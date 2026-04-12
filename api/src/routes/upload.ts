import { Router } from 'express'
import { Storage } from '@google-cloud/storage'
import admin from 'firebase-admin'
import crypto from 'crypto'
import { AuthRequest } from '../middleware/auth.js'

const router = Router()
const storage = new Storage()
const bucket = storage.bucket(process.env.GCS_BUCKET || '')
const MODAL_URL_TRANSCODE = process.env.MODAL_URL_TRANSCODE || ''
const MODAL_AUTH_TOKEN = process.env.MODAL_AUTH_TOKEN || ''

router.post('/upload/sign', async (req: AuthRequest, res) => {
  const { filename, contentType } = req.body
  if (!filename || !contentType) {
    res.status(400).json({ error: 'filename and contentType required' })
    return
  }

  const videoId = crypto.randomUUID()
  const gcsPath = `videos/${videoId}/${filename}`
  const file = bucket.file(gcsPath)

  const origin = req.headers.origin || 'https://gweebler.web.app'
  const [uploadUrl] = await file.createResumableUpload({
    metadata: { contentType },
    origin,
  })

  const db = admin.firestore()
  await db.collection('videos').doc(videoId).set({
    userId: req.uid,
    filename,
    gcsPath,
    status: 'uploaded',
    createdAt: admin.firestore.FieldValue.serverTimestamp(),
    updatedAt: admin.firestore.FieldValue.serverTimestamp(),
  })

  res.json({ videoId, uploadUrl })
})

router.post('/videos/:videoId/transcode', async (req: AuthRequest, res) => {
  const videoId = req.params.videoId as string
  const db = admin.firestore()

  const videoDoc = await db.collection('videos').doc(videoId).get()
  if (!videoDoc.exists || videoDoc.data()?.userId !== req.uid) {
    res.status(404).json({ error: 'Video not found' })
    return
  }

  const gcsPath = videoDoc.data()!.gcsPath as string
  const file = bucket.file(gcsPath)

  const [videoUrl] = await file.getSignedUrl({
    action: 'read',
    expires: Date.now() + 2 * 60 * 60 * 1000,
  })

  await db.collection('videos').doc(videoId).update({
    transcodeStatus: 'running',
    updatedAt: admin.firestore.FieldValue.serverTimestamp(),
  })

  try {
    const modalRes = await fetch(MODAL_URL_TRANSCODE, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${MODAL_AUTH_TOKEN}`,
      },
      body: JSON.stringify({
        video_url: videoUrl,
        video_id: videoId,
        bucket: process.env.GCS_BUCKET,
      }),
    })

    if (!modalRes.ok) {
      throw new Error(`Modal transcode failed: ${await modalRes.text()}`)
    }

    const result = await modalRes.json() as { gcs_path: string }

    await db.collection('videos').doc(videoId).update({
      transcodeStatus: 'done',
      previewGcsPath: result.gcs_path,
      updatedAt: admin.firestore.FieldValue.serverTimestamp(),
    })

    res.json({ status: 'done', previewGcsPath: result.gcs_path })
  } catch (error) {
    const errorMsg = error instanceof Error ? error.message : String(error)
    await db.collection('videos').doc(videoId).update({
      transcodeStatus: 'failed',
      updatedAt: admin.firestore.FieldValue.serverTimestamp(),
    })
    res.status(500).json({ status: 'failed', error: errorMsg })
  }
})

export default router
