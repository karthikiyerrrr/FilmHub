import { useState, useCallback, useMemo } from 'react';
import type { CleanSegment, SegmentType } from '../types';

export function useSegments(initial: CleanSegment[]) {
  const [segments, setSegments] = useState<CleanSegment[]>(initial);

  const toggle = useCallback((index: number) => {
    setSegments(prev =>
      prev.map((s, i) => (i === index ? { ...s, accepted: !s.accepted } : s))
    );
  }, []);

  const updateTimes = useCallback(
    (index: number, start: number, end: number) => {
      setSegments(prev =>
        prev.map((s, i) => (i === index ? { ...s, start, end } : s))
      );
    },
    []
  );

  const updateDescription = useCallback(
    (index: number, description: string) => {
      setSegments(prev =>
        prev.map((s, i) => (i === index ? { ...s, description } : s))
      );
    },
    []
  );

  const addSegment = useCallback(
    (seg: { start: number; end: number; types: SegmentType[]; description: string }) => {
      setSegments(prev =>
        [...prev, { ...seg, accepted: true }].sort((a, b) => a.start - b.start)
      );
    },
    []
  );

  const removeSegment = useCallback((index: number) => {
    setSegments(prev => prev.filter((_, i) => i !== index));
  }, []);

  const selectAll = useCallback(() => {
    setSegments(prev => prev.map(s => ({ ...s, accepted: true })));
  }, []);

  const deselectAll = useCallback(() => {
    setSegments(prev => prev.map(s => ({ ...s, accepted: false })));
  }, []);

  const resetToOriginal = useCallback(() => {
    setSegments(initial);
  }, [initial]);

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
    addSegment,
    removeSegment,
    selectAll,
    deselectAll,
    resetToOriginal,
    acceptedSegments,
    totalRemovedSeconds,
  };
}
