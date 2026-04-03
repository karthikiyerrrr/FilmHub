#!/usr/bin/env python3
"""
convert_transcript.py
====================
Converts a transcript JSON file into a lightweight text format suitable
for promotion detection.  Strips Whisper metadata (token IDs, logprobs,
compression ratios, etc.) and keeps only speaker labels, timestamps, and
transcript text.

Output format (one line per segment):
  SPEAKER_00    00:00:00 - 00:00:12    I'm free. Today is finally today.

If diarization was not used (no speaker field), the speaker column is omitted:
  00:00:00 - 00:00:12    I'm free. Today is finally today.

Usage:
  python -m filmhub.convert_transcript video.mp4
  python -m filmhub.convert_transcript videos/
"""

import argparse
import json
import os
import sys
from pathlib import Path

from filmhub.utils import ANALYSIS_DIR, fmt_time, get_video_analysis_dir, resolve_videos


def convert_transcript(video_path: str) -> None:
    """Read transcript.json for a video and write a compact transcript.txt."""
    analysis_dir = get_video_analysis_dir(video_path)
    json_path = os.path.join(analysis_dir, "transcript.json")

    if not os.path.isfile(json_path):
        print(f"  Transcript not found: {json_path}")
        return

    with open(json_path) as f:
        transcript = json.load(f)

    lines = []
    for seg in transcript.get("segments", []):
        start = fmt_time(seg["start"])
        end = fmt_time(seg["end"])
        text = seg["text"].strip()
        speaker = seg.get("speaker")

        if speaker:
            lines.append(f"{speaker}    {start} - {end}    {text}")
        else:
            lines.append(f"{start} - {end}    {text}")

    txt_path = os.path.join(analysis_dir, "transcript.txt")
    with open(txt_path, "w") as f:
        f.write("\n".join(lines) + "\n")

    print(f"  Saved {len(lines)} segments to {txt_path}")


def main():
    parser = argparse.ArgumentParser(
        description="Convert transcript JSON to a compact text format for promotion detection."
    )
    parser.add_argument(
        "input",
        help="Path to a video file or a directory of video files.",
    )
    args = parser.parse_args()

    videos = resolve_videos(args.input)

    if not videos:
        print("No video files found.")
        sys.exit(0)

    for v in videos:
        name = Path(v).stem
        print(f"Converting transcript for: {name}")
        convert_transcript(v)

    print("Done.")


if __name__ == "__main__":
    main()
