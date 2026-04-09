# FilmHub

Automatically removes paid promotions and sponsorship segments from video files.

## Project structure

- `filmhub/` — Python package containing all processing modules
  - `utils.py` — Shared utilities (time formatting, directory constants, video file resolution)
  - `transcribe.py` — Extracts audio and generates timestamped transcripts using local Whisper (with optional speaker diarization)
  - `diarize.py` — Speaker diarization using PyAnnote; aligns speaker labels with Whisper segments via temporal overlap
  - `detect_music.py` — Detects copyrighted music segments using Demucs source separation, librosa energy analysis, and AcoustID fingerprinting
  - `detect_graphics.py` — Detects on-screen graphics transitions using OpenCV frame-by-frame histogram comparison
  - `export_resolve.py` — Exports confirmed segments as color-coded markers to a DaVinci Resolve timeline
  - `cut_video.py` — Removes specified time segments from a video using FFmpeg (no re-encoding)
- `reviewer/` — Webapp for visual segment review (Rust/Axum backend + React/Vite frontend)
  - `src/` — Axum server: video streaming with range requests, REST API for analysis data, segment saving, and video cutting
  - `frontend/` — React 19 + TypeScript + Tailwind v4: video player, timeline with segment overlays, segment list, transcript panel
  - Build: `cd reviewer/frontend && npm install && npm run build && cd .. && cargo build --release`
  - Run: `reviewer/target/release/reviewer --project-root /path/to/FilmHub --port 3456`
- `videos/` — Input directory for original video files
- `analysis/` — Output directory for all detection and analysis results (transcripts, music segments, graphics candidates, etc.)
- `output/` — Output directory for processed videos with promotions removed

## Tech stack

- Python 3
- [mlx-whisper](https://github.com/ml-explore/mlx-examples) — GPU-accelerated speech-to-text transcription on Apple Silicon
- [PyAnnote](https://github.com/pyannote/pyannote-audio) (`pyannote.audio`) — speaker diarization (who spoke when); gated model, requires one-time HuggingFace token
- [Demucs](https://github.com/facebookresearch/demucs) — audio source separation (isolates music from speech)
- [librosa](https://librosa.org/) — audio analysis (RMS energy for music segment detection)
- [pyacoustid](https://github.com/beetbox/pyacoustid) / [Chromaprint](https://github.com/acoustid/chromaprint) — audio fingerprinting against AcoustID database
- [OpenCV](https://opencv.org/) (`opencv-python`) — frame analysis and histogram comparison for graphics detection
- FFmpeg / ffprobe — audio extraction and lossless video cutting
- [Axum](https://github.com/tokio-rs/axum) — Rust async web framework for the reviewer backend
- React 19 + Vite + Tailwind CSS v4 — reviewer frontend

## Reviewer security (local-only for now)

The reviewer webapp is currently designed for local use only. Before exposing it to untrusted networks or deploying as a public-facing service, the following must be addressed:

- **Path traversal** — Route handlers in `analysis.rs`, `segments.rs`, and `cut.rs` join user-supplied path parameters directly without validating against `..` sequences. Sanitize inputs and verify resolved paths stay within `project_root`.
- **CORS** — `main.rs` uses `CorsLayer::permissive()`. Restrict allowed origins to expected hosts.
- **Bind address** — Server binds to `0.0.0.0`. Switch to `127.0.0.1` or a configurable listen address.
- **Mutex poisoning** — `.lock().unwrap()` calls will crash the server if a thread panics while holding the lock. Handle or recover from poisoned locks.
