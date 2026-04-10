const MODAL_ENDPOINT_URL = process.env.MODAL_ENDPOINT_URL || ''
const MODAL_AUTH_TOKEN = process.env.MODAL_AUTH_TOKEN || ''

interface ModalResponse {
  status: string
  gcs_path?: string
  segment_count?: number
  candidate_count?: number
  error?: string
}

async function callModal(endpoint: string, body: Record<string, unknown>): Promise<ModalResponse> {
  const url = `${MODAL_ENDPOINT_URL}/${endpoint}`
  const res = await fetch(url, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${MODAL_AUTH_TOKEN}`,
    },
    body: JSON.stringify(body),
  })

  if (!res.ok) {
    const text = await res.text()
    throw new Error(`Modal ${endpoint} failed (${res.status}): ${text}`)
  }

  return res.json() as Promise<ModalResponse>
}

export async function modalTranscribe(videoUrl: string, videoId: string, bucket: string, diarize = false) {
  return callModal('transcribe', { video_url: videoUrl, video_id: videoId, bucket, diarize })
}

export async function modalDetectMusic(videoUrl: string, videoId: string, bucket: string) {
  return callModal('detect_music', { video_url: videoUrl, video_id: videoId, bucket })
}

export async function modalDetectGraphics(videoUrl: string, videoId: string, bucket: string) {
  return callModal('detect_graphics', { video_url: videoUrl, video_id: videoId, bucket })
}

export async function modalCutVideo(videoUrl: string, videoId: string, filename: string, segments: Array<{ start: number; end: number }>, bucket: string) {
  return callModal('cut_video', { video_url: videoUrl, video_id: videoId, filename, segments, bucket })
}
