# Gweebler Frontend

Standalone webapp frontend for Gweebler — a cloud-based video cleanup service. Separate from the `reviewer/` webapp in the project root.

## Tech stack

- React 19 + TypeScript 6 + Vite 8
- Tailwind CSS v4 (via `@tailwindcss/vite` plugin, `@import "tailwindcss"` in CSS)
- react-router-dom v7 for routing
- Firebase Auth (Google + email/password) and Firestore (real-time job progress)
- All Firebase config via `VITE_FIREBASE_*` env vars; API base via `VITE_API_URL`

## Directory structure

- `src/api.ts` — All backend calls. Uses Firebase ID tokens for auth (`Bearer` header). Every request goes through `apiFetch()`.
- `src/firebase.ts` — Firebase app init, exports `auth` and `db` (Firestore)
- `src/types/index.ts` — All shared types (segments, video info, job status, review data)
- `src/components/` — Page-level and UI components (SignInForm, VideoPicker, ReviewView, Timeline, VideoPlayer, etc.)
- `src/hooks/` — Custom hooks: `useAuth` (auth state), `useAnalysis`, `useSegments`, `useJobProgress` (Firestore listener), `useVideoSync`, `useHandleDrag`
- `src/utils/formatTime.ts` — Time formatting utility

## Routes

- `/sign-in` — Login page
- `/dashboard` — Video list + upload (protected)
- `/review/:videoId` — Segment review editor (protected)
- `*` — Redirects to `/dashboard`

## API integration

The backend is an Express/TypeScript server in `../api/`. In dev, Vite proxies `/api` to `http://localhost:8080`. Key endpoints:
- `POST /api/upload/sign` — Get signed GCS upload URL
- `GET /api/videos` — List user's videos
- `POST /api/analyze/:videoId` — Trigger analysis job
- `GET /api/analysis/:videoId` — Fetch analysis results
- `POST /api/save/:videoId` — Save review decisions
- `POST /api/cut/:videoId` — Trigger video cut
- `POST /api/videos/:videoId/transcode` — Trigger transcoding

## Commands

```bash
npm install          # Install dependencies
npm run dev          # Dev server (port 5173, proxies /api to :8080)
npm run build        # Type-check + production build (output: dist/)
npm run lint         # ESLint (flat config, TS + React hooks + React Refresh)
npm run preview      # Preview production build
```

## Conventions

- Dark theme with custom Tailwind v4 `@theme` tokens: `surface-0..3`, `text-primary/secondary/muted`, `accent`, `danger`, `success`
- Named function exports (not default) for components and hooks
- `App.tsx` is the only default export
- All API calls authenticated via Firebase ID token — no anonymous access
- Types centralized in `src/types/index.ts`
- Firestore used for real-time job progress tracking (`useJobProgress` hook listens to `jobs` collection)
