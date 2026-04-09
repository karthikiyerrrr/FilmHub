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
    dim: colors.dim,
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

  // Snap time to nearest segment edge when shift is held
  const snapToEdge = useCallback(
    (time: number) => {
      const snapThreshold = visibleDuration * 0.015; // ~1.5% of visible range
      let closest = time;
      let closestDist = snapThreshold;
      for (const seg of segments) {
        const dStart = Math.abs(time - seg.start);
        const dEnd = Math.abs(time - seg.end);
        if (dStart < closestDist) { closestDist = dStart; closest = seg.start; }
        if (dEnd < closestDist) { closestDist = dEnd; closest = seg.end; }
      }
      return closest;
    },
    [segments, visibleDuration]
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
        let time = Math.max(0, Math.min(duration, visibleStart + fraction * visibleDuration));
        if (e.shiftKey) time = snapToEdge(time);
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
  }, [isScrubbing, duration, visibleStart, visibleDuration, onSeek, snapToEdge]);

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

      {/* Segment lanes + scrub bar wrapper (playhead spans both) */}
      <div className="relative">
        {/* Playhead — spans full height, entire thing is draggable */}
        {playheadPercent >= 0 && playheadPercent <= 100 && (
          <div
            className="absolute top-0 bottom-0 z-20 cursor-col-resize"
            style={{ left: `${playheadPercent}%` }}
            onMouseDown={e => {
              e.stopPropagation();
              e.preventDefault();
              setIsScrubbing(true);
            }}
          >
            {/* Wide invisible hit area for the full line */}
            <div className="absolute top-0 bottom-0 left-1/2 -translate-x-1/2 w-3" />
            {/* Visible head */}
            <div className="absolute -top-0.5 left-1/2 -translate-x-1/2 w-2.5 h-2.5 rounded-full bg-white shadow-[0_0_6px_rgba(255,255,255,0.5)] pointer-events-none" />
            {/* Visible line */}
            <div className="absolute top-2 bottom-0 left-1/2 -translate-x-1/2 w-0.5 bg-white/80 shadow-[0_0_4px_rgba(255,255,255,0.2)] pointer-events-none" />
          </div>
        )}

        {/* Drag tooltip floats above all lanes */}
        {dragState && dragTime !== null && dragTooltipPercent !== null && (
          <div
            className="absolute -top-6 text-[10px] font-mono bg-surface-0/95 text-text-primary px-2 py-0.5 rounded border border-border-hover pointer-events-none z-30 whitespace-nowrap"
            style={{ left: `${dragTooltipPercent}%`, transform: 'translateX(-50%)' }}
          >
            {formatTimePrecise(dragTime)}
          </div>
        )}

        {/* Segment lanes — each segment gets its own row */}
        <div className="flex flex-col gap-0.5">
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
                      isBeingDragged
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
                      isBeingDragged
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

        {/* Scrub bar — thin bar for click-to-seek */}
        <div
          className="relative h-5 mt-0.5 bg-surface-1 rounded border border-border-subtle overflow-hidden select-none"
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
        </div>
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
