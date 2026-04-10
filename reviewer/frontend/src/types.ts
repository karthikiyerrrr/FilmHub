export type SegmentType = 'music' | 'graphics' | 'promotions';

export interface MusicSegment {
  start: number;
  end: number;
  track: string | null;
}

export interface GraphicsCandidate {
  frame_index: number;
  timestamp: number;
  time_formatted: string;
  correlation: number;
  before_frame: string;
  after_frame: string;
}

export interface TranscriptSegment {
  id: number;
  start: number;
  end: number;
  text: string;
}

export interface Transcript {
  segments: TranscriptSegment[];
}

export interface PromotionSegment {
  start: number;
  end: number;
  description: string;
}

export interface CleanSegment {
  start: number;
  end: number;
  types: SegmentType[];
  description: string;
  accepted: boolean;
}

export interface ReviewData {
  video: {
    filename: string;
    path: string;
    fps?: number;
  };
  music: MusicSegment[] | null;
  graphics: GraphicsCandidate[] | null;
  transcript: Transcript | null;
  promotions: PromotionSegment[] | null;
  suggested_segments: Array<{
    start: number;
    end: number;
    types: SegmentType[];
    description: string;
  }>;
}

export interface VideoInfo {
  name: string;
  path: string;
  has_analysis: boolean;
  analysis_types: string[];
}

export interface CutStatus {
  status: 'idle' | 'running' | 'done' | 'failed';
  segments_file?: string;
  output_path?: string;
  error?: string;
}

export interface SaveResult {
  file: string;
  sequence: number;
}

export interface ReviewExport {
  video: string;
  reviewed_at: string;
  segments: CleanSegment[];
  accepted_count: number;
  rejected_count: number;
  total_removed_seconds: number;
}
