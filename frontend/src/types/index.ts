// === Migrated from reviewer ===
export type SegmentType = 'music' | 'graphics' | 'promotions'

export interface MusicSegment {
  start: number
  end: number
  track: string | null
}

export interface GraphicsCandidate {
  frame_index: number
  timestamp: number
  time_formatted: string
  correlation: number
  before_frame: string
  after_frame: string
}

export interface TranscriptSegment {
  id: number
  start: number
  end: number
  text: string
}

export interface PromotionSegment {
  start: number
  end: number
  description: string
}

export interface CleanSegment {
  start: number
  end: number
  types: SegmentType[]
  description: string
  accepted: boolean
}

export interface Transcript {
  segments: TranscriptSegment[]
}

export interface ReviewData {
  video: { filename: string; path: string; fps?: number }
  music: MusicSegment[] | null
  graphics: GraphicsCandidate[] | null
  transcript: Transcript | null
  promotions: PromotionSegment[] | null
  suggested_segments: CleanSegment[]
}

export interface ReviewExport {
  video: string
  reviewed_at: string
  segments: (CleanSegment & { accepted: boolean })[]
  accepted_count: number
  rejected_count: number
  total_removed_seconds: number
}

// === New for Gweebler ===
export type VideoStatus = 'uploaded' | 'analyzing' | 'reviewed' | 'cut'

export interface VideoInfo {
  id: string
  userId: string
  filename: string
  gcsPath: string
  status: VideoStatus
  createdAt: any
  updatedAt: any
}

export type JobStatus = 'queued' | 'running' | 'completed' | 'failed'

export interface JobProgress {
  currentPass: string | null
  completedPasses: string[]
  message: string
  startedAt: any
  completedAt: any | null
  error: string | null
}

export interface AnalysisJob {
  id: string
  videoId: string
  userId: string
  status: JobStatus
  passes: string[]
  progress: JobProgress
  createdAt: any
}
