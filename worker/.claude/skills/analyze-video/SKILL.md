---
name: analyze-video
description: Analyze a video for copyrighted music, on-screen graphics, and paid promotions using cloud-based detection endpoints, then write review_data.json for the webapp reviewer
user-invocable: false
---

# Analyze Video

Run detection passes (music, graphics, promotions) on a video stored in GCS, then analyze results and write a consolidated `review_data.json` for the reviewer webapp.

## Environment

The following environment variables are available:
- `MODAL_URL_TRANSCRIBE` — Modal transcribe endpoint
- `MODAL_URL_DETECT_MUSIC` — Modal music detection endpoint
- `MODAL_URL_DETECT_GRAPHICS` — Modal graphics detection endpoint
- `MODAL_AUTH_TOKEN` — Auth token for Modal endpoints
- `GCS_BUCKET` — GCS bucket name (e.g., `gweebler.firebasestorage.app`)

The following are passed as arguments:
- `VIDEO_ID` — UUID of the video in the system
- `VIDEO_URL` — Signed GCS URL for the raw video file
- `VIDEO_FILENAME` — Original filename (e.g., `video04.mov`)
- `PASSES` — Comma-separated list of passes to run (e.g., `transcribe,music,graphics,promotions`)
- `ANALYSIS_DIR` — Local temp directory for working files

## Steps

### 1. Run detection passes

Run each selected detection pass by calling the Modal endpoint via curl. These are independent and should run in sequence.

**If "transcribe" is in PASSES:**

```bash
curl -s -X POST "$MODAL_URL_TRANSCRIBE" \
  -H "Content-Type: application/json" \
  -H "Authorization: Bearer $MODAL_AUTH_TOKEN" \
  -d "{\"video_url\": \"$VIDEO_URL\", \"video_id\": \"$VIDEO_ID\", \"bucket\": \"$GCS_BUCKET\"}"
```

This saves `analysis/{VIDEO_ID}/transcript.json` to GCS.

**If "music" is in PASSES:**

```bash
curl -s -X POST "$MODAL_URL_DETECT_MUSIC" \
  -H "Content-Type: application/json" \
  -H "Authorization: Bearer $MODAL_AUTH_TOKEN" \
  -d "{\"video_url\": \"$VIDEO_URL\", \"video_id\": \"$VIDEO_ID\", \"bucket\": \"$GCS_BUCKET\"}"
```

This saves `analysis/{VIDEO_ID}/music.json` to GCS.

**If "graphics" is in PASSES:**

```bash
curl -s -X POST "$MODAL_URL_DETECT_GRAPHICS" \
  -H "Content-Type: application/json" \
  -H "Authorization: Bearer $MODAL_AUTH_TOKEN" \
  -d "{\"video_url\": \"$VIDEO_URL\", \"video_id\": \"$VIDEO_ID\", \"bucket\": \"$GCS_BUCKET\"}"
```

This saves `analysis/{VIDEO_ID}/graphics_candidates.json` and frame images to GCS.

### 2. Download detection results

After all detection passes complete, download the results from GCS to the local `$ANALYSIS_DIR`:

```bash
# Download whatever was produced
gcloud storage cp "gs://$GCS_BUCKET/analysis/$VIDEO_ID/transcript.json" "$ANALYSIS_DIR/" 2>/dev/null || true
gcloud storage cp "gs://$GCS_BUCKET/analysis/$VIDEO_ID/music.json" "$ANALYSIS_DIR/" 2>/dev/null || true
gcloud storage cp "gs://$GCS_BUCKET/analysis/$VIDEO_ID/graphics_candidates.json" "$ANALYSIS_DIR/" 2>/dev/null || true
```

### 3. Analyze and identify segments

Read each detection result and build segments.

**Music segments:** Read `$ANALYSIS_DIR/music.json`. Each segment has `start`, `end` (seconds), and `track` (matched song name or null). Use these directly as music segments.

**Graphics segments:** Read `$ANALYSIS_DIR/graphics_candidates.json`. Each candidate is a transition point with `frame_index`, `timestamp`, `correlation`, `before_frame`, `after_frame`.

For each candidate transition, download and read the before/after frame images from GCS:
```bash
gcloud storage cp "gs://$GCS_BUCKET/analysis/$VIDEO_ID/graphics_frames/{before_frame}" "$ANALYSIS_DIR/" 2>/dev/null
gcloud storage cp "gs://$GCS_BUCKET/analysis/$VIDEO_ID/graphics_frames/{after_frame}" "$ANALYSIS_DIR/" 2>/dev/null
```

Process in batches of 5-10 transitions. Classify each by reading the frame images:

- **Flag for removal:** Sponsor logo overlays, product placement overlays, discount code displays, branded end cards, subscribe/follow animations with platform branding, affiliate link displays
- **Do NOT flag:** Normal scene changes, creator's own branding/watermark, content-relevant graphics, standard video UI elements

Build continuous time ranges from flagged frames: pair appear/disappear transitions, merge frames within 5 seconds.

**Promotion segments:** Read `$ANALYSIS_DIR/transcript.json`. Extract just the text with timestamps.

If the transcript has 50 or fewer segments, analyze it as a single chunk. Otherwise, split into chunks targeting ~50 segments each, splitting at natural break points (time gaps >10 seconds), with 5 segments of overlap between adjacent chunks.

For each chunk, identify:

- **Flag for removal:** Explicit sponsor mentions, product pitches with promotional language, transitions into/out of ad reads, discount codes and referral links, platform references directing viewers to social media, cross-promotion of creator's other channels
- **Do NOT flag:** Incidental platform mentions as part of content, genuine non-sponsored recommendations

Produce a JSON array of `{"start": float, "end": float, "description": "brief reason"}` for detected promotions.

After processing all chunks, reconcile: deduplicate detections from overlap zones (start/end within 3 seconds), merge segments within 5 seconds of each other, and sort by start time.

### 4. Analyze overlaps across types

Compare all detected segments across types and identify overlaps:

- **Merge** segments from different types if they overlap **and** their time ranges are similar (both start and end within 10 seconds of each other). Present as one unified segment noting all contributing types.
- **Do NOT merge** segments that merely overlap but have very different boundaries. These are separate segments.
- Sort the final list by start time.

### 5. Write `review_data.json`

Write a consolidated file to `$ANALYSIS_DIR/review_data.json` using this EXACT structure:

```json
{
  "video": {
    "filename": "<VIDEO_FILENAME>",
    "path": ""
  },
  "music": <contents of music.json array, or null if music pass was not run>,
  "graphics": <contents of graphics_candidates.json array, or null if graphics pass was not run>,
  "transcript": {
    "segments": <transcript.json segments array, keeping only id/start/end/text fields>
  },
  "promotions": <array of {"start": float, "end": float, "description": string} from step 3, or null if promotions not run>,
  "suggested_segments": <merged segment list from step 4, array of {"start": float, "end": float, "types": [string], "description": string, "accepted": true}>
}
```

Rules for `suggested_segments`:
- `types` is an ARRAY of strings. Valid values: `"music"`, `"graphics"`, `"promotions"`
- `accepted` must be `true` (boolean)
- `start` and `end` are numbers in seconds
- Use the ACTUAL data from the detection results. Never fabricate timestamps or text.
- The `transcript.segments` array must be trimmed to only `id`, `start`, `end`, and `text` fields.

### 6. Upload review_data.json to GCS

```bash
gcloud storage cp "$ANALYSIS_DIR/review_data.json" "gs://$GCS_BUCKET/analysis/$VIDEO_ID/review_data.json"
```

Write a signal line to stdout when complete:
```
ANALYSIS_COMPLETE: review_data.json uploaded to gs://$GCS_BUCKET/analysis/$VIDEO_ID/review_data.json
```
