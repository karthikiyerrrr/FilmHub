---
name: clean-video
description: Full video cleanup — detect and remove copyrighted music, on-screen promotional graphics, and paid promotions/platform references in a single pass
user-invocable: true
---

# Clean Video

Run all three removal passes (music, graphics, promotions) on a video file in a single workflow.

## Conventions

All questions to the user **must** use the `AskUserQuestion` tool. Never ask questions via plain text output — always invoke `AskUserQuestion` so the user gets a proper interactive prompt.

## Inputs

- `$ARGUMENTS` — path to the video file to process

## Steps

### 1. Validate the video file

Confirm that the file at `$ARGUMENTS` exists and has a video extension (.mp4, .mkv, .mov, .avi, .webm). If the path is invalid, tell the user and stop.

### 2. Ask which removal types to run

Present the three removal types and ask the user which to include (default: all three):

1. **Music** — Detect and remove copyrighted music segments (Demucs + AcoustID)
2. **Graphics** — Detect and remove on-screen promotional/copyrighted graphics (OpenCV + Claude vision)
3. **Promotions** — Detect and remove paid promotions, sponsorships, and platform references (Whisper transcription + text analysis)

Also ask the user to choose a **review mode** that will apply across all selected removal types:

1. **Review all** — Review every detected segment one by one
2. **Smart review** — Only review ambiguous segments, auto-remove the rest
3. **Auto cut** — Automatically remove all detected segments without individual review

### 3. Run detection passes

Run the selected detection scripts. These are independent and can run in sequence:

**If Music is selected:**

```
.venv/bin/python -m filmhub.detect_music "$ARGUMENTS"
```

If the user has provided an AcoustID API key (or the `ACOUSTID_API_KEY` env var is set), include it:

```
.venv/bin/python -m filmhub.detect_music "$ARGUMENTS" --acoustid-key "KEY"
```

This saves detected music segments to `analysis/<video-name>/music.json`.

**If Graphics is selected:**

```
.venv/bin/python -m filmhub.detect_graphics "$ARGUMENTS"
```

This saves candidate frames to `analysis/<video-name>/graphics_frames/` and a manifest to `analysis/<video-name>/graphics_candidates.json`.

**If Promotions is selected:**

```
.venv/bin/python -m filmhub.transcribe "$ARGUMENTS"
.venv/bin/python -m filmhub.convert_transcript "$ARGUMENTS"
```

This saves a transcript to `analysis/<video-name>/transcript.json` and a compact text version to `analysis/<video-name>/transcript.txt`.

### 4. Analyze and identify segments

**Music segments:** Read `analysis/<video-name>/music.json`. Each segment has `start`, `end` (seconds), and `track` (matched song name or null).

**Graphics segments:** Read `analysis/<video-name>/graphics_candidates.json`. For each candidate transition, read the before/after frame images from `analysis/<video-name>/graphics_frames/`. Process in batches of 5-10 transitions. Classify each using the same criteria as the remove-graphics skill:

- **Flag for removal:** Sponsor logo overlays, product placement overlays, discount code displays, branded end cards, subscribe/follow animations with platform branding, affiliate link displays
- **Do NOT flag:** Normal scene changes, creator's own branding/watermark, content-relevant graphics, standard video UI elements

Build continuous time ranges from flagged frames: pair appear/disappear transitions, merge frames within 5 seconds.

**Promotion segments:** Ask the user which model to use for transcript analysis:

1. **Opus** — most accurate, best for ambiguous or subtle promotions
2. **Sonnet** — good balance of speed and accuracy (default)
3. **Haiku** — fastest and cheapest, best for obvious ad reads

Read `analysis/<video-name>/transcript.txt`. Each line has the format `SPEAKER    HH:MM:SS - HH:MM:SS    text` (the speaker column may be absent if diarization wasn't used).

If the transcript has **≤50 lines**, use it as a single chunk. Otherwise, split into chunks targeting ~50 lines each, splitting at natural break points (time gaps >10 seconds or speaker changes), with **5 lines of overlap** between adjacent chunks.

Launch one `Agent` subagent per chunk **in a single message** (parallel), using the model the user selected. Each subagent receives its chunk and the following detection criteria:

- **Flag for removal:** Explicit sponsor mentions, product pitches with promotional language, transitions into/out of ad reads, discount codes and referral links, platform references directing viewers to social media, cross-promotion of creator's other channels
- **Do NOT flag:** Incidental platform mentions as part of content, genuine non-sponsored recommendations

Each subagent returns a JSON array of `{"start": "HH:MM:SS", "end": "HH:MM:SS", "description": "brief reason"}`. If none found, return `[]`.

After all subagents return, reconcile: deduplicate detections from overlap zones (start/end within 3 seconds), merge segments within 5 seconds of each other, and sort by start time.

### 5. Analyze overlaps across types

Before presenting segments for review, compare all detected segments across types and identify overlaps. Use **conservative merging** — only group segments that are clearly related:

- **Merge** segments from different types if they overlap **and** their time ranges are similar (both start and end within 10 seconds of each other). These are likely the same event detected by multiple methods, so present them as one unified segment noting all contributing types.
- **Do NOT merge** segments that merely overlap but have very different boundaries (e.g., a 10-second graphics segment that falls within a 3-minute promotions segment). These are likely unrelated detections and should be presented as **separate segments** for independent review, even though their time ranges overlap. Note the overlap for the user's awareness.
- Segments that don't overlap with any other type remain as single-type entries.
- Sort the final list by start time.

### 6. Review segments

Present the segment list to the user, applying the chosen review mode. For each segment, show:
- Timestamps (HH:MM:SS) and duration
- Which detection types flagged it (e.g., "Detected by: graphics, promotions")
- Type-specific details for each contributing type (track name for music, description for graphics, transcript text for promotions)
- For merged multi-type segments, note the individual time ranges from each type
- For segments that overlap with another segment but were NOT merged (different boundaries), note the overlap and which other segment it partially overlaps with, so the user can make an informed decision

**Review all:** Walk through every segment one by one. Ask whether to **keep**, **remove**, or **adjust boundaries** for each.

**Smart review:** Only present ambiguous segments for review, auto-remove the rest. A segment is ambiguous if any of its contributing types meet these criteria:
- *Music:* No AcoustID match, segment <10s, or segment >5min
- *Graphics:* Ambiguous graphic type, segment <3s, or incomplete transition pair
- *Promotions:* Segment <5s, segment >2min, or ambiguous promotional intent

Segments flagged by multiple types are generally higher confidence and can be auto-removed unless one of the above criteria applies.

**Auto cut:** Show the full list of all segments for informational purposes, then proceed directly to cutting.

### 7. Deduplicate and save the confirmed segments JSON

After review, deduplicate the confirmed segments: if any confirmed segments still overlap (e.g., two separately-reviewed segments that the user both chose to remove), merge their time ranges for the final cut list.

Determine the next sequence number `NN` by scanning `output/<video-name>/` for existing `clean_NN.<ext>` files (e.g., if `clean_01.mov` exists, use `02`). Save to `analysis/<video-name>/clean_NN_segments.json`:

```json
[
  {"start": 45.0, "end": 92.0, "types": ["promotions"], "description": "Sponsor: NordVPN ad read"},
  {"start": 120.5, "end": 245.3, "types": ["music"], "description": "Copyrighted track: Artist - Song Title"},
  {"start": 301.0, "end": 355.0, "types": ["graphics", "promotions"], "description": "Branded end card + platform CTA"}
]
```

If no segments remain after review, inform the user and stop.

### 8. Cut the video

Run the cutting script with the confirmed segments:

```
.venv/bin/python -m filmhub.cut_video "$ARGUMENTS" "analysis/<video-name>/clean_NN_segments.json"
```

This saves the clean video to `output/<video-name>/clean_NN.<ext>` where `NN` matches the sequence number used for the segments file.

### 9. Save a cut report

Parse the actual output path from `cut_video.py`'s stdout — it appears on the line starting with `Done! Clean video: `. Derive the cut report path by replacing the video extension with `_cuts.json` (e.g. `output/vid_04_test/clean_01.mov` → `output/vid_04_test/clean_01_cuts.json`).

Write the cut report to that path:

```json
{
  "source": "<original video path>",
  "type": "clean",
  "removal_types": ["music", "graphics", "promotions"],
  "review_mode": "smart",
  "segments_removed": [
    {"start": 45.0, "end": 92.0, "types": ["promotions"], "description": "Sponsor: NordVPN ad read"},
    {"start": 120.5, "end": 245.3, "types": ["music"], "description": "Copyrighted track: Artist - Song Title"},
    {"start": 301.0, "end": 355.0, "types": ["graphics", "promotions"], "description": "Branded end card + platform CTA"}
  ],
  "total_removed_seconds": 243.8,
  "output": "output/<video-name>/clean_NN.<ext>"
}
```

### 10. Report results

Tell the user:
- Which removal types were run
- How many segments were removed, broken down by type
- Total time removed
- Any overlapping segments that were merged (and which types contributed)
- Where the clean video was saved (`output/`)
- Where the cut report was saved (`output/`)
- Where the individual detection files are (`analysis/`)
