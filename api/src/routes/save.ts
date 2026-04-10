import { Router } from 'express'
import { Storage } from '@google-cloud/storage'
import admin from 'firebase-admin'
import { AuthRequest } from '../middleware/auth.js'

const router = Router()
const storage = new Storage()
const bucket = storage.bucket(process.env.GCS_BUCKET || '')

router.post('/save/:videoId', async (req: AuthRequest, res) => {
  const { videoId } = req.params as { videoId: string }
  const { segments, reviewData } = req.body

  const db = admin.firestore()
  const videoDoc = await db.collection('videos').doc(videoId).get()
  if (!videoDoc.exists || videoDoc.data()?.userId !== req.uid) {
    res.status(404).json({ error: 'Video not found' })
    return
  }

  const prefix = `analysis/${videoId}/`
  const [files] = await bucket.getFiles({ prefix })
  const reviewFiles = files.filter((f) => /review_\d+\.json$/.test(f.name))
  const seq = reviewFiles.length + 1
  const seqStr = String(seq).padStart(2, '0')

  const reviewFile = `${prefix}review_${seqStr}.json`
  await bucket.file(reviewFile).save(JSON.stringify(reviewData, null, 2), {
    contentType: 'application/json',
  })

  const cleanSegments = segments
    .filter((s: any) => s.accepted)
    .map(({ start, end, types, description }: any) => ({ start, end, types, description }))

  const segmentsFile = `${prefix}clean_${seqStr}_segments.json`
  await bucket.file(segmentsFile).save(JSON.stringify(cleanSegments, null, 2), {
    contentType: 'application/json',
  })

  res.json({ reviewFile, segmentsFile })
})

export default router
