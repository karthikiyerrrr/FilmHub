---
name: clean-video-app
description: Full video cleanup with visual webapp review — detect and remove copyrighted music, on-screen graphics, and paid promotions using a browser-based segment editor
user-invocable: true
---

# Clean Video App

Run all three removal passes (music, graphics, promotions) on a video file, then launch a local React webapp for visual segment review. The user reviews and adjusts segments in the browser, and the app handles cutting.

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

No review mode question is needed — review happens in the webapp.

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

Follow the same analysis steps as the `clean-video` skill:

**Music segments:** Read `analysis/<video-name>/music.json`. Each segment has `start`, `end` (seconds), and `track` (matched song name or null).

**Graphics segments:** Read `analysis/<video-name>/graphics_candidates.json`. For each candidate transition, read the before/after frame images from `analysis/<video-name>/graphics_frames/`. Process in batches of 5-10 transitions. Classify each:

- **Flag for removal:** Sponsor logo overlays, product placement overlays, discount code displays, branded end cards, subscribe/follow animations with platform branding, affiliate link displays
- **Do NOT flag:** Normal scene changes, creator's own branding/watermark, content-relevant graphics, standard video UI elements

Build continuous time ranges from flagged frames: pair appear/disappear transitions, merge frames within 5 seconds.

**Promotion segments:** Ask the user which model to use for transcript analysis:

1. **Opus** — most accurate, best for ambiguous or subtle promotions
2. **Sonnet** — good balance of speed and accuracy (default)
3. **Haiku** — fastest and cheapest, best for obvious ad reads

Read `analysis/<video-name>/transcript.txt`. If the transcript has **≤50 lines**, use it as a single chunk. Otherwise, split into chunks targeting ~50 lines each, splitting at natural break points (time gaps >10 seconds or speaker changes), with **5 lines of overlap** between adjacent chunks.

Launch one `Agent` subagent per chunk **in a single message** (parallel), using the model the user selected. Each subagent receives its chunk and the following detection criteria:

- **Flag for removal:** Explicit sponsor mentions, product pitches with promotional language, transitions into/out of ad reads, discount codes and referral links, platform references directing viewers to social media, cross-promotion of creator's other channels
- **Do NOT flag:** Incidental platform mentions as part of content, genuine non-sponsored recommendations

Each subagent returns a JSON array of `{"start": "HH:MM:SS", "end": "HH:MM:SS", "description": "brief reason"}`. If none found, return `[]`.

After all subagents return, reconcile: deduplicate detections from overlap zones (start/end within 3 seconds), merge segments within 5 seconds of each other, and sort by start time.

### 5. Analyze overlaps across types

Compare all detected segments across types and identify overlaps:

- **Merge** segments from different types if they overlap **and** their time ranges are similar (both start and end within 10 seconds of each other). Present as one unified segment noting all contributing types.
- **Do NOT merge** segments that merely overlap but have very different boundaries. These are separate segments.
- Sort the final list by start time.

### 6. Write `review_data.json`

Write a consolidated file at `analysis/<video-name>/review_data.json` that the webapp will load. Use a Python one-liner or bash to build this JSON:

```json
{
  "video": {
    "filename": "<video filename with extension>",
    "path": "videos/<video filename>"
  },
  "music": <contents of music.json, or null if not run>,
  "graphics": <contents of graphics_candidates.json, or null if not run>,
  "transcript": {
    "segments": <transcript.json segments array, stripped to only id/start/end/text fields>
  },
  "promotions": <array of {"start": float, "end": float, "description": string} from step 4, or null>,
  "suggested_segments": <merged segment list from step 5, array of {"start": float, "end": float, "types": [string], "description": string}>
}
```

The transcript segments must be trimmed — keep only `id`, `start`, `end`, and `text` fields. Remove `tokens`, `temperature`, `avg_logprob`, `compression_ratio`, `no_speech_prob`, and `seek`.

### 7. Check prerequisites

Verify that `cargo` and `node`/`npm` are available:

```
which cargo
which node
which npm
```

If any are missing, tell the user to install Rust (via rustup.rs) and/or Node.js and stop.

### 8. Build the frontend

If `reviewer/frontend/dist/index.html` does not exist, build it:

```
cd reviewer/frontend && npm install && npm run build
```

### 9. Build and launch the reviewer webapp

If `reviewer/target/release/reviewer` does not exist or is missing, build it:

```
cd reviewer && cargo build --release
```

Then launch the server in the background:

```
reviewer/target/release/reviewer --project-root "$(pwd)" --video "$ARGUMENTS" --port 3456 &
```

Save the PID: `REVIEWER_PID=$!`

Tell the user: "The reviewer webapp is running at http://localhost:3456. Review the detected segments in your browser, then click 'Save & Cut' when ready."

### 10. Wait for review completion

Poll for the signal file that the webapp writes after the user clicks "Save & Cut" and the cut completes:

```
while [ ! -f "analysis/<video-name>/.review_complete.json" ]; do sleep 5; done
```

### 11. Read results and report

Read `analysis/<video-name>/.review_complete.json`:

```json
{"segments_file": "analysis/<video-name>/clean_NN_segments.json", "output_file": "output/<video-name>/clean_NN.ext", "status": "success"}
```

Read the segments file to count segments and calculate total removed time. Report to the user:
- How many segments were removed
- Total time removed
- Where the clean video was saved
- Where the segments file is

### 12. Save a cut report

Read the actual output path from the signal file. Derive the cut report path by replacing the video extension with `_cuts.json`.

Write the cut report:

```json
{
  "source": "<original video path>",
  "type": "clean",
  "removal_types": ["music", "graphics", "promotions"],
  "review_mode": "webapp",
  "segments_removed": [...],
  "total_removed_seconds": 243.8,
  "output": "output/<video-name>/clean_NN.<ext>"
}
```

### 13. Cleanup

Kill the background server and remove the signal file:

```
kill $REVIEWER_PID 2>/dev/null
rm -f "analysis/<video-name>/.review_complete.json"
```
