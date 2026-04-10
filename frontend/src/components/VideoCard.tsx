import type { VideoInfo } from '../types'

const statusLabels: Record<string, { text: string; color: string }> = {
  uploaded: { text: 'Uploaded', color: 'bg-gray-600' },
  analyzing: { text: 'Analyzing...', color: 'bg-yellow-600' },
  reviewed: { text: 'Ready for Review', color: 'bg-accent' },
  cut: { text: 'Cut Complete', color: 'bg-success' },
}

interface Props {
  video: VideoInfo
  progress?: { message: string; completedPasses: string[] } | null
  onAnalyze: (videoId: string) => void
  onReview: (videoId: string) => void
}

export function VideoCard({ video, progress, onAnalyze, onReview }: Props) {
  const status = statusLabels[video.status] || statusLabels.uploaded

  return (
    <div className="bg-surface-1 border border-subtle rounded-lg p-4 flex flex-col gap-3">
      <div className="flex items-center justify-between">
        <h3 className="text-primary font-medium truncate">{video.filename}</h3>
        <span className={`text-xs px-2 py-0.5 rounded ${status.color} text-white`}>{status.text}</span>
      </div>

      {video.status === 'analyzing' && progress && (
        <div className="text-sm text-secondary">
          <p>{progress.message}</p>
          {progress.completedPasses.length > 0 && (
            <p className="text-muted mt-1">Done: {progress.completedPasses.join(', ')}</p>
          )}
        </div>
      )}

      <div className="flex gap-2 mt-auto">
        {video.status === 'uploaded' && (
          <button
            onClick={() => onAnalyze(video.id)}
            className="px-3 py-1.5 bg-accent text-white rounded text-sm hover:bg-accent-hover"
          >
            Analyze
          </button>
        )}
        {video.status === 'reviewed' && (
          <button
            onClick={() => onReview(video.id)}
            className="px-3 py-1.5 bg-accent text-white rounded text-sm hover:bg-accent-hover"
          >
            Review
          </button>
        )}
      </div>
    </div>
  )
}
