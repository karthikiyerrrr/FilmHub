import { useState, memo } from 'react';
import type { CleanSegment, ReviewData, SegmentType, TranscriptSegment } from '../types';
import { frameUrl } from '../api';
import { formatTime, formatTimeFull, parseTime } from '../utils/formatTime';

const TYPE_BADGE: Record<string, { bg: string; text: string }> = {
  music: { bg: 'bg-blue-500/15', text: 'text-blue-400' },
  graphics: { bg: 'bg-green-500/15', text: 'text-green-400' },
  promotions: { bg: 'bg-red-500/15', text: 'text-red-400' },
};

const TYPE_BORDER: Record<string, string> = {
  music: 'border-l-blue-500',
  graphics: 'border-l-green-500',
  promotions: 'border-l-red-500',
};

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
  onToggle: (index: number) => void;
  onUpdateTimes: (index: number, start: number, end: number) => void;
  onSeek: (time: number) => void;
  onAdd: (seg: { start: number; end: number; types: SegmentType[]; description: string }) => void;
  onRemove: (index: number) => void;
  onSelectAll: () => void;
  onDeselectAll: () => void;
}

export default function SegmentList({
  video,
  segments,
  data,
  onToggle,
  onUpdateTimes,
  onSeek,
  onAdd,
  onRemove,
  onSelectAll,
  onDeselectAll,
}: Props) {
  const [showAdd, setShowAdd] = useState(false);
  const [expandedGraphics, setExpandedGraphics] = useState<Set<number>>(new Set());

  return (
    <div className="flex flex-col gap-2 h-full">
      <div className="flex items-center justify-between px-1">
        <h3 className="text-sm font-medium text-text-primary">
          Segments <span className="text-text-muted">({segments.length})</span>
        </h3>
        <div className="flex gap-2">
          <button onClick={onSelectAll} className="text-xs text-text-muted hover:text-accent transition-colors">
            Select all
          </button>
          <button onClick={onDeselectAll} className="text-xs text-text-muted hover:text-accent transition-colors">
            Deselect all
          </button>
        </div>
      </div>

      <div className="flex-1 overflow-y-auto space-y-1.5 pr-1">
        {segments.map((seg, i) => (
          <SegmentCard
            key={i}
            index={i}
            seg={seg}
            video={video}
            data={data}
            isGraphicsExpanded={expandedGraphics.has(i)}
            onToggle={onToggle}
            onUpdateTimes={onUpdateTimes}
            onSeek={onSeek}
            onRemove={onRemove}
            onToggleGraphics={() => {
              const next = new Set(expandedGraphics);
              next.has(i) ? next.delete(i) : next.add(i);
              setExpandedGraphics(next);
            }}
          />
        ))}
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

const SegmentCard = memo(function SegmentCard({
  index,
  seg,
  video,
  data,
  isGraphicsExpanded,
  onToggle,
  onUpdateTimes,
  onSeek,
  onRemove,
  onToggleGraphics,
}: {
  index: number;
  seg: CleanSegment;
  video: string;
  data: ReviewData;
  isGraphicsExpanded: boolean;
  onToggle: (i: number) => void;
  onUpdateTimes: (i: number, start: number, end: number) => void;
  onSeek: (time: number) => void;
  onRemove: (i: number) => void;
  onToggleGraphics: () => void;
}) {
  const borderClass = TYPE_BORDER[seg.types[0]] || 'border-l-zinc-500';
  const transcript = seg.types.includes('promotions')
    ? getOverlappingTranscript(seg.start, seg.end, data.transcript?.segments)
    : '';

  const graphicsMatch = seg.types.includes('graphics')
    ? data.graphics?.find(g => g.timestamp >= seg.start && g.timestamp <= seg.end)
    : null;

  return (
    <div
      className={`border-l-3 rounded-r-lg bg-surface-1 border border-border-subtle border-l-0 p-3 transition-all duration-200 ${borderClass} ${
        seg.accepted ? 'opacity-100' : 'opacity-40'
      } hover:border-border-hover`}
    >
      <div className="flex items-start justify-between gap-2">
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2 flex-wrap">
            {seg.types.map(t => {
              const badge = TYPE_BADGE[t] || TYPE_BADGE.promotions;
              return (
                <span
                  key={t}
                  className={`text-[10px] font-medium px-1.5 py-0.5 rounded ${badge.bg} ${badge.text}`}
                >
                  {t}
                </span>
              );
            })}
            <TimeInput
              value={seg.start}
              onChange={v => onUpdateTimes(index, v, seg.end)}
            />
            <span className="text-text-muted text-xs">&ndash;</span>
            <TimeInput
              value={seg.end}
              onChange={v => onUpdateTimes(index, seg.start, v)}
            />
            <span className="text-[10px] text-text-muted font-mono">
              ({formatTime(seg.end - seg.start)})
            </span>
          </div>

          <p className="text-xs text-text-secondary mt-1.5 leading-relaxed">
            {seg.description}
          </p>

          {seg.types.includes('music') && (
            <p className="text-[10px] text-blue-400/70 mt-1">
              {data.music?.find(m => m.start <= seg.start && m.end >= seg.end)?.track ||
                'Unknown track'}
            </p>
          )}

          {transcript && (
            <p className="text-[10px] text-red-400/60 mt-1 line-clamp-2 italic">
              &ldquo;{transcript}&rdquo;
            </p>
          )}

          {graphicsMatch && (
            <div className="mt-1.5">
              <button
                className="text-[10px] text-green-400/70 hover:text-green-400 transition-colors"
                onClick={onToggleGraphics}
              >
                {isGraphicsExpanded ? 'Hide frames' : 'Show frames'}
              </button>
              {isGraphicsExpanded && (
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
        </div>

        <div className="flex flex-col items-center gap-1.5 shrink-0">
          <button
            onClick={() => onToggle(index)}
            className={`w-10 h-5 rounded-full transition-colors ${
              seg.accepted ? 'bg-accent' : 'bg-surface-3'
            }`}
          >
            <div
              className={`w-4 h-4 rounded-full bg-white transition-transform mx-0.5 ${
                seg.accepted ? 'translate-x-5' : 'translate-x-0'
              }`}
            />
          </button>
          <span className="text-[9px] text-text-muted">
            {seg.accepted ? 'Cut' : 'Keep'}
          </span>
          <button
            onClick={() => onSeek(seg.start)}
            className="text-[10px] text-text-muted hover:text-accent mt-1 transition-colors"
          >
            Seek
          </button>
          <button
            onClick={() => onRemove(index)}
            className="text-[10px] text-text-muted hover:text-danger mt-0.5 transition-colors"
          >
            Delete
          </button>
        </div>
      </div>
    </div>
  );
});

function TimeInput({ value, onChange }: { value: number; onChange: (v: number) => void }) {
  const [editing, setEditing] = useState(false);
  const [text, setText] = useState('');

  if (editing) {
    return (
      <input
        autoFocus
        className="w-20 text-xs font-mono bg-surface-2 border border-border-subtle rounded px-1 py-0.5 text-text-primary focus:border-accent focus:outline-none transition-colors"
        value={text}
        onChange={e => setText(e.target.value)}
        onBlur={() => {
          const parsed = parseTime(text);
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
        setText(formatTimeFull(value));
        setEditing(true);
      }}
      className="text-xs font-mono text-text-secondary hover:text-accent transition-colors"
    >
      {formatTimeFull(value)}
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
