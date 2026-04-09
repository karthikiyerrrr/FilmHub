---
name: remove-graphics
description: Detect and remove on-screen promotional/copyrighted graphics (sponsor overlays, banners, lower thirds, end cards) from a video using frame analysis and Claude vision
user-invocable: true
---

# Remove On-Screen Graphics

Detect and remove segments containing on-screen promotional or copyrighted graphics from a video file.

## Conventions

All questions to the user **must** use the `AskUserQuestion` tool. Never ask questions via plain text output — always invoke `AskUserQuestion` so the user gets a proper interactive prompt.

## Inputs

- `$ARGUMENTS` — path to the video file to process

## Steps

### 1. Validate the video file

Confirm that the file at `$ARGUMENTS` exists and has a video extension (.mp4, .mkv, .mov, .avi, .webm). If the path is invalid, tell the user and stop.

### 2. Detect visual transitions

Run the graphics detection script to extract candidate transition frames:

```
.venv/bin/python -m filmhub.detect_graphics "$ARGUMENTS"
```

This saves candidate frames to `analysis/<video-name>/graphics_frames/` and a manifest to `analysis/<video-name>/graphics_candidates.json`.

If no transitions were detected (empty JSON array), inform the user and stop.

### 3. Load prior feedback

Before running any classification, check if `.claude/rules/feedback.json` exists and read it. Extract entries where `"type": "graphics"` — these are lessons from previous runs that the classifier must apply. They will be injected into classification prompts in the next step.

### 4. Analyze candidate frames with Claude vision

Read the manifest JSON from `analysis/<video-name>/graphics_candidates.json`. For each candidate transition, read both the `before_frame` and `after_frame` images from `analysis/<video-name>/graphics_frames/`.

Process frames in batches of 5-10 transitions to manage context. For each transition pair, determine:

- Whether the transition shows a **graphic appearing** (before = clean content, after = graphic overlay) or **disappearing** (before = graphic, after = clean content)
- What type of graphic it is and whether it should be removed

**Flag for removal:**
- Sponsor logo overlays (e.g., NordVPN, Squarespace branded cards)
- Product placement overlays or branded lower-third banners
- Discount code displays or URL/promo link overlays
- Branded end cards or outro screens with sponsor logos
- Subscribe/follow animations with platform branding
- Affiliate link or referral code displays

**Do NOT flag:**
- Normal scene changes or camera cuts (content transitions)
- The video creator's own branding, channel logo, or watermark
- Content-relevant graphics (charts, diagrams, illustrations that are part of the video's topic)
- Standard video UI elements (progress bars, captions, subtitles)

If there are any `graphics` entries loaded from `.claude/rules/feedback.json`, append a **Lessons from prior runs** section to each graphics classification batch prompt, listing each lesson as a bullet. Example format:
> - Do NOT describe caption text (e.g. "FOOTAGE FROM X'S VIDEO") as social media handle lower-thirds — that is a content attribution graphic, not promotional

For each flagged transition, note the timestamp and a brief description of what was detected.

### 5. Build segment ranges

Convert the individual flagged frame timestamps into continuous time ranges:

- If a graphic **appears** at one timestamp and **disappears** at a later timestamp, the segment spans from the appear timestamp to the disappear timestamp
- If consecutive flagged frames are within 5 seconds of each other, merge them into a single segment
- Ensure segments don't extend beyond 0 or the video duration

### 6. Review and save the segments JSON

If no graphics segments are found, write an empty array `[]` to `analysis/<video-name>/graphics.json`, inform the user, and skip step 7.

Present a summary of what was found (number of segments, total duration) and ask the user to choose a **review mode**:

1. **Review all** — Review every detected segment one by one. For each segment, show its timestamps (HH:MM:SS), duration, description, and the before/after frame images. Ask whether to **keep**, **remove**, or **adjust boundaries** for that segment.
2. **Smart review** — Only review segments that need human judgment: segments where the graphic type is ambiguous (could be content-relevant vs. promotional), segments shorter than 3 seconds (may be false positives from scene cuts), or segments where only one transition (appear or disappear) was detected (incomplete pair). Auto-remove all other segments (clear sponsor overlays, branded end cards, discount code displays). For each segment presented for review, show timestamps, duration, description, and the frame images, and ask whether to **keep**, **remove**, or **adjust boundaries**.
3. **Auto cut** — Automatically remove all detected segments without individual review. Simply show the full list of segments with timestamps and descriptions for informational purposes, then proceed directly to cutting.

Write the confirmed segments to `analysis/<video-name>/graphics.json` as a JSON array:

```json
[
  {"start": 45.0, "end": 92.0, "description": "Sponsor logo overlay: NordVPN"},
  {"start": 301.0, "end": 355.0, "description": "Branded end card with discount code"}
]
```

### 7. Cut the video

Run the cutting script to remove the confirmed graphics segments:

```
.venv/bin/python -m filmhub.cut_video "$ARGUMENTS" "analysis/<video-name>/graphics.json"
```

This saves the clean video to `output/<video-name>/clean_NN.<ext>` where `NN` is the next available zero-padded sequence number.

### 8. Save a cut report

Parse the actual output path from `cut_video.py`'s stdout — it appears on the line starting with `Done! Clean video: `. Derive the cut report path by replacing the video extension with `_cuts.json` (e.g. `output/vid_04_test/clean_01.mov` → `output/vid_04_test/clean_01_cuts.json`).

Write the cut report to that path. The file should contain:

```json
{
  "source": "<original video path>",
  "type": "graphics",
  "segments_removed": [
    {"start": 45.0, "end": 92.0, "description": "Sponsor logo overlay: NordVPN"},
    {"start": 301.0, "end": 355.0, "description": "Branded end card with discount code"}
  ],
  "total_removed_seconds": 101.0,
  "output": "output/<video-name>/clean_NN.<ext>"
}
```

Each entry in `segments_removed` should include `start`, `end`, and a brief `description` of the graphic that was detected.

### 9. Report results

Tell the user:
- How many graphics segments were removed and their timestamps
- What types of graphics were detected in each segment
- Total time removed
- Where the clean video was saved (`output/`)
- Where the cut report was saved (`output/`)
- Where the candidate frames and manifest are (`analysis/`)
