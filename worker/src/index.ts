import express from 'express'
import admin from 'firebase-admin'
import { Storage } from '@google-cloud/storage'
import { runAnalysis } from './agent.js'

admin.initializeApp({
  credential: admin.credential.applicationDefault(),
})

const storage = new Storage()
const bucket = storage.bucket(process.env.GCS_BUCKET || '')

const app = express()
app.use(express.json())

app.get('/health', (_req, res) => {
  res.json({ status: 'ok' })
})

app.post('/run-analysis', async (req, res) => {
  const { jobId, videoId, passes, gcsVideoPath } = req.body

  if (!jobId || !videoId || !passes || !gcsVideoPath) {
    res.status(400).json({ error: 'Missing required fields' })
    return
  }

  console.log(`Received analysis job ${jobId} for video ${videoId}, passes: ${passes.join(', ')}`)

  let videoUrl: string
  try {
    const file = bucket.file(gcsVideoPath)
    const [url] = await file.getSignedUrl({
      action: 'read',
      expires: Date.now() + 2 * 60 * 60 * 1000,
    })
    videoUrl = url
    console.log(`Generated signed URL for ${gcsVideoPath}`)
  } catch (err) {
    console.error(`Failed to generate signed URL for ${gcsVideoPath}:`, err)
    res.status(500).json({ error: 'Failed to generate video URL' })
    return
  }

  res.json({ status: 'started' })

  // Run in background — use setTimeout to ensure response is sent first
  setTimeout(() => {
    runAnalysis({
      jobId,
      videoId,
      videoUrl,
      passes,
      bucketName: process.env.GCS_BUCKET || '',
    }).catch((err) => {
      console.error(`Analysis failed for job ${jobId}:`, err)
    })
  }, 100)
})

const PORT = parseInt(process.env.PORT || '8081')
app.listen(PORT, () => {
  console.log(`Worker service listening on port ${PORT}`)
})
