import { useState } from 'react';
import type { RefObject } from 'react';
import { formatTimeFrames } from '../utils/formatTime';

const SPEEDS = [0.5, 1, 1.5, 2];

interface Props {
  videoRef: RefObject<HTMLVideoElement | null>;
  src: string;
  currentTime: number;
  duration: number;
  isPlaying: boolean;
  onPlay: () => void;
  onPause: () => void;
  onLoadedMetadata: () => void;
  onTimeUpdate: () => void;
  play: () => void;
  pause: () => void;
  setPlaybackRate: (rate: number) => void;
  fps: number;
}

export default function VideoPlayer({
  videoRef,
  src,
  currentTime,
  duration,
  isPlaying,
  onPlay,
  onPause,
  onLoadedMetadata,
  onTimeUpdate,
  play,
  pause,
  setPlaybackRate,
  fps,
}: Props) {
  const [speed, setSpeed] = useState(1);

  const handleSpeedChange = () => {
    const idx = SPEEDS.indexOf(speed);
    const next = SPEEDS[(idx + 1) % SPEEDS.length];
    setSpeed(next);
    setPlaybackRate(next);
  };

  const progress = duration > 0 ? (currentTime / duration) * 100 : 0;

  return (
    <div className="flex flex-col bg-black rounded-lg overflow-hidden shadow-[0_0_40px_rgba(0,0,0,0.5)] max-w-full max-h-[50vh] xl:max-h-[70vh]">
      <div className="relative flex-1 min-h-0 bg-black">
        <video
          ref={videoRef}
          src={src}
          className="w-full h-full object-contain"
          onLoadedMetadata={onLoadedMetadata}
          onPlay={onPlay}
          onPause={onPause}
          onTimeUpdate={onTimeUpdate}
          preload="metadata"
        />
      </div>

      {/* Progress bar */}
      <div className="h-0.5 bg-surface-2">
        <div
          className="h-full bg-accent transition-[width] duration-100"
          style={{ width: `${progress}%` }}
        />
      </div>

      {/* Controls */}
      <div className="flex items-center gap-3 px-3 py-2 bg-surface-1 border-t border-border-subtle">
        <button
          onClick={isPlaying ? pause : play}
          className="w-8 h-8 flex items-center justify-center rounded-md hover:bg-accent/15 text-text-secondary hover:text-accent transition-colors"
        >
          {isPlaying ? (
            <svg width="16" height="16" viewBox="0 0 16 16" fill="currentColor">
              <rect x="3" y="2" width="4" height="12" rx="1" />
              <rect x="9" y="2" width="4" height="12" rx="1" />
            </svg>
          ) : (
            <svg width="16" height="16" viewBox="0 0 16 16" fill="currentColor">
              <path d="M4 2.5v11l9-5.5z" />
            </svg>
          )}
        </button>

        <span className="text-xs text-text-secondary font-mono tabular-nums min-w-[100px]">
          {formatTimeFrames(currentTime, fps)} / {formatTimeFrames(duration, fps)}
        </span>

        <button
          onClick={handleSpeedChange}
          className="px-2 py-0.5 text-xs rounded-md bg-surface-2 text-text-secondary hover:bg-surface-3 hover:text-text-primary font-mono transition-colors"
        >
          {speed}x
        </button>
      </div>
    </div>
  );
}
