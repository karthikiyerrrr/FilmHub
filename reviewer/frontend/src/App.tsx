import { useState, useEffect, useMemo, useCallback } from 'react';
import type { VideoInfo } from './types';
import { fetchVideos } from './api';
import { useAnalysis } from './hooks/useAnalysis';
import { useVideoSync } from './hooks/useVideoSync';
import { useSegments } from './hooks/useSegments';
import VideoPlayer from './components/VideoPlayer';
import Timeline from './components/Timeline';
import SegmentProperties from './components/SegmentProperties';
import TranscriptPanel from './components/TranscriptPanel';
import ActionBar from './components/ActionBar';

export default function App() {
  const [videos, setVideos] = useState<VideoInfo[]>([]);
  const [selectedVideo, setSelectedVideo] = useState<string | null>(null);

  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    const v = params.get('video');
    if (v) setSelectedVideo(v);
  }, []);

  useEffect(() => {
    fetchVideos().then(setVideos).catch(() => {});
  }, []);

  if (!selectedVideo) {
    return <VideoPicker videos={videos} onSelect={setSelectedVideo} />;
  }

  return <ReviewView video={selectedVideo} onBack={() => setSelectedVideo(null)} />;
}

function VideoPicker({
  videos,
  onSelect,
}: {
  videos: VideoInfo[];
  onSelect: (stem: string) => void;
}) {
  return (
    <div className="min-h-screen p-8 bg-surface-0">
      <div className="max-w-5xl mx-auto">
        <h1 className="text-2xl font-semibold text-text-primary mb-1">FilmHub Reviewer</h1>
        <p className="text-sm text-text-muted mb-8">Select a video to review detected segments</p>
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
          {videos.map(v => {
            const stem = v.name.replace(/\.[^.]+$/, '');
            const hasReviewData = v.analysis_types.includes('review_data');
            return (
              <button
                key={v.name}
                onClick={() => onSelect(stem)}
                disabled={!hasReviewData}
                className={`text-left p-4 rounded-lg border transition-all duration-200 ${
                  hasReviewData
                    ? 'border-border-subtle bg-surface-1 hover:border-accent/40 hover:bg-surface-2 hover:scale-[1.02]'
                    : 'border-border-subtle bg-surface-1/50 opacity-40 cursor-not-allowed'
                }`}
              >
                <p className="font-medium text-text-primary">{v.name}</p>
                <div className="flex gap-1 mt-2 flex-wrap">
                  {v.analysis_types.map(t => (
                    <span
                      key={t}
                      className="text-[10px] px-1.5 py-0.5 rounded bg-surface-2 text-text-muted"
                    >
                      {t}
                    </span>
                  ))}
                  {!v.has_analysis && (
                    <span className="text-[10px] text-text-muted">No analysis</span>
                  )}
                </div>
              </button>
            );
          })}
          {videos.length === 0 && (
            <p className="text-text-muted text-sm">No videos found in videos/ directory.</p>
          )}
        </div>
      </div>
    </div>
  );
}

function ReviewView({ video, onBack }: { video: string; onBack: () => void }) {
  const { data, loading, error, initialSegments } = useAnalysis(video);
  const videoSync = useVideoSync();

  const [videoFilename, setVideoFilename] = useState<string | null>(null);
  useEffect(() => {
    if (data?.video?.filename) {
      setVideoFilename(data.video.filename);
    } else {
      fetchVideos().then(videos => {
        const match = videos.find(v => v.name.replace(/\.[^.]+$/, '') === video);
        if (match) setVideoFilename(match.name);
      });
    }
  }, [data, video]);

  const stableInitial = useMemo(() => initialSegments, [data]);
  const segState = useSegments(stableInitial);

  const [selectedSegmentIndex, setSelectedSegmentIndex] = useState<number | null>(null);
  const [propertiesCollapsed, setPropertiesCollapsed] = useState(false);
  const [transcriptCollapsed, setTranscriptCollapsed] = useState(false);

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
      // Ignore when typing in input fields
      const tag = (e.target as HTMLElement).tagName;
      if (tag === 'INPUT' || tag === 'TEXTAREA' || tag === 'SELECT') return;

      switch (e.key) {
        case ' ':
          e.preventDefault();
          videoSync.isPlaying ? videoSync.pause() : videoSync.play();
          break;
        case 'ArrowLeft':
          e.preventDefault();
          videoSync.seek(Math.max(0, videoSync.currentTime - 5));
          break;
        case 'ArrowRight':
          e.preventDefault();
          videoSync.seek(Math.min(videoSync.duration, videoSync.currentTime + 5));
          break;
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
  }, [videoSync, jumpToSegment]);

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
        <button onClick={onBack} className="text-text-muted hover:text-text-primary text-sm transition-colors">
          Back to videos
        </button>
      </div>
    );
  }

  if (!data || !videoFilename) {
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
        <button onClick={onBack} className="text-text-muted hover:text-text-primary text-sm transition-colors">
          &larr; Back
        </button>
        <div className="w-px h-4 bg-border-subtle" />
        <span className="text-sm font-medium text-text-primary">{videoFilename}</span>
        <div className="flex-1" />
        <div className="flex items-center gap-2 text-[10px] text-text-muted font-mono">
          <span>Space: play/pause</span>
          <span className="text-border-subtle">|</span>
          <span>&larr;&rarr;: seek</span>
          <span className="text-border-subtle">|</span>
          <span>[ ]: segments</span>
        </div>
        <div className="flex items-center gap-1 ml-2">
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
        <div className="hidden xl:flex xl:shrink-0 xl:min-h-0 xl:order-1">
          {propertiesCollapsed ? (
            <button
              onClick={() => setPropertiesCollapsed(false)}
              className="w-8 flex flex-col items-center justify-center bg-surface-1 border-r border-border-subtle hover:bg-surface-2 transition-colors"
            >
              <span className="text-[10px] text-text-muted [writing-mode:vertical-lr] rotate-180">Properties</span>
            </button>
          ) : (
            <div className="w-72 overflow-y-auto pr-3 relative">
              <button
                onClick={() => setPropertiesCollapsed(true)}
                className="absolute top-0 right-3 text-[10px] text-text-muted hover:text-text-primary transition-colors p-1"
                title="Collapse"
              >
                &laquo;
              </button>
              <SegmentProperties
                video={video}
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
              />
            </div>
          )}
        </div>

        {!propertiesCollapsed && <div className="hidden xl:block w-px bg-border-subtle shrink-0 xl:order-2" />}

        {/* Center: Video + Timeline */}
        <div className="shrink-0 xl:shrink xl:flex-1 xl:min-w-0 xl:order-3 space-y-2 xl:px-3">
          <div className="max-h-[50vh] xl:max-h-[70vh] flex justify-center max-w-full overflow-hidden">
            <VideoPlayer
              videoRef={videoSync.videoRef}
              src={`/videos/${videoFilename}`}
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
          />
        </div>

        {!transcriptCollapsed && <div className="hidden xl:block w-px bg-border-subtle shrink-0 xl:order-4" />}

        {/* Transcript — right column on xl */}
        <div className="hidden xl:flex xl:shrink-0 xl:min-h-0 xl:order-5">
          {transcriptCollapsed ? (
            <button
              onClick={() => setTranscriptCollapsed(false)}
              className="w-8 flex flex-col items-center justify-center bg-surface-1 border-l border-border-subtle hover:bg-surface-2 transition-colors"
            >
              <span className="text-[10px] text-text-muted [writing-mode:vertical-lr]">Transcript</span>
            </button>
          ) : (
            <div className="w-64 overflow-y-auto pl-3 relative">
              <button
                onClick={() => setTranscriptCollapsed(true)}
                className="absolute top-0 left-3 text-[10px] text-text-muted hover:text-text-primary transition-colors p-1"
                title="Collapse"
              >
                &raquo;
              </button>
              <TranscriptPanel
                segments={data.transcript?.segments ?? []}
                currentTime={videoSync.currentTime}
                cleanSegments={segState.segments}
                onSeek={videoSync.seek}
              />
            </div>
          )}
        </div>

        {/* Bottom panels — narrow screens only */}
        <div className="flex-1 flex min-h-0 gap-0 xl:hidden">
          {!propertiesCollapsed && (
            <>
              <div className={`overflow-y-auto p-2 ${transcriptCollapsed ? 'flex-1' : 'w-3/5'}`}>
                <SegmentProperties
                  video={video}
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
                />
              </div>
              {!transcriptCollapsed && <div className="w-px bg-border-subtle shrink-0" />}
            </>
          )}
          {propertiesCollapsed && (
            <button
              onClick={() => setPropertiesCollapsed(false)}
              className="w-8 shrink-0 flex flex-col items-center justify-center bg-surface-1 border-r border-border-subtle hover:bg-surface-2 transition-colors"
            >
              <span className="text-[10px] text-text-muted [writing-mode:vertical-lr] rotate-180">Properties</span>
            </button>
          )}
          {!transcriptCollapsed && (
            <div className={`overflow-y-auto p-2 ${propertiesCollapsed ? 'flex-1' : 'w-2/5'}`}>
              <TranscriptPanel
                segments={data.transcript?.segments ?? []}
                currentTime={videoSync.currentTime}
                cleanSegments={segState.segments}
                onSeek={videoSync.seek}
              />
            </div>
          )}
          {transcriptCollapsed && (
            <button
              onClick={() => setTranscriptCollapsed(false)}
              className="w-8 shrink-0 flex flex-col items-center justify-center bg-surface-1 border-l border-border-subtle hover:bg-surface-2 transition-colors"
            >
              <span className="text-[10px] text-text-muted [writing-mode:vertical-lr]">Transcript</span>
            </button>
          )}
        </div>
      </div>

      {/* Action bar */}
      <ActionBar
        video={video}
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
