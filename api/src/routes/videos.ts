import { Router } from 'express'
import { Storage } from '@google-cloud/storage'
import admin from 'firebase-admin'
import { AuthRequest } from '../middleware/auth.js'

const router = Router()
const storage = new Storage()
const bucket = storage.bucket(process.env.GCS_BUCKET || '')

router.get('/videos', async (req: AuthRequest, res) => {
  const db = admin.firestore()
  const snapshot = await db
    .collection('videos')
    .where('userId', '==', req.uid)
    .orderBy('createdAt', 'desc')
    .get()

  const videos = snapshot.docs.map((doc) => ({
    id: doc.id,
    ...doc.data(),
  }))

  res.json(videos)
})

router.get('/videos/:videoId/url', async (req: AuthRequest, res) => {
  const videoId = req.params.videoId as string
  const db = admin.firestore()
  const doc = await db.collection('videos').doc(videoId).get()

  if (!doc.exists || doc.data()?.userId !== req.uid) {
    res.status(404).json({ error: 'Video not found' })
    return
  }

  const gcsPath = doc.data()!.gcsPath as string
  const file = bucket.file(gcsPath)

  const [signedUrl] = await file.getSignedUrl({
    action: 'read',
    expires: Date.now() + 60 * 60 * 1000,
  })

  res.json({ url: signedUrl })
})

export default router
