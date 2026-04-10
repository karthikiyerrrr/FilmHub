import { useState, useEffect } from 'react'
import { fetchAnalysis } from '../api'
import type { ReviewData, CleanSegment } from '../types'

export function useAnalysis(videoId: string | null) {
  const [data, setData] = useState<ReviewData | null>(null)
  const [initialSegments, setInitialSegments] = useState<CleanSegment[]>([])
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    if (!videoId) return

    setLoading(true)
    setError(null)

    fetchAnalysis(videoId)
      .then((reviewData) => {
        setData(reviewData)
        const segments = (reviewData.suggested_segments || []).map((seg) => ({
          ...seg,
          accepted: seg.accepted !== undefined ? seg.accepted : true,
        }))
        setInitialSegments(segments)
      })
      .catch((err) => setError(err.message))
      .finally(() => setLoading(false))
  }, [videoId])

  return { data, initialSegments, loading, error }
}
