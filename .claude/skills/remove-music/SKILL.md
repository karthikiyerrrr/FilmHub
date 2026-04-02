---
name: remove-music
description: Detect and remove copyrighted music segments from a video using Demucs source separation, librosa energy analysis, and AcoustID fingerprinting
user-invocable: true
---

# Remove Copyrighted Music

Detect and remove segments containing copyrighted music from a video file.

## Conventions

All questions to the user **must** use the `AskUserQuestion` tool. Never ask questions via plain text output — always invoke `AskUserQuestion` so the user gets a proper interactive prompt.

## Inputs

- `$ARGUMENTS` — path to the video file to process

## Steps

### 1. Validate the video file

Confirm that the file at `$ARGUMENTS` exists and has a video extension (.mp4, .mkv, .mov, .avi, .webm). If the path is invalid, tell the user and stop.

### 2. Detect copyrighted music

Run the music detection script to identify segments containing music:

```
.venv/bin/python -m filmhub.detect_music "$ARGUMENTS"
```

If the user has provided an AcoustID API key (or the `ACOUSTID_API_KEY` env var is set), include it:

```
.venv/bin/python -m filmhub.detect_music "$ARGUMENTS" --acoustid-key "KEY"
```

This saves detected music segments to `analysis/<video-name>/music.json`.

### 3. Review detected segments

Read the generated music JSON file from `analysis/<video-name>/`. The file contains an array of segments, each with `start`, `end` (in seconds), and `track` (matched song name or null) fields.

If no music segments were detected, inform the user and stop.

Present a summary of what was found (number of segments, total duration) and ask the user to choose a **review mode**:

1. **Review all** — Review every detected segment one by one. For each segment, show its timestamps (HH:MM:SS), duration, and matched track name (or "Unknown track"). Ask whether to **keep**, **remove**, or **adjust boundaries** for that segment.
2. **Smart review** — Only review segments that need human judgment: segments with no AcoustID match (unknown tracks), segments shorter than 10 seconds, or segments longer than 5 minutes. Auto-remove all other segments (those with a confirmed track match and reasonable duration). For each segment presented for review, show timestamps, duration, and track info, and ask whether to **keep**, **remove**, or **adjust boundaries**.
3. **Auto cut** — Automatically remove all detected segments without individual review. Simply show the full list of segments with timestamps and track names for informational purposes, then proceed directly to cutting.

### 4. Save the confirmed segments JSON

Based on the review mode results, update `analysis/<video-name>/music.json` with the confirmed segments to remove:

```json
[
  {"start": 120.5, "end": 245.3, "track": "Artist - Song Title"},
  {"start": 1803.0, "end": 1920.5, "track": null}
]
```

If no segments are confirmed for removal, inform the user and stop. Skip step 5.

### 5. Cut the video

Run the cutting script to remove the music segments:

```
.venv/bin/python -m filmhub.cut_video "$ARGUMENTS" "analysis/<video-name>/music.json"
```

This saves the clean video to `output/<video-name>/clean_NN.<ext>` where `NN` is the next available zero-padded sequence number.

### 6. Save a cut report

Parse the actual output path from `cut_video.py`'s stdout — it appears on the line starting with `Done! Clean video: `. Derive the cut report path by replacing the video extension with `_cuts.json` (e.g. `output/vid_04_test/clean_01.mov` → `output/vid_04_test/clean_01_cuts.json`).

Write the cut report to that path. The file should contain:

```json
{
  "source": "<original video path>",
  "type": "music",
  "segments_removed": [
    {"start": 120.5, "end": 245.3, "track": "Artist - Song Title"},
    {"start": 1803.0, "end": 1920.5, "track": null}
  ],
  "total_removed_seconds": 242.3,
  "output": "output/<video-name>/clean_NN.<ext>"
}
```

Each entry in `segments_removed` should include `start`, `end`, and the `track` name (or null if unidentified).

### 7. Report results

Tell the user:
- How many music segments were removed and their timestamps
- Which tracks were identified (if any)
- Total time removed
- Where the clean video was saved (`output/`)
- Where the cut report was saved (`output/`)
- Where the music detection file is (`analysis/`)
