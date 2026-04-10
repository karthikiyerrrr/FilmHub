#!/usr/bin/env python3
"""
cut_video.py
============
Removes specified segments from a video using FFmpeg.

Takes a video file and a JSON file listing segments to remove, then produces
a clean video with those segments cut out. Uses FFmpeg's concat demuxer with
stream copy (no re-encoding) for lossless, fast processing.

Cut points are automatically snapped to natural pauses in dialogue when a
transcript is available (looks for transcript.json in the video's analysis
directory). This avoids cuts mid-sentence.

The segments JSON file should contain an array of objects:
  [{"start": <seconds>, "end": <seconds>}, ...]

Requirements:
  FFmpeg and ffprobe must be installed and available on PATH.

Usage:
  python -m filmhub.cut_video video.mp4 segments.json
  python -m filmhub.cut_video video.mp4 segments.json -o output/clean.mp4
  python -m filmhub.cut_video video.mp4 segments.json --no-snap
"""

import argparse
import json
import os
import subprocess
import sys
import tempfile
from pathlib import Path

from filmhub.utils import ANALYSIS_DIR, OUTPUT_DIR, fmt_time


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


def load_transcript(video_path: str) -> list[dict] | None:
    """Try to load transcript.json from the video's analysis directory."""
    name = Path(video_path).stem
    transcript_path = os.path.join(ANALYSIS_DIR, name, "transcript.json")
    if not os.path.isfile(transcript_path):
        return None
    with open(transcript_path) as f:
        data = json.load(f)
    # Handle both formats: top-level list or dict with "segments" key
    if isinstance(data, dict) and "segments" in data:
        data = data["segments"]
    if isinstance(data, list) and data and "start" in data[0]:
        return data
    return None


def find_phrase_boundaries(transcript: list[dict]) -> list[float]:
    """Collect all transcript segment boundary timestamps.

    Each boundary is a point where one phrase ends and another begins,
    which is the ideal place to cut without chopping mid-sentence.
    """
    boundaries = set()
    for s in transcript:
        boundaries.add(s["start"])
        boundaries.add(s["end"])
    return sorted(boundaries)


def snap_to_boundary(timestamp: float, boundaries: list[float],
                     search_window: float = 3.0,
                     prefer: str = "nearest") -> float:
    """Snap a timestamp to the nearest transcript phrase boundary within a window.

    prefer: "nearest" (default), "forward" (only later boundaries),
            or "backward" (only earlier boundaries)
    """
    best = timestamp
    best_dist = search_window + 1
    for b in boundaries:
        dist = abs(b - timestamp)
        if dist > search_window:
            continue
        if prefer == "forward" and b < timestamp:
            continue
        if prefer == "backward" and b > timestamp:
            continue
        if dist < best_dist:
            best_dist = dist
            best = b
    return best


def snap_segments(segments: list[dict], transcript: list[dict],
                  search_window: float = 3.0) -> list[dict]:
    """Adjust segment boundaries to align with phrase boundaries in the transcript.

    For the start of a removal segment, snap forward when possible so the
    preceding phrase completes before the cut. For the end of a removal
    segment, snap forward so we skip past any partially-spoken phrase.
    """
    boundaries = find_phrase_boundaries(transcript)
    if not boundaries:
        return segments

    snapped = []
    for seg in segments:
        # Start of removal: prefer snapping FORWARD so the preceding phrase finishes
        new_start = snap_to_boundary(seg["start"], boundaries, search_window, prefer="forward")
        # End of removal: prefer snapping FORWARD so any partial phrase completes before resuming
        new_end = snap_to_boundary(seg["end"], boundaries, search_window, prefer="forward")

        # Ensure the segment doesn't collapse or invert
        if new_end - new_start < 0.5:
            new_start = seg["start"]
            new_end = seg["end"]

        new_seg = dict(seg, start=new_start, end=new_end)
        if new_start != seg["start"] or new_end != seg["end"]:
            print(f"    Snapped {fmt_time(seg['start'])}–{fmt_time(seg['end'])} "
                  f"→ {fmt_time(new_start)}–{fmt_time(new_end)}")
        snapped.append(new_seg)
    return snapped


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


def cut_video(video_path: str, segments: list[dict], output_path: str,
              do_snap: bool = True) -> None:
    """
    Remove the specified segments from the video by re-encoding only the kept
    intervals using FFmpeg's trim+concat filter chain. This produces
    frame-accurate cuts with no artifacts. Uses hardware acceleration
    (h264_videotoolbox) on macOS for speed.
    """
    if not segments:
        print("  No segments to remove — copying file as-is.")
        subprocess.run(["cp", video_path, output_path], check=True)
        return

    # Snap cut points to dialogue pauses if transcript is available
    if do_snap:
        transcript = load_transcript(video_path)
        if transcript:
            print("  Snapping cut points to dialogue pauses...")
            segments = snap_segments(segments, transcript)
        else:
            print("  No transcript found — cutting at exact boundaries.")

    duration = get_duration(video_path)
    keep_intervals = compute_keep_intervals(segments, duration)

    if not keep_intervals:
        print("  WARNING: entire video would be removed — skipping.")
        return

    print(f"  Keeping {len(keep_intervals)} interval(s), removing {len(segments)} segment(s)")
    removed = sum(seg["end"] - seg["start"] for seg in segments)
    print(f"  Removing {fmt_time(removed)} of {fmt_time(duration)} total")
    print("  Re-encoding (hardware-accelerated)...")

    # Build filter_complex: trim each interval, concat them
    filter_parts = []
    concat_inputs = []
    for i, (start, end) in enumerate(keep_intervals):
        filter_parts.append(
            f"[0:v]trim=start={start:.3f}:end={end:.3f},setpts=PTS-STARTPTS[v{i}]"
        )
        filter_parts.append(
            f"[0:a]atrim=start={start:.3f}:end={end:.3f},asetpts=PTS-STARTPTS[a{i}]"
        )
        concat_inputs.append(f"[v{i}][a{i}]")

    n = len(keep_intervals)
    filter_parts.append(
        f"{''.join(concat_inputs)}concat=n={n}:v=1:a=1[outv][outa]"
    )
    filter_complex = ";".join(filter_parts)

    cmd = [
        "ffmpeg", "-y",
        "-i", video_path,
        "-filter_complex", filter_complex,
        "-map", "[outv]",
        "-map", "[outa]",
        "-c:v", "h264_videotoolbox",
        "-b:v", "8M",
        "-c:a", "aac",
        "-b:a", "192k",
        "-movflags", "+faststart",
        output_path,
    ]
    subprocess.run(cmd, check=True, capture_output=True)


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
    parser.add_argument(
        "--no-snap",
        action="store_true",
        help="Disable snapping cut points to dialogue pauses.",
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

    cut_video(str(video_path), segments, output_path, do_snap=not args.no_snap)

    print(f"\nDone! Clean video: {output_path}")


if __name__ == "__main__":
    main()
