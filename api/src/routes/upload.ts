import { Router } from 'express'
import { Storage } from '@google-cloud/storage'
import admin from 'firebase-admin'
import crypto from 'crypto'
import { AuthRequest } from '../middleware/auth.js'

const router = Router()
const storage = new Storage()
const bucket = storage.bucket(process.env.GCS_BUCKET || '')

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

export default router
