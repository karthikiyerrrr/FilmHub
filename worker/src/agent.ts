import Anthropic from '@anthropic-ai/sdk'
import { Storage } from '@google-cloud/storage'
import admin from 'firebase-admin'
import { modalTranscribe, modalDetectMusic, modalDetectGraphics } from './modal-client.js'

const anthropic = new Anthropic()
const storage = new Storage()
const bucket = storage.bucket(process.env.GCS_BUCKET || '')

const tools: Anthropic.Tool[] = [
  {
    name: 'run_transcription',
    description: 'Transcribe video audio using Whisper. Returns timestamped transcript with speaker labels.',
    input_schema: {
      type: 'object' as const,
      properties: {
        video_url: { type: 'string', description: 'Signed GCS URL of the video' },
      },
      required: ['video_url'],
    },
  },
  {
    name: 'detect_music',
    description: 'Detect copyrighted music segments using Demucs source separation and AcoustID fingerprinting.',
    input_schema: {
      type: 'object' as const,
      properties: {
        video_url: { type: 'string', description: 'Signed GCS URL of the video' },
      },
      required: ['video_url'],
    },
  },
  {
    name: 'detect_graphics',
    description: 'Detect on-screen promotional graphics transitions using frame analysis.',
    input_schema: {
      type: 'object' as const,
      properties: {
        video_url: { type: 'string', description: 'Signed GCS URL of the video' },
      },
      required: ['video_url'],
    },
  },
  {
    name: 'detect_promotions',
    description: 'Analyze transcript text to identify paid promotion and sponsorship segments. Requires transcription to have been run first.',
    input_schema: {
      type: 'object' as const,
      properties: {
        transcript_json: { type: 'string', description: 'JSON string of the transcript data' },
      },
      required: ['transcript_json'],
    },
  },
  {
    name: 'read_gcs_file',
    description: 'Read a JSON file from cloud storage. Use this to read the actual detection results after each pass completes (e.g., transcript.json, music.json, graphics_candidates.json).',
    input_schema: {
      type: 'object' as const,
      properties: {
        path: { type: 'string', description: 'GCS path relative to the analysis folder, e.g., "transcript.json" or "music.json"' },
      },
      required: ['path'],
    },
  },
  {
    name: 'update_progress',
    description: 'Update the analysis job progress visible to the user in real-time.',
    input_schema: {
      type: 'object' as const,
      properties: {
        message: { type: 'string', description: 'Progress message to show the user' },
      },
      required: ['message'],
    },
  },
  {
    name: 'save_results',
    description: 'Save detection results JSON to cloud storage.',
    input_schema: {
      type: 'object' as const,
      properties: {
        type: { type: 'string', description: 'Result type: "review_data"' },
        data: { type: 'string', description: 'JSON string of the results data' },
      },
      required: ['type', 'data'],
    },
  },
]

interface JobContext {
  jobId: string
  videoId: string
  videoUrl: string
  passes: string[]
  bucketName: string
}

async function updateFirestoreProgress(jobId: string, updates: Record<string, unknown>) {
  const db = admin.firestore()
  await db.collection('jobs').doc(jobId).update({
    'progress.message': updates.message || '',
    'progress.currentPass': updates.currentPass || null,
    ...(updates.completedPasses ? { 'progress.completedPasses': updates.completedPasses } : {}),
  })
}

async function handleToolCall(
  toolName: string,
  toolInput: Record<string, unknown>,
  ctx: JobContext,
  completedPasses: string[],
): Promise<string> {
  switch (toolName) {
    case 'run_transcription': {
      await updateFirestoreProgress(ctx.jobId, { message: 'Transcribing audio...', currentPass: 'transcribe' })
      const result = await modalTranscribe(ctx.videoUrl, ctx.videoId, ctx.bucketName)
      completedPasses.push('transcribe')
      await updateFirestoreProgress(ctx.jobId, { message: 'Transcription complete', completedPasses })
      return JSON.stringify(result)
    }
    case 'detect_music': {
      await updateFirestoreProgress(ctx.jobId, { message: 'Detecting music...', currentPass: 'music' })
      const result = await modalDetectMusic(ctx.videoUrl, ctx.videoId, ctx.bucketName)
      completedPasses.push('music')
      await updateFirestoreProgress(ctx.jobId, { message: 'Music detection complete', completedPasses })
      return JSON.stringify(result)
    }
    case 'detect_graphics': {
      await updateFirestoreProgress(ctx.jobId, { message: 'Detecting graphics...', currentPass: 'graphics' })
      const result = await modalDetectGraphics(ctx.videoUrl, ctx.videoId, ctx.bucketName)
      completedPasses.push('graphics')
      await updateFirestoreProgress(ctx.jobId, { message: 'Graphics detection complete', completedPasses })
      return JSON.stringify(result)
    }
    case 'detect_promotions': {
      await updateFirestoreProgress(ctx.jobId, { message: 'Detecting promotions...', currentPass: 'promotions' })
      completedPasses.push('promotions')
      await updateFirestoreProgress(ctx.jobId, { message: 'Promotion detection complete', completedPasses })
      return JSON.stringify({ status: 'completed', note: 'Promotions analyzed from transcript' })
    }
    case 'read_gcs_file': {
      const path = toolInput.path as string
      const gcsPath = `analysis/${ctx.videoId}/${path}`
      const file = bucket.file(gcsPath)
      try {
        const [content] = await file.download()
        return content.toString()
      } catch {
        return JSON.stringify({ error: `File not found: ${gcsPath}` })
      }
    }
    case 'update_progress': {
      const msg = toolInput.message as string
      await updateFirestoreProgress(ctx.jobId, { message: msg })
      return 'Progress updated'
    }
    case 'save_results': {
      const type = toolInput.type as string
      const data = toolInput.data as string
      const gcsPath = `analysis/${ctx.videoId}/${type}.json`
      const file = bucket.file(gcsPath)
      await file.save(data, { contentType: 'application/json' })
      return JSON.stringify({ saved: gcsPath })
    }
    default:
      return JSON.stringify({ error: `Unknown tool: ${toolName}` })
  }
}

export async function runAnalysis(ctx: JobContext): Promise<void> {
  const db = admin.firestore()
  const completedPasses: string[] = []

  try {
    await db.collection('jobs').doc(ctx.jobId).update({
      status: 'running',
      'progress.startedAt': admin.firestore.FieldValue.serverTimestamp(),
      'progress.message': 'Starting analysis...',
    })

    const systemPrompt = `You are an analysis orchestrator for video processing. You have been asked to run the following detection passes on a video: ${ctx.passes.join(', ')}.

Use the tools provided to run each pass. The video URL is already provided to each tool.

Rules:
- Run transcription first if "transcribe" is in the passes, since "promotions" detection requires the transcript.
- For "promotions" detection: first read the transcript from GCS (it was saved by run_transcription), then use detect_promotions with the transcript text to identify paid promotion segments. Analyze the transcript yourself to find sponsorship mentions, ad reads, and promotional content. Return the segments you find.
- After all requested passes complete, assemble a review_data.json using save_results with type "review_data".
- Update progress after each step so the user can see what's happening.
- If a pass fails, continue with remaining passes and report the error.

CRITICAL: The review_data.json MUST use this exact JSON structure:
{
  "video": { "filename": "<original filename>", "path": "" },
  "music": [{"start": 0, "end": 10, "track": "Artist - Title" or null}] or null,
  "graphics": [{"frame_index": 0, "timestamp": 0, "time_formatted": "0:00:00", "correlation": 0.3, "before_frame": "", "after_frame": ""}] or null,
  "transcript": {"segments": [{"id": 0, "start": 0, "end": 1, "text": "..."}]} or null,
  "promotions": [{"start": 0, "end": 10, "description": "..."}] or null,
  "suggested_segments": [
    {
      "start": 0,
      "end": 10,
      "types": ["music", "graphics", "promotions"],
      "description": "Description of what was detected",
      "accepted": true
    }
  ]
}

IMPORTANT format rules for suggested_segments:
- "types" is an ARRAY of strings, not a single string. Valid values: "music", "graphics", "promotions"
- "accepted" must be true (boolean)
- "start" and "end" are numbers in seconds

CRITICAL: After each detection pass completes, use read_gcs_file to read the ACTUAL results:
- After transcription: read_gcs_file("transcript.json")
- After music detection: read_gcs_file("music.json")
- After graphics detection: read_gcs_file("graphics_candidates.json")
Use the REAL data from these files to populate the review_data.json. Do NOT fabricate or hallucinate data. The transcript, music, graphics, and promotions fields in review_data.json must contain the actual detection results, not made-up content.

Video URL: ${ctx.videoUrl}
Video ID: ${ctx.videoId}`

    let messages: Anthropic.MessageParam[] = [
      { role: 'user', content: `Run the following detection passes: ${ctx.passes.join(', ')}` },
    ]

    while (true) {
      const response = await anthropic.messages.create({
        model: 'claude-sonnet-4-20250514',
        max_tokens: 4096,
        system: systemPrompt,
        tools,
        messages,
      })

      const toolUses = response.content.filter((b): b is Anthropic.ToolUseBlock => b.type === 'tool_use')

      if (response.stop_reason === 'end_turn' || toolUses.length === 0) {
        break
      }

      const toolResults: Anthropic.ToolResultBlockParam[] = []
      for (const toolUse of toolUses) {
        const result = await handleToolCall(
          toolUse.name,
          toolUse.input as Record<string, unknown>,
          ctx,
          completedPasses,
        )
        toolResults.push({
          type: 'tool_result',
          tool_use_id: toolUse.id,
          content: result,
        })
      }

      messages = [
        ...messages,
        { role: 'assistant', content: response.content },
        { role: 'user', content: toolResults },
      ]
    }

    await db.collection('jobs').doc(ctx.jobId).update({
      status: 'completed',
      'progress.completedAt': admin.firestore.FieldValue.serverTimestamp(),
      'progress.message': 'Analysis complete',
      'progress.currentPass': null,
    })

    await db.collection('videos').doc(ctx.videoId).update({
      status: 'reviewed',
      updatedAt: admin.firestore.FieldValue.serverTimestamp(),
    })

  } catch (error) {
    const errorMsg = error instanceof Error ? error.message : String(error)
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
  }
}
