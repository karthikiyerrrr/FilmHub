import { Router } from 'express'
import { Storage } from '@google-cloud/storage'
import admin from 'firebase-admin'
import { AuthRequest } from '../middleware/auth.js'

const router = Router()
const storage = new Storage()
const bucket = storage.bucket(process.env.GCS_BUCKET || '')

router.get('/analysis/:videoId', async (req: AuthRequest, res) => {
  const { videoId } = req.params as { videoId: string }
  const db = admin.firestore()

  const videoDoc = await db.collection('videos').doc(videoId).get()
  if (!videoDoc.exists || videoDoc.data()?.userId !== req.uid) {
    res.status(404).json({ error: 'Video not found' })
    return
  }

  const gcsPath = `analysis/${videoId}/review_data.json`
  const file = bucket.file(gcsPath)

  try {
    const [exists] = await file.exists()
    if (!exists) {
      res.status(404).json({ error: 'Analysis not found' })
      return
    }

    const [content] = await file.download()
    const data = JSON.parse(content.toString())

    if (!data.video?.fps) {
      try {
        const videoGcsPath = videoDoc.data()!.gcsPath as string
        const videoFile = bucket.file(videoGcsPath)
        const [signedUrl] = await videoFile.getSignedUrl({
          action: 'read',
          expires: Date.now() + 10 * 60 * 1000,
        })

        const { execSync } = await import('child_process')
        const ffprobeOut = execSync(
          `ffprobe -v quiet -print_format json -show_streams "${signedUrl}"`,
          { timeout: 15000 },
        ).toString()

        const streams = JSON.parse(ffprobeOut)
        const videoStream = streams.streams?.find((s: any) => s.codec_type === 'video')
        if (videoStream?.r_frame_rate) {
          const [num, den] = videoStream.r_frame_rate.split('/')
          const rawFps = parseInt(num) / parseInt(den)
          const common = [23.976, 24.0, 25.0, 29.97, 30.0, 48.0, 50.0, 59.94, 60.0]
          const fps = common.reduce((prev, curr) =>
            Math.abs(curr - rawFps) < Math.abs(prev - rawFps) ? curr : prev
          )
          if (!data.video) data.video = {}
          data.video.fps = fps
        }
      } catch {
        // FPS injection is best-effort
      }
    }

    res.json(data)
  } catch {
    res.status(500).json({ error: 'Failed to read analysis data' })
  }
})

router.get('/analysis/:videoId/frames/:filename', async (req: AuthRequest, res) => {
  const { videoId, filename } = req.params as { videoId: string; filename: string }

  if (filename.includes('..') || filename.includes('/')) {
    res.status(400).json({ error: 'Invalid filename' })
    return
  }

  const db = admin.firestore()
  const videoDoc = await db.collection('videos').doc(videoId).get()
  if (!videoDoc.exists || videoDoc.data()?.userId !== req.uid) {
    res.status(404).json({ error: 'Not found' })
    return
  }

  const gcsPath = `analysis/${videoId}/graphics_frames/${filename}`
  const file = bucket.file(gcsPath)

  try {
    const [exists] = await file.exists()
    if (!exists) {
      res.status(404).json({ error: 'Frame not found' })
      return
    }

    res.setHeader('Content-Type', 'image/png')
    file.createReadStream().pipe(res)
  } catch {
    res.status(500).json({ error: 'Failed to read frame' })
  }
})

export default router
