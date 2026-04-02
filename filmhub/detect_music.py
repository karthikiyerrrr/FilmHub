#!/usr/bin/env python3
"""
detect_music.py
====================
Detects copyrighted music segments in video files using source separation
and audio fingerprinting.

Pipeline:
  1. Extract audio from video using FFmpeg (44.1 kHz for music analysis)
  2. Separate music from speech using Demucs (Meta's source separation)
  3. Detect music segments via RMS energy analysis with librosa
  4. Fingerprint detected segments against AcoustID database

Requirements:
  pip install demucs librosa pyacoustid
  FFmpeg must be installed and available on PATH.
  Chromaprint (fpcalc) must be installed for fingerprinting.

Usage:
  # Process a single video
  python -m filmhub.detect_music video.mp4 --acoustid-key YOUR_KEY

  # Process all videos in the videos/ directory
  python -m filmhub.detect_music videos/

  # Adjust detection sensitivity
  python -m filmhub.detect_music video.mp4 --threshold 0.02
"""

import argparse
import json
import os
import shutil
import subprocess
import sys
import tempfile
import time
from pathlib import Path

import librosa
import numpy as np

from filmhub.utils import ANALYSIS_DIR, fmt_time, resolve_videos


# ---------------------------------------------------------------------------
# 1. Audio extraction
# ---------------------------------------------------------------------------

def extract_audio(video_path: str, audio_path: str) -> None:
    """Extract mono 44.1 kHz WAV audio from a video file."""
    cmd = [
        "ffmpeg", "-y", "-i", video_path,
        "-vn",                 # no video
        "-acodec", "pcm_s16le",
        "-ar", "44100",        # 44.1 kHz for music analysis
        "-ac", "1",            # mono
        audio_path,
    ]
    subprocess.run(cmd, check=True, capture_output=True)


# ---------------------------------------------------------------------------
# 2. Source separation (Demucs)
# ---------------------------------------------------------------------------

def separate_music(audio_path: str, output_dir: str, model_name: str = "htdemucs") -> str:
    """Separate music from speech using Demucs. Returns path to the music stem."""
    cmd = [
        sys.executable, "-m", "demucs",
        "-n", model_name,
        "-o", output_dir,
        "--two-stems", "vocals",
        audio_path,
    ]
    print(f"    Running Demucs ({model_name})...")
    subprocess.run(cmd, check=True, capture_output=True)

    stem_name = Path(audio_path).stem
    music_path = os.path.join(output_dir, model_name, stem_name, "no_vocals.wav")

    if not os.path.exists(music_path):
        print(f"  ERROR: Expected music stem not found at {music_path}")
        sys.exit(1)

    return music_path


# ---------------------------------------------------------------------------
# 3. Music segment detection (librosa RMS energy)
# ---------------------------------------------------------------------------

def detect_music_segments(
    music_path: str,
    threshold: float = 0.01,
    hop_length: int = 512,
    frame_length: int = 2048,
) -> list[tuple[float, float]]:
    """Detect segments where music energy exceeds the threshold."""
    y, sr = librosa.load(music_path, sr=None)
    rms = librosa.feature.rms(y=y, frame_length=frame_length, hop_length=hop_length)[0]
    times = librosa.frames_to_time(np.arange(len(rms)), sr=sr, hop_length=hop_length)

    segments = []
    in_segment = False
    start = 0.0

    for i, energy in enumerate(rms):
        if energy > threshold and not in_segment:
            start = times[i]
            in_segment = True
        elif energy <= threshold and in_segment:
            segments.append((start, times[i]))
            in_segment = False

    if in_segment:
        segments.append((start, times[-1]))

    return segments


def merge_segments(
    segments: list[tuple[float, float]],
    gap: float = 5.0,
    min_duration: float = 3.0,
) -> list[tuple[float, float]]:
    """Merge nearby segments and filter out short ones."""
    if not segments:
        return []

    merged = [segments[0]]
    for start, end in segments[1:]:
        prev_start, prev_end = merged[-1]
        if start - prev_end <= gap:
            merged[-1] = (prev_start, max(prev_end, end))
        else:
            merged.append((start, end))

    return [(s, e) for s, e in merged if e - s >= min_duration]


# ---------------------------------------------------------------------------
# 4. Audio fingerprinting (AcoustID / Chromaprint)
# ---------------------------------------------------------------------------

def fingerprint_segment(
    music_path: str,
    start: float,
    end: float,
    api_key: str,
) -> str | None:
    """Fingerprint a music segment and look up against AcoustID."""
    import acoustid

    duration = end - start
    # Use a ~30s clip from the middle for best fingerprint accuracy
    clip_duration = min(30.0, duration)
    clip_start = start + (duration - clip_duration) / 2

    tmp_path = None
    try:
        with tempfile.NamedTemporaryFile(suffix=".wav", delete=False) as tmp:
            tmp_path = tmp.name

        cmd = [
            "ffmpeg", "-y", "-i", music_path,
            "-ss", f"{clip_start:.3f}",
            "-t", f"{clip_duration:.3f}",
            "-acodec", "pcm_s16le", "-ar", "44100", "-ac", "1",
            tmp_path,
        ]
        subprocess.run(cmd, check=True, capture_output=True)

        results = acoustid.match(api_key, tmp_path)
        for score, recording_id, title, artist in results:
            if score > 0.5 and title:
                label = f"{artist} - {title}" if artist else title
                return label
        return None

    except acoustid.NoBackendError:
        print("  WARNING: Chromaprint (fpcalc) not found. Skipping fingerprinting.")
        print("           Install it via: brew install chromaprint")
        return None
    except acoustid.FingerprintGenerationError:
        return None
    except acoustid.WebServiceError as e:
        print(f"  WARNING: AcoustID lookup failed: {e}")
        return None
    finally:
        if tmp_path and os.path.exists(tmp_path):
            os.remove(tmp_path)


# ---------------------------------------------------------------------------
# Main processing
# ---------------------------------------------------------------------------

def process_video(video_path: str, output_dir: str, args: argparse.Namespace) -> None:
    """Run the full music detection pipeline on a single video."""
    name = Path(video_path).stem

    print(f"\n{'='*60}")
    print(f"Processing: {video_path}")
    print(f"{'='*60}")

    demucs_dir = tempfile.mkdtemp(prefix="demucs_")
    audio_path = os.path.join(tempfile.gettempdir(), f"{name}_audio_44k.wav")

    try:
        # Step 1: Extract audio
        print("  [1/4] Extracting audio (44.1 kHz)...")
        t0 = time.time()
        extract_audio(video_path, audio_path)
        print(f"         Done in {time.time() - t0:.1f}s")

        # Step 2: Separate music from speech
        print("  [2/4] Separating music from speech...")
        t0 = time.time()
        music_path = separate_music(audio_path, demucs_dir, args.demucs_model)
        print(f"         Done in {time.time() - t0:.1f}s")

        # Step 3: Detect music segments
        print("  [3/4] Detecting music segments...")
        t0 = time.time()
        raw_segments = detect_music_segments(music_path, args.threshold)
        segments = merge_segments(raw_segments, args.merge_gap, args.min_duration)
        print(f"         Found {len(segments)} segment(s) in {time.time() - t0:.1f}s")

        for s, e in segments:
            print(f"           {fmt_time(s)} – {fmt_time(e)} ({e - s:.1f}s)")

        if not segments:
            print("         No music segments detected.")

        # Step 4: Fingerprint segments
        results = []
        api_key = args.acoustid_key or os.environ.get("ACOUSTID_API_KEY")

        if segments and api_key:
            print("  [4/4] Fingerprinting segments against AcoustID...")
            for i, (s, e) in enumerate(segments):
                print(f"         Segment {i+1}/{len(segments)}: {fmt_time(s)} – {fmt_time(e)}...")
                track = fingerprint_segment(music_path, s, e, api_key)
                results.append({"start": round(s, 2), "end": round(e, 2), "track": track})
                if track:
                    print(f"           → {track}")
                else:
                    print(f"           → Unknown track")
        else:
            if segments and not api_key:
                print("  [4/4] Skipping fingerprinting (no AcoustID API key provided).")
            elif not segments:
                print("  [4/4] Skipping fingerprinting (no segments to fingerprint).")

            for s, e in segments:
                results.append({"start": round(s, 2), "end": round(e, 2), "track": None})

        # Save results
        video_dir = os.path.join(output_dir, name)
        os.makedirs(video_dir, exist_ok=True)
        output_path = os.path.join(video_dir, "music.json")
        with open(output_path, "w") as f:
            json.dump(results, f, indent=2)
        print(f"         Results saved to {output_path}")

    finally:
        # Cleanup temp files
        if os.path.exists(audio_path):
            os.remove(audio_path)
        if os.path.exists(demucs_dir):
            shutil.rmtree(demucs_dir)

    print("  Done.")


def main():
    parser = argparse.ArgumentParser(
        description="Detect copyrighted music in video files using source separation and audio fingerprinting."
    )
    parser.add_argument(
        "input",
        help="Path to a video file or a directory of video files.",
    )
    parser.add_argument(
        "--output", "-o",
        default=None,
        help=f"Output directory for results (default: {ANALYSIS_DIR}).",
    )
    parser.add_argument(
        "--extensions",
        default=".mp4,.mkv,.mov,.avi,.webm",
        help="Comma-separated video file extensions to process (default: .mp4,.mkv,.mov,.avi,.webm).",
    )
    parser.add_argument(
        "--threshold",
        type=float,
        default=0.01,
        help="RMS energy threshold for music detection (default: 0.01).",
    )
    parser.add_argument(
        "--min-duration",
        type=float,
        default=3.0,
        help="Minimum segment duration in seconds to keep (default: 3.0).",
    )
    parser.add_argument(
        "--merge-gap",
        type=float,
        default=5.0,
        help="Merge music segments closer than this many seconds (default: 5.0).",
    )
    parser.add_argument(
        "--acoustid-key",
        default=None,
        help="AcoustID API key (or set ACOUSTID_API_KEY env var).",
    )
    parser.add_argument(
        "--demucs-model",
        default="htdemucs",
        help="Demucs model name (default: htdemucs).",
    )
    args = parser.parse_args()

    extensions = set(args.extensions.split(","))
    videos = resolve_videos(args.input, extensions)

    if not videos:
        print("No video files found.")
        sys.exit(0)

    # Output directory
    output_dir = args.output if args.output else ANALYSIS_DIR
    output_dir = str(Path(output_dir).resolve())
    os.makedirs(output_dir, exist_ok=True)

    print(f"Found {len(videos)} video(s) to process.")
    print(f"Demucs model: {args.demucs_model}")
    print(f"RMS threshold: {args.threshold}")
    print(f"Results will be saved to: {output_dir}")

    for v in videos:
        process_video(v, output_dir, args)

    print(f"\nAll done! Results are in: {output_dir}")


if __name__ == "__main__":
    main()
