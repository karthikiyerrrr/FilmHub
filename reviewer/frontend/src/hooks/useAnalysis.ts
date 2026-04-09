import { useState, useEffect } from 'react';
import type { ReviewData, CleanSegment } from '../types';
import { fetchAnalysis } from '../api';

export function useAnalysis(video: string | null) {
  const [data, setData] = useState<ReviewData | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!video) return;
    setLoading(true);
    setError(null);

    fetchAnalysis(video)
      .then(setData)
      .catch(e => setError(e.message))
      .finally(() => setLoading(false));
  }, [video]);

  const initialSegments: CleanSegment[] =
    data?.suggested_segments?.map(s => ({
      ...s,
      accepted: true,
    })) ?? [];

  return { data, loading, error, initialSegments };
}
