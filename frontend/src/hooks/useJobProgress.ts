import { useState, useEffect } from 'react'
import { doc, onSnapshot } from 'firebase/firestore'
import { db } from '../firebase'
import type { AnalysisJob } from '../types'

export function useJobProgress(jobId: string | null) {
  const [job, setJob] = useState<AnalysisJob | null>(null)

  useEffect(() => {
    if (!jobId) {
      setJob(null)
      return
    }

    const unsubscribe = onSnapshot(doc(db, 'jobs', jobId), (snapshot) => {
      if (snapshot.exists()) {
        setJob({ id: snapshot.id, ...snapshot.data() } as AnalysisJob)
      }
    })

    return unsubscribe
  }, [jobId])

  return job
}
