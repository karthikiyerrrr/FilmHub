import { auth } from './firebase'
import type { VideoInfo, ReviewData, ReviewExport, CleanSegment } from './types'

async function apiFetch(path: string, options: RequestInit = {}) {
  const user = auth.currentUser
  if (!user) throw new Error('Not authenticated')

  const token = await user.getIdToken()
  const res = await fetch(path, {
    ...options,
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${token}`,
      ...options.headers,
    },
  })

  if (!res.ok) {
    const body = await res.json().catch(() => ({}))
    throw new Error(body.error || `API error: ${res.status}`)
  }

  return res.json()
}

export async function getUploadUrl(filename: string, contentType: string): Promise<{ videoId: string; uploadUrl: string }> {
  return apiFetch('/api/upload/sign', {
    method: 'POST',
    body: JSON.stringify({ filename, contentType }),
  })
}

export async function fetchVideos(): Promise<VideoInfo[]> {
  return apiFetch('/api/videos')
}

export function videoStreamUrl(videoId: string): string {
  return `/api/videos/${videoId}/stream`
}

export async function triggerAnalysis(videoId: string, passes: string[]): Promise<{ jobId: string }> {
  return apiFetch(`/api/analyze/${videoId}`, {
    method: 'POST',
    body: JSON.stringify({ passes }),
  })
}

export async function fetchAnalysis(videoId: string): Promise<ReviewData> {
  return apiFetch(`/api/analysis/${videoId}`)
}

export function frameUrl(videoId: string, filename: string): string {
  return `/api/analysis/${videoId}/frames/${filename}`
}

export async function saveReview(videoId: string, data: { segments: CleanSegment[]; reviewData: ReviewExport }): Promise<{ reviewFile: string; segmentsFile: string }> {
  return apiFetch(`/api/save/${videoId}`, {
    method: 'POST',
    body: JSON.stringify(data),
  })
}

export async function triggerCut(videoId: string, segmentsFile: string): Promise<{ status: string; downloadUrl?: string }> {
  return apiFetch(`/api/cut/${videoId}`, {
    method: 'POST',
    body: JSON.stringify({ segmentsFile }),
  })
}

export async function getCutStatus(videoId: string): Promise<{ status: string; downloadUrl?: string; error?: string }> {
  return apiFetch(`/api/cut/${videoId}/status`)
}
