import { useState, useCallback, useMemo, useRef } from 'react';
import type { CleanSegment, SegmentType } from '../types';

export function useSegments(initial: CleanSegment[]) {
  const [segments, setSegments] = useState<CleanSegment[]>(initial);
  const historyRef = useRef<CleanSegment[][]>([]);
  const batchingRef = useRef(false);

  // Wrapper that pushes current state to history before applying an update.
  // During a batch (drag operations), mutations skip history — the snapshot
  // was already captured by beginBatch.
  const setSegmentsWithHistory = useCallback(
    (updater: CleanSegment[] | ((prev: CleanSegment[]) => CleanSegment[])) => {
      setSegments(prev => {
        if (!batchingRef.current) {
          historyRef.current.push(prev);
          if (historyRef.current.length > 50) historyRef.current.shift();
        }
        return typeof updater === 'function' ? updater(prev) : updater;
      });
    },
    []
  );

  // Call before a continuous operation (e.g. drag start) to snapshot once
  const beginBatch = useCallback(() => {
    setSegments(prev => {
      historyRef.current.push(prev);
      if (historyRef.current.length > 50) historyRef.current.shift();
      batchingRef.current = true;
      return prev;
    });
  }, []);

  // Call when the continuous operation ends (e.g. mouseup)
  const endBatch = useCallback(() => {
    batchingRef.current = false;
  }, []);

  const undo = useCallback(() => {
    const prev = historyRef.current.pop();
    if (prev) setSegments(prev);
  }, []);

  const canUndo = historyRef.current.length > 0;

  const toggle = useCallback((index: number) => {
    setSegmentsWithHistory(prev =>
      prev.map((s, i) => (i === index ? { ...s, accepted: !s.accepted } : s))
    );
  }, [setSegmentsWithHistory]);

  const updateTimes = useCallback(
    (index: number, start: number, end: number) => {
      setSegmentsWithHistory(prev =>
        prev.map((s, i) => (i === index ? { ...s, start, end } : s))
      );
    },
    [setSegmentsWithHistory]
  );

  const updateDescription = useCallback(
    (index: number, description: string) => {
      setSegmentsWithHistory(prev =>
        prev.map((s, i) => (i === index ? { ...s, description } : s))
      );
    },
    [setSegmentsWithHistory]
  );

  const addSegment = useCallback(
    (seg: { start: number; end: number; types: SegmentType[]; description: string }) => {
      setSegmentsWithHistory(prev =>
        [...prev, { ...seg, accepted: true }].sort((a, b) => a.start - b.start)
      );
    },
    [setSegmentsWithHistory]
  );

  const removeSegment = useCallback((index: number) => {
    setSegmentsWithHistory(prev => prev.filter((_, i) => i !== index));
  }, [setSegmentsWithHistory]);

  const selectAll = useCallback(() => {
    setSegmentsWithHistory(prev => prev.map(s => ({ ...s, accepted: true })));
  }, [setSegmentsWithHistory]);

  const deselectAll = useCallback(() => {
    setSegmentsWithHistory(prev => prev.map(s => ({ ...s, accepted: false })));
  }, [setSegmentsWithHistory]);

  const resetToOriginal = useCallback(() => {
    setSegments(initial);
    historyRef.current = [];
  }, [initial]);

  const updateTypes = useCallback(
    (index: number, types: SegmentType[]) => {
      setSegmentsWithHistory(prev =>
        prev.map((s, i) => (i === index ? { ...s, types } : s))
      );
    },
    [setSegmentsWithHistory]
  );

  const splitSegment = useCallback(
    (index: number, splitTime: number) => {
      setSegmentsWithHistory(prev => {
        const seg = prev[index];
        if (!seg || splitTime <= seg.start || splitTime >= seg.end) return prev;
        const left: CleanSegment = { ...seg, end: splitTime };
        const right: CleanSegment = { ...seg, start: splitTime };
        return [...prev.slice(0, index), left, right, ...prev.slice(index + 1)];
      });
    },
    [setSegmentsWithHistory]
  );

  const acceptedSegments = useMemo(
    () => segments.filter(s => s.accepted),
    [segments]
  );

  const totalRemovedSeconds = useMemo(
    () => acceptedSegments.reduce((sum, s) => sum + (s.end - s.start), 0),
    [acceptedSegments]
  );

  return {
    segments,
    toggle,
    updateTimes,
    updateDescription,
    updateTypes,
    splitSegment,
    addSegment,
    removeSegment,
    selectAll,
    deselectAll,
    resetToOriginal,
    undo,
    canUndo,
    beginBatch,
    endBatch,
    acceptedSegments,
    totalRemovedSeconds,
  };
}
