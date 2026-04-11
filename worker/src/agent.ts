import { query } from '@anthropic-ai/claude-agent-sdk'
import { Storage } from '@google-cloud/storage'
import admin from 'firebase-admin'
import path from 'path'
import fs from 'fs'
import os from 'os'

const storage = new Storage()

interface JobContext {
  jobId: string
  videoId: string
  videoUrl: string
  videoFilename: string
  passes: string[]
  bucketName: string
}

async function updateFirestoreProgress(jobId: string, updates: Record<string, unknown>) {
  const db = admin.firestore()
  const updateData: Record<string, unknown> = {
    'progress.message': updates.message || '',
  }
  if (updates.currentPass !== undefined) updateData['progress.currentPass'] = updates.currentPass
  if (updates.completedPasses) updateData['progress.completedPasses'] = updates.completedPasses
  await db.collection('jobs').doc(jobId).update(updateData)
}

export async function runAnalysis(ctx: JobContext): Promise<void> {
  const db = admin.firestore()

  // Create a temp working directory for this analysis
  const analysisDir = fs.mkdtempSync(path.join(os.tmpdir(), `gweebler-${ctx.videoId}-`))

  try {
    await db.collection('jobs').doc(ctx.jobId).update({
      status: 'running',
      'progress.startedAt': admin.firestore.FieldValue.serverTimestamp(),
      'progress.message': 'Starting analysis...',
    })

    // The project root where .claude/skills/ lives
    const projectRoot = process.env.PROJECT_ROOT || '/app/project'

    const prompt = `Use the analyze-video skill to analyze this video.

VIDEO_ID: ${ctx.videoId}
VIDEO_URL: ${ctx.videoUrl}
VIDEO_FILENAME: ${ctx.videoFilename}
PASSES: ${ctx.passes.join(',')}
ANALYSIS_DIR: ${analysisDir}`

    console.log(`Starting Agent SDK query for job ${ctx.jobId}...`)

    const completedPasses: string[] = []

    const q = query({
      prompt,
      options: {
        cwd: projectRoot,
        settingSources: ['project'],
        allowedTools: ['Skill', 'Read', 'Write', 'Bash', 'Glob', 'Grep'],
        permissionMode: 'bypassPermissions',
        model: 'claude-sonnet-4-20250514',
        maxTurns: 50,
        maxBudgetUsd: 5.00,
        env: {
          MODAL_URL_TRANSCRIBE: process.env.MODAL_URL_TRANSCRIBE,
          MODAL_URL_DETECT_MUSIC: process.env.MODAL_URL_DETECT_MUSIC,
          MODAL_URL_DETECT_GRAPHICS: process.env.MODAL_URL_DETECT_GRAPHICS,
          MODAL_AUTH_TOKEN: process.env.MODAL_AUTH_TOKEN,
          GCS_BUCKET: ctx.bucketName,
          VIDEO_ID: ctx.videoId,
          VIDEO_URL: ctx.videoUrl,
          VIDEO_FILENAME: ctx.videoFilename,
          ANALYSIS_DIR: analysisDir,
        },
        systemPrompt: {
          type: 'preset',
          preset: 'claude_code',
          append: `You are running inside a cloud worker container. Your job is to analyze a video using the analyze-video skill. The skill will guide you through each step. Follow the skill instructions precisely.

Do NOT ask questions — execute all steps autonomously. Do NOT skip any detection pass that is listed in PASSES.

When a Modal endpoint returns a result, proceed to the next step immediately. Do not wait for user input.`
        },
      },
    })

    for await (const message of q) {
      switch (message.type) {
        case 'assistant': {
          // Extract text content for logging
          for (const block of message.message.content) {
            if (block.type === 'text') {
              // Check for progress signals
              const text = block.text
              if (text.includes('Transcrib')) {
                if (!completedPasses.includes('transcribe')) {
                  await updateFirestoreProgress(ctx.jobId, {
                    message: 'Transcribing audio...',
                    currentPass: 'transcribe',
                  })
                }
              }
              if (text.includes('music') || text.includes('Music')) {
                if (!completedPasses.includes('music') && completedPasses.includes('transcribe') || !ctx.passes.includes('transcribe')) {
                  await updateFirestoreProgress(ctx.jobId, {
                    message: 'Detecting music...',
                    currentPass: 'music',
                  })
                }
              }
              if (text.includes('graphics') || text.includes('Graphics')) {
                if (!completedPasses.includes('graphics')) {
                  await updateFirestoreProgress(ctx.jobId, {
                    message: 'Detecting graphics...',
                    currentPass: 'graphics',
                  })
                }
              }
              if (text.includes('promoti') || text.includes('Promoti')) {
                if (!completedPasses.includes('promotions')) {
                  await updateFirestoreProgress(ctx.jobId, {
                    message: 'Detecting promotions...',
                    currentPass: 'promotions',
                  })
                }
              }
              if (text.includes('ANALYSIS_COMPLETE')) {
                console.log(`Analysis complete signal received for job ${ctx.jobId}`)
              }

              // Track completed passes
              if (text.includes('transcript.json') && text.includes('uploaded')) {
                completedPasses.push('transcribe')
                await updateFirestoreProgress(ctx.jobId, {
                  message: 'Transcription complete',
                  completedPasses,
                })
              }
              if (text.includes('music.json') && text.includes('uploaded')) {
                completedPasses.push('music')
                await updateFirestoreProgress(ctx.jobId, {
                  message: 'Music detection complete',
                  completedPasses,
                })
              }
              if (text.includes('graphics_candidates.json') && text.includes('uploaded')) {
                completedPasses.push('graphics')
                await updateFirestoreProgress(ctx.jobId, {
                  message: 'Graphics detection complete',
                  completedPasses,
                })
              }
            }
          }
          break
        }

        case 'result': {
          if (message.subtype === 'success') {
            console.log(`Agent SDK query completed for job ${ctx.jobId}. Cost: $${message.total_cost_usd.toFixed(4)}`)
          } else {
            console.error(`Agent SDK query failed for job ${ctx.jobId}:`, message.errors)
            throw new Error(`Agent failed: ${message.errors?.join(', ')}`)
          }
          break
        }

        case 'tool_progress': {
          console.log(`Tool ${message.tool_name} running (${message.elapsed_time_seconds}s)`)
          break
        }
      }
    }

    // Verify review_data.json was uploaded to GCS
    const bucket = storage.bucket(ctx.bucketName)
    const reviewDataFile = bucket.file(`analysis/${ctx.videoId}/review_data.json`)
    const [exists] = await reviewDataFile.exists()

    if (!exists) {
      throw new Error('Analysis completed but review_data.json was not uploaded to GCS')
    }

    await db.collection('jobs').doc(ctx.jobId).update({
      status: 'completed',
      'progress.completedAt': admin.firestore.FieldValue.serverTimestamp(),
      'progress.message': 'Analysis complete',
      'progress.currentPass': null,
      'progress.completedPasses': ctx.passes,
    })

    await db.collection('videos').doc(ctx.videoId).update({
      status: 'reviewed',
      updatedAt: admin.firestore.FieldValue.serverTimestamp(),
    })

  } catch (error) {
    const errorMsg = error instanceof Error ? error.message : String(error)
    console.error(`Analysis failed for job ${ctx.jobId}:`, errorMsg)

    await db.collection('jobs').doc(ctx.jobId).update({
      status: 'failed',
      'progress.error': errorMsg,
      'progress.message': `Analysis failed: ${errorMsg}`,
      'progress.completedAt': admin.firestore.FieldValue.serverTimestamp(),
    })

    await db.collection('videos').doc(ctx.videoId).update({
      status: 'uploaded',
      updatedAt: admin.firestore.FieldValue.serverTimestamp(),
    })
  } finally {
    // Clean up temp directory
    fs.rmSync(analysisDir, { recursive: true, force: true })
  }
}
