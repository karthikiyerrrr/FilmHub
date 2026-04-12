// worker/src/pipeline.ts
import Anthropic from '@anthropic-ai/sdk'
import { modalTranscribe, modalDetectMusic, modalDetectGraphics } from './modal-client.js'
import { readGcsJson, readGcsBuffer, writeGcsJson } from './gcs.js'
import {
  updateJobProgress,
  markJobRunning,
  markJobCompleted,
  markJobFailed,
  updateVideoStatus,
} from './firestore.js'
import { buildAnalysisMessages, parseReviewData } from './prompts.js'

const anthropic = new Anthropic()

interface JobContext {
  jobId: string
  videoId: string
  videoUrl: string
  videoFilename: string
  passes: string[]
  bucketName: string
}

export async function runAnalysis(ctx: JobContext): Promise<void> {
  const completedPasses: string[] = []

  try {
    await markJobRunning(ctx.jobId)

    // ─── Phase 1: Run Modal detection passes in parallel ───
    await updateJobProgress(ctx.jobId, { message: 'Running detection passes...' })

    const passPromises: Array<Promise<{ pass: string; result: unknown }>> = []

    if (ctx.passes.includes('transcribe') || ctx.passes.includes('promotions')) {
      passPromises.push(
        (async () => {
          await updateJobProgress(ctx.jobId, { message: 'Transcribing audio...', currentPass: 'transcribe' })
          const result = await modalTranscribe(ctx.videoUrl, ctx.videoId, ctx.bucketName)
          completedPasses.push('transcribe')
          await updateJobProgress(ctx.jobId, { message: 'Transcription complete', completedPasses })
          return { pass: 'transcribe', result }
        })(),
      )
    }

    if (ctx.passes.includes('music')) {
      passPromises.push(
        (async () => {
          await updateJobProgress(ctx.jobId, { message: 'Detecting music...', currentPass: 'music' })
          const result = await modalDetectMusic(ctx.videoUrl, ctx.videoId, ctx.bucketName)
          completedPasses.push('music')
          await updateJobProgress(ctx.jobId, { message: 'Music detection complete', completedPasses })
          return { pass: 'music', result }
        })(),
      )
    }

    if (ctx.passes.includes('graphics')) {
      passPromises.push(
        (async () => {
          await updateJobProgress(ctx.jobId, { message: 'Detecting graphics...', currentPass: 'graphics' })
          const result = await modalDetectGraphics(ctx.videoUrl, ctx.videoId, ctx.bucketName)
          completedPasses.push('graphics')
          await updateJobProgress(ctx.jobId, { message: 'Graphics detection complete', completedPasses })
          return { pass: 'graphics', result }
        })(),
      )
    }

    const passResults = await Promise.allSettled(passPromises)

    // Log any failures but continue
    for (const r of passResults) {
      if (r.status === 'rejected') {
        console.error('Detection pass failed:', r.reason)
      }
    }

    // ─── Phase 2: Read results from GCS ───
    await updateJobProgress(ctx.jobId, { message: 'Reading detection results...' })
    const prefix = `analysis/${ctx.videoId}`

    let transcript: unknown | null = null
    let music: unknown | null = null
    let graphics: unknown | null = null

    try { transcript = await readGcsJson(`${prefix}/transcript.json`) } catch { /* not produced */ }
    try { music = await readGcsJson(`${prefix}/music.json`) } catch { /* not produced */ }
    try { graphics = await readGcsJson(`${prefix}/graphics_candidates.json`) } catch { /* not produced */ }

    // Download graphics frame images for vision analysis
    interface GraphicsCandidate {
      frame_index: number
      timestamp: number
      time_formatted: string
      before_frame: string
      after_frame: string
    }

    const graphicsFrames: Array<{
      candidateIndex: number
      timestamp: number
      timeFormatted: string
      beforeImage: Buffer
      afterImage: Buffer
    }> = []

    if (graphics && Array.isArray(graphics)) {
      const candidates = graphics as GraphicsCandidate[]
      // Download frame pairs sequentially to keep memory bounded
      for (let i = 0; i < candidates.length; i++) {
        const c = candidates[i]
        try {
          const [beforeImg, afterImg] = await Promise.all([
            readGcsBuffer(`${prefix}/graphics_frames/${c.before_frame}`),
            readGcsBuffer(`${prefix}/graphics_frames/${c.after_frame}`),
          ])
          graphicsFrames.push({
            candidateIndex: i,
            timestamp: c.timestamp,
            timeFormatted: c.time_formatted,
            beforeImage: beforeImg,
            afterImage: afterImg,
          })
        } catch (err) {
          console.error(`Failed to download frame pair for candidate ${i}:`, err)
        }
      }
    }

    // ─── Phase 3: Single Claude call for analysis ───
    await updateJobProgress(ctx.jobId, { message: 'Analyzing results with Claude...', currentPass: 'analysis' })

    const messages = buildAnalysisMessages({
      videoId: ctx.videoId,
      videoFilename: ctx.videoFilename,
      passes: ctx.passes,
      transcript,
      music,
      graphics,
      graphicsFrames,
    })

    const response = await anthropic.messages.create({
      model: 'claude-sonnet-4-20250514',
      max_tokens: 8192,
      messages,
    })

    const textBlock = response.content.find((b): b is Anthropic.TextBlock => b.type === 'text')
    if (!textBlock) {
      throw new Error('Claude returned no text response')
    }

    const reviewData = parseReviewData(textBlock.text)

    // ─── Phase 4: Upload and finalize ───
    await updateJobProgress(ctx.jobId, { message: 'Saving results...' })
    await writeGcsJson(`${prefix}/review_data.json`, reviewData)

    if (ctx.passes.includes('promotions')) {
      completedPasses.push('promotions')
    }

    await markJobCompleted(ctx.jobId)
    await updateVideoStatus(ctx.videoId, 'reviewed')

    console.log(`Analysis complete for job ${ctx.jobId}`)
  } catch (error) {
    const errorMsg = error instanceof Error ? error.message : String(error)
    console.error(`Analysis failed for job ${ctx.jobId}:`, errorMsg)
    try {
      await markJobFailed(ctx.jobId, errorMsg)
      await updateVideoStatus(ctx.videoId, 'uploaded')
    } catch (firestoreErr) {
      console.error(`Failed to update Firestore after error:`, firestoreErr)
    }
  }
}
