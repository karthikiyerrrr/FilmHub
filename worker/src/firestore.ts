// worker/src/firestore.ts
import admin from 'firebase-admin'

const db = () => admin.firestore()

export async function updateJobProgress(jobId: string, updates: {
  message: string
  currentPass?: string | null
  completedPasses?: string[]
}): Promise<void> {
  const data: Record<string, unknown> = {
    'progress.message': updates.message,
  }
  if (updates.currentPass !== undefined) {
    data['progress.currentPass'] = updates.currentPass
  }
  if (updates.completedPasses) {
    data['progress.completedPasses'] = updates.completedPasses
  }
  await db().collection('jobs').doc(jobId).update(data)
}

export async function markJobRunning(jobId: string): Promise<void> {
  await db().collection('jobs').doc(jobId).update({
    status: 'running',
    'progress.startedAt': admin.firestore.FieldValue.serverTimestamp(),
    'progress.message': 'Starting analysis...',
  })
}

export async function markJobCompleted(jobId: string): Promise<void> {
  await db().collection('jobs').doc(jobId).update({
    status: 'completed',
    'progress.completedAt': admin.firestore.FieldValue.serverTimestamp(),
    'progress.message': 'Analysis complete',
    'progress.currentPass': null,
  })
}

export async function markJobFailed(jobId: string, error: string): Promise<void> {
  await db().collection('jobs').doc(jobId).update({
    status: 'failed',
    'progress.error': error,
    'progress.message': `Analysis failed: ${error}`,
    'progress.completedAt': admin.firestore.FieldValue.serverTimestamp(),
  })
}

export async function updateVideoStatus(videoId: string, status: string): Promise<void> {
  await db().collection('videos').doc(videoId).update({
    status,
    updatedAt: admin.firestore.FieldValue.serverTimestamp(),
  })
}
