#!/usr/bin/env python3
"""
detect_graphics.py
====================
Detects on-screen graphics transitions (sponsor overlays, banners, lower
thirds, end cards) in video files by analyzing visual changes between frames.

Pipeline:
  1. Extract frames at 1 fps using FFmpeg to a temp directory
  2. Compare consecutive frames via OpenCV histogram correlation across
     multiple regions (full frame, top 25%, bottom 25%)
  3. Optionally detect text/icon frames via brightness drop + Canny edge
     density (--detect-text flag)
  4. Identify transition points where any region changes significantly
  5. Save candidate transition frames for further analysis

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

  # Also detect hard cuts to text/icon screens (e.g. outro cards)
  python -m filmhub.detect_graphics video.mp4 --detect-text
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
# 2. Frame metrics computation
# ---------------------------------------------------------------------------

def _hs_histogram(region: np.ndarray) -> np.ndarray:
    """Compute a normalized H+S histogram for a BGR image region."""
    hsv = cv2.cvtColor(region, cv2.COLOR_BGR2HSV)
    hist = cv2.calcHist([hsv], [0, 1], None, [50, 60], [0, 180, 0, 256])
    cv2.normalize(hist, hist)
    return hist


def compute_frame_metrics(frame_path: str) -> dict | None:
    """Load a frame and compute histogram and brightness metrics.

    Returns a dict with:
      - ``hists``: normalized H+S histograms for the full frame, top-25%
        band, and bottom-25% band
      - ``brightness``: mean V-channel value (0–1), used to detect cuts to
        dark screens and overlay events
    """
    img = cv2.imread(frame_path)
    if img is None:
        return None

    h = img.shape[0]
    top_band    = img[:h // 4]       # top 25% — banners, titles
    bottom_band = img[3 * h // 4:]   # bottom 25% — lower-thirds, handles

    def _v_mean(region: np.ndarray) -> float:
        return float(np.mean(cv2.cvtColor(region, cv2.COLOR_BGR2HSV)[:, :, 2])) / 255.0

    metrics: dict = {
        "hists": {
            "full":   _hs_histogram(img),
            "top":    _hs_histogram(top_band)    if top_band.size    else None,
            "bottom": _hs_histogram(bottom_band) if bottom_band.size else None,
        },
        # Per-region mean V-channel brightness (0–1) for text/overlay detection.
        "brightness": {
            "full":   _v_mean(img),
            "top":    _v_mean(top_band)    if top_band.size    else 0.0,
            "bottom": _v_mean(bottom_band) if bottom_band.size else 0.0,
        },
    }

    return metrics


def _hist_score(prev: dict, curr: dict) -> float:
    """Return the minimum histogram correlation across all ROI bands.

    A lower score means a bigger visual change in at least one region.
    """
    scores = []
    for key in ("full", "top", "bottom"):
        p = prev["hists"].get(key)
        c = curr["hists"].get(key)
        if p is not None and c is not None:
            scores.append(cv2.compareHist(p, c, cv2.HISTCMP_CORREL))
    return min(scores) if scores else 1.0


# ---------------------------------------------------------------------------
# 3. Transition detection
# ---------------------------------------------------------------------------

# Thresholds for text/overlay detection (--detect-text mode).
# Lower-third / social-handle overlay: bottom band brightens disproportionately
# on an otherwise dark frame (e.g. white handles appearing over dark video).
_OVERLAY_BOTTOM_MIN_DELTA  = 0.05   # bottom band must rise by at least this
_OVERLAY_MAX_PREV_FULL     = 0.20   # only flag if whole frame was dark before
# Outro / title card: top and bottom bands move in opposite directions, both
# with sufficient magnitude (card has light content in one band, dark in other).
_SPLIT_BAND_MIN_DELTA      = 0.04   # each band must change by at least this


def detect_transitions(
    frames_dir: str,
    threshold: float = 0.4,
    fps: int = 1,
    detect_text: bool = False,
) -> list[dict]:
    """Compare consecutive frames and return detected transitions.

    A transition is flagged when either:
    - The minimum ROI histogram correlation drops below *threshold*, OR
    - (When *detect_text* is enabled) A hard cut to a dark, edge-dense frame
      is detected (brightness drop + high Canny edge density), which catches
      black-screen text cards and outro cards that histogram comparison misses.
    """
    frame_files = sorted(
        Path(frames_dir).glob("frame_*.png"),
        key=lambda p: int(p.stem.split("_")[1]),
    )

    if len(frame_files) < 2:
        return []

    total = len(frame_files) - 1
    transitions = []
    prev_metrics = compute_frame_metrics(str(frame_files[0]))

    for i in range(1, len(frame_files)):
        curr_metrics = compute_frame_metrics(str(frame_files[i]))

        if prev_metrics is None or curr_metrics is None:
            prev_metrics = curr_metrics
            continue

        score = _hist_score(prev_metrics, curr_metrics)

        # Primary signal: any ROI band changed significantly.
        triggered = score < threshold
        trigger_reason = "histogram" if triggered else None

        # Secondary signal: regional brightness divergence for text/overlay detection.
        if detect_text and not triggered:
            pb = prev_metrics["brightness"]
            cb = curr_metrics["brightness"]
            d_full   = cb["full"]   - pb["full"]
            d_bottom = cb["bottom"] - pb["bottom"]
            d_top    = cb["top"]    - pb["top"]

            # Lower-third / social-handle: bottom band brightens significantly
            # more than the full frame, on an already-dark video frame.
            # (Global lighting changes affect all regions roughly equally.)
            if (d_bottom > _OVERLAY_BOTTOM_MIN_DELTA
                    and abs(d_bottom) > abs(d_full)
                    and pb["full"] < _OVERLAY_MAX_PREV_FULL):
                triggered = True
                trigger_reason = "text-overlay"

            # Outro / title card: top and bottom bands move in opposite
            # directions with meaningful magnitude — card lays out content
            # unevenly across the frame (e.g. bright icons top, black bottom).
            elif (abs(d_top) > _SPLIT_BAND_MIN_DELTA
                    and abs(d_bottom) > _SPLIT_BAND_MIN_DELTA
                    and d_top * d_bottom < 0):
                triggered = True
                trigger_reason = "text-darkcut"

        if triggered:
            frame_index = int(frame_files[i].stem.split("_")[1]) - 1  # 0-based
            entry = {
                "frame_index": frame_index,
                "timestamp": round(frame_index / fps, 2),
                "correlation": round(score, 4),
                "trigger": trigger_reason,
                "before_frame": str(frame_files[i - 1]),
                "after_frame": str(frame_files[i]),
            }
            if detect_text:
                entry["brightness_full"]   = round(curr_metrics["brightness"]["full"], 4)
                entry["brightness_bottom"] = round(curr_metrics["brightness"]["bottom"], 4)
                entry["brightness_top"]    = round(curr_metrics["brightness"]["top"], 4)
            transitions.append(entry)

        if i % 500 == 0:
            print(f"         Compared {i}/{total} frames...")

        prev_metrics = curr_metrics

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
    video_dir = os.path.join(output_dir, name)
    candidates_dir = os.path.join(video_dir, "graphics_frames")

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
        detect_text = getattr(args, "detect_text", False)
        mode_label = " + text detection" if detect_text else ""
        print(f"  [2/4] Detecting visual transitions (threshold: {args.threshold}{mode_label})...")
        t0 = time.time()
        transitions = detect_transitions(tmp_frames_dir, args.threshold, fps, detect_text)
        print(f"         Found {len(transitions)} transition(s) in {time.time() - t0:.1f}s")

        for t in transitions:
            extras = f"correlation: {t['correlation']}"
            if t.get("trigger", "").startswith("text"):
                extras += (f", b_full={t.get('brightness_full')}"
                           f" b_top={t.get('brightness_top')}"
                           f" b_bot={t.get('brightness_bottom')}")
            print(f"           {fmt_time(t['timestamp'])} ({extras})")

        if not transitions:
            print("         No visual transitions detected.")
            # Write empty manifest
            os.makedirs(video_dir, exist_ok=True)
            manifest_path = os.path.join(video_dir, "graphics_candidates.json")
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
                "before_frame": os.path.join("graphics_frames", before_name),
                "after_frame": os.path.join("graphics_frames", after_name),
            })

        manifest_path = os.path.join(video_dir, "graphics_candidates.json")
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
    parser.add_argument(
        "--detect-text",
        action="store_true",
        default=False,
        help=(
            "Also detect hard cuts to text/icon screens (e.g. outro cards, "
            "social handle cards) using brightness drop + Canny edge density. "
            "No extra dependencies required."
        ),
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
    if args.detect_text:
        print("Text/icon detection: enabled")
    print(f"Results will be saved to: {output_dir}")

    for v in videos:
        process_video(v, output_dir, args)

    print(f"\nAll done! Results are in: {output_dir}")


if __name__ == "__main__":
    main()
