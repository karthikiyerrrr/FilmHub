# Timeline Lanes & Video Scaling Fix

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Fix VideoPlayer scaling on wide screens and redesign the timeline to show segments as individual horizontal bars (lanes) above a video scrub bar, eliminating handle overlap between adjacent segments.

**Architecture:** Replace the single-bar overlay model (all segments stacked on one `h-12` bar) with a multi-lane layout: each segment renders as its own horizontal bar positioned by time, stacked vertically above a thin video scrub bar. The scrub bar retains playhead, click-to-seek, and zoom/pan. Each segment bar has independent left/right drag handles with no risk of overlapping adjacent segments. VideoPlayer gets proper `max-w-full` containment to prevent overflow on wide viewports.

**Tech Stack:** React 19, TypeScript, Tailwind CSS v4, existing `useHandleDrag` hook (minor update)

---

### Task 1: Fix VideoPlayer Scaling

**Files:**
- Modify: `reviewer/frontend/src/components/VideoPlayer.tsx:47-49`
- Modify: `reviewer/frontend/src/App.tsx:213-214`

The video overflows on wide screens because the `aspect-video` container has no width constraint. The parent `max-h-[50vh]` limits height but allows unbounded width expansion to maintain 16:9.

- [ ] **Step 1: Constrain the VideoPlayer container width**

In `VideoPlayer.tsx`, change the outer container div (line 48) from:

```tsx
<div className="flex flex-col bg-black rounded-lg overflow-hidden shadow-[0_0_40px_rgba(0,0,0,0.5)]">
```

to:

```tsx
<div className="flex flex-col bg-black rounded-lg overflow-hidden shadow-[0_0_40px_rgba(0,0,0,0.5)] max-w-full">
```

- [ ] **Step 2: Constrain the parent wrapper in App.tsx**

In `App.tsx`, change the VideoPlayer wrapper (line 214) from:

```tsx
<div className="max-h-[50vh] flex justify-center">
```

to:

```tsx
<div className="max-h-[50vh] flex justify-center max-w-full overflow-hidden">
```

- [ ] **Step 3: Verify fix**

Run: `cd reviewer/frontend && npm run build`
Expected: Clean build, no errors.

Manual test: Open the app in a wide browser window (>1920px). The video should scale down to fit within the viewport width while maintaining aspect ratio, never getting clipped.

- [ ] **Step 4: Commit**

```bash
git add reviewer/frontend/src/components/VideoPlayer.tsx reviewer/frontend/src/App.tsx
git commit -m "fix: constrain VideoPlayer width to prevent overflow on wide screens"
```

---

### Task 2: Redesign Timeline — Segment Lanes Above Scrub Bar

**Files:**
- Modify: `reviewer/frontend/src/components/Timeline.tsx` (major rewrite)
- Modify: `reviewer/frontend/src/hooks/useHandleDrag.ts` (update containerRef to use scrub bar ref for time calculations)

The current timeline renders all segments as overlapping rectangles on a single `h-12` bar. When adjacent segments share a boundary, their drag handles overlap, making them impossible to independently tune. The fix: render each segment as its own horizontal bar in a vertically stacked lane layout above a thin video scrub bar.

**New layout structure:**

```
[Mini overview] (when zoomed)
[Time markers]
[Segment lane 0: =====[handles]=====           ]  <- segment bar
[Segment lane 1:        =====[handles]=====     ]  <- segment bar
[Segment lane 2:                  =====[handles]]  <- segment bar
[Scrub bar + playhead]  <- thin bar for click-to-seek, playhead
[Zoom controls]
```

Each segment bar is positioned horizontally by its `start`/`end` times (like before) but vertically each gets its own row. Drag handles live on the segment bars, not the scrub bar. The scrub bar is a thin `h-3` bar for click-to-seek and playhead display only.

- [ ] **Step 1: Update useHandleDrag to accept a separate time-reference container**

The hook currently uses `containerRef` for both rendering context and time-to-pixel conversion. Since segment bars and the scrub bar share the same horizontal time scale, we need the hook to use the scrub bar's container for `clientXToTime` calculations (since that's the full-width reference element).

In `useHandleDrag.ts`, rename the `containerRef` parameter to `timelineRef` for clarity (it will point to the outer wrapper that spans the full timeline width):

```ts
interface UseHandleDragOptions {
  timelineRef: RefObject<HTMLDivElement | null>;  // renamed from containerRef
  duration: number;
  visibleStart: number;
  visibleDuration: number;
  segments: CleanSegment[];
  onUpdateTimes: (index: number, start: number, end: number) => void;
  onSeek: (time: number) => void;
}
```

Update the `clientXToTime` function to use `timelineRef` instead of `containerRef`:

```ts
const clientXToTime = useCallback(
  (clientX: number): number => {
    const container = timelineRef.current;
    if (!container) return 0;
    const rect = container.getBoundingClientRect();
    const fraction = (clientX - rect.left) / rect.width;
    return latestRef.current.visibleStart + fraction * latestRef.current.visibleDuration;
  },
  [timelineRef]
);
```

No other changes to the hook — the drag logic is correct (updates only the target segment, enforces 0.5s minimum).

- [ ] **Step 2: Rewrite Timeline.tsx with lane layout**

Replace the segment rendering section of `Timeline.tsx`. The key structural changes:

1. Add a `timelineRef` on an outer wrapper div that spans the full width (used for all time-to-pixel conversions)
2. Render segment lanes in a vertical stack above the scrub bar
3. Move drag handles from the scrub bar to the segment lane bars
4. Make the scrub bar a thin `h-3` bar with just playhead + click-to-seek + segment background hints

Here's the full rewritten component:

```tsx
import { useRef, useState, useCallback, useEffect } from 'react';
import type { CleanSegment } from '../types';
import { useHandleDrag } from '../hooks/useHandleDrag';
import { formatTime, formatTimePrecise } from '../utils/formatTime';

const TYPE_COLORS: Record<string, { normal: string; dim: string; border: string; label: string }> = {
  music: {
    normal: 'rgba(59, 130, 246, 0.4)',
    dim: 'rgba(59, 130, 246, 0.12)',
    border: 'rgba(59, 130, 246, 0.7)',
    label: 'rgba(59, 130, 246, 0.9)',
  },
  graphics: {
    normal: 'rgba(34, 197, 94, 0.4)',
    dim: 'rgba(34, 197, 94, 0.12)',
    border: 'rgba(34, 197, 94, 0.7)',
    label: 'rgba(34, 197, 94, 0.9)',
  },
  promotions: {
    normal: 'rgba(239, 68, 68, 0.4)',
    dim: 'rgba(239, 68, 68, 0.12)',
    border: 'rgba(239, 68, 68, 0.7)',
    label: 'rgba(239, 68, 68, 0.9)',
  },
};

function segmentColors(types: string[], accepted: boolean) {
  const colors = TYPE_COLORS[types[0]] || TYPE_COLORS.promotions;
  return {
    bg: accepted ? colors.normal : colors.dim,
    border: colors.border,
    label: colors.label,
  };
}

interface Props {
  duration: number;
  currentTime: number;
  segments: CleanSegment[];
  onSeek: (time: number) => void;
  onUpdateTimes: (index: number, start: number, end: number) => void;
}

export default function Timeline({ duration, currentTime, segments, onSeek, onUpdateTimes }: Props) {
  const timelineRef = useRef<HTMLDivElement>(null);
  const [zoom, setZoom] = useState(1);
  const [panOffset, setPanOffset] = useState(0);
  const [isPanning, setIsPanning] = useState(false);
  const [isScrubbing, setIsScrubbing] = useState(false);
  const panStartRef = useRef({ x: 0, offset: 0 });
  const rafScrubRef = useRef(0);

  const visibleDuration = duration / zoom;
  const visibleStart = panOffset * duration;

  const { dragState, dragTime, dragCursorX, onHandleMouseDown } = useHandleDrag({
    timelineRef,
    duration,
    visibleStart,
    visibleDuration,
    segments,
    onUpdateTimes,
    onSeek,
  });

  const timeToPercent = useCallback(
    (time: number) => ((time - visibleStart) / visibleDuration) * 100,
    [visibleStart, visibleDuration]
  );

  const clientXToTime = useCallback(
    (clientX: number) => {
      const container = timelineRef.current;
      if (!container) return 0;
      const rect = container.getBoundingClientRect();
      const fraction = (clientX - rect.left) / rect.width;
      return Math.max(0, Math.min(duration, visibleStart + fraction * visibleDuration));
    },
    [visibleStart, visibleDuration, duration]
  );

  // Mouse down on scrub bar: start scrubbing or panning
  const handleScrubMouseDown = useCallback(
    (e: React.MouseEvent) => {
      if (dragState) return;

      if (zoom > 1 && (e.button === 1 || e.altKey)) {
        e.preventDefault();
        setIsPanning(true);
        panStartRef.current = { x: e.clientX, offset: panOffset };
        return;
      }

      if (e.button === 0) {
        e.preventDefault();
        const time = clientXToTime(e.clientX);
        onSeek(time);
        setIsScrubbing(true);
      }
    },
    [zoom, panOffset, dragState, clientXToTime, onSeek]
  );

  // Scrubbing: live seek
  useEffect(() => {
    if (!isScrubbing) return;
    const handleMove = (e: MouseEvent) => {
      cancelAnimationFrame(rafScrubRef.current);
      rafScrubRef.current = requestAnimationFrame(() => {
        const container = timelineRef.current;
        if (!container) return;
        const rect = container.getBoundingClientRect();
        const fraction = (e.clientX - rect.left) / rect.width;
        const time = Math.max(0, Math.min(duration, visibleStart + fraction * visibleDuration));
        onSeek(time);
      });
    };
    const handleUp = () => {
      cancelAnimationFrame(rafScrubRef.current);
      setIsScrubbing(false);
    };
    window.addEventListener('mousemove', handleMove);
    window.addEventListener('mouseup', handleUp);
    return () => {
      cancelAnimationFrame(rafScrubRef.current);
      window.removeEventListener('mousemove', handleMove);
      window.removeEventListener('mouseup', handleUp);
    };
  }, [isScrubbing, duration, visibleStart, visibleDuration, onSeek]);

  // Panning
  useEffect(() => {
    if (!isPanning) return;
    const handleMove = (e: MouseEvent) => {
      const container = timelineRef.current;
      if (!container) return;
      const dx = e.clientX - panStartRef.current.x;
      const containerWidth = container.getBoundingClientRect().width;
      const timeDelta = (dx / containerWidth) * visibleDuration;
      let newStart = panStartRef.current.offset * duration - timeDelta;
      newStart = Math.max(0, Math.min(duration - visibleDuration, newStart));
      setPanOffset(duration > 0 ? newStart / duration : 0);
    };
    const handleUp = () => setIsPanning(false);
    window.addEventListener('mousemove', handleMove);
    window.addEventListener('mouseup', handleUp);
    return () => {
      window.removeEventListener('mousemove', handleMove);
      window.removeEventListener('mouseup', handleUp);
    };
  }, [isPanning, duration, visibleDuration]);

  const handleWheel = useCallback(
    (e: React.WheelEvent) => {
      e.preventDefault();
      const rect = e.currentTarget.getBoundingClientRect();
      const mouseX = (e.clientX - rect.left) / rect.width;
      const mouseTime = visibleStart + mouseX * visibleDuration;

      const newZoom = Math.max(1, Math.min(50, zoom * (e.deltaY < 0 ? 1.2 : 1 / 1.2)));
      const newVisibleDuration = duration / newZoom;
      let newStart = mouseTime - mouseX * newVisibleDuration;
      newStart = Math.max(0, Math.min(duration - newVisibleDuration, newStart));

      setZoom(newZoom);
      setPanOffset(duration > 0 ? newStart / duration : 0);
    },
    [zoom, duration, visibleStart, visibleDuration]
  );

  const playheadPercent = timeToPercent(currentTime);

  // Time markers
  const markerInterval = getMarkerInterval(visibleDuration);
  const markers: number[] = [];
  const firstMarker = Math.ceil(visibleStart / markerInterval) * markerInterval;
  for (let t = firstMarker; t <= visibleStart + visibleDuration; t += markerInterval) {
    markers.push(t);
  }

  // Drag tooltip
  let dragTooltipPercent: number | null = null;
  if (dragState && dragTime !== null && timelineRef.current) {
    const rect = timelineRef.current.getBoundingClientRect();
    dragTooltipPercent = ((dragCursorX - rect.left) / rect.width) * 100;
    dragTooltipPercent = Math.max(0, Math.min(100, dragTooltipPercent));
  }

  return (
    <div ref={timelineRef} className="flex flex-col gap-1" onWheel={handleWheel}>
      {/* Mini overview when zoomed */}
      {zoom > 1 && (
        <div className="relative h-2.5 bg-surface-2 rounded-sm overflow-hidden border border-border-subtle">
          {segments.map((seg, i) => (
            <div
              key={i}
              className="absolute top-0 bottom-0"
              style={{
                left: `${(seg.start / duration) * 100}%`,
                width: `${((seg.end - seg.start) / duration) * 100}%`,
                backgroundColor: segmentColors(seg.types, seg.accepted).bg,
              }}
            />
          ))}
          <div
            className="absolute top-0 bottom-0 border border-white/30 bg-white/5 rounded-[1px]"
            style={{
              left: `${panOffset * 100}%`,
              width: `${(1 / zoom) * 100}%`,
            }}
          />
        </div>
      )}

      {/* Time markers */}
      <div className="relative h-5 text-[10px] text-text-muted select-none">
        {markers.map(t => (
          <span
            key={t}
            className="absolute -translate-x-1/2 font-mono"
            style={{ left: `${timeToPercent(t)}%` }}
          >
            {formatTime(t)}
          </span>
        ))}
      </div>

      {/* Segment lanes — each segment gets its own row */}
      <div className="flex flex-col gap-0.5 relative">
        {/* Drag tooltip floats above all lanes */}
        {dragState && dragTime !== null && dragTooltipPercent !== null && (
          <div
            className="absolute -top-6 text-[10px] font-mono bg-surface-0/95 text-text-primary px-2 py-0.5 rounded border border-border-hover pointer-events-none z-30 whitespace-nowrap"
            style={{ left: `${dragTooltipPercent}%`, transform: 'translateX(-50%)' }}
          >
            {formatTimePrecise(dragTime)}
          </div>
        )}

        {segments.map((seg, i) => {
          const left = timeToPercent(seg.start);
          const right = timeToPercent(seg.end);
          if (right < 0 || left > 100) return null;

          const colors = segmentColors(seg.types, seg.accepted);
          const isBeingDragged = dragState?.segmentIndex === i;
          const clampedLeft = Math.max(0, left);
          const clampedRight = Math.min(100, right);

          return (
            <div key={i} className="relative h-7 group select-none">
              {/* Connector line spanning full width at midpoint */}
              <div
                className="absolute top-1/2 h-px bg-border-subtle -translate-y-1/2"
                style={{ left: `${clampedLeft}%`, width: `${clampedRight - clampedLeft}%` }}
              />

              {/* Segment bar */}
              <div
                className="absolute top-0.5 bottom-0.5 rounded-sm"
                style={{
                  left: `${clampedLeft}%`,
                  width: `${clampedRight - clampedLeft}%`,
                  backgroundColor: colors.bg,
                  borderLeft: left >= 0 ? `1px solid ${colors.border}` : undefined,
                  borderRight: right <= 100 ? `1px solid ${colors.border}` : undefined,
                  zIndex: isBeingDragged ? 15 : 5,
                }}
              >
                {/* Type label (visible if bar is wide enough) */}
                <span
                  className="absolute inset-0 flex items-center px-1.5 text-[9px] font-medium truncate pointer-events-none"
                  style={{ color: colors.label }}
                >
                  {seg.types.join(', ')}
                </span>

                {/* Left handle (in-point) */}
                <div
                  className={`absolute left-0 top-0 bottom-0 w-3 -ml-1.5 cursor-col-resize z-20 flex items-center justify-center transition-opacity ${
                    isBeingDragged && dragState?.edge === 'start'
                      ? 'opacity-100'
                      : 'opacity-0 group-hover:opacity-100'
                  }`}
                  onMouseDown={e => onHandleMouseDown(e, i, 'start')}
                >
                  <div className="w-1 h-4 rounded-full bg-white/90 shadow-[0_0_4px_rgba(255,255,255,0.3)]" />
                </div>

                {/* Right handle (out-point) */}
                <div
                  className={`absolute right-0 top-0 bottom-0 w-3 -mr-1.5 cursor-col-resize z-20 flex items-center justify-center transition-opacity ${
                    isBeingDragged && dragState?.edge === 'end'
                      ? 'opacity-100'
                      : 'opacity-0 group-hover:opacity-100'
                  }`}
                  onMouseDown={e => onHandleMouseDown(e, i, 'end')}
                >
                  <div className="w-1 h-4 rounded-full bg-white/90 shadow-[0_0_4px_rgba(255,255,255,0.3)]" />
                </div>
              </div>
            </div>
          );
        })}
      </div>

      {/* Scrub bar — thin bar for click-to-seek + playhead */}
      <div
        className="relative h-3 bg-surface-1 rounded border border-border-subtle overflow-hidden select-none"
        onMouseDown={handleScrubMouseDown}
        style={{
          cursor: isScrubbing
            ? 'col-resize'
            : isPanning
            ? 'grabbing'
            : zoom > 1
            ? 'crosshair'
            : 'pointer',
        }}
      >
        {/* Faint segment indicators on scrub bar */}
        {segments.map((seg, i) => {
          const left = timeToPercent(seg.start);
          const right = timeToPercent(seg.end);
          if (right < 0 || left > 100) return null;
          const colors = segmentColors(seg.types, seg.accepted);
          return (
            <div
              key={i}
              className="absolute top-0 bottom-0"
              style={{
                left: `${Math.max(0, left)}%`,
                width: `${Math.min(100, right) - Math.max(0, left)}%`,
                backgroundColor: colors.dim,
              }}
            />
          );
        })}

        {/* Playhead */}
        {playheadPercent >= 0 && playheadPercent <= 100 && (
          <div
            className="absolute top-0 bottom-0 pointer-events-none z-20"
            style={{ left: `${playheadPercent}%` }}
          >
            <div className="absolute -top-0.5 left-1/2 -translate-x-1/2 w-1.5 h-1.5 rounded-full bg-white shadow-[0_0_4px_rgba(255,255,255,0.4)]" />
            <div className="absolute top-0 bottom-0 left-1/2 -translate-x-1/2 w-px bg-white shadow-[0_0_3px_rgba(255,255,255,0.2)]" />
          </div>
        )}
      </div>

      {/* Zoom controls */}
      <div className="flex items-center gap-3 text-[10px] text-text-muted">
        <button
          onClick={() => {
            setZoom(1);
            setPanOffset(0);
          }}
          className="hover:text-text-primary transition-colors"
        >
          Reset
        </button>
        <span className="font-mono text-text-secondary">{zoom.toFixed(1)}x</span>
        <span>Scroll to zoom, Alt+drag to pan</span>
      </div>
    </div>
  );
}

function getMarkerInterval(visibleDuration: number): number {
  const target = visibleDuration / 8;
  const intervals = [1, 2, 5, 10, 15, 30, 60, 120, 300, 600, 900, 1800, 3600];
  for (const interval of intervals) {
    if (interval >= target) return interval;
  }
  return 3600;
}
```

- [ ] **Step 3: Update useHandleDrag.ts — rename containerRef to timelineRef**

In `useHandleDrag.ts`, replace all occurrences of `containerRef` with `timelineRef`:

```ts
interface UseHandleDragOptions {
  timelineRef: RefObject<HTMLDivElement | null>;
  duration: number;
  visibleStart: number;
  visibleDuration: number;
  segments: CleanSegment[];
  onUpdateTimes: (index: number, start: number, end: number) => void;
  onSeek: (time: number) => void;
}

export function useHandleDrag({
  timelineRef,
  duration,
  visibleStart,
  visibleDuration,
  segments,
  onUpdateTimes,
  onSeek,
}: UseHandleDragOptions) {
  // ...existing code...

  const clientXToTime = useCallback(
    (clientX: number): number => {
      const container = timelineRef.current;
      if (!container) return 0;
      const rect = container.getBoundingClientRect();
      const fraction = (clientX - rect.left) / rect.width;
      return latestRef.current.visibleStart + fraction * latestRef.current.visibleDuration;
    },
    [timelineRef]
  );

  // ...rest unchanged...
}
```

- [ ] **Step 4: Build and verify**

Run: `cd reviewer/frontend && npm run build`
Expected: Clean build, no TypeScript errors.

- [ ] **Step 5: Manual verification**

Open the app and verify:
1. Each segment appears as its own horizontal bar above the scrub bar
2. Segments with shared boundaries have separate, non-overlapping handles
3. Dragging one segment's handle does NOT affect adjacent segments
4. Playhead displays on the thin scrub bar
5. Click-to-seek works on the scrub bar
6. Zoom and pan still work (scroll to zoom, Alt+drag to pan)
7. Drag tooltip shows precise time above all lanes
8. Type labels (music, graphics, promotions) appear on segment bars

- [ ] **Step 6: Commit**

```bash
git add reviewer/frontend/src/components/Timeline.tsx reviewer/frontend/src/hooks/useHandleDrag.ts
git commit -m "feat: redesign timeline with per-segment lanes above scrub bar

Each segment renders as its own horizontal bar, eliminating handle
overlap between adjacent segments. Thin scrub bar retains playhead
and click-to-seek functionality."
```

---

## Verification Checklist

1. `cd reviewer/frontend && npm run build` — clean build, no errors
2. Wide browser window — video scales down, no horizontal overflow
3. Segment lanes — each segment has its own row with independent handles
4. Drag segment handle — only that segment moves, adjacent segments unaffected
5. Live preview — video frame tracks drag position in real time
6. Click scrub bar — playhead jumps, video seeks
7. Zoom + pan — still functional on scrub bar
8. Keyboard shortcuts — Space, arrows, brackets still work
