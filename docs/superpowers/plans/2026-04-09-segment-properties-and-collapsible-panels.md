# Segment Properties Panel & Collapsible Layout Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Replace the SegmentList sidebar with a context-sensitive Segment Properties panel activated by clicking timeline segments, add collapsible side panels, and ensure Save & Cut writes a review data JSON.

**Architecture:** Selection state lives in App.tsx (`selectedSegmentIndex`). Clicking a segment bar in Timeline sets it; clicking empty space clears it. SegmentProperties replaces SegmentList — when a segment is selected it shows an editor with time inputs, type toggles, split, and delete; when nothing is selected it shows a summary + add-segment form. Side panels (Properties + Transcript) are independently collapsible via toggle buttons. A new backend endpoint saves all segments with review metadata as `review_XX.json` alongside the existing `clean_XX_segments.json` for cutting.

**Tech Stack:** React 19, TypeScript, Tailwind CSS v4, Rust/Axum backend

---

## File Map

| File | Action | Responsibility |
|------|--------|----------------|
| `reviewer/frontend/src/types.ts` | Modify | Add `ReviewExport` type |
| `reviewer/frontend/src/hooks/useSegments.ts` | Modify | Add `updateTypes`, `splitSegment` |
| `reviewer/src/routes/segments.rs` | Modify | Add `save_review` endpoint |
| `reviewer/src/routes/mod.rs` | No change | Already exports `segments` |
| `reviewer/src/main.rs` | Modify | Register new route |
| `reviewer/frontend/src/api.ts` | Modify | Add `saveReviewData` function |
| `reviewer/frontend/src/components/SegmentProperties.tsx` | **Create** | Properties panel for selected segment |
| `reviewer/frontend/src/components/Timeline.tsx` | Modify | Add `selectedIndex` prop, click-to-select, selected highlight |
| `reviewer/frontend/src/App.tsx` | Modify | Selection state, collapsible panels, replace SegmentList |
| `reviewer/frontend/src/components/ActionBar.tsx` | Modify | Call `saveReviewData`, add select/deselect all |

---

### Task 1: Type & Hook Updates

**Files:**
- Modify: `reviewer/frontend/src/types.ts`
- Modify: `reviewer/frontend/src/hooks/useSegments.ts`

- [ ] **Step 1: Add ReviewExport type to types.ts**

Add after the `SaveResult` type:

```ts
export interface ReviewExport {
  video: string;
  reviewed_at: string;
  segments: CleanSegment[];
  accepted_count: number;
  rejected_count: number;
  total_removed_seconds: number;
}
```

- [ ] **Step 2: Add `updateTypes` and `splitSegment` to useSegments.ts**

Add these two methods inside `useSegments` before the `return` statement:

```ts
const updateTypes = useCallback(
  (index: number, types: SegmentType[]) => {
    setSegments(prev =>
      prev.map((s, i) => (i === index ? { ...s, types } : s))
    );
  },
  []
);

const splitSegment = useCallback(
  (index: number, splitTime: number) => {
    setSegments(prev => {
      const seg = prev[index];
      if (!seg || splitTime <= seg.start || splitTime >= seg.end) return prev;
      const left: CleanSegment = { ...seg, end: splitTime };
      const right: CleanSegment = { ...seg, start: splitTime };
      return [...prev.slice(0, index), left, right, ...prev.slice(index + 1)];
    });
  },
  []
);
```

Add both to the return object:

```ts
return {
  segments,
  toggle,
  updateTimes,
  updateDescription,
  updateTypes,      // NEW
  splitSegment,     // NEW
  addSegment,
  removeSegment,
  selectAll,
  deselectAll,
  resetToOriginal,
  acceptedSegments,
  totalRemovedSeconds,
};
```

- [ ] **Step 3: Verify build**

Run: `cd reviewer/frontend && npx tsc --noEmit`
Expected: No errors (new methods are exported but not yet consumed)

- [ ] **Step 4: Commit**

```bash
git add reviewer/frontend/src/types.ts reviewer/frontend/src/hooks/useSegments.ts
git commit -m "feat: add ReviewExport type, updateTypes and splitSegment to useSegments"
```

---

### Task 2: Backend Review Data Endpoint

**Files:**
- Modify: `reviewer/src/routes/segments.rs`
- Modify: `reviewer/src/main.rs`

- [ ] **Step 1: Add review data structs and handler to segments.rs**

Add these types after the existing `SaveResult` struct:

```rust
#[derive(Deserialize)]
pub struct ReviewSegment {
    pub start: f64,
    pub end: f64,
    pub types: Vec<String>,
    pub description: String,
    pub accepted: bool,
}

#[derive(Deserialize)]
pub struct ReviewExport {
    pub video: String,
    pub reviewed_at: String,
    pub segments: Vec<ReviewSegment>,
    pub accepted_count: u32,
    pub rejected_count: u32,
    pub total_removed_seconds: f64,
}
```

Add this handler function after `save_segments`:

```rust
pub async fn save_review(
    State(state): State<AppState>,
    Path(video): Path<String>,
    Json(review): Json<ReviewExport>,
) -> Result<Json<SaveResult>, StatusCode> {
    let analysis_path = state.analysis_dir().join(&video);

    if !analysis_path.exists() {
        tokio::fs::create_dir_all(&analysis_path)
            .await
            .map_err(|_| StatusCode::INTERNAL_SERVER_ERROR)?;
    }

    // Find next review sequence number
    let mut max_seq: u32 = 0;
    let mut entries = tokio::fs::read_dir(&analysis_path)
        .await
        .map_err(|_| StatusCode::INTERNAL_SERVER_ERROR)?;

    while let Some(entry) = entries
        .next_entry()
        .await
        .map_err(|_| StatusCode::INTERNAL_SERVER_ERROR)?
    {
        let name = entry.file_name().to_string_lossy().to_string();
        if let Some(rest) = name.strip_prefix("review_") {
            if let Some(num_str) = rest.strip_suffix(".json") {
                if let Ok(n) = num_str.parse::<u32>() {
                    max_seq = max_seq.max(n);
                }
            }
        }
    }

    let seq = max_seq + 1;
    let filename = format!("review_{:02}.json", seq);
    let filepath = analysis_path.join(&filename);

    let json_data = serde_json::to_string_pretty(&review)
        .map_err(|_| StatusCode::INTERNAL_SERVER_ERROR)?;

    tokio::fs::write(&filepath, json_data)
        .await
        .map_err(|_| StatusCode::INTERNAL_SERVER_ERROR)?;

    let relative = format!("analysis/{}/{}", video, filename);

    Ok(Json(SaveResult {
        file: relative,
        sequence: seq,
    }))
}
```

Note: `ReviewExport` only derives `Deserialize` (for accepting the POST body). The handler serializes it back with `serde_json::to_string_pretty(&review)` — this works because `serde_json::to_string_pretty` accepts any `Serialize` type. We need to also derive `Serialize` on both `ReviewExport` and `ReviewSegment`:

```rust
#[derive(Deserialize, Serialize)]
pub struct ReviewSegment { ... }

#[derive(Deserialize, Serialize)]
pub struct ReviewExport { ... }
```

- [ ] **Step 2: Register the route in main.rs**

In the `api` router block, add after the existing segments route:

```rust
.route("/api/review/{video}", post(routes::segments::save_review))
```

- [ ] **Step 3: Verify backend builds**

Run: `cd reviewer && cargo check`
Expected: No errors

- [ ] **Step 4: Commit**

```bash
git add reviewer/src/routes/segments.rs reviewer/src/main.rs
git commit -m "feat: add review data save endpoint POST /api/review/{video}"
```

---

### Task 3: Frontend API Layer Update

**Files:**
- Modify: `reviewer/frontend/src/api.ts`

- [ ] **Step 1: Add saveReviewData function**

Add after the existing `saveSegments` function:

```ts
export async function saveReviewData(
  video: string,
  data: import('./types').ReviewExport
): Promise<SaveResult> {
  const res = await fetch(`/api/review/${video}`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(data),
  });
  if (!res.ok) throw new Error('Failed to save review data');
  return res.json();
}
```

- [ ] **Step 2: Verify build**

Run: `cd reviewer/frontend && npx tsc --noEmit`
Expected: No errors

- [ ] **Step 3: Commit**

```bash
git add reviewer/frontend/src/api.ts
git commit -m "feat: add saveReviewData API function"
```

---

### Task 4: SegmentProperties Component

**Files:**
- Create: `reviewer/frontend/src/components/SegmentProperties.tsx`

This component replaces SegmentList. When a segment is selected, it shows an editor. When nothing is selected, it shows a segment summary list and add-segment form.

- [ ] **Step 1: Create SegmentProperties.tsx with full implementation**

```tsx
import { useState } from 'react';
import type { CleanSegment, ReviewData, SegmentType, TranscriptSegment } from '../types';
import { frameUrl } from '../api';
import { formatTime, formatTimeFull, parseTime } from '../utils/formatTime';

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
      />
    );
  }

  return (
    <SegmentSummary
      segments={segments}
      onSelect={onSelect}
      onAdd={onAdd}
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
              seg.accepted ? 'bg-accent' : 'bg-surface-3'
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
            />
            <span className="text-text-muted text-xs">&ndash;</span>
            <TimeInput
              value={seg.end}
              onChange={v => onUpdateTimes(seg.start, v)}
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
            Split at playhead ({formatTimeFull(currentTime)})
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
  onAdd,
}: {
  segments: CleanSegment[];
  onSelect: (index: number) => void;
  onAdd: (seg: { start: number; end: number; types: SegmentType[]; description: string }) => void;
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
              onClick={() => onSelect(i)}
              className={`w-full text-left px-2.5 py-1.5 rounded-md border border-border-subtle transition-all text-xs hover:border-border-hover ${
                seg.accepted ? 'bg-surface-1' : 'bg-surface-1 opacity-40'
              }`}
            >
              <div className="flex items-center gap-2">
                <span className={`text-[10px] font-medium px-1 py-0.5 rounded ${badge.bg} ${badge.text}`}>
                  {seg.types[0]}
                </span>
                <span className="font-mono text-text-secondary">
                  {formatTimeFull(seg.start)} &ndash; {formatTimeFull(seg.end)}
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
```

- [ ] **Step 2: Verify build**

Run: `cd reviewer/frontend && npx tsc --noEmit`
Expected: No errors

- [ ] **Step 3: Commit**

```bash
git add reviewer/frontend/src/components/SegmentProperties.tsx
git commit -m "feat: create SegmentProperties component replacing SegmentList"
```

---

### Task 5: Timeline Selection Support

**Files:**
- Modify: `reviewer/frontend/src/components/Timeline.tsx`

Add `selectedIndex` prop and `onSelect` callback. Clicking a segment bar selects it. Selected segment gets an accent glow border.

- [ ] **Step 1: Add selection props to Timeline interface**

Update the `Props` interface:

```ts
interface Props {
  duration: number;
  currentTime: number;
  segments: CleanSegment[];
  selectedIndex: number | null;            // NEW
  onSeek: (time: number) => void;
  onUpdateTimes: (index: number, start: number, end: number) => void;
  onSelect: (index: number | null) => void; // NEW
}
```

Update the function signature to destructure the new props:

```ts
export default function Timeline({ duration, currentTime, segments, selectedIndex, onSeek, onUpdateTimes, onSelect }: Props) {
```

- [ ] **Step 2: Add click handler and selected styling to segment bars**

In the segment lane rendering (the `<div>` with className `"absolute top-0.5 bottom-0.5 rounded-sm"` around line 300-310), add an `onClick` handler and selected border styling:

Replace the segment bar `<div>`:

```tsx
<div
  className="absolute top-0.5 bottom-0.5 rounded-sm cursor-pointer"
  style={{
    left: `${clampedLeft}%`,
    width: `${clampedRight - clampedLeft}%`,
    backgroundColor: colors.bg,
    borderLeft: left >= 0 ? `1px solid ${colors.border}` : undefined,
    borderRight: right <= 100 ? `1px solid ${colors.border}` : undefined,
    zIndex: isBeingDragged ? 15 : selectedIndex === i ? 12 : 5,
    boxShadow: selectedIndex === i ? `0 0 0 1.5px ${colors.border}, 0 0 8px ${colors.bg}` : undefined,
  }}
  onClick={(e) => {
    e.stopPropagation();
    onSelect(selectedIndex === i ? null : i);
  }}
>
```

- [ ] **Step 3: Add click-to-deselect on scrub bar**

In the scrub bar's `handleScrubMouseDown`, add deselection when clicking empty space. After the `if (e.button === 0)` block that sets `isScrubbing`, add:

```ts
onSelect(null);
```

Specifically, insert `onSelect(null)` right after `setIsScrubbing(true)` inside the `if (e.button === 0)` block.

- [ ] **Step 4: Verify build**

Run: `cd reviewer/frontend && npx tsc --noEmit`
Expected: Errors in App.tsx because it doesn't pass the new props yet (expected — will fix in Task 6)

- [ ] **Step 5: Commit**

```bash
git add reviewer/frontend/src/components/Timeline.tsx
git commit -m "feat: add segment selection to Timeline with visual highlight"
```

---

### Task 6: App.tsx — Selection State, Collapsible Panels, Layout Overhaul

**Files:**
- Modify: `reviewer/frontend/src/App.tsx`

This is the largest task. It replaces SegmentList with SegmentProperties, adds `selectedSegmentIndex` state, adds collapsible panel toggles for both wide and narrow layouts.

- [ ] **Step 1: Update imports**

Replace the `SegmentList` import with `SegmentProperties`:

```ts
import SegmentProperties from './components/SegmentProperties';
```

Remove:
```ts
import SegmentList from './components/SegmentList';
```

- [ ] **Step 2: Add selection and collapse state to ReviewView**

Add these state declarations after `const segState = useSegments(stableInitial);`:

```ts
const [selectedSegmentIndex, setSelectedSegmentIndex] = useState<number | null>(null);
const [propertiesCollapsed, setPropertiesCollapsed] = useState(false);
const [transcriptCollapsed, setTranscriptCollapsed] = useState(false);
```

Also add `useState` to the imports if not already there (it's already imported).

- [ ] **Step 3: Rewrite the main content area**

Replace everything inside the `{/* Main content */}` div (the `<div className="flex-1 flex flex-col xl:flex-row ...">` block, lines ~213-297) with the new layout that uses SegmentProperties and collapsible panels:

```tsx
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
```

- [ ] **Step 4: Add collapse toggle buttons to the header**

In the header bar (the `<div className="flex items-center gap-3 px-4 py-2.5 ...">` block), add collapse toggle buttons after the keyboard shortcut hints and before the closing `</div>`:

```tsx
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
```

- [ ] **Step 5: Update ActionBar props**

Pass additional props to ActionBar for select/deselect all:

```tsx
<ActionBar
  video={video}
  segments={segState.segments}
  acceptedSegments={segState.acceptedSegments}
  totalRemovedSeconds={segState.totalRemovedSeconds}
  onReset={segState.resetToOriginal}
  onSelectAll={segState.selectAll}
  onDeselectAll={segState.deselectAll}
/>
```

- [ ] **Step 6: Verify build**

Run: `cd reviewer/frontend && npx tsc --noEmit`
Expected: Errors in ActionBar.tsx for new props (expected — will fix in Task 7)

- [ ] **Step 7: Commit**

```bash
git add reviewer/frontend/src/App.tsx
git commit -m "feat: replace SegmentList with SegmentProperties, add collapsible panels"
```

---

### Task 7: ActionBar — Review Data Save + Select/Deselect All

**Files:**
- Modify: `reviewer/frontend/src/components/ActionBar.tsx`

Move select/deselect all buttons here. On Save & Cut, also save review data JSON.

- [ ] **Step 1: Update Props interface and imports**

```ts
import { useState, useCallback, useRef, useEffect } from 'react';
import type { CleanSegment, CutStatus } from '../types';
import { saveSegments, saveReviewData, startCut, getCutStatus } from '../api';
import { formatDuration } from '../utils/formatTime';

interface Props {
  video: string;
  segments: CleanSegment[];        // ALL segments (for review data)
  acceptedSegments: CleanSegment[];
  totalRemovedSeconds: number;
  onReset: () => void;
  onSelectAll: () => void;
  onDeselectAll: () => void;
}
```

Update the function signature:

```ts
export default function ActionBar({
  video,
  segments,
  acceptedSegments,
  totalRemovedSeconds,
  onReset,
  onSelectAll,
  onDeselectAll,
}: Props) {
```

- [ ] **Step 2: Update handleSaveAndCut to save review data**

Replace the `handleSaveAndCut` callback:

```ts
const handleSaveAndCut = useCallback(async () => {
  if (acceptedSegments.length === 0) return;

  try {
    // Save review data (all segments with review state)
    await saveReviewData(video, {
      video,
      reviewed_at: new Date().toISOString(),
      segments,
      accepted_count: acceptedSegments.length,
      rejected_count: segments.length - acceptedSegments.length,
      total_removed_seconds: totalRemovedSeconds,
    });

    // Save accepted segments for cutting (existing flow)
    const toSave = acceptedSegments.map(({ accepted: _, ...rest }) => rest);
    const result = await saveSegments(video, toSave);

    await startCut(video, result.file);
    setStatus({ status: 'running' });
    setElapsed(0);

    const start = Date.now();
    timerRef.current = setInterval(() => {
      setElapsed(Math.floor((Date.now() - start) / 1000));
    }, 1000);

    pollRef.current = setInterval(async () => {
      try {
        const s = await getCutStatus(video);
        if (s.status !== 'running') {
          clearInterval(timerRef.current);
          clearInterval(pollRef.current);
          setStatus(s);
        }
      } catch {
        // keep polling
      }
    }, 2000);
  } catch (e) {
    setStatus({ status: 'failed', error: String(e) });
  }
}, [video, segments, acceptedSegments, totalRemovedSeconds]);
```

- [ ] **Step 3: Add select/deselect all buttons to the left section**

Replace the left `<div>` content:

```tsx
<div className="flex items-center gap-4">
  <span className="text-sm text-text-secondary">
    <strong className="text-text-primary">{acceptedSegments.length}</strong> segments,{' '}
    <strong className="text-text-primary">{formatDuration(totalRemovedSeconds)}</strong> to remove
  </span>
  <div className="flex gap-2">
    <button onClick={onSelectAll} className="text-xs text-text-muted hover:text-accent transition-colors">
      Select all
    </button>
    <button onClick={onDeselectAll} className="text-xs text-text-muted hover:text-accent transition-colors">
      Deselect all
    </button>
  </div>
</div>
```

- [ ] **Step 4: Verify full build**

Run: `cd reviewer/frontend && npm run build`
Expected: Clean build with no errors

- [ ] **Step 5: Commit**

```bash
git add reviewer/frontend/src/components/ActionBar.tsx
git commit -m "feat: save review data JSON on Save & Cut, add select/deselect all"
```

---

### Task 8: Remove SegmentList and Final Verification

**Files:**
- Delete: `reviewer/frontend/src/components/SegmentList.tsx`

- [ ] **Step 1: Verify SegmentList is no longer imported anywhere**

Search for `SegmentList` imports across the codebase. After Task 6, App.tsx should no longer import it.

Run: `grep -r "SegmentList" reviewer/frontend/src/`
Expected: No matches (or only the file itself)

- [ ] **Step 2: Delete SegmentList.tsx**

```bash
rm reviewer/frontend/src/components/SegmentList.tsx
```

- [ ] **Step 3: Full build verification**

Run: `cd reviewer/frontend && npm run build`
Expected: Clean build

Run: `cd reviewer && cargo check`
Expected: Clean check

- [ ] **Step 4: Commit**

```bash
git add -u reviewer/frontend/src/components/SegmentList.tsx
git commit -m "chore: remove unused SegmentList component"
```

---

## Verification Checklist

1. `cd reviewer/frontend && npm run build` — clean build, no TS errors
2. `cd reviewer && cargo check` — backend compiles
3. Launch reviewer, load a video — verify Properties panel shows on left (wide) or bottom (narrow)
4. Click a segment bar in timeline — verify it gets highlighted and Properties panel shows editor
5. Edit start/end time, toggle labels, change description — verify updates propagate
6. Click "Split at playhead" — verify segment splits into two at current time
7. Click "Delete segment" — verify segment removed, properties clears
8. Click scrub bar — verify segment deselects
9. Toggle collapse on Properties panel — verify it collapses to thin vertical bar
10. Toggle collapse on Transcript panel — verify same
11. Collapse both — verify center column expands to fill
12. Narrow window — verify bottom split layout with collapse toggles
13. Click "Save & Cut" — verify `review_XX.json` appears in `analysis/{video}/` AND `clean_XX_segments.json` for cutting
14. Verify `review_XX.json` contains all segments with `accepted` field, metadata
15. Select all / Deselect all buttons in action bar work
