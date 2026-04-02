#!/usr/bin/env python3
"""
cut_video.py
============
Removes specified segments from a video using FFmpeg.

Takes a video file and a JSON file listing segments to remove, then produces
a clean video with those segments cut out. Uses FFmpeg's concat demuxer with
stream copy (no re-encoding) for lossless, fast processing.

The segments JSON file should contain an array of objects:
  [{"start": <seconds>, "end": <seconds>}, ...]

Requirements:
  FFmpeg and ffprobe must be installed and available on PATH.

Usage:
  python -m filmhub.cut_video video.mp4 segments.json
  python -m filmhub.cut_video video.mp4 segments.json -o output/clean.mp4
"""

import argparse
import json
import os
import subprocess
import sys
import tempfile
from pathlib import Path

from filmhub.utils import OUTPUT_DIR, fmt_time


def get_duration(video_path: str) -> float:
    """Get video duration in seconds via ffprobe."""
    cmd = [
        "ffprobe", "-v", "error",
        "-show_entries", "format=duration",
        "-of", "default=noprint_wrappers=1:nokey=1",
        video_path,
    ]
    result = subprocess.run(cmd, capture_output=True, text=True, check=True)
    return float(result.stdout.strip())


def compute_keep_intervals(segments: list[dict], duration: float) -> list[tuple[float, float]]:
    """Invert removal segments into keep intervals."""
    segments = sorted(segments, key=lambda s: s["start"])
    keep = []
    cursor = 0.0
    for seg in segments:
        start = max(0, seg["start"])
        end = min(duration, seg["end"])
        if cursor < start:
            keep.append((cursor, start))
        cursor = max(cursor, end)
    if cursor < duration:
        keep.append((cursor, duration))
    return keep


def cut_video(video_path: str, segments: list[dict], output_path: str) -> None:
    """
    Remove the specified segments from the video using FFmpeg's concat demuxer.
    Uses stream copy (no re-encoding) for fast, lossless output.
    """
    if not segments:
        print("  No segments to remove — copying file as-is.")
        subprocess.run(["cp", video_path, output_path], check=True)
        return

    duration = get_duration(video_path)
    keep_intervals = compute_keep_intervals(segments, duration)

    if not keep_intervals:
        print("  WARNING: entire video would be removed — skipping.")
        return

    print(f"  Keeping {len(keep_intervals)} interval(s), removing {len(segments)} segment(s)")
    removed = sum(seg["end"] - seg["start"] for seg in segments)
    print(f"  Removing {fmt_time(removed)} of {fmt_time(duration)} total")

    tmpdir = tempfile.mkdtemp(prefix="cut_video_")
    concat_list_path = os.path.join(tmpdir, "concat.txt")
    part_paths = []

    for i, (start, end) in enumerate(keep_intervals):
        part_path = os.path.join(tmpdir, f"part_{i:04d}.mkv")
        part_paths.append(part_path)
        cmd = [
            "ffmpeg", "-y",
            "-i", video_path,
            "-ss", f"{start:.3f}",
            "-to", f"{end:.3f}",
            "-c", "copy",
            "-avoid_negative_ts", "make_zero",
            part_path,
        ]
        subprocess.run(cmd, check=True, capture_output=True)

    with open(concat_list_path, "w") as f:
        for p in part_paths:
            f.write(f"file '{p}'\n")

    cmd = [
        "ffmpeg", "-y",
        "-f", "concat", "-safe", "0",
        "-i", concat_list_path,
        "-c", "copy",
        output_path,
    ]
    subprocess.run(cmd, check=True, capture_output=True)

    # Clean up temp files
    for p in part_paths:
        os.remove(p)
    os.remove(concat_list_path)
    os.rmdir(tmpdir)


def main():
    parser = argparse.ArgumentParser(
        description="Remove specified segments from a video using FFmpeg."
    )
    parser.add_argument(
        "video",
        help="Path to the input video file.",
    )
    parser.add_argument(
        "segments",
        help='Path to a JSON file with segments to remove: [{"start": s, "end": s}, ...]',
    )
    parser.add_argument(
        "--output", "-o",
        default=None,
        help="Output file path (default: output/<name>_clean.<ext>).",
    )
    args = parser.parse_args()

    video_path = Path(args.video).resolve()
    if not video_path.is_file():
        print(f"ERROR: {args.video} is not a valid file.")
        sys.exit(1)

    segments_path = Path(args.segments).resolve()
    if not segments_path.is_file():
        print(f"ERROR: {args.segments} is not a valid file.")
        sys.exit(1)

    with open(segments_path) as f:
        segments = json.load(f)

    if not isinstance(segments, list):
        print("ERROR: segments JSON must be an array of {start, end} objects.")
        sys.exit(1)

    # Determine output path
    if args.output:
        output_path = str(Path(args.output).resolve())
        os.makedirs(Path(output_path).parent, exist_ok=True)
    else:
        name = video_path.stem
        ext = video_path.suffix
        video_output_dir = os.path.join(OUTPUT_DIR, name)
        os.makedirs(video_output_dir, exist_ok=True)
        n = 1
        while os.path.exists(os.path.join(video_output_dir, f"clean_{n:02d}{ext}")):
            n += 1
        output_path = os.path.join(video_output_dir, f"clean_{n:02d}{ext}")

    print(f"Video:    {video_path}")
    print(f"Segments: {segments_path} ({len(segments)} to remove)")
    print(f"Output:   {output_path}")

    cut_video(str(video_path), segments, output_path)

    print(f"\nDone! Clean video: {output_path}")


if __name__ == "__main__":
    main()
