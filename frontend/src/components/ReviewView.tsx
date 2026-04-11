import { useState, useEffect, useMemo, useCallback } from 'react';
import { useNavigate } from 'react-router-dom';
import { fetchVideoUrl } from '../api';
import { useAnalysis } from '../hooks/useAnalysis';
import { useVideoSync } from '../hooks/useVideoSync';
import { useSegments } from '../hooks/useSegments';
import VideoPlayer from './VideoPlayer';
import Timeline from './Timeline';
import SegmentProperties from './SegmentProperties';
import TranscriptPanel from './TranscriptPanel';
import ActionBar from './ActionBar';

interface Props {
  videoId: string;
}

export function ReviewView({ videoId }: Props) {
  const navigate = useNavigate();
  const { data, loading, error, initialSegments } = useAnalysis(videoId);
  const videoSync = useVideoSync();

  useEffect(() => {
    if (data?.video?.fps) {
      videoSync.setFps(data.video.fps);
    }
  }, [data]);

  const stableInitial = useMemo(() => initialSegments, [data]);
  const segState = useSegments(stableInitial);

  const [selectedSegmentIndex, setSelectedSegmentIndex] = useState<number | null>(null);
  const [propertiesCollapsed, setPropertiesCollapsed] = useState(false);
  const [transcriptCollapsed, setTranscriptCollapsed] = useState(false);
  const [videoUrl, setVideoUrl] = useState<string | null>(null);

  useEffect(() => {
    fetchVideoUrl(videoId).then(setVideoUrl).catch(console.error);
  }, [videoId]);

  useEffect(() => {
    if (stableInitial.length > 0) {
      segState.resetToOriginal();
    }
  }, [stableInitial]);

  // Keyboard shortcuts
  const jumpToSegment = useCallback(
    (direction: 'prev' | 'next') => {
      const ct = videoSync.currentTime;
      const sorted = [...segState.segments].sort((a, b) => a.start - b.start);
      if (direction === 'next') {
        const next = sorted.find(s => s.start > ct + 0.5);
        if (next) videoSync.seek(next.start);
      } else {
        const prev = [...sorted].reverse().find(s => s.start < ct - 0.5);
        if (prev) videoSync.seek(prev.start);
      }
    },
    [videoSync, segState.segments]
  );

  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      // Undo: Cmd+Z (Mac) or Ctrl+Z (Windows/Linux) — works even in input fields
      if (e.key === 'z' && (e.metaKey || e.ctrlKey) && !e.shiftKey) {
        e.preventDefault();
        segState.undo();
        return;
      }

      // Ignore other shortcuts when typing in input fields
      const tag = (e.target as HTMLElement).tagName;
      if (tag === 'INPUT' || tag === 'TEXTAREA' || tag === 'SELECT') return;

      switch (e.key) {
        case ' ':
          e.preventDefault();
          videoSync.isPlaying ? videoSync.pause() : videoSync.play();
          break;
        case 'ArrowLeft': {
          e.preventDefault();
          const stepL = e.shiftKey ? 1 : 1 / videoSync.fps;
          videoSync.seek(Math.max(0, videoSync.currentTime - stepL));
          break;
        }
        case 'ArrowRight': {
          e.preventDefault();
          const stepR = e.shiftKey ? 1 : 1 / videoSync.fps;
          videoSync.seek(Math.min(videoSync.duration, videoSync.currentTime + stepR));
          break;
        }
        case '[':
          jumpToSegment('prev');
          break;
        case ']':
          jumpToSegment('next');
          break;
      }
    };

    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [videoSync, jumpToSegment, segState]);

  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center text-text-muted bg-surface-0">
        <div className="flex items-center gap-3">
          <svg className="animate-spin w-5 h-5 text-accent" viewBox="0 0 24 24" fill="none">
            <circle cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="3" opacity="0.25" />
            <path d="M12 2a10 10 0 0 1 10 10" stroke="currentColor" strokeWidth="3" strokeLinecap="round" />
          </svg>
          Loading analysis data...
        </div>
      </div>
    );
  }

  if (error) {
    return (
      <div className="min-h-screen flex flex-col items-center justify-center gap-4 bg-surface-0">
        <p className="text-danger">Error: {error}</p>
        <button onClick={() => navigate('/dashboard')} className="text-text-muted hover:text-text-primary text-sm transition-colors">
          Back to videos
        </button>
      </div>
    );
  }

  if (!data) {
    return (
      <div className="min-h-screen flex items-center justify-center text-text-muted bg-surface-0">
        No review data found. Run detection passes first.
      </div>
    );
  }

  return (
    <div className="h-screen flex flex-col bg-surface-0">
      {/* Header */}
      <div className="flex items-center gap-3 px-4 py-2.5 bg-surface-1/80 backdrop-blur-md border-b border-border-subtle">
        <button onClick={() => navigate('/dashboard')} className="text-text-muted hover:text-text-primary text-sm transition-colors">
          &larr; Back
        </button>
        <div className="w-px h-4 bg-border-subtle" />
        <span className="text-sm font-medium text-text-primary">{data.video?.filename ?? videoId}</span>
        <div className="flex-1" />
        <div className="flex items-center gap-1">
          <button
            onClick={() => setPropertiesCollapsed(p => !p)}
            className={`text-[10px] px-2 py-0.5 rounded transition-colors ${
              propertiesCollapsed ? 'text-text-muted hover:text-text-primary' : 'text-text-secondary bg-surface-2'
            }`}
            title={propertiesCollapsed ? 'Show properties' : 'Hide properties'}
          >
            Properties
          </button>
          <button
            onClick={() => setTranscriptCollapsed(t => !t)}
            className={`text-[10px] px-2 py-0.5 rounded transition-colors ${
              transcriptCollapsed ? 'text-text-muted hover:text-text-primary' : 'text-text-secondary bg-surface-2'
            }`}
            title={transcriptCollapsed ? 'Show transcript' : 'Hide transcript'}
          >
            Transcript
          </button>
        </div>
      </div>

      {/* Main content — stacked on narrow, 3-column on xl */}
      <div className="flex-1 flex flex-col xl:flex-row min-h-0 px-4 pt-3 pb-2 gap-0">
        {/* Properties panel — left column on xl */}
        <div
          className="hidden xl:block xl:shrink-0 xl:min-h-0 xl:order-1 relative overflow-hidden transition-[width] duration-300 ease-in-out"
          style={{ width: propertiesCollapsed ? 32 : 288 }}
        >
          {/* Collapsed tab — absolutely positioned so it doesn't affect flow width */}
          <button
            onClick={() => setPropertiesCollapsed(false)}
            className={`absolute inset-0 w-8 flex flex-col items-center justify-center bg-surface-1 border-r border-border-subtle hover:bg-surface-2 transition-opacity duration-300 ${
              propertiesCollapsed ? 'opacity-100 z-10' : 'opacity-0 pointer-events-none'
            }`}
          >
            <span className="text-[10px] text-text-muted [writing-mode:vertical-lr] rotate-180">Properties</span>
          </button>
          {/* Expanded content */}
          <div
            className={`w-72 h-full flex relative transition-opacity duration-300 ${
              propertiesCollapsed ? 'opacity-0 pointer-events-none' : 'opacity-100'
            }`}
          >
            <div className="flex-1 overflow-y-auto pr-3">
            <SegmentProperties
              videoId={videoId}
              segments={segState.segments}
              data={data}
              selectedIndex={selectedSegmentIndex}
              currentTime={videoSync.currentTime}
              onSelect={setSelectedSegmentIndex}
              onToggle={segState.toggle}
              onUpdateTimes={segState.updateTimes}
              onUpdateTypes={segState.updateTypes}
              onUpdateDescription={segState.updateDescription}
              onSplit={segState.splitSegment}
              onSeek={videoSync.seek}
              onAdd={segState.addSegment}
              onRemove={segState.removeSegment}
              fps={videoSync.fps}
            />
            </div>
            <button
              onClick={() => setPropertiesCollapsed(true)}
              className="absolute top-1/2 -translate-y-1/2 right-0 text-[10px] text-text-muted hover:text-text-primary transition-colors p-1"
              title="Collapse"
            >
              &laquo;
            </button>
          </div>
        </div>

        <div className={`hidden xl:block w-px bg-border-subtle shrink-0 xl:order-2 transition-opacity duration-300 ${propertiesCollapsed ? 'opacity-0' : 'opacity-100'}`} />

        {/* Center: Video + Timeline */}
        <div className="shrink-0 xl:shrink xl:flex-1 xl:min-w-0 xl:order-3 space-y-2 xl:px-3">
          <div className="max-h-[50vh] xl:max-h-[70vh] flex justify-center max-w-full overflow-hidden">
            <VideoPlayer
              videoRef={videoSync.videoRef}
              src={videoUrl || ''}
              currentTime={videoSync.currentTime}
              duration={videoSync.duration}
              isPlaying={videoSync.isPlaying}
              onPlay={videoSync.onPlay}
              onPause={videoSync.onPause}
              onLoadedMetadata={videoSync.onLoadedMetadata}
              onTimeUpdate={videoSync.onTimeUpdate}
              play={videoSync.play}
              pause={videoSync.pause}
              setPlaybackRate={videoSync.setPlaybackRate}
              fps={videoSync.fps}
            />
          </div>
          <Timeline
            duration={videoSync.duration}
            currentTime={videoSync.currentTime}
            segments={segState.segments}
            selectedIndex={selectedSegmentIndex}
            onSeek={videoSync.seek}
            onUpdateTimes={segState.updateTimes}
            onSelect={setSelectedSegmentIndex}
            onBeginBatch={segState.beginBatch}
            onEndBatch={segState.endBatch}
            fps={videoSync.fps}
          />
        </div>

        <div className={`hidden xl:block w-px bg-border-subtle shrink-0 xl:order-4 transition-opacity duration-300 ${transcriptCollapsed ? 'opacity-0' : 'opacity-100'}`} />

        {/* Transcript — right column on xl */}
        <div
          className="hidden xl:block xl:shrink-0 xl:min-h-0 xl:order-5 relative overflow-hidden transition-[width] duration-300 ease-in-out"
          style={{ width: transcriptCollapsed ? 32 : 256 }}
        >
          {/* Collapsed tab — absolutely positioned */}
          <button
            onClick={() => setTranscriptCollapsed(false)}
            className={`absolute inset-0 w-8 ml-auto flex flex-col items-center justify-center bg-surface-1 border-l border-border-subtle hover:bg-surface-2 transition-opacity duration-300 ${
              transcriptCollapsed ? 'opacity-100 z-10' : 'opacity-0 pointer-events-none'
            }`}
          >
            <span className="text-[10px] text-text-muted [writing-mode:vertical-lr]">Transcript</span>
          </button>
          {/* Expanded content */}
          <div
            className={`w-64 h-full flex relative transition-opacity duration-300 ${
              transcriptCollapsed ? 'opacity-0 pointer-events-none' : 'opacity-100'
            }`}
          >
            <button
              onClick={() => setTranscriptCollapsed(true)}
              className="absolute top-1/2 -translate-y-1/2 left-0 text-[10px] text-text-muted hover:text-text-primary transition-colors p-1"
              title="Collapse"
            >
              &raquo;
            </button>
            <div className="flex-1 overflow-y-auto pl-3">
            <TranscriptPanel
              segments={data.transcript?.segments ?? []}
              currentTime={videoSync.currentTime}
              cleanSegments={segState.segments}
              onSeek={videoSync.seek}
            />
            </div>
          </div>
        </div>

        {/* Bottom panels — narrow screens only */}
        <div className="flex-1 flex min-h-0 gap-0 xl:hidden">
          {/* Properties — narrow */}
          <div
            className="relative overflow-hidden transition-all duration-300 ease-in-out"
            style={{ width: propertiesCollapsed ? 32 : undefined, flex: propertiesCollapsed ? '0 0 32px' : (transcriptCollapsed ? '1 1 0%' : '3 3 0%') }}
          >
            <button
              onClick={() => setPropertiesCollapsed(false)}
              className={`absolute inset-0 w-8 flex flex-col items-center justify-center bg-surface-1 border-r border-border-subtle hover:bg-surface-2 transition-opacity duration-300 ${
                propertiesCollapsed ? 'opacity-100 z-10' : 'opacity-0 pointer-events-none'
              }`}
            >
              <span className="text-[10px] text-text-muted [writing-mode:vertical-lr] rotate-180">Properties</span>
            </button>
            <div className={`h-full overflow-y-auto p-2 transition-opacity duration-300 ${propertiesCollapsed ? 'opacity-0 pointer-events-none' : 'opacity-100'}`}>
              <SegmentProperties
                videoId={videoId}
                segments={segState.segments}
                data={data}
                selectedIndex={selectedSegmentIndex}
                currentTime={videoSync.currentTime}
                onSelect={setSelectedSegmentIndex}
                onToggle={segState.toggle}
                onUpdateTimes={segState.updateTimes}
                onUpdateTypes={segState.updateTypes}
                onUpdateDescription={segState.updateDescription}
                onSplit={segState.splitSegment}
                onSeek={videoSync.seek}
                onAdd={segState.addSegment}
                onRemove={segState.removeSegment}
                fps={videoSync.fps}
              />
            </div>
          </div>

          <div className={`w-px bg-border-subtle shrink-0 transition-opacity duration-300 ${propertiesCollapsed || transcriptCollapsed ? 'opacity-0' : 'opacity-100'}`} />

          {/* Transcript — narrow */}
          <div
            className="relative overflow-hidden transition-all duration-300 ease-in-out"
            style={{ width: transcriptCollapsed ? 32 : undefined, flex: transcriptCollapsed ? '0 0 32px' : (propertiesCollapsed ? '1 1 0%' : '2 2 0%') }}
          >
            <div className={`h-full overflow-y-auto p-2 transition-opacity duration-300 ${transcriptCollapsed ? 'opacity-0 pointer-events-none' : 'opacity-100'}`}>
              <TranscriptPanel
                segments={data.transcript?.segments ?? []}
                currentTime={videoSync.currentTime}
                cleanSegments={segState.segments}
                onSeek={videoSync.seek}
              />
            </div>
            <button
              onClick={() => setTranscriptCollapsed(false)}
              className={`absolute inset-y-0 right-0 w-8 flex flex-col items-center justify-center bg-surface-1 border-l border-border-subtle hover:bg-surface-2 transition-opacity duration-300 ${
                transcriptCollapsed ? 'opacity-100 z-10' : 'opacity-0 pointer-events-none'
              }`}
            >
              <span className="text-[10px] text-text-muted [writing-mode:vertical-lr]">Transcript</span>
            </button>
          </div>
        </div>
      </div>

      {/* Action bar */}
      <ActionBar
        videoId={videoId}
        segments={segState.segments}
        acceptedSegments={segState.acceptedSegments}
        totalRemovedSeconds={segState.totalRemovedSeconds}
        onReset={segState.resetToOriginal}
        onSelectAll={segState.selectAll}
        onDeselectAll={segState.deselectAll}
      />
    </div>
  );
}
