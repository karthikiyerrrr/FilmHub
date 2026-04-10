import type { VideoInfo, ReviewData, CleanSegment, SaveResult, CutStatus } from './types';

export async function fetchVideos(): Promise<VideoInfo[]> {
  const res = await fetch('/api/videos');
  if (!res.ok) throw new Error('Failed to fetch videos');
  return res.json();
}

export async function fetchAnalysis(video: string): Promise<ReviewData> {
  const res = await fetch(`/api/analysis/${video}`);
  if (!res.ok) throw new Error('Failed to fetch analysis data');
  return res.json();
}

export async function saveSegments(
  video: string,
  segments: Omit<CleanSegment, 'accepted'>[]
): Promise<SaveResult> {
  const res = await fetch(`/api/segments/${video}`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(segments),
  });
  if (!res.ok) throw new Error('Failed to save segments');
  return res.json();
}

export async function saveReviewData(
  video: string,
  data: import('./types').ReviewExport
): Promise<SaveResult> {
  const res = await fetch(`/api/review/${video}`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(data),
  });
  if (!res.ok) throw new Error('Failed to save review data');
  return res.json();
}

export async function startCut(
  video: string,
  segmentsFile: string
): Promise<void> {
  const res = await fetch(`/api/cut/${video}`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ segments_file: segmentsFile }),
  });
  if (!res.ok) throw new Error('Failed to start cut');
}

export async function getCutStatus(video: string): Promise<CutStatus> {
  const res = await fetch(`/api/cut/${video}/status`);
  if (!res.ok) throw new Error('Failed to get cut status');
  return res.json();
}

export function frameUrl(video: string, framePath: string): string {
  const filename = framePath.split('/').pop() || framePath;
  return `/api/analysis/${video}/frames/${filename}`;
}
