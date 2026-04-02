---
name: remove-promotions
description: Remove paid promotions and platform references from a video by transcribing, identifying sponsor segments and platform mentions, and cutting them out
user-invocable: true
---

# Remove Promotions

Remove paid promotion, sponsorship, and platform reference segments from a video file.

## Conventions

All questions to the user **must** use the `AskUserQuestion` tool. Never ask questions via plain text output — always invoke `AskUserQuestion` so the user gets a proper interactive prompt.

## Inputs

- `$ARGUMENTS` — path to the video file to process

## Steps

### 1. Validate the video file

Confirm that the file at `$ARGUMENTS` exists and has a video extension (.mp4, .mkv, .mov, .avi, .webm). If the path is invalid, tell the user and stop.

### 2. Transcribe the video

Run the transcription script to generate a timestamped transcript:

```
.venv/bin/python -m filmhub.transcribe "$ARGUMENTS"
```

This saves a transcript JSON file to `analysis/<video-name>/transcript.json`.

### 3. Analyze the transcript for paid promotions

Read the generated transcript JSON file from `analysis/<video-name>/`. The file contains a `segments` array where each segment has `start`, `end` (in seconds), and `text` fields.

Review every segment's text and identify segments that are **paid promotions, sponsorships, ad reads, or platform references**. Look for patterns like:

- Explicit sponsor mentions ("This video is sponsored by...", "Thanks to X for sponsoring...")
- Product pitches with promotional language ("Use code X for Y% off", "Head to example.com/channel")
- Transitions into/out of ad reads ("Speaking of which...", "But first, a word from...")
- Discount codes, referral links, or calls to action for a sponsor's product
- **Platform references** — mentions of YouTube, Twitch, TikTok, Instagram, Twitter/X, Facebook, Snapchat, Patreon, Discord, or other social media platforms when the creator is directing viewers there (e.g., "Subscribe to my YouTube", "Follow me on Twitch", "Check out my TikTok", "Join my Discord")
- Cross-promotion of the creator's other channels or social accounts

**Do NOT flag:**
- Passing/incidental mentions of a platform as part of the video's actual content (e.g., discussing a TikTok trend, reacting to a YouTube video)
- Genuine product recommendations that aren't sponsored

For each identified promotion segment:
- Note the `start` and `end` timestamps (in seconds) from the transcript segments
- Merge segments that are within 5 seconds of each other into a single range

### 4. Review and save the segments JSON

If no promotions are found, write an empty array `[]` to `analysis/<video-name>/promotions.json`, inform the user, and skip step 5.

Present a summary of what was found (number of segments, total duration) and ask the user to choose a **review mode**:

1. **Review all** — Review every detected segment one by one. For each segment, show its timestamps (HH:MM:SS), duration, and a brief description of the promotion content. Ask whether to **keep**, **remove**, or **adjust boundaries** for that segment.
2. **Smart review** — Only review segments that need human judgment: segments shorter than 5 seconds (may be incidental mentions), segments longer than 2 minutes (may include non-promotional content), or segments where the promotional intent is ambiguous (e.g., the creator discussing a product they genuinely use vs. a paid sponsorship). Auto-remove all other segments (clear ad reads, explicit sponsor mentions, obvious platform CTAs). For each segment presented for review, show timestamps, duration, and the transcript text, and ask whether to **keep**, **remove**, or **adjust boundaries**.
3. **Auto cut** — Automatically remove all detected segments without individual review. Simply show the full list of segments with timestamps and descriptions for informational purposes, then proceed directly to cutting.

Write the confirmed segments to `analysis/<video-name>/promotions.json` as a JSON array:

```json
[
  {"start": 45.0, "end": 92.0},
  {"start": 301.0, "end": 355.0}
]
```

### 5. Cut the video

Run the cutting script to remove the promotion segments:

```
.venv/bin/python -m filmhub.cut_video "$ARGUMENTS" "analysis/<video-name>/promotions.json"
```

This saves the clean video to `output/<video-name>/clean_NN.<ext>` where `NN` is the next available zero-padded sequence number.

### 6. Save a cut report

Parse the actual output path from `cut_video.py`'s stdout — it appears on the line starting with `Done! Clean video: `. Derive the cut report path by replacing the video extension with `_cuts.json` (e.g. `output/vid_04_test/clean_01.mov` → `output/vid_04_test/clean_01_cuts.json`).

Write the cut report to that path. The file should contain:

```json
{
  "source": "<original video path>",
  "type": "promotions",
  "segments_removed": [
    {"start": 45.0, "end": 92.0, "description": "Sponsor: NordVPN ad read"},
    {"start": 301.0, "end": 355.0, "description": "Platform: YouTube subscribe CTA"}
  ],
  "total_removed_seconds": 101.0,
  "output": "output/<video-name>/clean_NN.<ext>"
}
```

Each entry in `segments_removed` should include `start`, `end`, and a brief `description` of why it was cut (sponsor name, platform reference, etc.).

### 7. Report results

Tell the user:
- How many promotion segments were found and their timestamps
- Total time removed
- Where the clean video was saved (`output/`)
- Where the cut report was saved (`output/`)
- Where the transcript and segments files are (`analysis/`)
