import { useState, useCallback, useRef, useEffect } from 'react';
import type { CleanSegment } from '../types';
import type { ReviewExport } from '../types';
import { saveReview, triggerCut, getCutStatus } from '../api';
import { formatDuration } from '../utils/formatTime';

interface Props {
  videoId: string;
  segments: CleanSegment[];
  acceptedSegments: CleanSegment[];
  totalRemovedSeconds: number;
  onReset: () => void;
  onSelectAll: () => void;
  onDeselectAll: () => void;
}

export default function ActionBar({
  videoId,
  segments,
  acceptedSegments,
  totalRemovedSeconds,
  onReset,
  onSelectAll,
  onDeselectAll,
}: Props) {
  const [status, setStatus] = useState<{ status: string; downloadUrl?: string; error?: string }>({ status: 'idle' });
  const [elapsed, setElapsed] = useState(0);
  const timerRef = useRef<ReturnType<typeof setInterval>>(undefined);
  const pollRef = useRef<ReturnType<typeof setInterval>>(undefined);

  useEffect(() => {
    return () => {
      clearInterval(timerRef.current);
      clearInterval(pollRef.current);
    };
  }, []);

  const handleSaveAndCut = useCallback(async () => {
    if (acceptedSegments.length === 0) return;

    try {
      const reviewData: ReviewExport = {
        video: videoId,
        reviewed_at: new Date().toISOString(),
        segments: segments,
        accepted_count: acceptedSegments.length,
        rejected_count: segments.length - acceptedSegments.length,
        total_removed_seconds: totalRemovedSeconds,
      };

      const result = await saveReview(videoId, { segments, reviewData });

      await triggerCut(videoId, result.segmentsFile);
      setStatus({ status: 'processing' });
      setElapsed(0);

      const start = Date.now();
      timerRef.current = setInterval(() => {
        setElapsed(Math.floor((Date.now() - start) / 1000));
      }, 1000);

      pollRef.current = setInterval(async () => {
        try {
          const s = await getCutStatus(videoId);
          if (s.status !== 'processing') {
            clearInterval(timerRef.current);
            clearInterval(pollRef.current);
            setStatus(s);

            if (s.status === 'done' && s.downloadUrl) {
              const a = document.createElement('a');
              a.href = s.downloadUrl;
              a.download = '';
              document.body.appendChild(a);
              a.click();
              document.body.removeChild(a);
            }
          }
        } catch {
          // keep polling
        }
      }, 2000);
    } catch (e) {
      setStatus({ status: 'failed', error: String(e) });
    }
  }, [videoId, segments, acceptedSegments, totalRemovedSeconds]);

  return (
    <div className="flex items-center justify-between px-4 py-3 bg-surface-1 border-t border-border-subtle">
      <div className="flex items-center gap-4">
        <span className="text-sm text-text-secondary">
          <strong className="text-text-primary">{acceptedSegments.length}</strong> segments,{' '}
          <strong className="text-text-primary">{formatDuration(totalRemovedSeconds)}</strong> to remove
        </span>
        <div className="flex gap-2">
          <button onClick={onSelectAll} className="text-xs text-text-muted hover:text-accent transition-colors">
            Select all
          </button>
          <button onClick={onDeselectAll} className="text-xs text-text-muted hover:text-accent transition-colors">
            Deselect all
          </button>
        </div>
      </div>

      <div className="flex items-center gap-3">
        {status.status === 'idle' && (
          <>
            <button
              onClick={onReset}
              className="text-xs text-text-muted hover:text-text-primary px-3 py-1.5 transition-colors"
            >
              Reset
            </button>
            <button
              onClick={handleSaveAndCut}
              disabled={acceptedSegments.length === 0}
              className="text-sm font-medium bg-white hover:bg-zinc-200 disabled:opacity-30 disabled:cursor-not-allowed text-surface-0 px-5 py-1.5 rounded-lg transition-all"
            >
              Save & Cut
            </button>
          </>
        )}

        {status.status === 'processing' && (
          <div className="flex items-center gap-2 text-sm text-text-secondary">
            <svg className="animate-spin w-4 h-4 text-accent" viewBox="0 0 24 24" fill="none">
              <circle cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="3" opacity="0.25" />
              <path
                d="M12 2a10 10 0 0 1 10 10"
                stroke="currentColor"
                strokeWidth="3"
                strokeLinecap="round"
              />
            </svg>
            Cutting video... {formatDuration(elapsed)}
          </div>
        )}

        {status.status === 'done' && (
          <div className="flex items-center gap-2 text-sm text-success">
            <svg width="16" height="16" viewBox="0 0 16 16" fill="currentColor">
              <path d="M8 1a7 7 0 110 14A7 7 0 018 1zm3.2 4.3a.5.5 0 00-.7 0L7 8.8 5.5 7.3a.5.5 0 00-.7.7l2 2a.5.5 0 00.7 0l4-4a.5.5 0 000-.7z" />
            </svg>
            Done! Download started.
          </div>
        )}

        {status.status === 'failed' && (
          <div className="text-sm text-danger max-w-md truncate">
            Error: {status.error}
          </div>
        )}
      </div>
    </div>
  );
}
