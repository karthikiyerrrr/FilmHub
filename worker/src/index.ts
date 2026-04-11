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

  // Run analysis and keep request open until complete
  // (Cloud Run terminates containers after response is sent)
  try {
    console.log(`Starting analysis for job ${jobId}...`)
    await runAnalysis({
      jobId,
      videoId,
      videoUrl,
      videoFilename: videoFilename || gcsVideoPath.split('/').pop() || 'video.mp4',
      passes,
      bucketName: process.env.GCS_BUCKET || '',
    })
    console.log(`Analysis completed for job ${jobId}`)
    res.json({ status: 'completed' })
  } catch (err) {
    console.error(`Analysis failed for job ${jobId}:`, err)
    res.status(500).json({ status: 'failed', error: String(err) })
  }
})

const PORT = parseInt(process.env.PORT || '8081')
app.listen(PORT, () => {
  console.log(`Worker service listening on port ${PORT}`)
})
