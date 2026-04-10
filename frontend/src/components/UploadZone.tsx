import { useState, useRef } from 'react'
import { getUploadUrl } from '../api'

interface Props {
  onUploadComplete: () => void
}

export function UploadZone({ onUploadComplete }: Props) {
  const [uploading, setUploading] = useState(false)
  const [progress, setProgress] = useState(0)
  const [dragOver, setDragOver] = useState(false)
  const inputRef = useRef<HTMLInputElement>(null)

  const uploadFile = async (file: File) => {
    setUploading(true)
    setProgress(0)
    try {
      const { uploadUrl } = await getUploadUrl(file.name, file.type)

      const xhr = new XMLHttpRequest()
      xhr.open('PUT', uploadUrl)
      xhr.setRequestHeader('Content-Type', file.type)

      xhr.upload.onprogress = (e) => {
        if (e.lengthComputable) {
          setProgress(Math.round((e.loaded / e.total) * 100))
        }
      }

      await new Promise<void>((resolve, reject) => {
        xhr.onload = () => (xhr.status < 400 ? resolve() : reject(new Error(`Upload failed: ${xhr.status}`)))
        xhr.onerror = () => reject(new Error('Upload failed'))
        xhr.send(file)
      })

      onUploadComplete()
    } catch (err) {
      console.error('Upload error:', err)
    } finally {
      setUploading(false)
      setProgress(0)
    }
  }

  const handleDrop = (e: React.DragEvent) => {
    e.preventDefault()
    setDragOver(false)
    const file = e.dataTransfer.files[0]
    if (file) uploadFile(file)
  }

  const handleClick = () => inputRef.current?.click()

  const handleChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0]
    if (file) uploadFile(file)
  }

  return (
    <div
      className={`border-2 border-dashed rounded-lg p-8 text-center cursor-pointer transition-colors ${
        dragOver ? 'border-accent bg-accent/10' : 'border-subtle hover:border-hover'
      }`}
      onDragOver={(e) => { e.preventDefault(); setDragOver(true) }}
      onDragLeave={() => setDragOver(false)}
      onDrop={handleDrop}
      onClick={handleClick}
    >
      <input
        ref={inputRef}
        type="file"
        accept="video/*"
        onChange={handleChange}
        className="hidden"
      />
      {uploading ? (
        <div>
          <p className="text-primary mb-2">Uploading... {progress}%</p>
          <div className="w-full bg-surface-2 rounded-full h-2">
            <div className="bg-accent h-2 rounded-full transition-all" style={{ width: `${progress}%` }} />
          </div>
        </div>
      ) : (
        <p className="text-muted">Drop a video file here, or click to browse</p>
      )}
    </div>
  )
}
