# FilmHub

Automatically removes paid promotions and sponsorship segments from video files.

## Project structure

- `filmhub/` — Python package containing all processing modules
  - `utils.py` — Shared utilities (time formatting, directory constants, video file resolution)
  - `transcribe.py` — Extracts audio and generates timestamped transcripts using local Whisper
  - `detect_music.py` — Detects copyrighted music segments using Demucs source separation, librosa energy analysis, and AcoustID fingerprinting
  - `detect_graphics.py` — Detects on-screen graphics transitions using OpenCV frame-by-frame histogram comparison
  - `cut_video.py` — Removes specified time segments from a video using FFmpeg (no re-encoding)
- `videos/` — Input directory for original video files
- `analysis/` — Output directory for all detection and analysis results (transcripts, music segments, graphics candidates, etc.)
- `output/` — Output directory for processed videos with promotions removed

## Tech stack

- Python 3
- [mlx-whisper](https://github.com/ml-explore/mlx-examples) — GPU-accelerated speech-to-text transcription on Apple Silicon
- [Demucs](https://github.com/facebookresearch/demucs) — audio source separation (isolates music from speech)
- [librosa](https://librosa.org/) — audio analysis (RMS energy for music segment detection)
- [pyacoustid](https://github.com/beetbox/pyacoustid) / [Chromaprint](https://github.com/acoustid/chromaprint) — audio fingerprinting against AcoustID database
- [OpenCV](https://opencv.org/) (`opencv-python`) — frame analysis and histogram comparison for graphics detection
- FFmpeg / ffprobe — audio extraction and lossless video cutting
