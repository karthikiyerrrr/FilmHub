// worker/src/prompts.ts
import Anthropic from '@anthropic-ai/sdk'

export interface AnalysisInput {
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

export interface ReviewData {
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
