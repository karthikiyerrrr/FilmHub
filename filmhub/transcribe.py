#!/usr/bin/env python3
"""
transcribe.py
====================
Generates timestamped transcripts from video files using mlx-whisper
(GPU-accelerated on Apple Silicon via MLX).

Pipeline (current):
  1. Extract audio from video using FFmpeg
  2. Transcribe audio using mlx-whisper (with timestamps)

Requirements:
  pip install mlx-whisper
  FFmpeg must be installed and available on PATH.

Usage:
  # Process a single video
  python -m filmhub.transcribe video.mp4

  # Process all videos in the videos/ directory
  python -m filmhub.transcribe videos/

  # Use a specific Whisper model size
  python -m filmhub.transcribe video.mp4 --whisper-model large
"""

import argparse
import json
import os
import subprocess
import sys
import tempfile
import time
from pathlib import Path

from filmhub.utils import ANALYSIS_DIR, fmt_time, resolve_videos


# ---------------------------------------------------------------------------
# MLX model name mapping
# ---------------------------------------------------------------------------

MLX_MODELS = {
    "tiny": "mlx-community/whisper-tiny",
    "small": "mlx-community/whisper-small-mlx",
    "medium": "mlx-community/whisper-medium-mlx",
    "large": "mlx-community/whisper-large-v3-mlx",
    "turbo": "mlx-community/whisper-turbo",
}


# ---------------------------------------------------------------------------
# 1. Audio extraction
# ---------------------------------------------------------------------------

def extract_audio(video_path: str, audio_path: str) -> None:
    """Extract mono 16 kHz WAV audio from a video file."""
    cmd = [
        "ffmpeg", "-y", "-i", video_path,
        "-vn",                 # no video
        "-acodec", "pcm_s16le",
        "-ar", "16000",        # 16 kHz
        "-ac", "1",            # mono
        audio_path,
    ]
    subprocess.run(cmd, check=True, capture_output=True)


# ---------------------------------------------------------------------------
# 2. Transcription (with segment-level timestamps)
# ---------------------------------------------------------------------------

def transcribe(audio_path: str, model_name: str = "turbo") -> dict:
    """Transcribe using mlx-whisper (GPU-accelerated on Apple Silicon)."""
    import mlx_whisper

    repo = MLX_MODELS.get(model_name)
    if repo is None:
        print(f"  Unknown model '{model_name}', using as HuggingFace repo directly.")
        repo = model_name

    print(f"  Using model: {repo}")
    print(f"  Loading model (first run will download from HuggingFace)...")
    t0 = time.time()
    result = mlx_whisper.transcribe(audio_path, path_or_hf_repo=repo, verbose=True)
    elapsed = time.time() - t0
    print(f"  Transcription completed in {elapsed:.1f}s")
    return result


# ---------------------------------------------------------------------------
# Main
# ---------------------------------------------------------------------------

def process_video(video_path: str, output_dir: str, whisper_model: str) -> None:
    """Extract audio and generate a timestamped transcript for a single video."""
    name = Path(video_path).stem

    print(f"\n{'='*60}")
    print(f"Processing: {video_path}")
    print(f"{'='*60}")

    # Step 1: Extract audio
    print("  [1/2] Extracting audio...")
    audio_path = os.path.join(tempfile.gettempdir(), f"{name}_audio.wav")
    extract_audio(video_path, audio_path)

    # Step 2: Transcribe
    print("  [2/2] Transcribing with mlx-whisper...")
    transcript = transcribe(audio_path, whisper_model)

    # Save transcript
    video_dir = os.path.join(output_dir, name)
    os.makedirs(video_dir, exist_ok=True)
    transcript_path = os.path.join(video_dir, "transcript.json")
    with open(transcript_path, "w") as f:
        json.dump(transcript, f, indent=2)
    print(f"         Transcript saved to {transcript_path}")

    # Print segment summary
    segments = transcript.get("segments", [])
    if segments:
        total_duration = segments[-1]["end"]
        print(f"         {len(segments)} segments, duration: {fmt_time(total_duration)}")

    # Cleanup temp audio
    os.remove(audio_path)
    print("  Done.")


def main():
    parser = argparse.ArgumentParser(
        description="Generate timestamped transcripts from videos using local Whisper."
    )
    parser.add_argument(
        "input",
        help="Path to a video file or a directory of video files.",
    )
    parser.add_argument(
        "--output", "-o",
        default=None,
        help=f"Output directory for transcripts (default: {ANALYSIS_DIR}).",
    )
    parser.add_argument(
        "--whisper-model",
        default="turbo",
        help="Whisper model size (default: turbo). Options: tiny, small, medium, large, turbo.",
    )
    parser.add_argument(
        "--extensions",
        default=".mp4,.mkv,.mov,.avi,.webm",
        help="Comma-separated video file extensions to process (default: .mp4,.mkv,.mov,.avi,.webm).",
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
    print(f"Whisper model: {args.whisper_model}")
    print(f"Transcripts will be saved to: {output_dir}")

    for v in videos:
        process_video(v, output_dir, args.whisper_model)

    print(f"\nAll done! Transcripts are in: {output_dir}")


if __name__ == "__main__":
    main()
