"""
Export FilmHub segments to DaVinci Resolve as timeline markers.

Usage:
    python -m filmhub.export_resolve <segments_json> [--timeline NAME]
    python -m filmhub.export_resolve <segments_json> --save [--fps FPS]
    python -m filmhub.export_resolve --load <markers_json> [--timeline NAME]

--save writes marker data to a JSON file (no Resolve needed).
--load imports a previously saved markers file into Resolve.

Requires DaVinci Resolve to be running with scripting enabled (except --save):
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


def _build_markers(segments: list, fps: float) -> list:
    """Convert segments to marker dicts with frame-level data."""
    markers = []
    for seg in segments:
        start_frame = int(round(seg["start"] * fps))
        duration = max(1, int(round((seg["end"] - seg["start"]) * fps)))
        types = seg.get("types", ["unknown"])
        color = _pick_color(types)
        name = " + ".join(t.capitalize() for t in types)
        note = seg.get("description", "")
        markers.append({
            "start_frame": start_frame,
            "duration": duration,
            "color": color,
            "name": name,
            "note": note,
            "start_seconds": seg["start"],
            "end_seconds": seg["end"],
            "types": types,
        })
    return markers


def _save_markers(segments: list, fps: float, segments_path: Path) -> Path:
    """Save marker data to a JSON file next to the segments file."""
    markers = _build_markers(segments, fps)
    out = {
        "fps": fps,
        "source_segments": str(segments_path),
        "markers": markers,
    }
    save_path = segments_path.with_name(
        segments_path.stem.replace("_segments", "_markers") + ".json"
    )
    with open(save_path, "w") as f:
        json.dump(out, f, indent=2)
    return save_path


def _add_markers(timeline, segments: list, fps: float) -> int:
    markers = _build_markers(segments, fps)
    return _apply_markers(timeline, markers, fps)


def _apply_markers(timeline, markers: list, fps: float) -> int:
    added = 0
    for m in markers:
        ok = timeline.AddMarker(
            m["start_frame"], m["color"], m["name"], m["note"],
            m["duration"], "filmhub",
        )
        if ok:
            added += 1
            start_tc = _frames_to_tc(m["start_frame"], fps)
            end_tc = _frames_to_tc(m["start_frame"] + m["duration"], fps)
            print(f"  [{m['color']:8}] {start_tc} → {end_tc}  {m['name']}: {m['note']}")
        else:
            start_tc = _frames_to_tc(m["start_frame"], fps)
            print(
                f"  Warning: skipped marker at {start_tc} — frame {m['start_frame']} already has a marker",
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
        nargs="?",
        help="Path to segments JSON (e.g. analysis/Taylor_test_1/clean_04_segments.json)",
    )
    parser.add_argument(
        "--timeline",
        help="Name of timeline to add markers to (default: currently open timeline)",
    )
    parser.add_argument(
        "--save",
        action="store_true",
        help="Save marker data to a JSON file without connecting to Resolve",
    )
    parser.add_argument(
        "--fps",
        type=float,
        default=24.0,
        help="Frame rate for --save mode (default: 24.0)",
    )
    parser.add_argument(
        "--load",
        metavar="MARKERS_JSON",
        help="Load a previously saved markers JSON file into Resolve",
    )
    args = parser.parse_args()

    # --load mode: import saved markers into Resolve
    if args.load:
        markers_path = Path(args.load)
        if not markers_path.exists():
            print(f"Error: file not found: {markers_path}", file=sys.stderr)
            sys.exit(1)

        with open(markers_path) as f:
            data = json.load(f)

        markers = data["markers"]

        if not markers:
            print("No markers in file — nothing to import.")
            return

        resolve = _load_resolve()
        pm = resolve.GetProjectManager()
        project = pm.GetCurrentProject()
        if project is None:
            print("Error: no project is open in DaVinci Resolve.", file=sys.stderr)
            sys.exit(1)

        print(f"Project:  {project.GetName()}")
        timeline = _get_timeline(project, args.timeline)
        timeline_fps = float(timeline.GetSetting("timelineFrameRate"))
        print(f"Timeline: {timeline.GetName()}  ({timeline_fps} fps)")

        # Recompute frame positions from seconds using the timeline's actual FPS
        for m in markers:
            m["start_frame"] = int(round(m["start_seconds"] * timeline_fps))
            m["duration"] = max(1, int(round(
                (m["end_seconds"] - m["start_seconds"]) * timeline_fps
            )))

        print(f"Markers:  {markers_path}  ({len(markers)} marker(s))\n")

        added = _apply_markers(timeline, markers, timeline_fps)
        print(f"\nDone — added {added}/{len(markers)} marker(s) to '{timeline.GetName()}'")
        return

    # segments_json is required for non-load modes
    if not args.segments_json:
        parser.error("segments_json is required (unless using --load)")

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

    # --save mode: write markers file without Resolve
    if args.save:
        save_path = _save_markers(segments, args.fps, segments_path)
        print(f"FPS:      {args.fps}")
        markers = _build_markers(segments, args.fps)
        for m in markers:
            start_tc = _frames_to_tc(m["start_frame"], args.fps)
            end_tc = _frames_to_tc(m["start_frame"] + m["duration"], args.fps)
            print(f"  [{m['color']:8}] {start_tc} → {end_tc}  {m['name']}: {m['note']}")
        print(f"\nSaved {len(markers)} marker(s) to {save_path}")
        print(f"Import later with: python -m filmhub.export_resolve --load \"{save_path}\"")
        return

    # Default mode: push directly to Resolve
    resolve = _load_resolve()

    pm = resolve.GetProjectManager()
    project = pm.GetCurrentProject()
    if project is None:
        print("Error: no project is open in DaVinci Resolve.", file=sys.stderr)
        sys.exit(1)

    print(f"Project:  {project.GetName()}")
    timeline = _get_timeline(project, args.timeline)
    print(f"Timeline: {timeline.GetName()}")

    fps = float(timeline.GetSetting("timelineFrameRate"))
    print(f"FPS:      {fps}\n")

    added = _add_markers(timeline, segments, fps)
    print(f"\nDone — added {added}/{len(segments)} marker(s) to '{timeline.GetName()}'")


def _get_timeline(project, timeline_name=None):
    if timeline_name:
        for i in range(1, project.GetTimelineCount() + 1):
            tl = project.GetTimelineByIndex(i)
            if tl.GetName() == timeline_name:
                return tl
        print(f"Error: timeline '{timeline_name}' not found in project.", file=sys.stderr)
        sys.exit(1)
    else:
        timeline = project.GetCurrentTimeline()
        if timeline is None:
            print("Error: no timeline is currently open in Resolve.", file=sys.stderr)
            sys.exit(1)
        return timeline


if __name__ == "__main__":
    main()
