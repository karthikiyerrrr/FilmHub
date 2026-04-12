# Gweebler Worker Service

Cloud Run service that processes video analysis jobs for the Gweebler standalone webapp. Receives jobs from the `api/` service and orchestrates GPU compute via `modal/` endpoints.

## Tech stack

- **Runtime:** Node.js 20, TypeScript (ESM, target ES2022)
- **AI:** `@anthropic-ai/sdk` — single Claude API call for segment analysis (claude-sonnet-4-20250514)
- **Cloud:** Firebase Admin (Firestore for job state), Google Cloud Storage (signed URLs, result upload)
- **HTTP:** Express 5 — exposes `/run-analysis` endpoint and `/health` check

## How it works

1. `api/` POSTs to `/run-analysis` with `jobId`, `videoId`, `passes`, `gcsVideoPath`, `videoFilename`
2. `index.ts` generates a GCS signed URL (2h expiry) for the video
3. `pipeline.ts` runs a 3-phase pipeline:
   - **Phase 1:** Parallel Modal calls (`Promise.allSettled`) for transcribe, music, graphics detection
   - **Phase 2:** Reads results from GCS, downloads graphics frame images for vision analysis
   - **Phase 3:** Single Claude API call with all data + frame images; Claude analyzes segments and produces `review_data.json`
   - **Phase 4:** Uploads `review_data.json` to GCS, marks job completed in Firestore
4. Worker awaits completion before responding (keeps Cloud Run container alive)
5. On failure, marks job `failed` and resets video status to `uploaded`

## Source files

- `index.ts` — Express server, `/run-analysis` endpoint, signed URL generation
- `pipeline.ts` — 3-phase analysis orchestrator (Modal calls -> Claude analysis -> upload)
- `prompts.ts` — Builds Claude API messages with detection data and frame images
- `gcs.ts` — GCS read/write helpers (JSON, binary buffers)
- `firestore.ts` — Firestore progress and status update helpers
- `modal-client.ts` — HTTP client for Modal GPU endpoints

## Key environment variables

- `GCS_BUCKET` — GCS bucket for video storage and analysis results
- `MODAL_URL_TRANSCRIBE`, `MODAL_URL_DETECT_MUSIC`, `MODAL_URL_DETECT_GRAPHICS` — Modal endpoint URLs
- `MODAL_AUTH_TOKEN` — auth token for Modal API calls
- `ANTHROPIC_API_KEY` — required by the Anthropic SDK
- `PORT` — HTTP port (default `8081`)

## Relation to sibling directories

- **`api/`** — the API service that creates jobs in Firestore and POSTs to this worker
- **`modal/`** — Python GPU functions deployed on Modal; this worker calls their HTTP endpoints
- **`frontend/`** — React SPA on Firebase Hosting; shows real-time job progress via Firestore

## Commands

```bash
npm install          # Install dependencies
npm run dev          # Dev mode with hot reload (tsx watch)
npm run build        # Compile TypeScript to dist/
npm start            # Run compiled output (node dist/index.js)
```

## Conventions

- ESM modules throughout (`"type": "module"`, `.js` extensions in imports)
- Firestore updates use dot-notation for nested fields (`progress.message`, `progress.currentPass`)
- Worker awaits `runAnalysis()` before responding — Cloud Run keeps the container alive for the duration
- The API service uses fire-and-forget `fetch` to the worker, so the worker's response timing doesn't affect the frontend
