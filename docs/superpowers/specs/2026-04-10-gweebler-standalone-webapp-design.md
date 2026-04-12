# Gweebler Standalone Webapp — Design Spec

**Date:** 2026-04-10
**Status:** Draft

## Overview

Transform FilmHub (renamed to Gweebler) from a local CLI + Rust/React webapp into a standalone, authenticated web application with cloud-based video processing. Users upload videos via a browser, trigger AI-orchestrated analysis, review detected segments in a rich timeline UI, and download cleaned videos.

## Architecture

```
┌─────────────────────────────────────────────────────────────────┐
│                        Firebase Hosting                         │
│                   Vite + React 19 + Tailwind v4                 │
│                        (SPA frontend)                           │
└────────────┬──────────────────┬──────────────────┬──────────────┘
             │ API calls        │ Auth             │ Realtime
             ▼                  ▼                  ▼
┌────────────────────┐  ┌─────────────┐  ┌─────────────────┐
│  Cloud Run: API    │  │  Firebase   │  │    Firestore    │
│  (Node/Express)    │  │    Auth     │  │  (job status,   │
│                    │  │  Google +   │  │   progress)     │
│  - Upload signing  │  │  email/pw   │  └─────────────────┘
│  - Video listing   │  │  whitelist  │           ▲
│  - Analysis data   │  └─────────────┘           │ writes progress
│  - Save review     │                            │
│  - Trigger cut     │                ┌───────────┴───────────┐
│  - Trigger analyze │                │  Cloud Run: Worker    │
└──────┬─────────┬───┘                │  (Node/Express)       │
       │         │                    │                       │
       │    ┌────┴────┐               │  - Anthropic SDK      │
       │    │ Cloud   │───────────────│    agent loop         │
       │    │ Tasks   │               │  - Tool use →         │
       │    └─────────┘               │    Modal endpoints    │
       │                              └───────────┬───────────┘
       ▼                                          │
┌─────────────────┐                               ▼
│  Firebase        │                     ┌─────────────────┐
│  Storage (GCS)   │◄────────────────────│     Modal       │
│                  │                     │  (GPU compute)  │
│  - Raw videos    │                     │  - Transcribe   │
│  - Analysis JSON │                     │  - Music detect │
│  - Frame images  │                     │  - Graphics det │
│  - Cut videos    │                     │  - Cut video    │
└──────────────────┘                     └─────────────────┘
```

### Two Cloud Run Services

- **API service** — lightweight, handles all HTTP routes (auth verification, upload signing, video listing, review data, cut triggering). Scales to zero quickly.
- **Worker service** — receives analysis jobs via Cloud Tasks, runs the Anthropic SDK agent loop, writes progress to Firestore and results to GCS. Separate CPU/memory/timeout settings.
- **Cloud Tasks** — dispatches analysis jobs from API to Worker with retry logic and deduplication.

## Tech Stack

- **Frontend:** Vite + React 19 + TypeScript + Tailwind CSS v4 + Firebase SDK (Auth + Firestore)
- **API Service:** Node.js + Express + TypeScript + firebase-admin + @google-cloud/storage + @google-cloud/tasks
- **Worker Service:** Node.js + TypeScript + firebase-admin + @anthropic-ai/sdk + @google-cloud/storage
- **GPU Compute:** Modal (Python) — faster-whisper, Demucs, librosa, OpenCV, FFmpeg
- **Auth:** Firebase Auth (Google Sign-In + email/password), whitelisted emails
- **Database:** Firestore (job status, video metadata, user data)
- **Storage:** Firebase Storage / GCS bucket (`gweebler.firebasestorage.app`)
- **Hosting:** Firebase Hosting (SPA)

## Infrastructure Details

- **GCP Project:** gweebler
- **Region:** us-west1 (bucket, Cloud Tasks, Cloud Run)
- **GCS Bucket:** gweebler.firebasestorage.app (default Firebase Storage bucket)
- **Cloud Tasks Queue:** gweebler-analysis (us-west1)
- **Whitelisted Emails:** kbi102003@gmail.com, akshayphx@gmail.com

## Data Model

### Firestore Collections

```
users/{uid}
  - email: string
  - displayName: string
  - createdAt: timestamp

videos/{videoId}
  - userId: string (owner)
  - filename: string (original filename, e.g. "my_video.mp4")
  - gcsPath: string ("videos/{videoId}/{filename}")
  - status: "uploaded" | "analyzing" | "reviewed" | "cut"
  - createdAt: timestamp
  - updatedAt: timestamp

jobs/{jobId}
  - videoId: string
  - userId: string
  - status: "queued" | "running" | "completed" | "failed"
  - passes: string[] (e.g. ["transcribe", "music", "graphics", "promotions"])
  - progress: {
      currentPass: string | null,
      completedPasses: string[],
      message: string,
      startedAt: timestamp,
      completedAt: timestamp | null,
      error: string | null
    }
  - createdAt: timestamp
```

### GCS Bucket Structure

```
gweebler.firebasestorage.app/
  videos/{videoId}/{filename}                  # Raw uploaded video
  analysis/{videoId}/review_data.json          # Combined analysis results
  analysis/{videoId}/transcript.json           # Whisper output
  analysis/{videoId}/music.json                # Music detection output
  analysis/{videoId}/graphics_candidates.json  # Graphics detection output
  analysis/{videoId}/graphics_frames/          # Frame PNGs
  analysis/{videoId}/promotions.json           # Promotion detection output
  analysis/{videoId}/review_{seq}.json         # User review snapshots
  analysis/{videoId}/clean_{seq}_segments.json # Accepted segments
  output/{videoId}/clean_{filename}            # Cut video (temporary, auto-cleaned after 24h)
```

### Auth & Whitelist

Firebase Auth with Google Sign-In + email/password. The API service middleware verifies every request:

1. Verify Firebase ID token via `firebase-admin` SDK
2. Extract email from token
3. Check email ∈ `ALLOWED_EMAILS` env var
4. Reject with 403 if not whitelisted

Firebase Auth itself doesn't restrict sign-up — authorization is enforced at the API layer.

## Frontend Architecture

### Routes (React Router)

```
/sign-in          → SignInPage (Google button + email/password form)
/dashboard        → DashboardPage (video grid, upload, status)
/review/:videoId  → ReviewPage (full review UI)
```

All routes except `/sign-in` are auth-gated via a `<ProtectedRoute>` wrapper.

### Pages

**SignInPage** — Google Sign-In button, email/password form, error display for unauthorized emails.

**DashboardPage** — Video grid with upload zone:
- `UploadZone` — drag-and-drop / click. Gets signed resumable URL from API, uploads directly to GCS with progress bar.
- `VideoCard` — filename, status badge ("Uploaded", "Analyzing...", "Ready for Review", "Cut Complete"). Real-time status via Firestore subscription.
- "Analyze" button per video — modal to select detection passes (checkboxes: Transcribe, Music, Graphics, Promotions), POSTs to API.
- Analysis progress shown inline via Firestore subscription to `jobs/{jobId}.progress`.

**ReviewPage** — Migrated from existing reviewer frontend:
- `VideoPlayer` — streams video via signed GCS URL
- `Timeline` — segment visualization with zoom, pan, drag handles, snap-to-edge
- `SegmentProperties` — segment editing, type toggles, split, remove, frame previews
- `TranscriptPanel` — timestamped transcript with auto-scroll and click-to-seek
- `ActionBar` — save review + trigger cut → download via signed GCS URL

### Hooks

Migrated from existing app:
- `useVideoSync` — as-is
- `useSegments` — as-is (undo history, segment editing)
- `useHandleDrag` — as-is

New/adapted:
- `useAnalysis` — fetches from Cloud Run API instead of local Axum server
- `useAuth` — wraps Firebase Auth, exposes user + loading + sign-in/out
- `useJobProgress` — subscribes to Firestore `jobs/{jobId}` for real-time progress

### API Client

Same function signatures as current `api.ts`, different URLs, adds Firebase ID token to `Authorization: Bearer` header on every request.

## Cloud Run API Service

Node.js + Express + TypeScript. Auth middleware on all `/api/*` routes. CORS restricted to Firebase Hosting domain.

### Endpoints

```
POST /api/upload/sign
  → Generates GCS signed resumable upload URL
  → Creates Firestore video doc with status "uploaded"
  → Returns { videoId, uploadUrl }

GET /api/videos
  → Lists user's videos from Firestore (filtered by userId)
  → Returns VideoInfo[]

GET /api/videos/:videoId/stream
  → Generates short-lived signed GCS URL, redirects (302)
  → GCS handles range requests natively

POST /api/analyze/:videoId
  → Body: { passes: ["transcribe", "music", "graphics", "promotions"] }
  → Creates Firestore job doc with status "queued"
  → Enqueues Cloud Tasks message with { jobId, videoId, passes }
  → Updates video status to "analyzing"
  → Returns { jobId }

GET /api/analysis/:videoId
  → Reads review_data.json from GCS
  → Runs ffprobe on video (via signed URL) to inject FPS
  → Returns ReviewData JSON

GET /api/analysis/:videoId/frames/:filename
  → Reads frame PNG from GCS, streams to client
  → Validates filename (no path traversal)

POST /api/save/:videoId
  → Body: { segments, reviewData }
  → Writes review_{seq}.json and clean_{seq}_segments.json to GCS
  → Returns { reviewFile, segmentsFile }

POST /api/cut/:videoId
  → Body: { segmentsFile }
  → Calls Modal cut_video endpoint directly (not via Cloud Tasks)
  → Writes progress to Firestore
  → Returns { status, downloadUrl } when done

GET /api/cut/:videoId/status
  → Reads cut status from Firestore
  → If done: returns { status: "done", downloadUrl: signedGcsUrl (1hr expiry) }
```

## Cloud Run Worker Service

Node.js + TypeScript. Receives jobs from Cloud Tasks via HTTP POST. Authenticates incoming requests via OIDC token verification.

### Job Execution Flow

```
POST /run-analysis
  Body (from Cloud Tasks): { jobId, videoId, passes, gcsVideoPath }

  1. Update Firestore job: status → "running"
  2. Generate signed GCS URL for the video
  3. Start Anthropic SDK agent loop:
     - System prompt describes available tools and selected passes
     - Tools:
       a. run_transcription(videoUrl) → Modal /transcribe endpoint
       b. detect_music(videoUrl) → Modal /detect-music endpoint
       c. detect_graphics(videoUrl) → Modal /detect-graphics endpoint
       d. detect_promotions(transcriptJson) → Claude text analysis (no Modal)
       e. update_progress(message) → Firestore job.progress update
       f. save_results(type, data) → writes JSON to GCS
     - Agent decides execution order based on selected passes
     - Each tool call triggers a Firestore progress update
  4. After all passes complete:
     - Assemble review_data.json (combines all results + suggested_segments)
     - Write review_data.json to GCS
     - Update Firestore job: status → "completed"
     - Update Firestore video: status → "reviewed"
  5. On failure:
     - Update Firestore job: status → "failed", error message
     - Update Firestore video: status back to "uploaded"
```

### Cloud Run Configuration
- **Timeout:** 30 minutes
- **Memory:** 512MB
- **CPU:** 1 vCPU
- **Max instances:** 3
- **Concurrency:** 1 (one job per instance)

## Modal Endpoints

Python + Modal, deployed as web endpoints. Each detection pass is a separate endpoint.

```
POST /transcribe
  Input: { video_url, diarize }
  GPU: A10G
  Process: Download → extract audio → faster-whisper → optional diarization
  Output: { segments: [{ id, start, end, text, speaker? }] }
  Timeout: 15 min

POST /detect-music
  Input: { video_url }
  GPU: A10G (Demucs needs GPU)
  Process: Download → extract audio → Demucs → librosa energy → AcoustID
  Output: { segments: [{ start, end, track? }] }
  Timeout: 15 min

POST /detect-graphics
  Input: { video_url }
  GPU: None (CPU-only, OpenCV)
  Process: Download → frame histogram comparison → extract frames → upload to GCS
  Output: { candidates: [{ timestamp, correlation, frame_url }] }
  Timeout: 10 min

POST /cut-video
  Input: { video_url, segments: [{ start, end }] }
  GPU: None (CPU-only, FFmpeg)
  Process: Download → FFmpeg lossless cut → upload to GCS
  Output: { output_url }
  Timeout: 15 min
```

Auth via shared secret in `Authorization: Bearer` header (`MODAL_AUTH_TOKEN`).

Modal endpoints receive signed GCS URLs to read videos. For writes (frames, cut video), Modal uses a GCS service account key provided via Modal secrets.

Key difference from current Python modules: `faster-whisper` replaces `mlx-whisper` (MLX is Apple Silicon only; Modal runs Linux/NVIDIA).

## Cut & Download Flow

1. Frontend → `POST /api/save/:videoId` — saves review JSON + segments to GCS
2. Frontend → `POST /api/cut/:videoId` — API calls Modal `/cut-video` directly (not Cloud Tasks; cutting is fast, ~1-2 min, user is waiting)
3. Modal uploads cut video to GCS at `output/{videoId}/clean_{filename}`
4. API generates signed download URL (1hr expiry), returns to frontend
5. Frontend triggers browser download via `<a download>` or `window.location`
6. Deferred cleanup: files in `output/` older than 24h are auto-deleted (GCS lifecycle policy)

Fallback: if cutting takes longer than expected, API returns `{ status: "processing" }` and frontend polls `GET /api/cut/:videoId/status`.

## File Structure

```
Gweebler/
├── frontend/                    # Vite + React SPA
│   ├── package.json
│   ├── vite.config.ts
│   ├── index.html
│   ├── tsconfig.json
│   ├── .env.local
│   └── src/
│       ├── main.tsx
│       ├── App.tsx
│       ├── api.ts               # API client with Firebase auth headers
│       ├── firebase.ts          # Firebase SDK init
│       ├── types/
│       │   └── index.ts
│       ├── components/
│       │   ├── ProtectedRoute.tsx
│       │   ├── SignInForm.tsx
│       │   ├── VideoPicker.tsx
│       │   ├── VideoCard.tsx
│       │   ├── UploadZone.tsx
│       │   ├── ReviewView.tsx
│       │   ├── VideoPlayer.tsx   # Migrated
│       │   ├── Timeline.tsx      # Migrated
│       │   ├── SegmentProperties.tsx  # Migrated
│       │   ├── TranscriptPanel.tsx    # Migrated
│       │   └── ActionBar.tsx     # Migrated, updated for download
│       └── hooks/
│           ├── useAuth.ts
│           ├── useJobProgress.ts
│           ├── useAnalysis.ts    # Adapted
│           ├── useVideoSync.ts   # Migrated
│           ├── useSegments.ts    # Migrated
│           └── useHandleDrag.ts  # Migrated
├── api/                         # Cloud Run API service
│   ├── package.json
│   ├── tsconfig.json
│   ├── Dockerfile
│   ├── .env.local
│   └── src/
│       ├── index.ts             # Express app + routes
│       ├── middleware/
│       │   └── auth.ts          # Firebase token verification + whitelist
│       └── routes/
│           ├── upload.ts
│           ├── videos.ts
│           ├── analyze.ts
│           ├── analysis.ts
│           ├── save.ts
│           └── cut.ts
├── worker/                      # Cloud Run Worker service
│   ├── package.json
│   ├── tsconfig.json
│   ├── Dockerfile
│   ├── .env.local
│   └── src/
│       ├── index.ts             # Express app, POST /run-analysis
│       ├── agent.ts             # Anthropic SDK agent loop + tool definitions
│       └── modal-client.ts      # HTTP client for Modal endpoints
├── modal/                       # Modal Python functions
│   ├── app.py                   # Modal App with web endpoints
│   ├── requirements.txt
│   └── gweebler_modal/
│       ├── __init__.py
│       ├── transcribe.py
│       ├── detect_music.py
│       ├── detect_graphics.py
│       └── cut_video.py
├── firebase.json                # Firebase Hosting + Firestore + Storage config
├── firestore.rules              # Firestore security rules
├── storage.rules                # GCS security rules
├── .firebaserc                  # Firebase project alias
├── .env.example                 # Template for all env vars
├── service-account.json         # GCP service account key (gitignored)
├── .gitignore
├── filmhub/                     # Original Python package (kept for reference)
└── reviewer/                    # Original Rust+React app (kept for reference)
```

## Local Development

```bash
# Terminal 1: Frontend
cd frontend && npm run dev          # http://localhost:5173

# Terminal 2: API service
cd api && npm run dev               # http://localhost:8080

# Terminal 3: Worker service
cd worker && npm run dev            # http://localhost:8081

# Terminal 4: Firebase emulators
firebase emulators:start --only auth,firestore
```

- Frontend proxies `/api/*` to `localhost:8080` via Vite dev proxy
- API uses Firebase Local Emulator for Auth and Firestore in dev
- Worker runs locally, API calls it directly (bypassing Cloud Tasks in dev)
- Modal endpoints are always remote (no local mode)

## Environment Variables

**Frontend (`frontend/.env.local`):**
```
VITE_API_URL=http://localhost:8080
VITE_FIREBASE_API_KEY=...
VITE_FIREBASE_AUTH_DOMAIN=gweebler.firebaseapp.com
VITE_FIREBASE_PROJECT_ID=gweebler
VITE_FIREBASE_STORAGE_BUCKET=gweebler.firebasestorage.app
VITE_FIREBASE_MESSAGING_SENDER_ID=...
VITE_FIREBASE_APP_ID=...
```

**API Service (`api/.env.local`):**
```
GOOGLE_APPLICATION_CREDENTIALS=../service-account.json
GCS_BUCKET=gweebler.firebasestorage.app
CLOUD_TASKS_QUEUE=gweebler-analysis
CLOUD_TASKS_LOCATION=us-west1
GCP_PROJECT=gweebler
WORKER_SERVICE_URL=http://localhost:8081
ALLOWED_EMAILS=kbi102003@gmail.com,akshayphx@gmail.com
```

**Worker Service (`worker/.env.local`):**
```
GOOGLE_APPLICATION_CREDENTIALS=../service-account.json
GCS_BUCKET=gweebler.firebasestorage.app
ANTHROPIC_API_KEY=...
MODAL_ENDPOINT_URL=...
MODAL_AUTH_TOKEN=...
```
