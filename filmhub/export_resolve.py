"""
Export FilmHub segments to DaVinci Resolve as timeline markers.

Usage:
    python -m filmhub.export_resolve <segments_json> [--timeline NAME]

Requires DaVinci Resolve to be running with scripting enabled:
    Resolve > Preferences > General > Enable scripting using: Local

Marker colors:
    Red    = Promotions
    Yellow = Graphics
    Blue   = Music
    Pink   = Multiple types
"""

import argparse
import importlib.util
import json
import sys
from pathlib import Path

_RESOLVE_MODULE = (
    "/Library/Application Support/Blackmagic Design/"
    "DaVinci Resolve/Developer/Scripting/Modules/DaVinciResolveScript.py"
)

TYPE_COLORS = {
    "graphics": "Yellow",
    "promotions": "Red",
    "music": "Blue",
}
MIXED_COLOR = "Pink"


_FUSIONSCRIPT_SO = (
    "/Applications/DaVinci Resolve/DaVinci Resolve.app"
    "/Contents/Libraries/Fusion/fusionscript.so"
)


def _load_resolve():
    # fusionscript.so must be importable — add its directory to sys.path if needed
    so_path = Path(_FUSIONSCRIPT_SO)
    if not so_path.exists():
        print(
            "Error: fusionscript.so not found. Is DaVinci Resolve installed?",
            file=sys.stderr,
        )
        sys.exit(1)

    fusion_lib_dir = str(so_path.parent)
    if fusion_lib_dir not in sys.path:
        sys.path.insert(0, fusion_lib_dir)

    try:
        import fusionscript as dvr
    except ImportError as e:
        print(f"Error loading fusionscript: {e}", file=sys.stderr)
        sys.exit(1)

    resolve = dvr.scriptapp("Resolve")
    if resolve is None:
        print(
            "Error: could not connect to DaVinci Resolve.\n"
            "Make sure Resolve is running and scripting is enabled:\n"
            "  Resolve > Preferences > General > Enable scripting using: Local",
            file=sys.stderr,
        )
        sys.exit(1)
    return resolve


def _pick_color(types: list) -> str:
    if len(types) == 1:
        return TYPE_COLORS.get(types[0], "Cream")
    return MIXED_COLOR


def _add_markers(timeline, segments: list, fps: float) -> int:
    added = 0
    for seg in segments:
        start_frame = int(round(seg["start"] * fps))
        duration = max(1, int(round((seg["end"] - seg["start"]) * fps)))

        types = seg.get("types", ["unknown"])
        color = _pick_color(types)
        name = " + ".join(t.capitalize() for t in types)
        note = seg.get("description", "")

        ok = timeline.AddMarker(start_frame, color, name, note, duration, "filmhub")
        if ok:
            added += 1
            start_tc = _frames_to_tc(start_frame, fps)
            end_tc = _frames_to_tc(start_frame + duration, fps)
            print(f"  [{color:8}] {start_tc} → {end_tc}  {name}: {note}")
        else:
            start_tc = _frames_to_tc(start_frame, fps)
            print(
                f"  Warning: skipped marker at {start_tc} — frame {start_frame} already has a marker",
                file=sys.stderr,
            )
    return added


def _frames_to_tc(frames: int, fps: float) -> str:
    total_seconds = frames / fps
    h = int(total_seconds // 3600)
    m = int((total_seconds % 3600) // 60)
    s = int(total_seconds % 60)
    return f"{h:02d}:{m:02d}:{s:02d}"


def main():
    parser = argparse.ArgumentParser(
        description="Add FilmHub segment markers to a DaVinci Resolve timeline"
    )
    parser.add_argument(
        "segments_json",
        help="Path to segments JSON (e.g. analysis/Taylor_test_1/clean_04_segments.json)",
    )
    parser.add_argument(
        "--timeline",
        help="Name of timeline to add markers to (default: currently open timeline)",
    )
    args = parser.parse_args()

    segments_path = Path(args.segments_json)
    if not segments_path.exists():
        print(f"Error: file not found: {segments_path}", file=sys.stderr)
        sys.exit(1)

    with open(segments_path) as f:
        segments = json.load(f)

    if not segments:
        print("No segments in file — nothing to export.")
        return

    print(f"Segments: {segments_path}  ({len(segments)} segment(s))")

    resolve = _load_resolve()

    pm = resolve.GetProjectManager()
    project = pm.GetCurrentProject()
    if project is None:
        print("Error: no project is open in DaVinci Resolve.", file=sys.stderr)
        sys.exit(1)

    print(f"Project:  {project.GetName()}")

    if args.timeline:
        timeline = None
        for i in range(1, project.GetTimelineCount() + 1):
            tl = project.GetTimelineByIndex(i)
            if tl.GetName() == args.timeline:
                timeline = tl
                break
        if timeline is None:
            print(f"Error: timeline '{args.timeline}' not found in project.", file=sys.stderr)
            sys.exit(1)
    else:
        timeline = project.GetCurrentTimeline()
        if timeline is None:
            print("Error: no timeline is currently open in Resolve.", file=sys.stderr)
            sys.exit(1)

    print(f"Timeline: {timeline.GetName()}")

    fps = float(timeline.GetSetting("timelineFrameRate"))
    print(f"FPS:      {fps}\n")

    added = _add_markers(timeline, segments, fps)
    print(f"\nDone — added {added}/{len(segments)} marker(s) to '{timeline.GetName()}'")


if __name__ == "__main__":
    main()
