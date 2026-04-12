import { useRef, useState, useCallback, useEffect } from 'react';

export function useVideoSync() {
  const videoRef = useRef<HTMLVideoElement>(null);
  const [currentTime, setCurrentTime] = useState(0);
  const [duration, setDuration] = useState(0);
  const [isPlaying, setIsPlaying] = useState(false);
  const [fps, setFps] = useState(30);
  const rafRef = useRef<number>(0);

  const updateTime = useCallback(() => {
    if (videoRef.current) {
      setCurrentTime(videoRef.current.currentTime);
    }
    if (isPlaying) {
      rafRef.current = requestAnimationFrame(updateTime);
    }
  }, [isPlaying]);

  useEffect(() => {
    if (isPlaying) {
      rafRef.current = requestAnimationFrame(updateTime);
    }
    return () => cancelAnimationFrame(rafRef.current);
  }, [isPlaying, updateTime]);

  const seek = useCallback((time: number) => {
    if (videoRef.current) {
      videoRef.current.currentTime = time;
      setCurrentTime(time);
    }
  }, []);

  const play = useCallback(() => {
    videoRef.current?.play();
  }, []);

  const pause = useCallback(() => {
    videoRef.current?.pause();
  }, []);

  const setPlaybackRate = useCallback((rate: number) => {
    if (videoRef.current) {
      videoRef.current.playbackRate = rate;
    }
  }, []);

  const onLoadedMetadata = useCallback(() => {
    if (videoRef.current) {
      setDuration(videoRef.current.duration);
    }
  }, []);

  const onPlay = useCallback(() => setIsPlaying(true), []);
  const onPause = useCallback(() => setIsPlaying(false), []);
  const onTimeUpdate = useCallback(() => {
    if (videoRef.current) {
      setCurrentTime(videoRef.current.currentTime);
    }
  }, []);

  return {
    videoRef,
    currentTime,
    duration,
    isPlaying,
    fps,
    setFps,
    seek,
    play,
    pause,
    setPlaybackRate,
    onLoadedMetadata,
    onPlay,
    onPause,
    onTimeUpdate,
  };
}
