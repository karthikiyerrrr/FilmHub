---
name: clean-folder
description: Batch process a folder of videos — detect and remove copyrighted music, on-screen graphics, and paid promotions across all videos with sequential detection, skip-already-processed logic, and per-video DaVinci Resolve export commands. Use this skill when the user wants to clean multiple videos at once, process a directory/folder of videos, or batch process video files.
user-invocable: true
---

# Clean Folder

Batch process every video in a folder through the full cleanup pipeline (music, graphics, promotions). Detection runs sequentially — one video at a time — to avoid overwhelming system resources. Already-processed files are skipped, and each video gets its own DaVinci Resolve export command.

## Conventions

All questions to the user **must** use the `AskUserQuestion` tool. Never ask questions via plain text output — always invoke `AskUserQuestion` so the user gets a proper interactive prompt.

## Inputs

- `$ARGUMENTS` — path to a folder containing video files (or a single video file, which will be treated as a one-item batch)

## Steps

### 1. Discover and validate video files

Use `filmhub.utils.resolve_videos` logic: scan the folder at `$ARGUMENTS` for files with supported extensions (.mp4, .mkv, .mov, .avi, .webm). Sort alphabetically.

If the path is a single file, treat it as a batch of one.

If no video files are found, tell the user and stop.

Tell the user how many videos were found and list their filenames.

### 2. Check for already-processed videos

For each video, check whether `output/<video-name>/` already contains a `clean_*.mp4` (or matching extension) file. If so, mark that video as **already processed**.

If any videos are already processed, tell the user which ones and ask whether to:
1. **Skip** already-processed videos (default)
2. **Re-process** everything from scratch

Remove skipped videos from the batch. If all videos are already processed and the user chooses to skip, stop.

### 3. Ask which removal types to run

Present the three removal types and ask the user which to include (default: all three). This choice applies to **every video** in the batch:

1. **Music** — Detect and remove copyrighted music segments (Demucs + AcoustID)
2. **Graphics** — Detect and remove on-screen promotional/copyrighted graphics (OpenCV + Claude vision)
3. **Promotions** — Detect and remove paid promotions, sponsorships, and platform references (Whisper transcription + text analysis)

### 4. Ask which review mode to use

Ask the user to choose a **review mode** that will apply across all videos:

1. **Review all** — Review every detected segment one by one, per video
2. **Smart review** — Only review ambiguous segments, auto-remove the rest
3. **Auto cut** — Automatically remove all detected segments without individual review

For batch processing, note to the user that "auto cut" is recommended for large batches since reviewing every segment across many videos is time-consuming.

### 5. Run detection passes sequentially across videos

Process videos one at a time to avoid overwhelming system resources. For each video, run the selected detection scripts in order:

**If Music is selected:**

```
.venv/bin/python -m filmhub.detect_music "<video-path>"
```

If the user has provided an AcoustID API key (or `ACOUSTID_API_KEY` env var is set), include `--acoustid-key "KEY"`.

**If Graphics is selected:**

```
.venv/bin/python -m filmhub.detect_graphics "<video-path>"
```

**If Promotions is selected:**

```
.venv/bin/python -m filmhub.transcribe "<video-path>"
.venv/bin/python -m filmhub.convert_transcript "<video-path>"
```

After each video completes, report progress (e.g., "3/8 videos detected"). Wait for all detection scripts to finish for the current video before moving on to the next.

### 6. Analyze and identify segments per video

Process each video's detection results. This follows the same logic as the **clean-video** skill steps 4-5:

**Music segments:** Read `analysis/<video-name>/music.json`.

**Graphics segments:** Follow the analysis steps from the **remove-graphics** skill (load prior feedback from `.claude/rules/feedback.json`, analyze candidate frames with Claude vision in batches, build segment ranges).

**Promotion segments:** Follow the analysis steps from the **remove-promotions** skill (load prior feedback, choose analysis model, chunk and analyze transcript).

**Overlap analysis:** Compare segments across types using conservative merging — merge segments from different types only if they overlap AND both start and end are within 10 seconds of each other. Keep segments with different boundaries separate but note the overlap.

Sort the final segment list per video by start time.

### 7. Review segments

Process videos one at a time for review, applying the chosen review mode. Before each video's review, announce which video is being reviewed (e.g., "Video 3/8: cooking_vlog.mp4").

For each segment, show:
- Timestamps (HH:MM:SS) and duration
- Which detection types flagged it
- Type-specific details (track name, description, transcript text)
- For merged multi-type segments, note the individual time ranges
- For overlapping-but-not-merged segments, note the overlap

**Review all:** Walk through every segment one by one per video. Ask whether to **keep**, **remove**, or **adjust boundaries**.

**Smart review:** Only present ambiguous segments for review, auto-remove the rest. A segment is ambiguous if:
- *Music:* No AcoustID match, segment <10s, or segment >5min
- *Graphics:* Ambiguous graphic type, segment <3s, or incomplete transition pair
- *Promotions:* Segment <5s, segment >2min, or ambiguous promotional intent

**Auto cut:** Show the full segment list per video for informational purposes, then proceed to cutting.

### 8. Save confirmed segments per video

For each video, after review:

1. Deduplicate confirmed segments (merge overlapping time ranges)
2. Determine the next sequence number `NN` by scanning `output/<video-name>/` for existing `clean_NN.*` files
3. Save to `analysis/<video-name>/clean_NN_segments.json`:

```json
[
  {"start": 45.0, "end": 92.0, "types": ["promotions"], "description": "Sponsor: NordVPN ad read"},
  {"start": 120.5, "end": 245.3, "types": ["music"], "description": "Copyrighted track: Artist - Song Title"}
]
```

If a video has no segments after review, skip it for cutting and note this in the summary.

### 9. Cut all videos

Run the cutting script for each video that has confirmed segments:

```
.venv/bin/python -m filmhub.cut_video "<video-path>" "analysis/<video-name>/clean_NN_segments.json"
```

These can run sequentially (each cut is fast since it uses stream copy without re-encoding).

Parse the actual output path from each `cut_video.py` stdout — it appears on the line starting with `Done! Clean video: `.

### 10. Save cut reports

For each cut video, write a cut report to `output/<video-name>/clean_NN_cuts.json`:

```json
{
  "source": "<original video path>",
  "type": "clean",
  "removal_types": ["music", "graphics", "promotions"],
  "review_mode": "smart",
  "segments_removed": [...],
  "total_removed_seconds": 243.8,
  "output": "output/<video-name>/clean_NN.<ext>"
}
```

### 11. Generate DaVinci Resolve export commands

Collect all the Resolve export commands and present them together in a single copy-paste block. For each video that had segments removed, the command is:

```
.venv/bin/python -m filmhub.export_resolve "analysis/<video-name>/clean_NN_segments.json"
```

Present the full block like this:

```
# DaVinci Resolve marker exports — run these in your terminal
# Open the corresponding timeline in Resolve before running each command
# Marker colors: Red = Promotions, Yellow = Graphics, Blue = Music, Pink = Multiple types

.venv/bin/python -m filmhub.export_resolve "analysis/video1/clean_01_segments.json"
.venv/bin/python -m filmhub.export_resolve "analysis/video2/clean_01_segments.json"
.venv/bin/python -m filmhub.export_resolve "analysis/video3/clean_02_segments.json"
```

Tell the user to open the corresponding timeline in DaVinci Resolve before running each command, and remind them of the marker color scheme.

### 12. Report batch results

Present a summary table of all videos processed:

| Video | Segments removed | Time removed | Output file |
|-------|-----------------|--------------|-------------|
| video1.mp4 | 3 (1 music, 2 promos) | 2:34 | output/video1/clean_01.mp4 |
| video2.mp4 | 0 (clean) | 0:00 | — |
| video3.mkv | 5 (2 graphics, 3 promos) | 4:12 | output/video3/clean_02.mkv |

Also report:
- Total videos processed vs skipped (already processed)
- Total segments removed across all videos, broken down by type
- Total time removed across all videos
- Any videos that had no segments (already clean)
- Where analysis files and cut reports are saved

### 13. Collect feedback

Follow the **collect-feedback** skill steps to gather false positive/negative feedback from the user across the batch. Since the user just reviewed many videos, focus on patterns — recurring false positives or types of segments that were consistently missed.
