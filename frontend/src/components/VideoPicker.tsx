import { useState, useEffect, useCallback } from 'react'
import { useNavigate } from 'react-router-dom'
import { collection, query, where, onSnapshot } from 'firebase/firestore'
import { db } from '../firebase'
import { useAuth } from '../hooks/useAuth'
import { triggerAnalysis } from '../api'
import { UploadZone } from './UploadZone'
import { VideoCard } from './VideoCard'
import { AnalyzeModal } from './AnalyzeModal'
import type { VideoInfo } from '../types'

export function VideoPicker() {
  const { user, signOut } = useAuth()
  const navigate = useNavigate()
  const [videos, setVideos] = useState<VideoInfo[]>([])
  const [analyzeTarget, setAnalyzeTarget] = useState<VideoInfo | null>(null)
  const [jobMessages, setJobMessages] = useState<Record<string, { message: string; completedPasses: string[] }>>({})

  useEffect(() => {
    if (!user) return
    const q = query(collection(db, 'videos'), where('userId', '==', user.uid))
    const unsubscribe = onSnapshot(q, (snapshot) => {
      const vids = snapshot.docs.map((doc) => ({ id: doc.id, ...doc.data() } as VideoInfo))
      vids.sort((a, b) => (b.createdAt?.seconds || 0) - (a.createdAt?.seconds || 0))
      setVideos(vids)
    })
    return unsubscribe
  }, [user])

  useEffect(() => {
    const analyzingIds = videos.filter((v) => v.status === 'analyzing').map((v) => v.id)
    if (analyzingIds.length === 0) return

    const q = query(collection(db, 'jobs'), where('videoId', 'in', analyzingIds), where('status', 'in', ['queued', 'running']))
    const unsubscribe = onSnapshot(q, (snapshot) => {
      const messages: Record<string, { message: string; completedPasses: string[] }> = {}
      snapshot.docs.forEach((doc) => {
        const data = doc.data()
        messages[data.videoId] = {
          message: data.progress?.message || 'Queued...',
          completedPasses: data.progress?.completedPasses || [],
        }
      })
      setJobMessages(messages)
    })
    return unsubscribe
  }, [videos])

  const handleUploadComplete = useCallback(() => {}, [])

  const handleAnalyze = async (passes: string[]) => {
    if (!analyzeTarget) return
    await triggerAnalysis(analyzeTarget.id, passes)
    setAnalyzeTarget(null)
  }

  return (
    <div className="min-h-screen bg-surface-0 p-6">
      <div className="max-w-5xl mx-auto">
        <div className="flex items-center justify-between mb-6">
          <h1 className="text-2xl font-bold text-primary">Gweebler</h1>
          <div className="flex items-center gap-3">
            <span className="text-sm text-muted">{user?.email}</span>
            <button onClick={signOut} className="text-sm text-muted hover:text-primary">Sign out</button>
          </div>
        </div>

        <UploadZone onUploadComplete={handleUploadComplete} />

        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4 mt-6">
          {videos.map((video) => (
            <VideoCard
              key={video.id}
              video={video}
              progress={jobMessages[video.id] || null}
              onAnalyze={(id) => setAnalyzeTarget(videos.find((v) => v.id === id) || null)}
              onReview={(id) => navigate(`/review/${id}`)}
            />
          ))}
        </div>

        {videos.length === 0 && (
          <p className="text-center text-muted mt-12">No videos yet. Upload one to get started.</p>
        )}
      </div>

      {analyzeTarget && (
        <AnalyzeModal
          videoFilename={analyzeTarget.filename}
          onConfirm={handleAnalyze}
          onCancel={() => setAnalyzeTarget(null)}
        />
      )}
    </div>
  )
}
