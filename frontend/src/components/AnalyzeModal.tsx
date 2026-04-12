import { useState } from 'react'

const PASSES = [
  { id: 'transcribe', label: 'Transcribe Audio' },
  { id: 'music', label: 'Detect Music' },
  { id: 'graphics', label: 'Detect Graphics' },
  { id: 'promotions', label: 'Detect Promotions' },
]

interface Props {
  videoFilename: string
  onConfirm: (passes: string[]) => void
  onCancel: () => void
}

export function AnalyzeModal({ videoFilename, onConfirm, onCancel }: Props) {
  const [selected, setSelected] = useState<Set<string>>(new Set(PASSES.map((p) => p.id)))

  const toggle = (id: string) => {
    const next = new Set(selected)
    if (next.has(id)) next.delete(id)
    else next.add(id)
    setSelected(next)
  }

  return (
    <div className="fixed inset-0 bg-black/60 flex items-center justify-center z-50" onClick={onCancel}>
      <div className="bg-surface-1 border border-subtle rounded-lg p-6 w-full max-w-md" onClick={(e) => e.stopPropagation()}>
        <h2 className="text-lg font-bold text-primary mb-1">Analyze Video</h2>
        <p className="text-sm text-muted mb-4">{videoFilename}</p>

        <div className="space-y-2 mb-6">
          {PASSES.map((pass) => (
            <label key={pass.id} className="flex items-center gap-2 cursor-pointer">
              <input
                type="checkbox"
                checked={selected.has(pass.id)}
                onChange={() => toggle(pass.id)}
                className="accent-accent"
              />
              <span className="text-primary">{pass.label}</span>
            </label>
          ))}
        </div>

        <div className="flex gap-2 justify-end">
          <button onClick={onCancel} className="px-4 py-2 text-muted hover:text-primary">Cancel</button>
          <button
            onClick={() => onConfirm([...selected])}
            disabled={selected.size === 0}
            className="px-4 py-2 bg-accent text-white rounded hover:bg-accent-hover disabled:opacity-50"
          >
            Start Analysis
          </button>
        </div>
      </div>
    </div>
  )
}
