import { Router } from 'express'
import { Storage } from '@google-cloud/storage'
import admin from 'firebase-admin'
import { AuthRequest } from '../middleware/auth.js'

const router = Router()
const storage = new Storage()
const bucket = storage.bucket(process.env.GCS_BUCKET || '')

const MODAL_ENDPOINT_URL = process.env.MODAL_ENDPOINT_URL || ''
const MODAL_AUTH_TOKEN = process.env.MODAL_AUTH_TOKEN || ''

router.post('/cut/:videoId', async (req: AuthRequest, res) => {
  const { videoId } = req.params as { videoId: string }
  const { segmentsFile } = req.body

  const db = admin.firestore()
  const videoDoc = await db.collection('videos').doc(videoId).get()
  if (!videoDoc.exists || videoDoc.data()?.userId !== req.uid) {
    res.status(404).json({ error: 'Video not found' })
    return
  }

  const videoData = videoDoc.data()!
  const gcsVideoPath = videoData.gcsPath as string
  const filename = videoData.filename as string

  const [segContent] = await bucket.file(segmentsFile).download()
  const segments = JSON.parse(segContent.toString())

  const [videoUrl] = await bucket.file(gcsVideoPath).getSignedUrl({
    action: 'read',
    expires: Date.now() + 2 * 60 * 60 * 1000,
  })

  const cutJobId = `cut_${videoId}`
  await db.collection('cuts').doc(cutJobId).set({
    videoId,
    userId: req.uid,
    status: 'running',
    createdAt: admin.firestore.FieldValue.serverTimestamp(),
  })

  try {
    const modalRes = await fetch(`${MODAL_ENDPOINT_URL}/cut_video`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${MODAL_AUTH_TOKEN}`,
      },
      body: JSON.stringify({
        video_url: videoUrl,
        video_id: videoId,
        filename,
        segments,
        bucket: process.env.GCS_BUCKET,
      }),
    })

    if (!modalRes.ok) {
      throw new Error(`Modal cut failed: ${await modalRes.text()}`)
    }

    const result = await modalRes.json() as { gcs_path: string }

    const [downloadUrl] = await bucket.file(result.gcs_path).getSignedUrl({
      action: 'read',
      expires: Date.now() + 60 * 60 * 1000,
    })

    await db.collection('cuts').doc(cutJobId).update({
      status: 'done',
      gcsPath: result.gcs_path,
      downloadUrl,
    })

    await db.collection('videos').doc(videoId).update({
      status: 'cut',
      updatedAt: admin.firestore.FieldValue.serverTimestamp(),
    })

    res.json({ status: 'done', downloadUrl })

  } catch (error) {
    const errorMsg = error instanceof Error ? error.message : String(error)
    await db.collection('cuts').doc(cutJobId).update({
      status: 'failed',
      error: errorMsg,
    })
    res.status(500).json({ status: 'failed', error: errorMsg })
  }
})

router.get('/cut/:videoId/status', async (req: AuthRequest, res) => {
  const { videoId } = req.params as { videoId: string }
  const db = admin.firestore()

  const cutJobId = `cut_${videoId}`
  const doc = await db.collection('cuts').doc(cutJobId).get()

  if (!doc.exists) {
    res.json({ status: 'idle' })
    return
  }

  const data = doc.data()!
  if (data.userId !== req.uid) {
    res.status(404).json({ error: 'Not found' })
    return
  }

  res.json({
    status: data.status,
    downloadUrl: data.downloadUrl || undefined,
    error: data.error || undefined,
  })
})

export default router
