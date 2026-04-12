# Gweebler API

Express + TypeScript backend for the Gweebler standalone webapp. Handles auth, video upload/management, analysis orchestration, and video cutting.

## Tech stack

- Express 5, TypeScript (ESM), Node 20
- Firebase Admin SDK -- Firestore for metadata, Auth for token verification
- Google Cloud Storage -- video files and analysis results via signed URLs
- Google Cloud Tasks -- (imported but analysis dispatch currently uses direct HTTP)
- Modal -- serverless GPU functions for transcode and video cutting

## Directory structure

```
src/
  index.ts              -- App entry: Firebase init, CORS, mounts /api routes
  middleware/auth.ts     -- Verifies Firebase ID token, enforces ALLOWED_EMAILS allowlist
  routes/
    upload.ts            -- POST /api/upload/sign (GCS resumable upload URL + Firestore doc)
                            POST /api/videos/:videoId/transcode (calls Modal transcode endpoint)
    videos.ts            -- GET /api/videos (list user's videos)
                            GET /api/videos/:videoId/url (signed GCS URL, prefers transcoded preview)
    analyze.ts           -- POST /api/analyze/:videoId (fire-and-forget call to worker service with OIDC auth)
    analysis.ts          -- GET /api/analysis/:videoId (fetch review_data.json from GCS, inject FPS via ffprobe)
                            GET /api/analysis/:videoId/frames/:filename (stream graphics frame PNGs from GCS)
    save.ts              -- POST /api/save/:videoId (save reviewed segments + review snapshot to GCS)
    cut.ts               -- POST /api/cut/:videoId (calls Modal cut endpoint, returns signed download URL)
                            GET /api/cut/:videoId/status
```

## Auth

All `/api` routes require a Firebase ID token in `Authorization: Bearer <token>`. The middleware also checks the token's email against `ALLOWED_EMAILS` env var (comma-separated allowlist).

## How it connects to other services

- **Frontend** (`../frontend/`) -- React SPA authenticates with Firebase Auth, sends ID tokens to this API. Frontend hosted on Firebase Hosting; API on Cloud Run.
- **Worker** (`../worker/`) -- The `/api/analyze/:videoId` route calls the worker's `/run-analysis` endpoint with OIDC service-to-service auth (fetches identity token from GCP metadata server). The call is fire-and-forget; the worker updates Firestore directly for progress.
- **Modal** -- Transcode and cut operations call Modal endpoints directly with `MODAL_AUTH_TOKEN`.

## Environment variables

`PORT`, `GCS_BUCKET`, `GCP_PROJECT`, `ALLOWED_EMAILS`, `WORKER_SERVICE_URL`, `MODAL_URL_TRANSCODE`, `MODAL_URL_CUT_VIDEO`, `MODAL_AUTH_TOKEN`, `CLOUD_TASKS_LOCATION`, `CLOUD_TASKS_QUEUE`

## Commands

```bash
npm run dev      # tsx watch src/index.ts (hot reload)
npm run build    # tsc -> dist/
npm start        # node dist/index.js (production)
```

## Conventions

- All routes use `AuthRequest` (extends Express Request with `uid` and `email`)
- Every route verifies `videoDoc.userId === req.uid` for ownership checks
- GCS paths follow `videos/{videoId}/` for uploads, `analysis/{videoId}/` for results
- Firestore collections: `videos`, `jobs`, `cuts`
- Dockerfile builds a production image with ffmpeg included (for the ffprobe FPS detection in analysis.ts)
