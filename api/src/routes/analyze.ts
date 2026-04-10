import { Router } from 'express'
import admin from 'firebase-admin'
import { CloudTasksClient } from '@google-cloud/tasks'
import crypto from 'crypto'
import { AuthRequest } from '../middleware/auth.js'

const router = Router()
const tasksClient = new CloudTasksClient()

const GCP_PROJECT = process.env.GCP_PROJECT || 'gweebler'
const CLOUD_TASKS_LOCATION = process.env.CLOUD_TASKS_LOCATION || 'us-west1'
const CLOUD_TASKS_QUEUE = process.env.CLOUD_TASKS_QUEUE || 'gweebler-analysis'
const WORKER_SERVICE_URL = process.env.WORKER_SERVICE_URL || ''

router.post('/analyze/:videoId', async (req: AuthRequest, res) => {
  const { videoId } = req.params as { videoId: string }
  const { passes } = req.body

  if (!passes || !Array.isArray(passes) || passes.length === 0) {
    res.status(400).json({ error: 'passes array required' })
    return
  }

  const db = admin.firestore()
  const videoDoc = await db.collection('videos').doc(videoId).get()
  if (!videoDoc.exists || videoDoc.data()?.userId !== req.uid) {
    res.status(404).json({ error: 'Video not found' })
    return
  }

  const gcsVideoPath = videoDoc.data()!.gcsPath as string
  const jobId = crypto.randomUUID()

  await db.collection('jobs').doc(jobId).set({
    videoId,
    userId: req.uid,
    status: 'queued',
    passes,
    progress: {
      currentPass: null,
      completedPasses: [],
      message: 'Queued for analysis...',
      startedAt: null,
      completedAt: null,
      error: null,
    },
    createdAt: admin.firestore.FieldValue.serverTimestamp(),
  })

  await db.collection('videos').doc(videoId).update({
    status: 'analyzing',
    updatedAt: admin.firestore.FieldValue.serverTimestamp(),
  })

  // In dev mode, call worker directly
  if (WORKER_SERVICE_URL.includes('localhost')) {
    fetch(`${WORKER_SERVICE_URL}/run-analysis`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ jobId, videoId, passes, gcsVideoPath }),
    }).catch((err) => console.error('Worker call failed:', err))
  } else {
    const queuePath = tasksClient.queuePath(GCP_PROJECT, CLOUD_TASKS_LOCATION, CLOUD_TASKS_QUEUE)
    await tasksClient.createTask({
      parent: queuePath,
      task: {
        httpRequest: {
          httpMethod: 'POST',
          url: `${WORKER_SERVICE_URL}/run-analysis`,
          headers: { 'Content-Type': 'application/json' },
          body: Buffer.from(JSON.stringify({ jobId, videoId, passes, gcsVideoPath })).toString('base64'),
          oidcToken: {
            serviceAccountEmail: `${GCP_PROJECT}@appspot.gserviceaccount.com`,
          },
        },
      },
    })
  }

  res.json({ jobId })
})

export default router
