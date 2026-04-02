"""Shared utilities for FilmHub video processing scripts."""

import os
import sys
from pathlib import Path

# ---------------------------------------------------------------------------
# Directory constants (relative to the repo root)
# ---------------------------------------------------------------------------

_REPO_ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))

ANALYSIS_DIR = os.path.join(_REPO_ROOT, "analysis")
OUTPUT_DIR = os.path.join(_REPO_ROOT, "output")

SUPPORTED_EXTENSIONS = {".mp4", ".mkv", ".mov", ".avi", ".webm"}


def get_video_analysis_dir(video_path: str) -> str:
    """Return the per-video analysis subdirectory path."""
    return os.path.join(ANALYSIS_DIR, Path(video_path).stem)


def get_video_output_dir(video_path: str) -> str:
    """Return the per-video output subdirectory path."""
    return os.path.join(OUTPUT_DIR, Path(video_path).stem)


# ---------------------------------------------------------------------------
# Format helpers
# ---------------------------------------------------------------------------

def fmt_time(seconds: float) -> str:
    """Format seconds as HH:MM:SS."""
    m, s = divmod(int(seconds), 60)
    h, m = divmod(m, 60)
    return f"{h:02d}:{m:02d}:{s:02d}"


# ---------------------------------------------------------------------------
# Video file resolution
# ---------------------------------------------------------------------------

def resolve_videos(input_path: str, extensions: set[str] | None = None) -> list[str]:
    """Resolve a file or directory path into a list of video file paths.

    Returns an empty list if no videos are found. Exits with an error
    if the path is invalid.
    """
    if extensions is None:
        extensions = SUPPORTED_EXTENSIONS

    path = Path(input_path).resolve()

    if path.is_file():
        return [str(path)]
    elif path.is_dir():
        return sorted(
            str(p) for p in path.iterdir()
            if p.suffix.lower() in extensions
        )
    else:
        print(f"ERROR: {input_path} is not a valid file or directory.")
        sys.exit(1)
