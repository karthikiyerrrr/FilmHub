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

  const file = bucket.file(gcsVideoPath)
  const [videoUrl] = await file.getSignedUrl({
    action: 'read',
    expires: Date.now() + 2 * 60 * 60 * 1000,
  })

  res.json({ status: 'started' })

  runAnalysis({
    jobId,
    videoId,
    videoUrl,
    passes,
    bucketName: process.env.GCS_BUCKET || '',
  }).catch((err) => {
    console.error(`Analysis failed for job ${jobId}:`, err)
  })
})

const PORT = parseInt(process.env.PORT || '8081')
app.listen(PORT, () => {
  console.log(`Worker service listening on port ${PORT}`)
})
