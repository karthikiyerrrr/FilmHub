# Worker Performance Optimization Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Restructure the worker's analysis pipeline so mechanical I/O (Modal calls, GCS reads) happens in code with full parallelism, and Claude is only invoked once for the intelligence-requiring analysis steps — cutting latency by ~60% and API cost by ~80%.

**Architecture:** The current agent.ts runs everything through a Claude tool loop (8-12 API roundtrips). The new design splits the pipeline into three phases: (1) code-driven parallel Modal calls + GCS reads, (2) a single Claude API call for segment analysis and review_data assembly, (3) code-driven GCS upload and Firestore updates. Graphics frame vision analysis and real transcript-based promotion detection are added to match the skill spec.

**Tech Stack:** Node.js, TypeScript (ESM), @anthropic-ai/sdk, @google-cloud/storage, firebase-admin, Express 5

---

## File Structure

| File | Responsibility |
|------|---------------|
| `worker/src/index.ts` | Express server, `/run-analysis` endpoint — awaits analysis before responding |
| `worker/src/pipeline.ts` | **NEW** — orchestrates the 3-phase pipeline: run passes, invoke Claude, upload results |
| `worker/src/modal-client.ts` | Unchanged — HTTP calls to Modal endpoints |
| `worker/src/gcs.ts` | **NEW** — GCS read/write helpers (download JSON, download image, upload JSON) |
| `worker/src/firestore.ts` | **NEW** — Firestore progress update helpers |
| `worker/src/prompts.ts` | **NEW** — Claude system prompt and message builder for the single analysis call |
| `worker/src/agent.ts` | **DELETE** — replaced by pipeline.ts + prompts.ts |

---

### Task 1: Extract GCS helpers into `gcs.ts`

**Files:**
- Create: `worker/src/gcs.ts`
- Modify: `worker/src/agent.ts` (remove GCS logic after this is created — done in Task 5)

- [ ] **Step 1: Create `gcs.ts` with read/write/download helpers**

```typescript
// worker/src/gcs.ts
import { Storage } from '@google-cloud/storage'

const storage = new Storage()

function getBucket() {
  return storage.bucket(process.env.GCS_BUCKET || '')
}

export async function readGcsJson(path: string): Promise<unknown> {
  const [content] = await getBucket().file(path).download()
  return JSON.parse(content.toString())
}

export async function readGcsBuffer(path: string): Promise<Buffer> {
  const [content] = await getBucket().file(path).download()
  return content
}

export async function writeGcsJson(path: string, data: unknown): Promise<void> {
  await getBucket().file(path).save(JSON.stringify(data), {
    contentType: 'application/json',
  })
}

export async function gcsFileExists(path: string): Promise<boolean> {
  const [exists] = await getBucket().file(path).exists()
  return exists
}
```

- [ ] **Step 2: Verify it compiles**

Run: `cd worker && npx tsc --noEmit`
Expected: No errors (the file is self-contained, no imports from other new files yet)

- [ ] **Step 3: Commit**

```bash
git add worker/src/gcs.ts
git commit -m "feat(worker): extract GCS helpers into gcs.ts"
```

---

### Task 2: Extract Firestore helpers into `firestore.ts`

**Files:**
- Create: `worker/src/firestore.ts`

- [ ] **Step 1: Create `firestore.ts` with progress and status update helpers**

```typescript
// worker/src/firestore.ts
import admin from 'firebase-admin'

const db = () => admin.firestore()

export async function updateJobProgress(jobId: string, updates: {
  message: string
  currentPass?: string | null
  completedPasses?: string[]
}): Promise<void> {
  const data: Record<string, unknown> = {
    'progress.message': updates.message,
  }
  if (updates.currentPass !== undefined) {
    data['progress.currentPass'] = updates.currentPass
  }
  if (updates.completedPasses) {
    data['progress.completedPasses'] = updates.completedPasses
  }
  await db().collection('jobs').doc(jobId).update(data)
}

export async function markJobRunning(jobId: string): Promise<void> {
  await db().collection('jobs').doc(jobId).update({
    status: 'running',
    'progress.startedAt': admin.firestore.FieldValue.serverTimestamp(),
    'progress.message': 'Starting analysis...',
  })
}

export async function markJobCompleted(jobId: string): Promise<void> {
  await db().collection('jobs').doc(jobId).update({
    status: 'completed',
    'progress.completedAt': admin.firestore.FieldValue.serverTimestamp(),
    'progress.message': 'Analysis complete',
    'progress.currentPass': null,
  })
}

export async function markJobFailed(jobId: string, error: string): Promise<void> {
  await db().collection('jobs').doc(jobId).update({
    status: 'failed',
    'progress.error': error,
    'progress.message': `Analysis failed: ${error}`,
    'progress.completedAt': admin.firestore.FieldValue.serverTimestamp(),
  })
}

export async function updateVideoStatus(videoId: string, status: string): Promise<void> {
  await db().collection('videos').doc(videoId).update({
    status,
    updatedAt: admin.firestore.FieldValue.serverTimestamp(),
  })
}
```

- [ ] **Step 2: Verify it compiles**

Run: `cd worker && npx tsc --noEmit`
Expected: No errors

- [ ] **Step 3: Commit**

```bash
git add worker/src/firestore.ts
git commit -m "feat(worker): extract Firestore helpers into firestore.ts"
```

---

### Task 3: Create the Claude prompt builder in `prompts.ts`

**Files:**
- Create: `worker/src/prompts.ts`

This builds the single Claude API call that replaces the entire tool loop. Claude receives all detection results as data and returns the final `review_data.json` content.

- [ ] **Step 1: Create `prompts.ts`**

```typescript
// worker/src/prompts.ts
import Anthropic from '@anthropic-ai/sdk'

interface AnalysisInput {
  videoId: string
  videoFilename: string
  passes: string[]
  transcript: unknown | null
  music: unknown | null
  graphics: unknown | null
  graphicsFrames: Array<{
    candidateIndex: number
    timestamp: number
    timeFormatted: string
    beforeImage: Buffer
    afterImage: Buffer
  }>
}

interface ReviewData {
  video: { filename: string; path: string }
  music: unknown | null
  graphics: unknown | null
  transcript: unknown | null
  promotions: unknown | null
  suggested_segments: Array<{
    start: number
    end: number
    types: string[]
    description: string
    accepted: true
  }>
}

export function buildAnalysisMessages(input: AnalysisInput): Anthropic.MessageParam[] {
  const contentBlocks: Anthropic.ContentBlockParam[] = []

  let textPrompt = `Analyze the following video detection results and produce a review_data.json file.

Video ID: ${input.videoId}
Video filename: ${input.videoFilename}
Passes run: ${input.passes.join(', ')}

`

  if (input.music) {
    textPrompt += `## Music Detection Results
\`\`\`json
${JSON.stringify(input.music, null, 2)}
\`\`\`

Each music segment has start/end (seconds) and track (matched song name or null). Include all of these as music suggested_segments.

`
  }

  if (input.transcript) {
    textPrompt += `## Transcript
\`\`\`json
${JSON.stringify(input.transcript, null, 2)}
\`\`\`

`
    if (input.passes.includes('promotions')) {
      textPrompt += `## Promotion Detection Task
Analyze the transcript above to identify paid promotion and sponsorship segments.

**Flag for removal:**
- Explicit sponsor mentions ("this video is sponsored by...")
- Product pitches with promotional language
- Transitions into/out of ad reads
- Discount codes and referral links
- Platform references directing viewers to social media
- Cross-promotion of creator's other channels

**Do NOT flag:**
- Incidental platform mentions as part of content
- Genuine non-sponsored recommendations

Return each promotion as {"start": seconds, "end": seconds, "description": "brief reason"}.

`
    }
  }

  if (input.graphics && input.graphicsFrames.length > 0) {
    textPrompt += `## Graphics Detection Candidates
\`\`\`json
${JSON.stringify(input.graphics, null, 2)}
\`\`\`

Below are the before/after frame images for each graphics transition candidate. Classify each:

**Flag for removal:** Sponsor logo overlays, product placement overlays, discount code displays, branded end cards, subscribe/follow animations with platform branding, affiliate link displays
**Do NOT flag:** Normal scene changes, creator's own branding/watermark, content-relevant graphics, standard video UI elements

For flagged transitions, build time ranges: pair appear/disappear transitions, merge candidates within 5 seconds.

`
  }

  contentBlocks.push({ type: 'text', text: textPrompt })

  // Add graphics frame images
  for (const frame of input.graphicsFrames) {
    contentBlocks.push({
      type: 'text',
      text: `\n### Graphics candidate #${frame.candidateIndex} (${frame.timeFormatted}, t=${frame.timestamp}s)\nBefore:`,
    })
    contentBlocks.push({
      type: 'image',
      source: { type: 'base64', media_type: 'image/png', data: frame.beforeImage.toString('base64') },
    })
    contentBlocks.push({ type: 'text', text: 'After:' })
    contentBlocks.push({
      type: 'image',
      source: { type: 'base64', media_type: 'image/png', data: frame.afterImage.toString('base64') },
    })
  }

  // Final instruction
  contentBlocks.push({
    type: 'text',
    text: `
## Output Instructions

Produce the final review_data.json with this EXACT structure:

{
  "video": { "filename": "${input.videoFilename}", "path": "" },
  "music": <music.json contents or null if not run>,
  "graphics": <graphics_candidates.json contents or null if not run>,
  "transcript": { "segments": <transcript segments with only id/start/end/text fields> } or null,
  "promotions": <array of {"start": float, "end": float, "description": string}> or null,
  "suggested_segments": <merged segments, see rules below>
}

Rules for suggested_segments:
- "types" is an ARRAY of strings. Valid values: "music", "graphics", "promotions"
- "accepted" must be true (boolean)
- "start" and "end" are numbers in seconds
- Use ONLY the actual data provided above. Never fabricate timestamps or text.
- Trim transcript segments to only id, start, end, and text fields.
- For graphics: group nearby flagged candidates (within 5 seconds) into a single segment. Set start to 1s before first candidate, end to 1s after last.
- Merge segments from different types if they overlap AND their boundaries are within 10 seconds of each other. Use both type labels.
- Do NOT merge segments that merely overlap but have very different boundaries.
- Sort suggested_segments by start time.

Return ONLY the JSON object. No markdown fences, no explanation.`,
  })

  return [{ role: 'user', content: contentBlocks }]
}

export function parseReviewData(responseText: string): ReviewData {
  // Strip markdown fences if Claude included them despite instructions
  let cleaned = responseText.trim()
  if (cleaned.startsWith('```')) {
    cleaned = cleaned.replace(/^```(?:json)?\n?/, '').replace(/\n?```$/, '')
  }
  return JSON.parse(cleaned) as ReviewData
}
```

- [ ] **Step 2: Verify it compiles**

Run: `cd worker && npx tsc --noEmit`
Expected: No errors

- [ ] **Step 3: Commit**

```bash
git add worker/src/prompts.ts
git commit -m "feat(worker): add Claude prompt builder for single-call analysis"
```

---

### Task 4: Create the pipeline orchestrator in `pipeline.ts`

**Files:**
- Create: `worker/src/pipeline.ts`

This is the core replacement for agent.ts. Three phases: parallel Modal calls, single Claude analysis call, upload results.

- [ ] **Step 1: Create `pipeline.ts`**

```typescript
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
      // Download frames in batches of 10 to avoid overwhelming GCS
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
    await markJobFailed(ctx.jobId, errorMsg)
    await updateVideoStatus(ctx.videoId, 'uploaded')
  }
}
```

- [ ] **Step 2: Verify it compiles**

Run: `cd worker && npx tsc --noEmit`
Expected: No errors

- [ ] **Step 3: Commit**

```bash
git add worker/src/pipeline.ts
git commit -m "feat(worker): add pipeline orchestrator replacing agent tool loop"
```

---

### Task 5: Update `index.ts` to use pipeline and fix fire-and-forget

**Files:**
- Modify: `worker/src/index.ts`

Two changes: (1) import from `pipeline.ts` instead of `agent.ts`, (2) await the analysis so Cloud Run keeps the container alive.

- [ ] **Step 1: Rewrite `index.ts`**

Replace the full contents of `worker/src/index.ts` with:

```typescript
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
```

Key changes from the old version:
- Imports `runAnalysis` from `./pipeline.js` instead of `./agent.js`
- **Awaits** `runAnalysis()` instead of fire-and-forget `setTimeout` — this keeps the Cloud Run container alive for the full duration
- Accepts `videoFilename` from the request body (already sent by the API)
- Returns `{ status: 'completed' }` or `{ status: 'failed' }` after analysis finishes (the API ignores this response since it uses fire-and-forget `fetch`)

- [ ] **Step 2: Verify it compiles**

Run: `cd worker && npx tsc --noEmit`
Expected: No errors

- [ ] **Step 3: Commit**

```bash
git add worker/src/index.ts
git commit -m "fix(worker): await analysis to prevent Cloud Run container kill"
```

---

### Task 6: Delete `agent.ts` and verify build

**Files:**
- Delete: `worker/src/agent.ts`

- [ ] **Step 1: Delete agent.ts**

```bash
rm worker/src/agent.ts
```

- [ ] **Step 2: Full build check**

Run: `cd worker && npx tsc`
Expected: Compiles cleanly to `dist/` with no errors. Verify the output files exist:

```bash
ls worker/dist/
# Expected: index.js, pipeline.js, prompts.js, gcs.js, firestore.js, modal-client.js
```

- [ ] **Step 3: Commit**

```bash
git rm worker/src/agent.ts
git commit -m "refactor(worker): remove agent.ts tool loop, replaced by pipeline.ts"
```

---

### Task 7: Update Cloud Run timeout for long-running requests

**Files:**
- Modify: `worker/Dockerfile` (no changes needed)
- Note: deployment command needs `--timeout 3600` (already in the deploy command from previous session)

- [ ] **Step 1: Verify Dockerfile is still correct**

The existing Dockerfile is fine — it builds TypeScript and runs `node dist/index.js`. No changes needed since we didn't add any new system dependencies.

Read `worker/Dockerfile` and confirm it contains:
```dockerfile
FROM node:20-slim
WORKDIR /app
COPY package*.json ./
RUN npm ci
COPY tsconfig.json ./
COPY src/ src/
RUN npx tsc
RUN npm prune --production
EXPOSE 8081
ENV PORT=8081
CMD ["node", "dist/index.js"]
```

- [ ] **Step 2: Update CLAUDE.md to reflect new architecture**

Update `worker/CLAUDE.md` to describe the pipeline architecture instead of the agent tool loop. Key changes:
- Remove references to Agent SDK, skills, and cli.js
- Document the 3-phase pipeline: parallel Modal calls → single Claude analysis → upload
- Update file descriptions (pipeline.ts, prompts.ts, gcs.ts, firestore.ts replace agent.ts)
- Note that the worker now awaits analysis completion (no fire-and-forget)

- [ ] **Step 3: Commit**

```bash
git add worker/CLAUDE.md
git commit -m "docs(worker): update CLAUDE.md for pipeline architecture"
```

---

### Task 8: Deploy and test

- [ ] **Step 1: Deploy worker to Cloud Run**

```bash
cd worker && gcloud run deploy gweebler-worker \
  --source . \
  --region us-west1 \
  --project gweebler \
  --no-allow-unauthenticated \
  --memory 1Gi \
  --timeout 3600 \
  --set-env-vars "ANTHROPIC_API_KEY=<key>,GCS_BUCKET=gweebler.firebasestorage.app,MODAL_URL_TRANSCRIBE=https://kbi102003--gweebler-transcribe.modal.run,MODAL_URL_DETECT_MUSIC=https://kbi102003--gweebler-detect-music.modal.run,MODAL_URL_DETECT_GRAPHICS=https://kbi102003--gweebler-detect-graphics.modal.run,MODAL_AUTH_TOKEN=<token>,PROJECT_ROOT=/app"
```

- [ ] **Step 2: Upload a test video and trigger analysis from the webapp**

Go to https://gweebler.web.app, upload a video, select all passes, click Analyze.

- [ ] **Step 3: Monitor logs**

```bash
gcloud logging read 'resource.type="cloud_run_revision" AND resource.labels.service_name="gweebler-worker"' \
  --project gweebler --limit 50 --format "table(timestamp,textPayload)" --freshness 10m
```

Expected log sequence:
1. `Received analysis job ... passes: transcribe, music, graphics`
2. `Running detection passes...` (parallel Modal calls)
3. `Reading detection results...`
4. `Analyzing results with Claude...`
5. `Saving results...`
6. `Analysis complete for job ...`

- [ ] **Step 4: Verify review_data.json in GCS**

```bash
gcloud storage cat "gs://gweebler.firebasestorage.app/analysis/<VIDEO_ID>/review_data.json" --project gweebler | head -50
```

Verify it has the expected structure: `video`, `music`, `graphics`, `transcript`, `promotions`, `suggested_segments`.

---

## Performance comparison

| Metric | Old (tool loop) | New (pipeline) |
|--------|-----------------|----------------|
| Claude API calls | 8-12 roundtrips | 1 call |
| Modal parallelism | Sequential (via tool loop) | Parallel (`Promise.allSettled`) |
| Graphics vision analysis | None (raw candidates passed through) | Before/after frame classification |
| Promotion detection | Stub (returns empty) | Real transcript analysis by Claude |
| Estimated latency | 90-120s | 30-50s |
| Estimated cost per job | ~$0.30-0.50 | ~$0.05-0.10 |
| Cloud Run container safety | May be killed (fire-and-forget) | Kept alive (awaited request) |
