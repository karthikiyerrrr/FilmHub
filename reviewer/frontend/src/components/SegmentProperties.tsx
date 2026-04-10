import { useState } from 'react';
import type { CleanSegment, ReviewData, SegmentType, TranscriptSegment } from '../types';
import { frameUrl } from '../api';
import { formatTime, formatTimeFrames, parseTime, parseTimeFrames } from '../utils/formatTime';

const TYPE_BADGE: Record<string, { bg: string; text: string; border: string }> = {
  music: { bg: 'bg-blue-500/15', text: 'text-blue-400', border: 'border-blue-500' },
  graphics: { bg: 'bg-green-500/15', text: 'text-green-400', border: 'border-green-500' },
  promotions: { bg: 'bg-red-500/15', text: 'text-red-400', border: 'border-red-500' },
};

const ALL_TYPES: SegmentType[] = ['music', 'graphics', 'promotions'];

function getOverlappingTranscript(
  start: number,
  end: number,
  transcriptSegments: TranscriptSegment[] | undefined
): string {
  if (!transcriptSegments) return '';
  return transcriptSegments
    .filter(t => t.end > start && t.start < end)
    .map(t => t.text)
    .join(' ')
    .trim();
}

interface Props {
  video: string;
  segments: CleanSegment[];
  data: ReviewData;
  selectedIndex: number | null;
  currentTime: number;
  onSelect: (index: number | null) => void;
  onToggle: (index: number) => void;
  onUpdateTimes: (index: number, start: number, end: number) => void;
  onUpdateTypes: (index: number, types: SegmentType[]) => void;
  onUpdateDescription: (index: number, desc: string) => void;
  onSplit: (index: number, splitTime: number) => void;
  onSeek: (time: number) => void;
  onAdd: (seg: { start: number; end: number; types: SegmentType[]; description: string }) => void;
  onRemove: (index: number) => void;
  fps: number;
}

export default function SegmentProperties({
  video,
  segments,
  data,
  selectedIndex,
  currentTime,
  onSelect,
  onToggle,
  onUpdateTimes,
  onUpdateTypes,
  onUpdateDescription,
  onSplit,
  onSeek,
  onAdd,
  onRemove,
  fps,
}: Props) {
  const seg = selectedIndex !== null ? segments[selectedIndex] : null;

  if (seg && selectedIndex !== null) {
    return (
      <SegmentEditor
        index={selectedIndex}
        seg={seg}
        video={video}
        data={data}
        currentTime={currentTime}
        onDeselect={() => onSelect(null)}
        onToggle={() => onToggle(selectedIndex)}
        onUpdateTimes={(start, end) => onUpdateTimes(selectedIndex, start, end)}
        onUpdateTypes={(types) => onUpdateTypes(selectedIndex, types)}
        onUpdateDescription={(desc) => onUpdateDescription(selectedIndex, desc)}
        onSplit={() => onSplit(selectedIndex, currentTime)}
        onSeek={onSeek}
        onRemove={() => {
          onRemove(selectedIndex);
          onSelect(null);
        }}
        fps={fps}
      />
    );
  }

  return (
    <SegmentSummary
      segments={segments}
      onSelect={onSelect}
      onSeek={onSeek}
      onAdd={onAdd}
      fps={fps}
    />
  );
}

function SegmentEditor({
  index,
  seg,
  video,
  data,
  currentTime,
  onDeselect,
  onToggle,
  onUpdateTimes,
  onUpdateTypes,
  onUpdateDescription,
  onSplit,
  onSeek,
  onRemove,
  fps,
}: {
  index: number;
  seg: CleanSegment;
  video: string;
  data: ReviewData;
  currentTime: number;
  onDeselect: () => void;
  onToggle: () => void;
  onUpdateTimes: (start: number, end: number) => void;
  onUpdateTypes: (types: SegmentType[]) => void;
  onUpdateDescription: (desc: string) => void;
  onSplit: () => void;
  onSeek: (time: number) => void;
  onRemove: () => void;
  fps: number;
}) {
  const canSplit = currentTime > seg.start + 0.5 && currentTime < seg.end - 0.5;
  const transcript = seg.types.includes('promotions')
    ? getOverlappingTranscript(seg.start, seg.end, data.transcript?.segments)
    : '';
  const graphicsMatch = seg.types.includes('graphics')
    ? data.graphics?.find(g => g.timestamp >= seg.start && g.timestamp <= seg.end)
    : null;
  const [showFrames, setShowFrames] = useState(false);

  const toggleType = (type: SegmentType) => {
    const has = seg.types.includes(type);
    if (has && seg.types.length === 1) return; // must have at least one type
    const next = has ? seg.types.filter(t => t !== type) : [...seg.types, type];
    onUpdateTypes(next as SegmentType[]);
  };

  return (
    <div className="flex flex-col gap-3 h-full">
      {/* Header */}
      <div className="flex items-center justify-between px-1">
        <h3 className="text-sm font-medium text-text-primary">
          Segment {index + 1}
        </h3>
        <button
          onClick={onDeselect}
          className="text-xs text-text-muted hover:text-text-primary transition-colors"
        >
          Close
        </button>
      </div>

      <div className="flex-1 overflow-y-auto space-y-4 pr-1">
        {/* Accept/Reject toggle */}
        <div className="flex items-center justify-between bg-surface-1 rounded-lg p-3 border border-border-subtle">
          <span className="text-xs text-text-secondary">
            {seg.accepted ? 'Will be cut' : 'Will be kept'}
          </span>
          <button
            onClick={onToggle}
            className={`w-10 h-5 rounded-full transition-colors ${
              seg.accepted ? 'bg-danger-matte' : 'bg-surface-3'
            }`}
          >
            <div
              className={`w-4 h-4 rounded-full bg-white transition-transform mx-0.5 ${
                seg.accepted ? 'translate-x-5' : 'translate-x-0'
              }`}
            />
          </button>
        </div>

        {/* Type toggles */}
        <div>
          <label className="text-[10px] text-text-muted uppercase tracking-wider mb-1.5 block">
            Labels
          </label>
          <div className="flex gap-1.5">
            {ALL_TYPES.map(type => {
              const active = seg.types.includes(type);
              const badge = TYPE_BADGE[type];
              return (
                <button
                  key={type}
                  onClick={() => toggleType(type)}
                  className={`text-[11px] font-medium px-2.5 py-1 rounded-md border transition-all ${
                    active
                      ? `${badge.bg} ${badge.text} ${badge.border}`
                      : 'bg-surface-2 text-text-muted border-border-subtle hover:border-border-hover'
                  }`}
                >
                  {type}
                </button>
              );
            })}
          </div>
        </div>

        {/* Time inputs */}
        <div>
          <label className="text-[10px] text-text-muted uppercase tracking-wider mb-1.5 block">
            Time Range
          </label>
          <div className="flex items-center gap-2">
            <TimeInput
              value={seg.start}
              onChange={v => onUpdateTimes(v, seg.end)}
              fps={fps}
            />
            <span className="text-text-muted text-xs">&ndash;</span>
            <TimeInput
              value={seg.end}
              onChange={v => onUpdateTimes(seg.start, v)}
              fps={fps}
            />
            <span className="text-[10px] text-text-muted font-mono ml-1">
              ({formatTime(seg.end - seg.start)})
            </span>
          </div>
          <div className="flex gap-2 mt-2">
            <button
              onClick={() => onSeek(seg.start)}
              className="text-[10px] text-text-muted hover:text-accent transition-colors"
            >
              Go to start
            </button>
            <button
              onClick={() => onSeek(seg.end)}
              className="text-[10px] text-text-muted hover:text-accent transition-colors"
            >
              Go to end
            </button>
          </div>
        </div>

        {/* Description */}
        <div>
          <label className="text-[10px] text-text-muted uppercase tracking-wider mb-1.5 block">
            Description
          </label>
          <input
            type="text"
            value={seg.description}
            onChange={e => onUpdateDescription(e.target.value)}
            className="w-full text-xs bg-surface-2 border border-border-subtle rounded px-2 py-1.5 text-text-primary focus:border-accent focus:outline-none transition-colors"
          />
        </div>

        {/* Music track info */}
        {seg.types.includes('music') && (
          <div className="text-[11px] text-blue-400/70 bg-blue-500/5 rounded-md px-3 py-2 border border-blue-500/10">
            Track: {data.music?.find(m => m.start <= seg.start && m.end >= seg.end)?.track || 'Unknown'}
          </div>
        )}

        {/* Promotion transcript */}
        {transcript && (
          <div className="text-[11px] text-red-400/70 bg-red-500/5 rounded-md px-3 py-2 border border-red-500/10 italic">
            &ldquo;{transcript}&rdquo;
          </div>
        )}

        {/* Graphics frames */}
        {graphicsMatch && (
          <div>
            <button
              className="text-[10px] text-green-400/70 hover:text-green-400 transition-colors"
              onClick={() => setShowFrames(!showFrames)}
            >
              {showFrames ? 'Hide frames' : 'Show frames'}
            </button>
            {showFrames && (
              <div className="flex gap-2 mt-1.5">
                <div className="flex-1">
                  <span className="text-[9px] text-text-muted block mb-0.5">Before</span>
                  <img
                    src={frameUrl(video, graphicsMatch.before_frame)}
                    alt="Before"
                    className="w-full rounded"
                  />
                </div>
                <div className="flex-1">
                  <span className="text-[9px] text-text-muted block mb-0.5">After</span>
                  <img
                    src={frameUrl(video, graphicsMatch.after_frame)}
                    alt="After"
                    className="w-full rounded"
                  />
                </div>
              </div>
            )}
          </div>
        )}

        {/* Split at playhead */}
        <div className="pt-2 border-t border-border-subtle">
          <button
            onClick={onSplit}
            disabled={!canSplit}
            className="w-full text-xs py-2 rounded-md border transition-colors disabled:opacity-30 disabled:cursor-not-allowed border-border-subtle text-text-secondary hover:text-text-primary hover:border-border-hover"
          >
            Split at playhead ({formatTimeFrames(currentTime, fps)})
          </button>
        </div>

        {/* Delete */}
        <button
          onClick={onRemove}
          className="w-full text-xs text-danger/70 hover:text-danger py-2 rounded-md border border-danger/20 hover:border-danger/40 transition-colors"
        >
          Delete segment
        </button>
      </div>
    </div>
  );
}

function SegmentSummary({
  segments,
  onSelect,
  onSeek,
  onAdd,
  fps,
}: {
  segments: CleanSegment[];
  onSelect: (index: number) => void;
  onSeek: (time: number) => void;
  onAdd: (seg: { start: number; end: number; types: SegmentType[]; description: string }) => void;
  fps: number;
}) {
  const [showAdd, setShowAdd] = useState(false);

  return (
    <div className="flex flex-col gap-2 h-full">
      <div className="flex items-center justify-between px-1">
        <h3 className="text-sm font-medium text-text-primary">
          Segments <span className="text-text-muted">({segments.length})</span>
        </h3>
      </div>

      <p className="text-[10px] text-text-muted px-1">
        Click a segment in the timeline to edit
      </p>

      <div className="flex-1 overflow-y-auto space-y-1 pr-1">
        {segments.map((seg, i) => {
          const badge = TYPE_BADGE[seg.types[0]] || TYPE_BADGE.promotions;
          return (
            <button
              key={i}
              onClick={() => { onSelect(i); onSeek(seg.start); }}
              className={`w-full text-left px-2.5 py-1.5 rounded-md border border-border-subtle transition-all text-xs hover:border-border-hover ${
                seg.accepted ? 'bg-surface-1' : 'bg-surface-1 opacity-40'
              }`}
            >
              <div className="flex items-center gap-2">
                <span className={`text-[10px] font-medium px-1 py-0.5 rounded ${badge.bg} ${badge.text}`}>
                  {seg.types[0]}
                </span>
                <span className="font-mono text-text-secondary">
                  {formatTimeFrames(seg.start, fps)} &ndash; {formatTimeFrames(seg.end, fps)}
                </span>
                <span className="text-text-muted ml-auto">
                  {seg.accepted ? 'Cut' : 'Keep'}
                </span>
              </div>
            </button>
          );
        })}
      </div>

      {showAdd ? (
        <AddSegmentForm
          onAdd={seg => {
            onAdd(seg);
            setShowAdd(false);
          }}
          onCancel={() => setShowAdd(false)}
        />
      ) : (
        <button
          onClick={() => setShowAdd(true)}
          className="w-full py-2 text-xs text-text-muted hover:text-accent border border-dashed border-border-subtle rounded-lg hover:border-accent/40 transition-colors"
        >
          + Add segment
        </button>
      )}
    </div>
  );
}

function TimeInput({ value, onChange, fps }: { value: number; onChange: (v: number) => void; fps: number }) {
  const [editing, setEditing] = useState(false);
  const [text, setText] = useState('');

  if (editing) {
    return (
      <input
        autoFocus
        className="w-24 text-xs font-mono bg-surface-2 border border-border-subtle rounded px-1 py-0.5 text-text-primary focus:border-accent focus:outline-none transition-colors"
        value={text}
        onChange={e => setText(e.target.value)}
        onBlur={() => {
          const parsed = parseTimeFrames(text, fps);
          if (parsed !== null) onChange(parsed);
          setEditing(false);
        }}
        onKeyDown={e => {
          if (e.key === 'Enter') (e.target as HTMLInputElement).blur();
          if (e.key === 'Escape') setEditing(false);
        }}
      />
    );
  }

  return (
    <button
      onClick={() => {
        setText(formatTimeFrames(value, fps));
        setEditing(true);
      }}
      className="text-xs font-mono text-text-secondary hover:text-accent transition-colors"
    >
      {formatTimeFrames(value, fps)}
    </button>
  );
}

function AddSegmentForm({
  onAdd,
  onCancel,
}: {
  onAdd: (seg: { start: number; end: number; types: SegmentType[]; description: string }) => void;
  onCancel: () => void;
}) {
  const [start, setStart] = useState('0:00:00');
  const [end, setEnd] = useState('0:00:00');
  const [type, setType] = useState<SegmentType>('promotions');
  const [desc, setDesc] = useState('');

  const handleSubmit = () => {
    const s = parseTime(start);
    const e = parseTime(end);
    if (s === null || e === null || s >= e) return;
    onAdd({ start: s, end: e, types: [type], description: desc || 'Manual segment' });
  };

  return (
    <div className="bg-surface-1 rounded-lg p-3 space-y-2 border border-border-subtle">
      <div className="flex gap-2">
        <input
          className="flex-1 text-xs font-mono bg-surface-2 border border-border-subtle rounded px-2 py-1.5 text-text-primary focus:border-accent focus:outline-none transition-colors"
          placeholder="Start (H:MM:SS)"
          value={start}
          onChange={e => setStart(e.target.value)}
        />
        <input
          className="flex-1 text-xs font-mono bg-surface-2 border border-border-subtle rounded px-2 py-1.5 text-text-primary focus:border-accent focus:outline-none transition-colors"
          placeholder="End (H:MM:SS)"
          value={end}
          onChange={e => setEnd(e.target.value)}
        />
      </div>
      <div className="flex gap-2">
        <select
          className="text-xs bg-surface-2 border border-border-subtle rounded px-2 py-1.5 text-text-primary focus:border-accent focus:outline-none transition-colors"
          value={type}
          onChange={e => setType(e.target.value as SegmentType)}
        >
          <option value="promotions">Promotions</option>
          <option value="music">Music</option>
          <option value="graphics">Graphics</option>
        </select>
        <input
          className="flex-1 text-xs bg-surface-2 border border-border-subtle rounded px-2 py-1.5 text-text-primary focus:border-accent focus:outline-none transition-colors"
          placeholder="Description"
          value={desc}
          onChange={e => setDesc(e.target.value)}
        />
      </div>
      <div className="flex gap-2 justify-end">
        <button onClick={onCancel} className="text-xs text-text-muted hover:text-text-primary px-2 py-1 transition-colors">
          Cancel
        </button>
        <button
          onClick={handleSubmit}
          className="text-xs bg-accent hover:bg-accent-hover text-white px-3 py-1 rounded transition-colors"
        >
          Add
        </button>
      </div>
    </div>
  );
}
