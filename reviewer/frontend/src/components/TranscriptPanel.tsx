import { useEffect, useRef } from 'react';
import type { TranscriptSegment, CleanSegment } from '../types';
import { formatTime } from '../utils/formatTime';

interface Props {
  segments: TranscriptSegment[];
  currentTime: number;
  cleanSegments: CleanSegment[];
  onSeek: (time: number) => void;
}

export default function TranscriptPanel({
  segments,
  currentTime,
  cleanSegments,
  onSeek,
}: Props) {
  const activeRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    activeRef.current?.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
  }, [currentTime]);

  const acceptedPromotions = cleanSegments.filter(
    s => s.accepted && s.types.includes('promotions')
  );

  return (
    <div className="flex flex-col h-full">
      <h3 className="text-sm font-medium text-text-primary px-1 mb-2">Transcript</h3>
      <div className="flex-1 overflow-y-auto space-y-0.5 pr-1">
        {segments.map(seg => {
          const isActive = currentTime >= seg.start && currentTime < seg.end;
          const isPromotion = acceptedPromotions.some(
            p => seg.end > p.start && seg.start < p.end
          );

          return (
            <div
              key={seg.id}
              ref={isActive ? activeRef : undefined}
              onClick={() => onSeek(seg.start)}
              className={`px-2 py-1 rounded cursor-pointer text-xs leading-relaxed transition-colors ${
                isActive
                  ? 'bg-accent-dim text-text-primary border-l-2 border-accent'
                  : isPromotion
                  ? 'bg-red-500/8 text-text-secondary border-l-2 border-red-500/30'
                  : 'text-text-muted hover:bg-surface-2/50 hover:text-text-secondary'
              }`}
            >
              <span className="font-mono text-[10px] text-text-muted mr-2">
                {formatTime(seg.start)}
              </span>
              {seg.text}
            </div>
          );
        })}
      </div>
    </div>
  );
}
