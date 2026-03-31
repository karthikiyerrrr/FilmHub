# FilmHub

Automatically detect and remove paid promotions, copyrighted music, and sponsor graphics from video files.

## How it works

FilmHub uses three independent detection methods that can run individually or combined:

| Method | What it detects | How |
|---|---|---|
| **Music** | Copyrighted music segments | Demucs source separation + librosa energy analysis + AcoustID fingerprinting |
| **Graphics** | Sponsor overlays, branded end cards, promo banners | OpenCV frame histogram comparison + Claude vision classification |
| **Promotions** | Sponsor reads, platform CTAs, affiliate plugs | MLX-Whisper transcription + text analysis |

Detected segments are cut from the video using FFmpeg's concat demuxer with stream copy (no re-encoding).

## Prerequisites

- Python 3.10+
- [FFmpeg](https://ffmpeg.org/) and ffprobe on PATH
- [Chromaprint](https://github.com/acoustid/chromaprint) (`fpcalc`) for music fingerprinting — `brew install chromaprint`
- [Claude Code](https://claude.ai/claude-code) for running the skills

## Setup

```bash
python3 -m venv .venv
source .venv/bin/activate
pip install -r requirements.txt
```

> **Note:** `mlx-whisper` provides GPU-accelerated transcription on Apple Silicon. For other platforms, replace with `openai-whisper` in `requirements.txt` and update the import in `filmhub/transcribe.py`.

## Usage

FilmHub is designed to be used through [Claude Code skills](https://docs.anthropic.com/en/docs/claude-code/skills) defined in `.claude/skills/`. Each skill guides Claude through the full detection-review-cut workflow interactively.

### Skills

| Skill | Description |
|---|---|
| `/clean-video <path>` | Full cleanup — runs all three detection passes in one workflow |
| `/remove-music <path>` | Detect and remove copyrighted music only |
| `/remove-graphics <path>` | Detect and remove sponsor graphics only |
| `/remove-promotions <path>` | Detect and remove paid promotions only |

Each skill offers three review modes:
- **Review all** — walk through every detected segment
- **Smart review** — only review ambiguous segments, auto-remove the rest
- **Auto cut** — remove all detected segments without review

### Direct CLI usage

The underlying scripts can also be run directly:

```bash
# Transcribe a video
.venv/bin/python -m filmhub.transcribe videos/video.mp4

# Detect copyrighted music
.venv/bin/python -m filmhub.detect_music videos/video.mp4

# Detect graphics transitions
.venv/bin/python -m filmhub.detect_graphics videos/video.mp4

# Cut segments from a video
.venv/bin/python -m filmhub.cut_video videos/video.mp4 analysis/video_music.json
```

## Project structure

```
filmhub/                 # Python package
├── utils.py             # Shared utilities (constants, helpers)
├── transcribe.py        # Whisper transcription
├── detect_music.py      # Music detection (Demucs + librosa + AcoustID)
├── detect_graphics.py   # Graphics detection (OpenCV histograms)
└── cut_video.py         # FFmpeg video cutting
videos/                  # Input video files
analysis/                # Detection output (transcripts, segments, frames)
output/                  # Processed clean videos and cut reports
.claude/skills/          # Claude Code skill definitions
```

## License

Private project.
