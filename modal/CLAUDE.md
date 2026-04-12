# Modal GPU Functions for Gweebler

Serverless GPU functions on [Modal](https://modal.com) that power the Gweebler standalone webapp's video processing pipeline. Mirrors the logic in the root `filmhub/` package but runs in cloud containers with GCS for storage instead of local filesystem.

## Tech stack

- Modal (app name: `gweebler`) with per-function container images
- CUDA 12.1 + faster-whisper (GPU transcription, replaces local mlx-whisper)
- Demucs + librosa + pyacoustid (music detection, GPU)
- OpenCV headless + NumPy (graphics detection, CPU)
- FFmpeg/ffprobe (audio extraction, video cutting, transcoding)
- Google Cloud Storage via service account (`GCS_SERVICE_ACCOUNT_JSON` env var)

## Container images

| Image | Base | GPU | Used by |
|-------|------|-----|---------|
| `whisper_image` | nvidia/cuda:12.1.1 | A10G | `transcribe` |
| `demucs_image` | nvidia/cuda:12.1.1 | A10G | `detect_music` |
| `graphics_image` | debian-slim | none | `detect_graphics` |
| `cut_image` | debian-slim | none | `cut_video` |
| `transcode_image` | debian-slim | none | `transcode_video` |

## Functions (all exposed as POST FastAPI endpoints)

- **transcribe** — Downloads video, extracts 16kHz mono audio, runs faster-whisper large-v3 on GPU. Uploads `analysis/{video_id}/transcript.json` to GCS.
- **detect_music** — Demucs source separation (htdemucs, two-stems), librosa RMS energy detection, AcoustID fingerprinting. Uploads `analysis/{video_id}/music.json`.
- **detect_graphics** — Extracts frames at 1fps, computes HSV histogram correlation between consecutive frames to find visual transitions. Uploads candidate frames and `analysis/{video_id}/graphics_candidates.json`.
- **cut_video** — Removes specified segments using FFmpeg concat demuxer (no re-encode). Uploads `output/{video_id}/clean_{filename}`.
- **transcode** — Converts uploaded video to web-optimized H.264 MP4 (faststart, max 1920x1080, CRF 23). Uploads `previews/{video_id}/preview.mp4`.

## Relationship to other directories

- **`filmhub/`** — Root Python package for local processing. Modal functions replicate the same algorithms but use faster-whisper instead of mlx-whisper and GCS instead of local `analysis/`/`output/` dirs.
- **`worker/`** — The worker agent calls transcribe, detect_music, and detect_graphics endpoints via HTTP POST during analysis jobs.
- **`api/`** — The API server calls cut_video and transcode endpoints directly (not via the worker) for on-demand operations.

## Secrets

All functions use `modal.Secret.from_name("gweebler")` which must contain:
- `GCS_SERVICE_ACCOUNT_JSON` — service account JSON for GCS access
- `ACOUSTID_API_KEY` — (optional) for music fingerprinting in detect_music

## Commands

```bash
# Deploy all functions to Modal
cd modal && modal deploy app.py

# Run a single function locally for testing
cd modal && modal run app.py::transcribe

# Serve endpoints locally during development
cd modal && modal serve app.py
```

## Conventions

- Each function module in `gweebler_modal/` exposes a `run()` entry point that `app.py` delegates to
- All modules follow the same pattern: download video to tmpdir, process, upload results to GCS, return status dict
- GCS client creation is centralized in `gweebler_modal/__init__.py`
- All timeouts are 600-900s; GPU functions get A10G, CPU functions use default compute
