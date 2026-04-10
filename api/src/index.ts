import express from 'express'
import cors from 'cors'
import admin from 'firebase-admin'
import { authMiddleware } from './middleware/auth.js'
import uploadRouter from './routes/upload.js'
import videosRouter from './routes/videos.js'

admin.initializeApp({
  credential: admin.credential.applicationDefault(),
})

const app = express()
app.use(cors({ origin: true }))
app.use(express.json())

// Health check (no auth)
app.get('/health', (_req, res) => {
  res.json({ status: 'ok' })
})

// All /api routes require auth
app.use('/api', authMiddleware)

app.use('/api', uploadRouter)
app.use('/api', videosRouter)

const PORT = parseInt(process.env.PORT || '8080')
app.listen(PORT, () => {
  console.log(`API server listening on port ${PORT}`)
})
