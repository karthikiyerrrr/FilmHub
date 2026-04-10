import { useState, useEffect, useCallback, useRef } from 'react';
import type { RefObject } from 'react';
import type { CleanSegment } from '../types';

interface DragState {
  segmentIndex: number;
  edge: 'start' | 'end';
}

interface UseHandleDragOptions {
  timelineRef: RefObject<HTMLDivElement | null>;
  duration: number;
  visibleStart: number;
  visibleDuration: number;
  segments: CleanSegment[];
  onUpdateTimes: (index: number, start: number, end: number) => void;
  onSeek: (time: number) => void;
  onBeginBatch?: () => void;
  onEndBatch?: () => void;
}

const MIN_SEGMENT_DURATION = 0.5;

export function useHandleDrag({
  timelineRef,
  duration,
  visibleStart,
  visibleDuration,
  segments,
  onUpdateTimes,
  onSeek,
  onBeginBatch,
  onEndBatch,
}: UseHandleDragOptions) {
  const [dragState, setDragState] = useState<DragState | null>(null);
  const [dragTime, setDragTime] = useState<number | null>(null);
  const [dragCursorX, setDragCursorX] = useState(0);
  const rafRef = useRef(0);
  const latestRef = useRef({ segments, visibleStart, visibleDuration, duration });
  latestRef.current = { segments, visibleStart, visibleDuration, duration };

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

  const onHandleMouseDown = useCallback(
    (e: React.MouseEvent, segmentIndex: number, edge: 'start' | 'end') => {
      e.stopPropagation();
      e.preventDefault();
      onBeginBatch?.();
      setDragState({ segmentIndex, edge });
      const time = clientXToTime(e.clientX);
      setDragTime(time);
      setDragCursorX(e.clientX);
      onSeek(time);
    },
    [clientXToTime, onSeek, onBeginBatch]
  );

  useEffect(() => {
    if (!dragState) return;

    const handleMove = (e: MouseEvent) => {
      cancelAnimationFrame(rafRef.current);
      rafRef.current = requestAnimationFrame(() => {
        const { segments: segs, duration: dur } = latestRef.current;
        const seg = segs[dragState.segmentIndex];
        if (!seg) return;

        let time = clientXToTime(e.clientX);
        time = Math.max(0, Math.min(dur, time));

        if (dragState.edge === 'start') {
          time = Math.min(time, seg.end - MIN_SEGMENT_DURATION);
          time = Math.max(0, time);
          onUpdateTimes(dragState.segmentIndex, time, seg.end);
        } else {
          time = Math.max(time, seg.start + MIN_SEGMENT_DURATION);
          time = Math.min(dur, time);
          onUpdateTimes(dragState.segmentIndex, seg.start, time);
        }

        setDragTime(time);
        setDragCursorX(e.clientX);
        onSeek(time);
      });
    };

    const handleUp = () => {
      cancelAnimationFrame(rafRef.current);
      setDragState(null);
      setDragTime(null);
      onEndBatch?.();
    };

    window.addEventListener('mousemove', handleMove);
    window.addEventListener('mouseup', handleUp);
    return () => {
      cancelAnimationFrame(rafRef.current);
      window.removeEventListener('mousemove', handleMove);
      window.removeEventListener('mouseup', handleUp);
    };
  }, [dragState, clientXToTime, onUpdateTimes, onSeek, onEndBatch]);

  return { dragState, dragTime, dragCursorX, onHandleMouseDown };
}
