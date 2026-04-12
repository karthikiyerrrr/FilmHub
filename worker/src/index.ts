import express from 'express'
import admin from 'firebase-admin'
import { Storage } from '@google-cloud/storage'
import { runAnalysis } from './pipeline.js'

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
  const { jobId, videoId, passes, gcsVideoPath, videoFilename } = req.body

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

  // Run analysis and wait for completion.
  // Cloud Run keeps the container alive as long as the request is open.
  // The API service uses fire-and-forget (fetch without await), so this
  // doesn't block the API response to the frontend.
  try {
    await runAnalysis({
      jobId,
      videoId,
      videoUrl,
      videoFilename: videoFilename || '',
      passes,
      bucketName: process.env.GCS_BUCKET || '',
    })
    res.json({ status: 'completed', jobId })
  } catch (err) {
    console.error(`Analysis failed for job ${jobId}:`, err)
    res.json({ status: 'failed', jobId })
  }
})

const PORT = parseInt(process.env.PORT || '8081')
app.listen(PORT, () => {
  console.log(`Worker service listening on port ${PORT}`)
})
