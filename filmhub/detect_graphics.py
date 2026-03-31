#!/usr/bin/env python3
"""
detect_graphics.py
====================
Detects on-screen graphics transitions (sponsor overlays, banners, lower
thirds, end cards) in video files by analyzing visual changes between frames.

Pipeline:
  1. Extract frames at 1 fps using FFmpeg to a temp directory
  2. Compare consecutive frames via OpenCV histogram correlation
  3. Identify transition points where the visual content changes significantly
  4. Save candidate transition frames for further analysis

Requirements:
  pip install opencv-python
  FFmpeg must be installed and available on PATH.

Usage:
  # Process a single video
  python -m filmhub.detect_graphics video.mp4

  # Process all videos in the videos/ directory
  python -m filmhub.detect_graphics videos/

  # Adjust detection sensitivity (lower = more sensitive)
  python -m filmhub.detect_graphics video.mp4 --threshold 0.3
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

import cv2
import numpy as np

from filmhub.utils import ANALYSIS_DIR, fmt_time, resolve_videos


# ---------------------------------------------------------------------------
# 1. Frame extraction
# ---------------------------------------------------------------------------

def extract_frames(video_path: str, output_dir: str, fps: int = 1) -> int:
    """Extract frames from a video at the given fps. Returns the frame count."""
    cmd = [
        "ffmpeg", "-y", "-i", video_path,
        "-vf", f"fps={fps}",
        os.path.join(output_dir, "frame_%06d.png"),
    ]
    subprocess.run(cmd, check=True, capture_output=True)

    frame_count = len(list(Path(output_dir).glob("frame_*.png")))
    return frame_count


# ---------------------------------------------------------------------------
# 2. Histogram computation
# ---------------------------------------------------------------------------

def compute_histogram(frame_path: str) -> np.ndarray | None:
    """Load a frame and compute a normalized HSV histogram (H + S channels)."""
    img = cv2.imread(frame_path)
    if img is None:
        return None
    hsv = cv2.cvtColor(img, cv2.COLOR_BGR2HSV)
    hist = cv2.calcHist([hsv], [0, 1], None, [50, 60], [0, 180, 0, 256])
    cv2.normalize(hist, hist)
    return hist


# ---------------------------------------------------------------------------
# 3. Transition detection
# ---------------------------------------------------------------------------

def detect_transitions(
    frames_dir: str,
    threshold: float = 0.4,
    fps: int = 1,
) -> list[dict]:
    """Compare consecutive frames and return transitions below the threshold."""
    frame_files = sorted(
        Path(frames_dir).glob("frame_*.png"),
        key=lambda p: int(p.stem.split("_")[1]),
    )

    if len(frame_files) < 2:
        return []

    total = len(frame_files) - 1
    transitions = []
    prev_hist = compute_histogram(str(frame_files[0]))

    for i in range(1, len(frame_files)):
        curr_hist = compute_histogram(str(frame_files[i]))

        if prev_hist is None or curr_hist is None:
            prev_hist = curr_hist
            continue

        score = cv2.compareHist(prev_hist, curr_hist, cv2.HISTCMP_CORREL)

        if score < threshold:
            frame_index = int(frame_files[i].stem.split("_")[1]) - 1  # 0-based
            transitions.append({
                "frame_index": frame_index,
                "timestamp": round(frame_index / fps, 2),
                "correlation": round(score, 4),
                "before_frame": str(frame_files[i - 1]),
                "after_frame": str(frame_files[i]),
            })

        if i % 500 == 0:
            print(f"         Compared {i}/{total} frames...")

        prev_hist = curr_hist

    return transitions


# ---------------------------------------------------------------------------
# Main processing
# ---------------------------------------------------------------------------

def process_video(video_path: str, output_dir: str, args: argparse.Namespace) -> None:
    """Run the full graphics detection pipeline on a single video."""
    name = Path(video_path).stem
    fps = args.fps

    print(f"\n{'='*60}")
    print(f"Processing: {video_path}")
    print(f"{'='*60}")

    tmp_frames_dir = tempfile.mkdtemp(prefix="frames_")
    candidates_dir = os.path.join(output_dir, f"{name}_graphics_frames")

    try:
        # Step 1: Extract frames
        print(f"  [1/4] Extracting frames at {fps} fps...")
        t0 = time.time()
        frame_count = extract_frames(video_path, tmp_frames_dir, fps)
        print(f"         Extracted {frame_count} frames in {time.time() - t0:.1f}s")

        if frame_count < 2:
            print("         Not enough frames to compare — skipping.")
            return

        # Step 2: Detect visual transitions
        print(f"  [2/4] Detecting visual transitions (threshold: {args.threshold})...")
        t0 = time.time()
        transitions = detect_transitions(tmp_frames_dir, args.threshold, fps)
        print(f"         Found {len(transitions)} transition(s) in {time.time() - t0:.1f}s")

        for t in transitions:
            print(f"           {fmt_time(t['timestamp'])} (correlation: {t['correlation']})")

        if not transitions:
            print("         No visual transitions detected.")
            # Write empty manifest
            manifest_path = os.path.join(output_dir, f"{name}_graphics_candidates.json")
            with open(manifest_path, "w") as f:
                json.dump([], f, indent=2)
            print(f"         Empty manifest saved to {manifest_path}")
            return

        # Step 3: Save candidate frames
        print(f"  [3/4] Saving {len(transitions)} candidate frame pair(s)...")
        os.makedirs(candidates_dir, exist_ok=True)

        for t in transitions:
            # Copy the before and after frames
            before_name = Path(t["before_frame"]).name
            after_name = Path(t["after_frame"]).name
            shutil.copy2(t["before_frame"], os.path.join(candidates_dir, before_name))
            shutil.copy2(t["after_frame"], os.path.join(candidates_dir, after_name))

        print(f"         Saved to {candidates_dir}")

        # Step 4: Save manifest JSON
        print("  [4/4] Saving manifest...")
        manifest = []
        for t in transitions:
            before_name = Path(t["before_frame"]).name
            after_name = Path(t["after_frame"]).name
            manifest.append({
                "frame_index": t["frame_index"],
                "timestamp": t["timestamp"],
                "time_formatted": fmt_time(t["timestamp"]),
                "correlation": t["correlation"],
                "before_frame": os.path.join(f"{name}_graphics_frames", before_name),
                "after_frame": os.path.join(f"{name}_graphics_frames", after_name),
            })

        manifest_path = os.path.join(output_dir, f"{name}_graphics_candidates.json")
        with open(manifest_path, "w") as f:
            json.dump(manifest, f, indent=2)
        print(f"         Manifest saved to {manifest_path}")

    finally:
        # Clean up full frame extraction temp directory
        if os.path.exists(tmp_frames_dir):
            shutil.rmtree(tmp_frames_dir)

    print("  Done.")


def main():
    parser = argparse.ArgumentParser(
        description="Detect on-screen graphics transitions in video files using frame-by-frame histogram comparison."
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
        default=0.4,
        help="Histogram correlation threshold for transition detection (default: 0.4). Lower values detect more transitions.",
    )
    parser.add_argument(
        "--fps",
        type=int,
        default=1,
        help="Frame extraction rate in frames per second (default: 1).",
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
    print(f"Threshold: {args.threshold}")
    print(f"Frame rate: {args.fps} fps")
    print(f"Results will be saved to: {output_dir}")

    for v in videos:
        process_video(v, output_dir, args)

    print(f"\nAll done! Results are in: {output_dir}")


if __name__ == "__main__":
    main()
