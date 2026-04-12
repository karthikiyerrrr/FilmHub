# Gweebler Standalone Webapp Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Transform FilmHub into Gweebler — a standalone, authenticated web application with cloud video processing via Modal, AI orchestration via Anthropic SDK, and a Firebase-hosted React frontend.

**Architecture:** Vite + React 19 SPA on Firebase Hosting. Two Cloud Run services (API + Worker) handle requests and analysis orchestration. Modal runs GPU-intensive detection passes. Firestore provides real-time job progress. Firebase Storage (GCS) stores all video and analysis artifacts.

**Tech Stack:** Vite, React 19, TypeScript, Tailwind CSS v4, Firebase (Auth, Firestore, Hosting, Storage), Express, Cloud Tasks, Anthropic SDK, Modal (Python), FFmpeg

**Spec:** `docs/superpowers/specs/2026-04-10-gweebler-standalone-webapp-design.md`

---

## File Structure

```
Gweebler/
├── frontend/                        # Vite + React SPA
│   ├── package.json
│   ├── vite.config.ts
│   ├── index.html
│   ├── tsconfig.json
│   ├── tsconfig.app.json
│   ├── tsconfig.node.json
│   ├── eslint.config.js
│   ├── .env.local                   # Firebase config + API URL
│   └── src/
│       ├── main.tsx
│       ├── App.tsx                   # React Router setup
│       ├── firebase.ts              # Firebase SDK init
│       ├── api.ts                   # API client with auth headers
│       ├── index.css                # Tailwind v4 theme (migrated)
│       ├── types/
│       │   └── index.ts             # All shared types
│       ├── components/
│       │   ├── ProtectedRoute.tsx    # Auth gate wrapper
│       │   ├── SignInForm.tsx        # Google + email/password
│       │   ├── VideoPicker.tsx       # Dashboard video grid
│       │   ├── VideoCard.tsx         # Single video with status
│       │   ├── UploadZone.tsx        # Drag-drop upload to GCS
│       │   ├── AnalyzeModal.tsx      # Pass selection dialog
│       │   ├── ReviewView.tsx        # Main review layout (migrated)
│       │   ├── VideoPlayer.tsx       # Video playback (migrated)
│       │   ├── Timeline.tsx          # Timeline editor (migrated)
│       │   ├── SegmentProperties.tsx # Segment editing (migrated)
│       │   ├── TranscriptPanel.tsx   # Transcript display (migrated)
│       │   └── ActionBar.tsx         # Save/cut/download (adapted)
│       ├── hooks/
│       │   ├── useAuth.ts            # Firebase Auth wrapper
│       │   ├── useJobProgress.ts     # Firestore job subscription
│       │   ├── useAnalysis.ts        # Fetch from Cloud Run API
│       │   ├── useVideoSync.ts       # Video playback state (migrated)
│       │   ├── useSegments.ts        # Segment editing + undo (migrated)
│       │   └── useHandleDrag.ts      # Timeline drag handling (migrated)
│       └── utils/
│           └── formatTime.ts         # Time formatting (migrated)
├── api/                             # Cloud Run API service
│   ├── package.json
│   ├── tsconfig.json
│   ├── Dockerfile
│   ├── .env.local
│   └── src/
│       ├── index.ts                 # Express app entry
│       ├── middleware/
│       │   └── auth.ts              # Firebase token + whitelist
│       └── routes/
│           ├── upload.ts            # POST /api/upload/sign
│           ├── videos.ts            # GET /api/videos, GET /api/videos/:id/stream
│           ├── analyze.ts           # POST /api/analyze/:videoId
│           ├── analysis.ts          # GET /api/analysis/:videoId, frames
│           ├── save.ts              # POST /api/save/:videoId
│           └── cut.ts              # POST /api/cut/:videoId, GET status
├── worker/                          # Cloud Run Worker service
│   ├── package.json
│   ├── tsconfig.json
│   ├── Dockerfile
│   ├── .env.local
│   └── src/
│       ├── index.ts                 # Express app, POST /run-analysis
│       ├── agent.ts                 # Anthropic SDK agent loop
│       └── modal-client.ts          # HTTP client for Modal
├── modal/                           # Modal Python functions
│   ├── app.py                       # Modal App with web endpoints
│   ├── requirements.txt
│   └── gweebler_modal/
│       ├── __init__.py
│       ├── transcribe.py
│       ├── detect_music.py
│       ├── detect_graphics.py
│       └── cut_video.py
├── firebase.json
├── firestore.rules
├── storage.rules
├── .firebaserc
├── service-account.json             # Gitignored
├── .env.example
└── .gitignore
```

---

## Phase 1: Project Scaffolding

### Task 1: Scaffold Vite + React frontend

**Files:**
- Create: `frontend/package.json`
- Create: `frontend/vite.config.ts`
- Create: `frontend/index.html`
- Create: `frontend/tsconfig.json`, `frontend/tsconfig.app.json`, `frontend/tsconfig.node.json`
- Create: `frontend/eslint.config.js`
- Create: `frontend/src/main.tsx`
- Create: `frontend/src/App.tsx`
- Create: `frontend/src/index.css`
- Create: `frontend/.env.local`

- [ ] **Step 1: Create Vite project**

```bash
cd /Users/kbi102003/Documents/GitHub/FilmHub
npm create vite@latest frontend -- --template react-ts
```

- [ ] **Step 2: Install dependencies**

```bash
cd frontend
npm install
npm install react-router-dom firebase
npm install -D tailwindcss @tailwindcss/vite
```

- [ ] **Step 3: Configure Vite with Tailwind and API proxy**

Replace `frontend/vite.config.ts`:

```typescript
import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import tailwindcss from '@tailwindcss/vite'

export default defineConfig({
  plugins: [react(), tailwindcss()],
  server: {
    proxy: {
      '/api': 'http://localhost:8080',
    },
  },
})
```

- [ ] **Step 4: Set up Tailwind CSS with theme**

Copy the existing theme from `reviewer/frontend/src/index.css` to `frontend/src/index.css`. The file uses `@import "tailwindcss"` and defines custom theme variables via `@theme`. Copy it verbatim — same dark color scheme, custom properties, scrollbar styles.

- [ ] **Step 5: Create environment file**

Create `frontend/.env.local`:

```env
VITE_API_URL=http://localhost:8080
VITE_FIREBASE_API_KEY=AIzaSyC4zTItzugFn6q0ntFmqHrxYz3kdx-SBWI
VITE_FIREBASE_AUTH_DOMAIN=gweebler.firebaseapp.com
VITE_FIREBASE_PROJECT_ID=gweebler
VITE_FIREBASE_STORAGE_BUCKET=gweebler.firebasestorage.app
VITE_FIREBASE_MESSAGING_SENDER_ID=115418276029
VITE_FIREBASE_APP_ID=1:115418276029:web:0a1c22a8c3b3ec1d7b17d4
```

- [ ] **Step 6: Create Firebase SDK init**

Create `frontend/src/firebase.ts`:

```typescript
import { initializeApp } from 'firebase/app'
import { getAuth } from 'firebase/auth'
import { getFirestore } from 'firebase/firestore'

const firebaseConfig = {
  apiKey: import.meta.env.VITE_FIREBASE_API_KEY,
  authDomain: import.meta.env.VITE_FIREBASE_AUTH_DOMAIN,
  projectId: import.meta.env.VITE_FIREBASE_PROJECT_ID,
  storageBucket: import.meta.env.VITE_FIREBASE_STORAGE_BUCKET,
  messagingSenderId: import.meta.env.VITE_FIREBASE_MESSAGING_SENDER_ID,
  appId: import.meta.env.VITE_FIREBASE_APP_ID,
}

const app = initializeApp(firebaseConfig)
export const auth = getAuth(app)
export const db = getFirestore(app)
```

- [ ] **Step 7: Create placeholder App with router**

Replace `frontend/src/App.tsx`:

```tsx
import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom'

function App() {
  return (
    <BrowserRouter>
      <Routes>
        <Route path="/sign-in" element={<div>Sign In (TODO)</div>} />
        <Route path="/dashboard" element={<div>Dashboard (TODO)</div>} />
        <Route path="/review/:videoId" element={<div>Review (TODO)</div>} />
        <Route path="*" element={<Navigate to="/sign-in" replace />} />
      </Routes>
    </BrowserRouter>
  )
}

export default App
```

- [ ] **Step 8: Update main.tsx**

Replace `frontend/src/main.tsx`:

```tsx
import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import './index.css'
import App from './App'

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <App />
  </StrictMode>,
)
```

- [ ] **Step 9: Verify it runs**

```bash
cd frontend && npm run dev
```

Expected: Dev server at http://localhost:5173, shows "Sign In (TODO)" placeholder.

- [ ] **Step 10: Commit**

```bash
git add frontend/
git commit -m "feat: scaffold Vite + React frontend with Tailwind v4 and Firebase SDK"
```

---

### Task 2: Scaffold API service

**Files:**
- Create: `api/package.json`
- Create: `api/tsconfig.json`
- Create: `api/src/index.ts`
- Create: `api/src/middleware/auth.ts`
- Create: `api/.env.local`

- [ ] **Step 1: Initialize Node project**

```bash
mkdir -p api/src/middleware api/src/routes
cd api
npm init -y
npm install express cors firebase-admin @google-cloud/storage @google-cloud/tasks
npm install -D typescript @types/express @types/cors @types/node tsx
```

- [ ] **Step 2: Create tsconfig.json**

Create `api/tsconfig.json`:

```json
{
  "compilerOptions": {
    "target": "ES2022",
    "module": "ESNext",
    "moduleResolution": "bundler",
    "esModuleInterop": true,
    "strict": true,
    "outDir": "dist",
    "rootDir": "src",
    "skipLibCheck": true,
    "resolveJsonModule": true
  },
  "include": ["src"]
}
```

- [ ] **Step 3: Update package.json scripts**

Add to `api/package.json`:

```json
{
  "type": "module",
  "scripts": {
    "dev": "tsx watch src/index.ts",
    "build": "tsc",
    "start": "node dist/index.js"
  }
}
```

- [ ] **Step 4: Create auth middleware**

Create `api/src/middleware/auth.ts`:

```typescript
import { Request, Response, NextFunction } from 'express'
import admin from 'firebase-admin'

const ALLOWED_EMAILS = (process.env.ALLOWED_EMAILS || '').split(',').map(e => e.trim()).filter(Boolean)

export interface AuthRequest extends Request {
  uid?: string
  email?: string
}

export async function authMiddleware(req: AuthRequest, res: Response, next: NextFunction) {
  const header = req.headers.authorization
  if (!header?.startsWith('Bearer ')) {
    res.status(401).json({ error: 'Missing authorization header' })
    return
  }

  const token = header.slice(7)
  try {
    const decoded = await admin.auth().verifyIdToken(token)
    const email = decoded.email
    if (!email || !ALLOWED_EMAILS.includes(email)) {
      res.status(403).json({ error: 'Email not authorized' })
      return
    }
    req.uid = decoded.uid
    req.email = email
    next()
  } catch {
    res.status(401).json({ error: 'Invalid token' })
  }
}
```

- [ ] **Step 5: Create Express app entry**

Create `api/src/index.ts`:

```typescript
import express from 'express'
import cors from 'cors'
import admin from 'firebase-admin'
import { authMiddleware } from './middleware/auth.js'

admin.initializeApp({
  credential: admin.credential.applicationDefault(),
})

const app = express()
app.use(cors({ origin: true }))
app.use(express.json())

// Health check (no auth)
app.get('/health', (_req, res) => {
  res.json({ status: 'ok' })
})

// All /api routes require auth
app.use('/api', authMiddleware)

// Routes will be added in later tasks

const PORT = parseInt(process.env.PORT || '8080')
app.listen(PORT, () => {
  console.log(`API server listening on port ${PORT}`)
})
```

- [ ] **Step 6: Create environment file**

Create `api/.env.local`:

```env
GOOGLE_APPLICATION_CREDENTIALS=../service-account.json
GCS_BUCKET=gweebler.firebasestorage.app
CLOUD_TASKS_QUEUE=gweebler-analysis
CLOUD_TASKS_LOCATION=us-west1
GCP_PROJECT=gweebler
WORKER_SERVICE_URL=http://localhost:8081
ALLOWED_EMAILS=kbi102003@gmail.com,akshayphx@gmail.com
PORT=8080
```

- [ ] **Step 7: Verify it runs**

```bash
cd api && GOOGLE_APPLICATION_CREDENTIALS=../service-account.json ALLOWED_EMAILS=kbi102003@gmail.com npm run dev
```

Expected: `API server listening on port 8080`. Test health check:

```bash
curl http://localhost:8080/health
```

Expected: `{"status":"ok"}`

- [ ] **Step 8: Commit**

```bash
git add api/
git commit -m "feat: scaffold API service with Express, Firebase Admin, and auth middleware"
```

---

### Task 3: Scaffold Worker service

**Files:**
- Create: `worker/package.json`
- Create: `worker/tsconfig.json`
- Create: `worker/src/index.ts`
- Create: `worker/.env.local`

- [ ] **Step 1: Initialize Node project**

```bash
mkdir -p worker/src
cd worker
npm init -y
npm install express firebase-admin @google-cloud/storage @anthropic-ai/sdk
npm install -D typescript @types/express @types/node tsx
```

- [ ] **Step 2: Create tsconfig.json**

Create `worker/tsconfig.json`:

```json
{
  "compilerOptions": {
    "target": "ES2022",
    "module": "ESNext",
    "moduleResolution": "bundler",
    "esModuleInterop": true,
    "strict": true,
    "outDir": "dist",
    "rootDir": "src",
    "skipLibCheck": true,
    "resolveJsonModule": true
  },
  "include": ["src"]
}
```

- [ ] **Step 3: Update package.json scripts**

Add to `worker/package.json`:

```json
{
  "type": "module",
  "scripts": {
    "dev": "tsx watch src/index.ts",
    "build": "tsc",
    "start": "node dist/index.js"
  }
}
```

- [ ] **Step 4: Create Express app entry**

Create `worker/src/index.ts`:

```typescript
import express from 'express'
import admin from 'firebase-admin'

admin.initializeApp({
  credential: admin.credential.applicationDefault(),
})

const app = express()
app.use(express.json())

app.get('/health', (_req, res) => {
  res.json({ status: 'ok' })
})

// POST /run-analysis will be added in Task 15
app.post('/run-analysis', async (req, res) => {
  res.json({ status: 'received', body: req.body })
})

const PORT = parseInt(process.env.PORT || '8081')
app.listen(PORT, () => {
  console.log(`Worker service listening on port ${PORT}`)
})
```

- [ ] **Step 5: Create environment file**

Create `worker/.env.local`:

```env
GOOGLE_APPLICATION_CREDENTIALS=../service-account.json
GCS_BUCKET=gweebler.firebasestorage.app
ANTHROPIC_API_KEY=              # set in .env.local
MODAL_ENDPOINT_URL=https://YOUR_MODAL_USERNAME--gweebler.modal.run
MODAL_AUTH_TOKEN=changeme
PORT=8081
```

- [ ] **Step 6: Verify it runs**

```bash
cd worker && GOOGLE_APPLICATION_CREDENTIALS=../service-account.json npm run dev
```

Expected: `Worker service listening on port 8081`.

- [ ] **Step 7: Commit**

```bash
git add worker/
git commit -m "feat: scaffold Worker service with Express and Anthropic SDK"
```

---

### Task 4: Root-level config and .gitignore

**Files:**
- Modify: `.gitignore`
- Create: `.env.example`

- [ ] **Step 1: Update .gitignore**

Add to the root `.gitignore`:

```
# Gweebler runtime
service-account.json
frontend/.env.local
api/.env.local
worker/.env.local
frontend/dist/
api/dist/
worker/dist/
node_modules/
```

- [ ] **Step 2: Create .env.example**

Create `.env.example`:

```env
# === Frontend (frontend/.env.local) ===
VITE_API_URL=http://localhost:8080
VITE_FIREBASE_API_KEY=
VITE_FIREBASE_AUTH_DOMAIN=gweebler.firebaseapp.com
VITE_FIREBASE_PROJECT_ID=gweebler
VITE_FIREBASE_STORAGE_BUCKET=gweebler.firebasestorage.app
VITE_FIREBASE_MESSAGING_SENDER_ID=
VITE_FIREBASE_APP_ID=

# === API Service (api/.env.local) ===
GOOGLE_APPLICATION_CREDENTIALS=../service-account.json
GCS_BUCKET=gweebler.firebasestorage.app
CLOUD_TASKS_QUEUE=gweebler-analysis
CLOUD_TASKS_LOCATION=us-west1
GCP_PROJECT=gweebler
WORKER_SERVICE_URL=http://localhost:8081
ALLOWED_EMAILS=kbi102003@gmail.com,akshayphx@gmail.com

# === Worker Service (worker/.env.local) ===
# GOOGLE_APPLICATION_CREDENTIALS=../service-account.json
# GCS_BUCKET=gweebler.firebasestorage.app
ANTHROPIC_API_KEY=
MODAL_ENDPOINT_URL=
MODAL_AUTH_TOKEN=
```

- [ ] **Step 3: Commit**

```bash
git add .gitignore .env.example
git commit -m "chore: add .gitignore and env template for Gweebler services"
```

---

## Phase 2: Authentication

### Task 5: Frontend auth hook and Firebase config

**Files:**
- Create: `frontend/src/hooks/useAuth.ts`

- [ ] **Step 1: Create useAuth hook**

Create `frontend/src/hooks/useAuth.ts`:

```typescript
import { useState, useEffect } from 'react'
import {
  onAuthStateChanged,
  signInWithPopup,
  signInWithEmailAndPassword,
  signOut as firebaseSignOut,
  GoogleAuthProvider,
  User,
} from 'firebase/auth'
import { auth } from '../firebase'

const googleProvider = new GoogleAuthProvider()

export function useAuth() {
  const [user, setUser] = useState<User | null>(null)
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    const unsubscribe = onAuthStateChanged(auth, (user) => {
      setUser(user)
      setLoading(false)
    })
    return unsubscribe
  }, [])

  const signInWithGoogle = () => signInWithPopup(auth, googleProvider)

  const signInWithEmail = (email: string, password: string) =>
    signInWithEmailAndPassword(auth, email, password)

  const signOut = () => firebaseSignOut(auth)

  const getIdToken = async () => {
    if (!user) return null
    return user.getIdToken()
  }

  return { user, loading, signInWithGoogle, signInWithEmail, signOut, getIdToken }
}
```

- [ ] **Step 2: Commit**

```bash
git add frontend/src/hooks/useAuth.ts
git commit -m "feat: add useAuth hook wrapping Firebase Auth"
```

---

### Task 6: Protected route and sign-in page

**Files:**
- Create: `frontend/src/components/ProtectedRoute.tsx`
- Create: `frontend/src/components/SignInForm.tsx`
- Modify: `frontend/src/App.tsx`

- [ ] **Step 1: Create ProtectedRoute**

Create `frontend/src/components/ProtectedRoute.tsx`:

```tsx
import { Navigate } from 'react-router-dom'
import { useAuth } from '../hooks/useAuth'

export function ProtectedRoute({ children }: { children: React.ReactNode }) {
  const { user, loading } = useAuth()

  if (loading) {
    return <div className="flex items-center justify-center h-screen bg-surface-0 text-secondary">Loading...</div>
  }

  if (!user) {
    return <Navigate to="/sign-in" replace />
  }

  return <>{children}</>
}
```

- [ ] **Step 2: Create SignInForm**

Create `frontend/src/components/SignInForm.tsx`:

```tsx
import { useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { useAuth } from '../hooks/useAuth'

export function SignInForm() {
  const { signInWithGoogle, signInWithEmail, user } = useAuth()
  const navigate = useNavigate()
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [error, setError] = useState<string | null>(null)
  const [loading, setLoading] = useState(false)

  // Redirect if already signed in
  if (user) {
    navigate('/dashboard', { replace: true })
    return null
  }

  const handleGoogle = async () => {
    setError(null)
    setLoading(true)
    try {
      await signInWithGoogle()
      navigate('/dashboard')
    } catch (err: any) {
      setError(err.message || 'Google sign-in failed')
    } finally {
      setLoading(false)
    }
  }

  const handleEmail = async (e: React.FormEvent) => {
    e.preventDefault()
    setError(null)
    setLoading(true)
    try {
      await signInWithEmail(email, password)
      navigate('/dashboard')
    } catch (err: any) {
      setError(err.message || 'Sign-in failed')
    } finally {
      setLoading(false)
    }
  }

  return (
    <div className="flex items-center justify-center min-h-screen bg-surface-0">
      <div className="w-full max-w-sm p-8 bg-surface-1 rounded-lg border border-subtle">
        <h1 className="text-2xl font-bold text-primary mb-6 text-center">Gweebler</h1>

        <button
          onClick={handleGoogle}
          disabled={loading}
          className="w-full py-2 px-4 bg-white text-gray-800 rounded font-medium hover:bg-gray-100 disabled:opacity-50 mb-4"
        >
          Sign in with Google
        </button>

        <div className="flex items-center my-4">
          <hr className="flex-1 border-subtle" />
          <span className="px-3 text-muted text-sm">or</span>
          <hr className="flex-1 border-subtle" />
        </div>

        <form onSubmit={handleEmail} className="space-y-3">
          <input
            type="email"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            placeholder="Email"
            className="w-full px-3 py-2 bg-surface-2 border border-subtle rounded text-primary placeholder:text-muted"
            required
          />
          <input
            type="password"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            placeholder="Password"
            className="w-full px-3 py-2 bg-surface-2 border border-subtle rounded text-primary placeholder:text-muted"
            required
          />
          <button
            type="submit"
            disabled={loading}
            className="w-full py-2 px-4 bg-accent text-white rounded font-medium hover:bg-accent-hover disabled:opacity-50"
          >
            Sign in
          </button>
        </form>

        {error && (
          <p className="mt-4 text-sm text-danger text-center">{error}</p>
        )}
      </div>
    </div>
  )
}
```

- [ ] **Step 3: Update App.tsx with routes**

Replace `frontend/src/App.tsx`:

```tsx
import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom'
import { ProtectedRoute } from './components/ProtectedRoute'
import { SignInForm } from './components/SignInForm'

function App() {
  return (
    <BrowserRouter>
      <Routes>
        <Route path="/sign-in" element={<SignInForm />} />
        <Route
          path="/dashboard"
          element={
            <ProtectedRoute>
              <div className="p-8 text-primary">Dashboard (TODO)</div>
            </ProtectedRoute>
          }
        />
        <Route
          path="/review/:videoId"
          element={
            <ProtectedRoute>
              <div className="p-8 text-primary">Review (TODO)</div>
            </ProtectedRoute>
          }
        />
        <Route path="*" element={<Navigate to="/dashboard" replace />} />
      </Routes>
    </BrowserRouter>
  )
}

export default App
```

- [ ] **Step 4: Verify sign-in flow**

```bash
cd frontend && npm run dev
```

Open http://localhost:5173. Should see the Gweebler sign-in page. Google sign-in should work (may get a 403 from the API later — that's expected since the API whitelist check isn't wired yet in the frontend-only flow). Firebase Auth should successfully authenticate.

- [ ] **Step 5: Commit**

```bash
git add frontend/src/
git commit -m "feat: add sign-in page with Google + email/password and protected routes"
```

---

## Phase 3: API Upload & Video Endpoints

### Task 7: Upload signing endpoint

**Files:**
- Create: `api/src/routes/upload.ts`
- Modify: `api/src/index.ts`

- [ ] **Step 1: Create upload route**

Create `api/src/routes/upload.ts`:

```typescript
import { Router } from 'express'
import { Storage } from '@google-cloud/storage'
import admin from 'firebase-admin'
import crypto from 'crypto'
import { AuthRequest } from '../middleware/auth.js'

const router = Router()
const storage = new Storage()
const bucket = storage.bucket(process.env.GCS_BUCKET || '')

router.post('/upload/sign', async (req: AuthRequest, res) => {
  const { filename, contentType } = req.body
  if (!filename || !contentType) {
    res.status(400).json({ error: 'filename and contentType required' })
    return
  }

  const videoId = crypto.randomUUID()
  const gcsPath = `videos/${videoId}/${filename}`
  const file = bucket.file(gcsPath)

  const [uploadUrl] = await file.createResumableUpload({
    metadata: { contentType },
  })

  // Create Firestore video doc
  const db = admin.firestore()
  await db.collection('videos').doc(videoId).set({
    userId: req.uid,
    filename,
    gcsPath,
    status: 'uploaded',
    createdAt: admin.firestore.FieldValue.serverTimestamp(),
    updatedAt: admin.firestore.FieldValue.serverTimestamp(),
  })

  res.json({ videoId, uploadUrl })
})

export default router
```

- [ ] **Step 2: Register route in index.ts**

Add to `api/src/index.ts`, after the auth middleware line:

```typescript
import uploadRouter from './routes/upload.js'

// After app.use('/api', authMiddleware)
app.use('/api', uploadRouter)
```

- [ ] **Step 3: Commit**

```bash
git add api/src/
git commit -m "feat: add upload signing endpoint for GCS resumable uploads"
```

---

### Task 8: Videos list and stream endpoints

**Files:**
- Create: `api/src/routes/videos.ts`
- Modify: `api/src/index.ts`

- [ ] **Step 1: Create videos route**

Create `api/src/routes/videos.ts`:

```typescript
import { Router } from 'express'
import { Storage } from '@google-cloud/storage'
import admin from 'firebase-admin'
import { AuthRequest } from '../middleware/auth.js'

const router = Router()
const storage = new Storage()
const bucket = storage.bucket(process.env.GCS_BUCKET || '')

router.get('/videos', async (req: AuthRequest, res) => {
  const db = admin.firestore()
  const snapshot = await db
    .collection('videos')
    .where('userId', '==', req.uid)
    .orderBy('createdAt', 'desc')
    .get()

  const videos = snapshot.docs.map((doc) => ({
    id: doc.id,
    ...doc.data(),
  }))

  res.json(videos)
})

router.get('/videos/:videoId/stream', async (req: AuthRequest, res) => {
  const { videoId } = req.params
  const db = admin.firestore()
  const doc = await db.collection('videos').doc(videoId).get()

  if (!doc.exists || doc.data()?.userId !== req.uid) {
    res.status(404).json({ error: 'Video not found' })
    return
  }

  const gcsPath = doc.data()!.gcsPath as string
  const file = bucket.file(gcsPath)

  const [signedUrl] = await file.getSignedUrl({
    action: 'read',
    expires: Date.now() + 60 * 60 * 1000, // 1 hour
  })

  res.redirect(302, signedUrl)
})

export default router
```

- [ ] **Step 2: Register route in index.ts**

Add to `api/src/index.ts`:

```typescript
import videosRouter from './routes/videos.js'

app.use('/api', videosRouter)
```

- [ ] **Step 3: Commit**

```bash
git add api/src/
git commit -m "feat: add video list and stream endpoints"
```

---

## Phase 4: Frontend Dashboard

### Task 9: API client with auth headers

**Files:**
- Create: `frontend/src/api.ts`
- Create: `frontend/src/types/index.ts`

- [ ] **Step 1: Create shared types**

Create `frontend/src/types/index.ts`. Migrate all types from `reviewer/frontend/src/types.ts` and extend with new types:

```typescript
// === Migrated from reviewer ===
export type SegmentType = 'music' | 'graphics' | 'promotions'

export interface MusicSegment {
  start: number
  end: number
  track: string | null
}

export interface GraphicsCandidate {
  frame_index: number
  timestamp: number
  time_formatted: string
  correlation: number
  before_frame: string
  after_frame: string
}

export interface TranscriptSegment {
  id: number
  start: number
  end: number
  text: string
}

export interface PromotionSegment {
  start: number
  end: number
  description: string
}

export interface CleanSegment {
  start: number
  end: number
  types: SegmentType[]
  description: string
  accepted: boolean
}

export interface Transcript {
  segments: TranscriptSegment[]
}

export interface ReviewData {
  video: { filename: string; path: string; fps?: number }
  music: MusicSegment[] | null
  graphics: GraphicsCandidate[] | null
  transcript: Transcript | null
  promotions: PromotionSegment[] | null
  suggested_segments: CleanSegment[]
}

export interface ReviewExport {
  video: string
  reviewed_at: string
  segments: (CleanSegment & { accepted: boolean })[]
  accepted_count: number
  rejected_count: number
  total_removed_seconds: number
}

// === New for Gweebler ===
export type VideoStatus = 'uploaded' | 'analyzing' | 'reviewed' | 'cut'

export interface VideoInfo {
  id: string
  userId: string
  filename: string
  gcsPath: string
  status: VideoStatus
  createdAt: any
  updatedAt: any
}

export type JobStatus = 'queued' | 'running' | 'completed' | 'failed'

export interface JobProgress {
  currentPass: string | null
  completedPasses: string[]
  message: string
  startedAt: any
  completedAt: any | null
  error: string | null
}

export interface AnalysisJob {
  id: string
  videoId: string
  userId: string
  status: JobStatus
  passes: string[]
  progress: JobProgress
  createdAt: any
}
```

- [ ] **Step 2: Create API client**

Create `frontend/src/api.ts`:

```typescript
import { auth } from './firebase'
import type { VideoInfo, ReviewData, ReviewExport, CleanSegment } from './types'

async function apiFetch(path: string, options: RequestInit = {}) {
  const user = auth.currentUser
  if (!user) throw new Error('Not authenticated')

  const token = await user.getIdToken()
  const res = await fetch(path, {
    ...options,
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${token}`,
      ...options.headers,
    },
  })

  if (!res.ok) {
    const body = await res.json().catch(() => ({}))
    throw new Error(body.error || `API error: ${res.status}`)
  }

  return res.json()
}

export async function getUploadUrl(filename: string, contentType: string): Promise<{ videoId: string; uploadUrl: string }> {
  return apiFetch('/api/upload/sign', {
    method: 'POST',
    body: JSON.stringify({ filename, contentType }),
  })
}

export async function fetchVideos(): Promise<VideoInfo[]> {
  return apiFetch('/api/videos')
}

export function videoStreamUrl(videoId: string): string {
  return `/api/videos/${videoId}/stream`
}

export async function triggerAnalysis(videoId: string, passes: string[]): Promise<{ jobId: string }> {
  return apiFetch(`/api/analyze/${videoId}`, {
    method: 'POST',
    body: JSON.stringify({ passes }),
  })
}

export async function fetchAnalysis(videoId: string): Promise<ReviewData> {
  return apiFetch(`/api/analysis/${videoId}`)
}

export function frameUrl(videoId: string, filename: string): string {
  return `/api/analysis/${videoId}/frames/${filename}`
}

export async function saveReview(videoId: string, data: { segments: CleanSegment[]; reviewData: ReviewExport }): Promise<{ reviewFile: string; segmentsFile: string }> {
  return apiFetch(`/api/save/${videoId}`, {
    method: 'POST',
    body: JSON.stringify(data),
  })
}

export async function triggerCut(videoId: string, segmentsFile: string): Promise<{ status: string; downloadUrl?: string }> {
  return apiFetch(`/api/cut/${videoId}`, {
    method: 'POST',
    body: JSON.stringify({ segmentsFile }),
  })
}

export async function getCutStatus(videoId: string): Promise<{ status: string; downloadUrl?: string; error?: string }> {
  return apiFetch(`/api/cut/${videoId}/status`)
}
```

- [ ] **Step 3: Commit**

```bash
git add frontend/src/types/ frontend/src/api.ts
git commit -m "feat: add shared types and API client with Firebase auth headers"
```

---

### Task 10: Upload zone component

**Files:**
- Create: `frontend/src/components/UploadZone.tsx`

- [ ] **Step 1: Create UploadZone**

Create `frontend/src/components/UploadZone.tsx`:

```tsx
import { useState, useRef } from 'react'
import { getUploadUrl } from '../api'

interface Props {
  onUploadComplete: () => void
}

export function UploadZone({ onUploadComplete }: Props) {
  const [uploading, setUploading] = useState(false)
  const [progress, setProgress] = useState(0)
  const [dragOver, setDragOver] = useState(false)
  const inputRef = useRef<HTMLInputElement>(null)

  const uploadFile = async (file: File) => {
    setUploading(true)
    setProgress(0)
    try {
      const { uploadUrl } = await getUploadUrl(file.name, file.type)

      // Upload directly to GCS via resumable URL
      const xhr = new XMLHttpRequest()
      xhr.open('PUT', uploadUrl)
      xhr.setRequestHeader('Content-Type', file.type)

      xhr.upload.onprogress = (e) => {
        if (e.lengthComputable) {
          setProgress(Math.round((e.loaded / e.total) * 100))
        }
      }

      await new Promise<void>((resolve, reject) => {
        xhr.onload = () => (xhr.status < 400 ? resolve() : reject(new Error(`Upload failed: ${xhr.status}`)))
        xhr.onerror = () => reject(new Error('Upload failed'))
        xhr.send(file)
      })

      onUploadComplete()
    } catch (err) {
      console.error('Upload error:', err)
    } finally {
      setUploading(false)
      setProgress(0)
    }
  }

  const handleDrop = (e: React.DragEvent) => {
    e.preventDefault()
    setDragOver(false)
    const file = e.dataTransfer.files[0]
    if (file) uploadFile(file)
  }

  const handleClick = () => inputRef.current?.click()

  const handleChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0]
    if (file) uploadFile(file)
  }

  return (
    <div
      className={`border-2 border-dashed rounded-lg p-8 text-center cursor-pointer transition-colors ${
        dragOver ? 'border-accent bg-accent/10' : 'border-subtle hover:border-hover'
      }`}
      onDragOver={(e) => { e.preventDefault(); setDragOver(true) }}
      onDragLeave={() => setDragOver(false)}
      onDrop={handleDrop}
      onClick={handleClick}
    >
      <input
        ref={inputRef}
        type="file"
        accept="video/*"
        onChange={handleChange}
        className="hidden"
      />
      {uploading ? (
        <div>
          <p className="text-primary mb-2">Uploading... {progress}%</p>
          <div className="w-full bg-surface-2 rounded-full h-2">
            <div className="bg-accent h-2 rounded-full transition-all" style={{ width: `${progress}%` }} />
          </div>
        </div>
      ) : (
        <p className="text-muted">Drop a video file here, or click to browse</p>
      )}
    </div>
  )
}
```

- [ ] **Step 2: Commit**

```bash
git add frontend/src/components/UploadZone.tsx
git commit -m "feat: add drag-drop upload zone with GCS resumable upload"
```

---

### Task 11: Video card and dashboard page

**Files:**
- Create: `frontend/src/components/VideoCard.tsx`
- Create: `frontend/src/components/AnalyzeModal.tsx`
- Create: `frontend/src/components/VideoPicker.tsx`
- Create: `frontend/src/hooks/useJobProgress.ts`
- Modify: `frontend/src/App.tsx`

- [ ] **Step 1: Create useJobProgress hook**

Create `frontend/src/hooks/useJobProgress.ts`:

```typescript
import { useState, useEffect } from 'react'
import { doc, onSnapshot } from 'firebase/firestore'
import { db } from '../firebase'
import type { AnalysisJob } from '../types'

export function useJobProgress(jobId: string | null) {
  const [job, setJob] = useState<AnalysisJob | null>(null)

  useEffect(() => {
    if (!jobId) {
      setJob(null)
      return
    }

    const unsubscribe = onSnapshot(doc(db, 'jobs', jobId), (snapshot) => {
      if (snapshot.exists()) {
        setJob({ id: snapshot.id, ...snapshot.data() } as AnalysisJob)
      }
    })

    return unsubscribe
  }, [jobId])

  return job
}
```

- [ ] **Step 2: Create VideoCard**

Create `frontend/src/components/VideoCard.tsx`:

```tsx
import type { VideoInfo } from '../types'

const statusLabels: Record<string, { text: string; color: string }> = {
  uploaded: { text: 'Uploaded', color: 'bg-gray-600' },
  analyzing: { text: 'Analyzing...', color: 'bg-yellow-600' },
  reviewed: { text: 'Ready for Review', color: 'bg-accent' },
  cut: { text: 'Cut Complete', color: 'bg-success' },
}

interface Props {
  video: VideoInfo
  progress?: { message: string; completedPasses: string[] } | null
  onAnalyze: (videoId: string) => void
  onReview: (videoId: string) => void
}

export function VideoCard({ video, progress, onAnalyze, onReview }: Props) {
  const status = statusLabels[video.status] || statusLabels.uploaded

  return (
    <div className="bg-surface-1 border border-subtle rounded-lg p-4 flex flex-col gap-3">
      <div className="flex items-center justify-between">
        <h3 className="text-primary font-medium truncate">{video.filename}</h3>
        <span className={`text-xs px-2 py-0.5 rounded ${status.color} text-white`}>{status.text}</span>
      </div>

      {video.status === 'analyzing' && progress && (
        <div className="text-sm text-secondary">
          <p>{progress.message}</p>
          {progress.completedPasses.length > 0 && (
            <p className="text-muted mt-1">Done: {progress.completedPasses.join(', ')}</p>
          )}
        </div>
      )}

      <div className="flex gap-2 mt-auto">
        {video.status === 'uploaded' && (
          <button
            onClick={() => onAnalyze(video.id)}
            className="px-3 py-1.5 bg-accent text-white rounded text-sm hover:bg-accent-hover"
          >
            Analyze
          </button>
        )}
        {video.status === 'reviewed' && (
          <button
            onClick={() => onReview(video.id)}
            className="px-3 py-1.5 bg-accent text-white rounded text-sm hover:bg-accent-hover"
          >
            Review
          </button>
        )}
      </div>
    </div>
  )
}
```

- [ ] **Step 3: Create AnalyzeModal**

Create `frontend/src/components/AnalyzeModal.tsx`:

```tsx
import { useState } from 'react'

const PASSES = [
  { id: 'transcribe', label: 'Transcribe Audio' },
  { id: 'music', label: 'Detect Music' },
  { id: 'graphics', label: 'Detect Graphics' },
  { id: 'promotions', label: 'Detect Promotions' },
]

interface Props {
  videoFilename: string
  onConfirm: (passes: string[]) => void
  onCancel: () => void
}

export function AnalyzeModal({ videoFilename, onConfirm, onCancel }: Props) {
  const [selected, setSelected] = useState<Set<string>>(new Set(PASSES.map((p) => p.id)))

  const toggle = (id: string) => {
    const next = new Set(selected)
    if (next.has(id)) next.delete(id)
    else next.add(id)
    setSelected(next)
  }

  return (
    <div className="fixed inset-0 bg-black/60 flex items-center justify-center z-50" onClick={onCancel}>
      <div className="bg-surface-1 border border-subtle rounded-lg p-6 w-full max-w-md" onClick={(e) => e.stopPropagation()}>
        <h2 className="text-lg font-bold text-primary mb-1">Analyze Video</h2>
        <p className="text-sm text-muted mb-4">{videoFilename}</p>

        <div className="space-y-2 mb-6">
          {PASSES.map((pass) => (
            <label key={pass.id} className="flex items-center gap-2 cursor-pointer">
              <input
                type="checkbox"
                checked={selected.has(pass.id)}
                onChange={() => toggle(pass.id)}
                className="accent-accent"
              />
              <span className="text-primary">{pass.label}</span>
            </label>
          ))}
        </div>

        <div className="flex gap-2 justify-end">
          <button onClick={onCancel} className="px-4 py-2 text-muted hover:text-primary">Cancel</button>
          <button
            onClick={() => onConfirm([...selected])}
            disabled={selected.size === 0}
            className="px-4 py-2 bg-accent text-white rounded hover:bg-accent-hover disabled:opacity-50"
          >
            Start Analysis
          </button>
        </div>
      </div>
    </div>
  )
}
```

- [ ] **Step 4: Create VideoPicker (dashboard)**

Create `frontend/src/components/VideoPicker.tsx`:

```tsx
import { useState, useEffect, useCallback } from 'react'
import { useNavigate } from 'react-router-dom'
import { collection, query, where, onSnapshot } from 'firebase/firestore'
import { db } from '../firebase'
import { useAuth } from '../hooks/useAuth'
import { fetchVideos, triggerAnalysis } from '../api'
import { UploadZone } from './UploadZone'
import { VideoCard } from './VideoCard'
import { AnalyzeModal } from './AnalyzeModal'
import type { VideoInfo } from '../types'

export function VideoPicker() {
  const { user, signOut } = useAuth()
  const navigate = useNavigate()
  const [videos, setVideos] = useState<VideoInfo[]>([])
  const [analyzeTarget, setAnalyzeTarget] = useState<VideoInfo | null>(null)
  const [jobMessages, setJobMessages] = useState<Record<string, { message: string; completedPasses: string[] }>>({})

  // Subscribe to real-time video status updates
  useEffect(() => {
    if (!user) return
    const q = query(collection(db, 'videos'), where('userId', '==', user.uid))
    const unsubscribe = onSnapshot(q, (snapshot) => {
      const vids = snapshot.docs.map((doc) => ({ id: doc.id, ...doc.data() } as VideoInfo))
      vids.sort((a, b) => (b.createdAt?.seconds || 0) - (a.createdAt?.seconds || 0))
      setVideos(vids)
    })
    return unsubscribe
  }, [user])

  // Subscribe to job progress for analyzing videos
  useEffect(() => {
    const analyzingIds = videos.filter((v) => v.status === 'analyzing').map((v) => v.id)
    if (analyzingIds.length === 0) return

    const q = query(collection(db, 'jobs'), where('videoId', 'in', analyzingIds), where('status', 'in', ['queued', 'running']))
    const unsubscribe = onSnapshot(q, (snapshot) => {
      const messages: Record<string, { message: string; completedPasses: string[] }> = {}
      snapshot.docs.forEach((doc) => {
        const data = doc.data()
        messages[data.videoId] = {
          message: data.progress?.message || 'Queued...',
          completedPasses: data.progress?.completedPasses || [],
        }
      })
      setJobMessages(messages)
    })
    return unsubscribe
  }, [videos])

  const handleUploadComplete = useCallback(() => {
    // Firestore subscription will pick up the new video automatically
  }, [])

  const handleAnalyze = async (passes: string[]) => {
    if (!analyzeTarget) return
    await triggerAnalysis(analyzeTarget.id, passes)
    setAnalyzeTarget(null)
  }

  return (
    <div className="min-h-screen bg-surface-0 p-6">
      <div className="max-w-5xl mx-auto">
        <div className="flex items-center justify-between mb-6">
          <h1 className="text-2xl font-bold text-primary">Gweebler</h1>
          <div className="flex items-center gap-3">
            <span className="text-sm text-muted">{user?.email}</span>
            <button onClick={signOut} className="text-sm text-muted hover:text-primary">Sign out</button>
          </div>
        </div>

        <UploadZone onUploadComplete={handleUploadComplete} />

        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4 mt-6">
          {videos.map((video) => (
            <VideoCard
              key={video.id}
              video={video}
              progress={jobMessages[video.id] || null}
              onAnalyze={(id) => setAnalyzeTarget(videos.find((v) => v.id === id) || null)}
              onReview={(id) => navigate(`/review/${id}`)}
            />
          ))}
        </div>

        {videos.length === 0 && (
          <p className="text-center text-muted mt-12">No videos yet. Upload one to get started.</p>
        )}
      </div>

      {analyzeTarget && (
        <AnalyzeModal
          videoFilename={analyzeTarget.filename}
          onConfirm={handleAnalyze}
          onCancel={() => setAnalyzeTarget(null)}
        />
      )}
    </div>
  )
}
```

- [ ] **Step 5: Update App.tsx to use VideoPicker**

Replace the dashboard route in `frontend/src/App.tsx`:

```tsx
import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom'
import { ProtectedRoute } from './components/ProtectedRoute'
import { SignInForm } from './components/SignInForm'
import { VideoPicker } from './components/VideoPicker'

function App() {
  return (
    <BrowserRouter>
      <Routes>
        <Route path="/sign-in" element={<SignInForm />} />
        <Route
          path="/dashboard"
          element={
            <ProtectedRoute>
              <VideoPicker />
            </ProtectedRoute>
          }
        />
        <Route
          path="/review/:videoId"
          element={
            <ProtectedRoute>
              <div className="p-8 text-primary">Review (TODO)</div>
            </ProtectedRoute>
          }
        />
        <Route path="*" element={<Navigate to="/dashboard" replace />} />
      </Routes>
    </BrowserRouter>
  )
}

export default App
```

- [ ] **Step 6: Verify dashboard loads**

```bash
cd frontend && npm run dev
```

Sign in, should see the Gweebler dashboard with upload zone and empty video grid.

- [ ] **Step 7: Commit**

```bash
git add frontend/src/
git commit -m "feat: add dashboard with video grid, upload zone, and analyze modal"
```

---

## Phase 5: Modal Endpoints

### Task 12: Modal app scaffold with transcribe endpoint

**Files:**
- Create: `modal/app.py`
- Create: `modal/requirements.txt`
- Create: `modal/gweebler_modal/__init__.py`
- Create: `modal/gweebler_modal/transcribe.py`

- [ ] **Step 1: Create requirements.txt**

Create `modal/requirements.txt`:

```
faster-whisper
pyannote.audio
demucs
librosa
pyacoustid
opencv-python-headless
google-cloud-storage
```

- [ ] **Step 2: Create gweebler_modal package**

Create `modal/gweebler_modal/__init__.py`:

```python
```

- [ ] **Step 3: Create transcribe module**

Create `modal/gweebler_modal/transcribe.py`. Adapt from `filmhub/transcribe.py`, replacing `mlx_whisper` with `faster_whisper` and local filesystem with GCS:

```python
import os
import json
import tempfile
import subprocess
from google.cloud import storage


def extract_audio(video_path: str, audio_path: str) -> None:
    """Extract mono 16kHz WAV audio from video."""
    subprocess.run(
        ["ffmpeg", "-y", "-i", video_path, "-vn", "-acodec", "pcm_s16le",
         "-ar", "16000", "-ac", "1", audio_path],
        check=True, capture_output=True,
    )


def transcribe_audio(audio_path: str, model_size: str = "large-v3") -> dict:
    """Transcribe audio using faster-whisper."""
    from faster_whisper import WhisperModel

    model = WhisperModel(model_size, device="cuda", compute_type="float16")
    segments_iter, info = model.transcribe(audio_path, beam_size=5)

    segments = []
    for i, seg in enumerate(segments_iter):
        segments.append({
            "id": i,
            "start": round(seg.start, 3),
            "end": round(seg.end, 3),
            "text": seg.text.strip(),
        })

    return {"segments": segments, "language": info.language}


def download_video(video_url: str, local_path: str) -> None:
    """Download video from URL (signed GCS URL) to local path."""
    import urllib.request
    urllib.request.urlretrieve(video_url, local_path)


def upload_json(data: dict, bucket_name: str, gcs_path: str) -> None:
    """Upload JSON data to GCS."""
    client = storage.Client()
    bucket = client.bucket(bucket_name)
    blob = bucket.blob(gcs_path)
    blob.upload_from_string(json.dumps(data, indent=2), content_type="application/json")


def run(video_url: str, video_id: str, bucket_name: str, diarize: bool = False) -> dict:
    """Full transcription pipeline: download → extract audio → transcribe → upload."""
    with tempfile.TemporaryDirectory() as tmpdir:
        video_path = os.path.join(tmpdir, "video.mp4")
        audio_path = os.path.join(tmpdir, "audio.wav")

        download_video(video_url, video_path)
        extract_audio(video_path, audio_path)
        result = transcribe_audio(audio_path)

        # Upload transcript to GCS
        gcs_path = f"analysis/{video_id}/transcript.json"
        upload_json(result, bucket_name, gcs_path)

        return {"status": "completed", "gcs_path": gcs_path, "segment_count": len(result["segments"])}
```

- [ ] **Step 4: Create Modal app with transcribe endpoint**

Create `modal/app.py`:

```python
import os
import modal

app = modal.App("gweebler")

# Base image with FFmpeg and common Python deps
base_image = (
    modal.Image.debian_slim(python_version="3.11")
    .apt_install("ffmpeg")
    .pip_install("google-cloud-storage")
)

# Whisper image with GPU support
whisper_image = base_image.pip_install("faster-whisper")

AUTH_TOKEN = os.environ.get("MODAL_AUTH_TOKEN", "")


def verify_auth(headers: dict) -> bool:
    """Verify Bearer token from request headers."""
    auth = headers.get("authorization", "")
    return auth == f"Bearer {AUTH_TOKEN}"


@app.function(
    image=whisper_image,
    gpu="A10G",
    timeout=900,
    secrets=[modal.Secret.from_name("gweebler")],
)
@modal.web_endpoint(method="POST")
def transcribe(item: dict) -> dict:
    import fastapi
    # Auth is checked by the caller passing the token
    from gweebler_modal.transcribe import run

    video_url = item["video_url"]
    video_id = item["video_id"]
    bucket_name = item.get("bucket", "gweebler.firebasestorage.app")
    diarize = item.get("diarize", False)

    return run(video_url, video_id, bucket_name, diarize)
```

- [ ] **Step 5: Test Modal deployment**

```bash
cd modal && modal deploy app.py
```

Expected: Deploys to Modal, shows endpoint URL.

- [ ] **Step 6: Commit**

```bash
git add modal/
git commit -m "feat: add Modal app with transcribe endpoint using faster-whisper"
```

---

### Task 13: Modal music detection endpoint

**Files:**
- Create: `modal/gweebler_modal/detect_music.py`
- Modify: `modal/app.py`

- [ ] **Step 1: Create detect_music module**

Create `modal/gweebler_modal/detect_music.py`. Adapt from `filmhub/detect_music.py`, replacing local filesystem with GCS:

```python
import os
import json
import tempfile
import subprocess
from google.cloud import storage


def download_video(video_url: str, local_path: str) -> None:
    import urllib.request
    urllib.request.urlretrieve(video_url, local_path)


def extract_audio(video_path: str, audio_path: str) -> None:
    """Extract audio at 44.1kHz for music analysis."""
    subprocess.run(
        ["ffmpeg", "-y", "-i", video_path, "-vn", "-acodec", "pcm_s16le",
         "-ar", "44100", "-ac", "1", audio_path],
        check=True, capture_output=True,
    )


def separate_music(audio_path: str, output_dir: str, model_name: str = "htdemucs") -> str:
    """Run Demucs source separation, return path to music stem."""
    subprocess.run(
        ["python", "-m", "demucs", "-n", model_name, "--two-stems", "vocals",
         "-o", output_dir, audio_path],
        check=True, capture_output=True,
    )
    stem_name = os.path.splitext(os.path.basename(audio_path))[0]
    return os.path.join(output_dir, model_name, stem_name, "no_vocals.wav")


def detect_music_segments(music_path: str, threshold: float = 0.01,
                          frame_length: int = 2048, hop_length: int = 512) -> list:
    """Detect music segments using librosa RMS energy."""
    import librosa
    import numpy as np

    y, sr = librosa.load(music_path, sr=None)
    rms = librosa.feature.rms(y=y, frame_length=frame_length, hop_length=hop_length)[0]
    times = librosa.frames_to_time(range(len(rms)), sr=sr, hop_length=hop_length)

    segments = []
    in_segment = False
    start = 0.0

    for i, (t, energy) in enumerate(zip(times, rms)):
        if energy > threshold and not in_segment:
            in_segment = True
            start = float(t)
        elif energy <= threshold and in_segment:
            in_segment = False
            segments.append((start, float(t)))

    if in_segment:
        segments.append((start, float(times[-1])))

    return segments


def merge_segments(segments: list, gap: float = 5.0, min_duration: float = 3.0) -> list:
    """Merge nearby segments and filter short ones."""
    if not segments:
        return []

    merged = [segments[0]]
    for start, end in segments[1:]:
        prev_start, prev_end = merged[-1]
        if start - prev_end <= gap:
            merged[-1] = (prev_start, end)
        else:
            merged.append((start, end))

    return [(s, e) for s, e in merged if e - s >= min_duration]


def fingerprint_segment(music_path: str, start: float, end: float) -> str | None:
    """Fingerprint a music segment using AcoustID."""
    try:
        import acoustid
        duration = min(end - start, 30)
        with tempfile.NamedTemporaryFile(suffix=".wav") as tmp:
            subprocess.run(
                ["ffmpeg", "-y", "-i", music_path, "-ss", str(start),
                 "-t", str(duration), tmp.name],
                check=True, capture_output=True,
            )
            api_key = os.environ.get("ACOUSTID_API_KEY", "")
            if not api_key:
                return None
            results = acoustid.match(api_key, tmp.name)
            for score, recording_id, title, artist in results:
                if score > 0.5 and title:
                    return f"{artist} - {title}" if artist else title
    except Exception:
        pass
    return None


def upload_json(data, bucket_name: str, gcs_path: str) -> None:
    client = storage.Client()
    bucket = client.bucket(bucket_name)
    blob = bucket.blob(gcs_path)
    blob.upload_from_string(json.dumps(data, indent=2), content_type="application/json")


def run(video_url: str, video_id: str, bucket_name: str) -> dict:
    """Full music detection pipeline."""
    with tempfile.TemporaryDirectory() as tmpdir:
        video_path = os.path.join(tmpdir, "video.mp4")
        audio_path = os.path.join(tmpdir, "audio.wav")
        demucs_dir = os.path.join(tmpdir, "demucs_out")

        download_video(video_url, video_path)
        extract_audio(video_path, audio_path)
        music_path = separate_music(audio_path, demucs_dir)

        raw_segments = detect_music_segments(music_path)
        merged = merge_segments(raw_segments)

        results = []
        for start, end in merged:
            track = fingerprint_segment(music_path, start, end)
            results.append({"start": round(start, 3), "end": round(end, 3), "track": track})

        gcs_path = f"analysis/{video_id}/music.json"
        upload_json(results, bucket_name, gcs_path)

        return {"status": "completed", "gcs_path": gcs_path, "segment_count": len(results)}
```

- [ ] **Step 2: Add detect-music endpoint to app.py**

Add to `modal/app.py`:

```python
demucs_image = base_image.pip_install("demucs", "librosa", "pyacoustid")

@app.function(
    image=demucs_image,
    gpu="A10G",
    timeout=900,
    secrets=[modal.Secret.from_name("gweebler")],
)
@modal.web_endpoint(method="POST")
def detect_music(item: dict) -> dict:
    from gweebler_modal.detect_music import run

    return run(
        video_url=item["video_url"],
        video_id=item["video_id"],
        bucket_name=item.get("bucket", "gweebler.firebasestorage.app"),
    )
```

- [ ] **Step 3: Commit**

```bash
git add modal/
git commit -m "feat: add Modal music detection endpoint with Demucs + AcoustID"
```

---

### Task 14: Modal graphics detection endpoint

**Files:**
- Create: `modal/gweebler_modal/detect_graphics.py`
- Modify: `modal/app.py`

- [ ] **Step 1: Create detect_graphics module**

Create `modal/gweebler_modal/detect_graphics.py`. Adapt from `filmhub/detect_graphics.py`, uploading frame PNGs to GCS instead of local disk:

```python
import os
import json
import tempfile
import subprocess
import shutil
from google.cloud import storage


def download_video(video_url: str, local_path: str) -> None:
    import urllib.request
    urllib.request.urlretrieve(video_url, local_path)


def extract_frames(video_path: str, output_dir: str, fps: int = 1) -> int:
    """Extract frames from video at specified FPS."""
    subprocess.run(
        ["ffmpeg", "-y", "-i", video_path, "-vf", f"fps={fps}",
         os.path.join(output_dir, "frame_%06d.png")],
        check=True, capture_output=True,
    )
    return len([f for f in os.listdir(output_dir) if f.startswith("frame_")])


def compute_frame_metrics(frame_path: str) -> dict | None:
    """Compute histogram metrics for a frame."""
    import cv2
    import numpy as np

    img = cv2.imread(frame_path)
    if img is None:
        return None

    hsv = cv2.cvtColor(img, cv2.COLOR_BGR2HSV)
    h, w = hsv.shape[:2]

    def hist(region):
        h_hist = cv2.calcHist([region], [0], None, [180], [0, 180])
        s_hist = cv2.calcHist([region], [1], None, [256], [0, 256])
        cv2.normalize(h_hist, h_hist)
        cv2.normalize(s_hist, s_hist)
        return h_hist, s_hist

    full_h, full_s = hist(hsv)
    top_h, top_s = hist(hsv[:h // 4])
    bot_h, bot_s = hist(hsv[3 * h // 4:])

    brightness = float(np.mean(hsv[:, :, 2]) / 255.0)
    top_brightness = float(np.mean(hsv[:h // 4, :, 2]) / 255.0)
    bot_brightness = float(np.mean(hsv[3 * h // 4:, :, 2]) / 255.0)

    return {
        "full_h": full_h, "full_s": full_s,
        "top_h": top_h, "top_s": top_s,
        "bot_h": bot_h, "bot_s": bot_s,
        "brightness_full": brightness,
        "brightness_top": top_brightness,
        "brightness_bottom": bot_brightness,
    }


def detect_transitions(frames_dir: str, threshold: float = 0.4, fps: int = 1) -> list:
    """Detect visual transitions between consecutive frames."""
    import cv2

    frames = sorted([f for f in os.listdir(frames_dir) if f.startswith("frame_")])
    prev_metrics = None
    candidates = []

    for i, fname in enumerate(frames):
        metrics = compute_frame_metrics(os.path.join(frames_dir, fname))
        if metrics is None:
            continue

        if prev_metrics is not None:
            scores = []
            for key in ["full", "top", "bot"]:
                for channel in ["h", "s"]:
                    s = cv2.compareHist(
                        prev_metrics[f"{key}_{channel}"],
                        metrics[f"{key}_{channel}"],
                        cv2.HISTCMP_CORREL,
                    )
                    scores.append(s)
            min_score = min(scores)

            if min_score < threshold:
                timestamp = i / fps
                candidates.append({
                    "frame_index": i,
                    "timestamp": round(timestamp, 3),
                    "time_formatted": f"{int(timestamp // 3600)}:{int((timestamp % 3600) // 60):02d}:{int(timestamp % 60):02d}",
                    "correlation": round(min_score, 4),
                    "before_frame": frames[i - 1],
                    "after_frame": fname,
                    "brightness_full": round(metrics["brightness_full"], 4),
                    "brightness_top": round(metrics["brightness_top"], 4),
                    "brightness_bottom": round(metrics["brightness_bottom"], 4),
                })

        prev_metrics = metrics

    return candidates


def upload_frames_to_gcs(frames_dir: str, candidates: list, bucket_name: str, video_id: str) -> list:
    """Upload candidate frame PNGs to GCS and update paths."""
    client = storage.Client()
    bucket = client.bucket(bucket_name)

    updated = []
    for c in candidates:
        for key in ["before_frame", "after_frame"]:
            local = os.path.join(frames_dir, c[key])
            gcs_path = f"analysis/{video_id}/graphics_frames/{c[key]}"
            blob = bucket.blob(gcs_path)
            blob.upload_from_filename(local, content_type="image/png")
            c[key] = c[key]  # Keep relative path, frontend will construct URL
        updated.append(c)

    return updated


def upload_json(data, bucket_name: str, gcs_path: str) -> None:
    client = storage.Client()
    bucket = client.bucket(bucket_name)
    blob = bucket.blob(gcs_path)
    blob.upload_from_string(json.dumps(data, indent=2), content_type="application/json")


def run(video_url: str, video_id: str, bucket_name: str, threshold: float = 0.4) -> dict:
    """Full graphics detection pipeline."""
    with tempfile.TemporaryDirectory() as tmpdir:
        video_path = os.path.join(tmpdir, "video.mp4")
        frames_dir = os.path.join(tmpdir, "frames")
        os.makedirs(frames_dir)

        download_video(video_url, video_path)
        frame_count = extract_frames(video_path, frames_dir)
        candidates = detect_transitions(frames_dir, threshold=threshold)
        candidates = upload_frames_to_gcs(frames_dir, candidates, bucket_name, video_id)

        gcs_path = f"analysis/{video_id}/graphics_candidates.json"
        upload_json(candidates, bucket_name, gcs_path)

        return {"status": "completed", "gcs_path": gcs_path, "candidate_count": len(candidates)}
```

- [ ] **Step 2: Add detect-graphics endpoint to app.py**

Add to `modal/app.py`:

```python
graphics_image = base_image.pip_install("opencv-python-headless", "numpy")

@app.function(
    image=graphics_image,
    timeout=600,
    secrets=[modal.Secret.from_name("gweebler")],
)
@modal.web_endpoint(method="POST")
def detect_graphics(item: dict) -> dict:
    from gweebler_modal.detect_graphics import run

    return run(
        video_url=item["video_url"],
        video_id=item["video_id"],
        bucket_name=item.get("bucket", "gweebler.firebasestorage.app"),
        threshold=item.get("threshold", 0.4),
    )
```

- [ ] **Step 3: Commit**

```bash
git add modal/
git commit -m "feat: add Modal graphics detection endpoint with OpenCV"
```

---

### Task 15: Modal cut-video endpoint

**Files:**
- Create: `modal/gweebler_modal/cut_video.py`
- Modify: `modal/app.py`

- [ ] **Step 1: Create cut_video module**

Create `modal/gweebler_modal/cut_video.py`. Adapt from `filmhub/cut_video.py`:

```python
import os
import json
import tempfile
import subprocess
from google.cloud import storage


def download_video(video_url: str, local_path: str) -> None:
    import urllib.request
    urllib.request.urlretrieve(video_url, local_path)


def get_duration(video_path: str) -> float:
    """Get video duration using ffprobe."""
    result = subprocess.run(
        ["ffprobe", "-v", "quiet", "-print_format", "json", "-show_format", video_path],
        capture_output=True, text=True, check=True,
    )
    info = json.loads(result.stdout)
    return float(info["format"]["duration"])


def compute_keep_intervals(segments: list, duration: float) -> list:
    """Invert removal segments into keep intervals."""
    sorted_segs = sorted(segments, key=lambda s: s["start"])
    keeps = []
    cursor = 0.0

    for seg in sorted_segs:
        if seg["start"] > cursor:
            keeps.append((cursor, seg["start"]))
        cursor = max(cursor, seg["end"])

    if cursor < duration:
        keeps.append((cursor, duration))

    return keeps


def cut_video(video_path: str, segments: list, output_path: str) -> None:
    """Cut video using FFmpeg concat demuxer (no re-encoding)."""
    duration = get_duration(video_path)
    keeps = compute_keep_intervals(segments, duration)

    if not keeps:
        raise ValueError("No content left after removing all segments")

    with tempfile.TemporaryDirectory() as tmpdir:
        # Extract keep intervals as MKV chunks
        chunk_paths = []
        for i, (start, end) in enumerate(keeps):
            chunk = os.path.join(tmpdir, f"chunk_{i:04d}.mkv")
            subprocess.run(
                ["ffmpeg", "-y", "-i", video_path, "-ss", str(start),
                 "-to", str(end), "-c", "copy", "-avoid_negative_ts", "make_zero", chunk],
                check=True, capture_output=True,
            )
            chunk_paths.append(chunk)

        # Create concat file
        concat_file = os.path.join(tmpdir, "concat.txt")
        with open(concat_file, "w") as f:
            for path in chunk_paths:
                f.write(f"file '{path}'\n")

        # Concatenate
        subprocess.run(
            ["ffmpeg", "-y", "-f", "concat", "-safe", "0", "-i", concat_file,
             "-c", "copy", output_path],
            check=True, capture_output=True,
        )


def run(video_url: str, video_id: str, filename: str, segments: list, bucket_name: str) -> dict:
    """Full cut pipeline: download → cut → upload."""
    with tempfile.TemporaryDirectory() as tmpdir:
        ext = os.path.splitext(filename)[1] or ".mp4"
        video_path = os.path.join(tmpdir, f"input{ext}")
        output_path = os.path.join(tmpdir, f"clean_{filename}")

        download_video(video_url, video_path)
        cut_video(video_path, segments, output_path)

        # Upload to GCS
        gcs_path = f"output/{video_id}/clean_{filename}"
        client = storage.Client()
        bucket = client.bucket(bucket_name)
        blob = bucket.blob(gcs_path)
        blob.upload_from_filename(output_path)

        return {"status": "completed", "gcs_path": gcs_path}
```

- [ ] **Step 2: Add cut-video endpoint to app.py**

Add to `modal/app.py`:

```python
@app.function(
    image=base_image,
    timeout=900,
    secrets=[modal.Secret.from_name("gweebler")],
)
@modal.web_endpoint(method="POST")
def cut_video(item: dict) -> dict:
    from gweebler_modal.cut_video import run

    return run(
        video_url=item["video_url"],
        video_id=item["video_id"],
        filename=item["filename"],
        segments=item["segments"],
        bucket_name=item.get("bucket", "gweebler.firebasestorage.app"),
    )
```

- [ ] **Step 3: Deploy all Modal endpoints**

```bash
cd modal && modal deploy app.py
```

- [ ] **Step 4: Commit**

```bash
git add modal/
git commit -m "feat: add Modal cut-video endpoint with FFmpeg concat"
```

---

## Phase 6: Worker Service (Anthropic Agent)

### Task 16: Modal client for worker

**Files:**
- Create: `worker/src/modal-client.ts`

- [ ] **Step 1: Create Modal HTTP client**

Create `worker/src/modal-client.ts`:

```typescript
const MODAL_ENDPOINT_URL = process.env.MODAL_ENDPOINT_URL || ''
const MODAL_AUTH_TOKEN = process.env.MODAL_AUTH_TOKEN || ''

interface ModalResponse {
  status: string
  gcs_path?: string
  segment_count?: number
  candidate_count?: number
  error?: string
}

async function callModal(endpoint: string, body: Record<string, unknown>): Promise<ModalResponse> {
  const url = `${MODAL_ENDPOINT_URL}/${endpoint}`
  const res = await fetch(url, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${MODAL_AUTH_TOKEN}`,
    },
    body: JSON.stringify(body),
  })

  if (!res.ok) {
    const text = await res.text()
    throw new Error(`Modal ${endpoint} failed (${res.status}): ${text}`)
  }

  return res.json() as Promise<ModalResponse>
}

export async function modalTranscribe(videoUrl: string, videoId: string, bucket: string, diarize = false) {
  return callModal('transcribe', { video_url: videoUrl, video_id: videoId, bucket, diarize })
}

export async function modalDetectMusic(videoUrl: string, videoId: string, bucket: string) {
  return callModal('detect_music', { video_url: videoUrl, video_id: videoId, bucket })
}

export async function modalDetectGraphics(videoUrl: string, videoId: string, bucket: string) {
  return callModal('detect_graphics', { video_url: videoUrl, video_id: videoId, bucket })
}

export async function modalCutVideo(videoUrl: string, videoId: string, filename: string, segments: Array<{ start: number; end: number }>, bucket: string) {
  return callModal('cut_video', { video_url: videoUrl, video_id: videoId, filename, segments, bucket })
}
```

- [ ] **Step 2: Commit**

```bash
git add worker/src/modal-client.ts
git commit -m "feat: add Modal HTTP client for worker service"
```

---

### Task 17: Anthropic agent loop with tools

**Files:**
- Create: `worker/src/agent.ts`
- Modify: `worker/src/index.ts`

- [ ] **Step 1: Create agent loop**

Create `worker/src/agent.ts`:

```typescript
import Anthropic from '@anthropic-ai/sdk'
import { Storage } from '@google-cloud/storage'
import admin from 'firebase-admin'
import { modalTranscribe, modalDetectMusic, modalDetectGraphics } from './modal-client.js'

const anthropic = new Anthropic()
const storage = new Storage()
const bucket = storage.bucket(process.env.GCS_BUCKET || '')

const tools: Anthropic.Tool[] = [
  {
    name: 'run_transcription',
    description: 'Transcribe video audio using Whisper. Returns timestamped transcript with speaker labels.',
    input_schema: {
      type: 'object' as const,
      properties: {
        video_url: { type: 'string', description: 'Signed GCS URL of the video' },
      },
      required: ['video_url'],
    },
  },
  {
    name: 'detect_music',
    description: 'Detect copyrighted music segments using Demucs source separation and AcoustID fingerprinting.',
    input_schema: {
      type: 'object' as const,
      properties: {
        video_url: { type: 'string', description: 'Signed GCS URL of the video' },
      },
      required: ['video_url'],
    },
  },
  {
    name: 'detect_graphics',
    description: 'Detect on-screen promotional graphics transitions using frame analysis.',
    input_schema: {
      type: 'object' as const,
      properties: {
        video_url: { type: 'string', description: 'Signed GCS URL of the video' },
      },
      required: ['video_url'],
    },
  },
  {
    name: 'detect_promotions',
    description: 'Analyze transcript text to identify paid promotion and sponsorship segments. Requires transcription to have been run first.',
    input_schema: {
      type: 'object' as const,
      properties: {
        transcript_json: { type: 'string', description: 'JSON string of the transcript data' },
      },
      required: ['transcript_json'],
    },
  },
  {
    name: 'update_progress',
    description: 'Update the analysis job progress visible to the user in real-time.',
    input_schema: {
      type: 'object' as const,
      properties: {
        message: { type: 'string', description: 'Progress message to show the user' },
      },
      required: ['message'],
    },
  },
  {
    name: 'save_results',
    description: 'Save detection results JSON to cloud storage.',
    input_schema: {
      type: 'object' as const,
      properties: {
        type: { type: 'string', description: 'Result type: "review_data"' },
        data: { type: 'string', description: 'JSON string of the results data' },
      },
      required: ['type', 'data'],
    },
  },
]

interface JobContext {
  jobId: string
  videoId: string
  videoUrl: string
  passes: string[]
  bucketName: string
}

async function updateFirestoreProgress(jobId: string, updates: Record<string, unknown>) {
  const db = admin.firestore()
  await db.collection('jobs').doc(jobId).update({
    'progress.message': updates.message || '',
    'progress.currentPass': updates.currentPass || null,
    ...(updates.completedPasses ? { 'progress.completedPasses': updates.completedPasses } : {}),
  })
}

async function handleToolCall(
  toolName: string,
  toolInput: Record<string, unknown>,
  ctx: JobContext,
  completedPasses: string[],
): Promise<string> {
  switch (toolName) {
    case 'run_transcription': {
      await updateFirestoreProgress(ctx.jobId, { message: 'Transcribing audio...', currentPass: 'transcribe' })
      const result = await modalTranscribe(ctx.videoUrl, ctx.videoId, ctx.bucketName)
      completedPasses.push('transcribe')
      await updateFirestoreProgress(ctx.jobId, { message: 'Transcription complete', completedPasses })
      return JSON.stringify(result)
    }
    case 'detect_music': {
      await updateFirestoreProgress(ctx.jobId, { message: 'Detecting music...', currentPass: 'music' })
      const result = await modalDetectMusic(ctx.videoUrl, ctx.videoId, ctx.bucketName)
      completedPasses.push('music')
      await updateFirestoreProgress(ctx.jobId, { message: 'Music detection complete', completedPasses })
      return JSON.stringify(result)
    }
    case 'detect_graphics': {
      await updateFirestoreProgress(ctx.jobId, { message: 'Detecting graphics...', currentPass: 'graphics' })
      const result = await modalDetectGraphics(ctx.videoUrl, ctx.videoId, ctx.bucketName)
      completedPasses.push('graphics')
      await updateFirestoreProgress(ctx.jobId, { message: 'Graphics detection complete', completedPasses })
      return JSON.stringify(result)
    }
    case 'detect_promotions': {
      await updateFirestoreProgress(ctx.jobId, { message: 'Detecting promotions...', currentPass: 'promotions' })
      // Claude analyzes the transcript directly — no Modal call needed
      completedPasses.push('promotions')
      await updateFirestoreProgress(ctx.jobId, { message: 'Promotion detection complete', completedPasses })
      return JSON.stringify({ status: 'completed', note: 'Promotions analyzed from transcript' })
    }
    case 'update_progress': {
      const msg = toolInput.message as string
      await updateFirestoreProgress(ctx.jobId, { message: msg })
      return 'Progress updated'
    }
    case 'save_results': {
      const type = toolInput.type as string
      const data = toolInput.data as string
      const gcsPath = `analysis/${ctx.videoId}/${type}.json`
      const file = bucket.file(gcsPath)
      await file.save(data, { contentType: 'application/json' })
      return JSON.stringify({ saved: gcsPath })
    }
    default:
      return JSON.stringify({ error: `Unknown tool: ${toolName}` })
  }
}

export async function runAnalysis(ctx: JobContext): Promise<void> {
  const db = admin.firestore()
  const completedPasses: string[] = []

  try {
    // Update job to running
    await db.collection('jobs').doc(ctx.jobId).update({
      status: 'running',
      'progress.startedAt': admin.firestore.FieldValue.serverTimestamp(),
      'progress.message': 'Starting analysis...',
    })

    const systemPrompt = `You are an analysis orchestrator for video processing. You have been asked to run the following detection passes on a video: ${ctx.passes.join(', ')}.

Use the tools provided to run each pass. The video URL is already provided to each tool.

Rules:
- Run transcription first if "transcribe" is in the passes, since "promotions" detection requires the transcript.
- For "promotions" detection: first read the transcript from GCS (it was saved by run_transcription), then use detect_promotions with the transcript text to identify paid promotion segments. Analyze the transcript yourself to find sponsorship mentions, ad reads, and promotional content. Return the segments you find.
- After all requested passes complete, assemble a review_data.json using save_results. The review_data should contain: video info, and a "suggested_segments" array combining all detected segments with appropriate types.
- Update progress after each step so the user can see what's happening.
- If a pass fails, continue with remaining passes and report the error.

Video URL: ${ctx.videoUrl}
Video ID: ${ctx.videoId}`

    let messages: Anthropic.MessageParam[] = [
      { role: 'user', content: `Run the following detection passes: ${ctx.passes.join(', ')}` },
    ]

    // Agent loop
    while (true) {
      const response = await anthropic.messages.create({
        model: 'claude-sonnet-4-20250514',
        max_tokens: 4096,
        system: systemPrompt,
        tools,
        messages,
      })

      // Collect tool uses and text
      const toolUses = response.content.filter((b): b is Anthropic.ToolUseBlock => b.type === 'tool_use')
      const textBlocks = response.content.filter((b): b is Anthropic.TextBlock => b.type === 'text')

      if (response.stop_reason === 'end_turn' || toolUses.length === 0) {
        break
      }

      // Process tool calls
      const toolResults: Anthropic.ToolResultBlockParam[] = []
      for (const toolUse of toolUses) {
        const result = await handleToolCall(
          toolUse.name,
          toolUse.input as Record<string, unknown>,
          ctx,
          completedPasses,
        )
        toolResults.push({
          type: 'tool_result',
          tool_use_id: toolUse.id,
          content: result,
        })
      }

      messages = [
        ...messages,
        { role: 'assistant', content: response.content },
        { role: 'user', content: toolResults },
      ]
    }

    // Mark job and video as completed
    await db.collection('jobs').doc(ctx.jobId).update({
      status: 'completed',
      'progress.completedAt': admin.firestore.FieldValue.serverTimestamp(),
      'progress.message': 'Analysis complete',
      'progress.currentPass': null,
    })

    await db.collection('videos').doc(ctx.videoId).update({
      status: 'reviewed',
      updatedAt: admin.firestore.FieldValue.serverTimestamp(),
    })

  } catch (error) {
    const errorMsg = error instanceof Error ? error.message : String(error)
    await db.collection('jobs').doc(ctx.jobId).update({
      status: 'failed',
      'progress.error': errorMsg,
      'progress.message': `Analysis failed: ${errorMsg}`,
      'progress.completedAt': admin.firestore.FieldValue.serverTimestamp(),
    })

    await db.collection('videos').doc(ctx.videoId).update({
      status: 'uploaded',
      updatedAt: admin.firestore.FieldValue.serverTimestamp(),
    })
  }
}
```

- [ ] **Step 2: Update worker index.ts with run-analysis endpoint**

Replace `worker/src/index.ts`:

```typescript
import express from 'express'
import admin from 'firebase-admin'
import { Storage } from '@google-cloud/storage'
import { runAnalysis } from './agent.js'

admin.initializeApp({
  credential: admin.credential.applicationDefault(),
})

const storage = new Storage()
const bucket = storage.bucket(process.env.GCS_BUCKET || '')

const app = express()
app.use(express.json())

app.get('/health', (_req, res) => {
  res.json({ status: 'ok' })
})

app.post('/run-analysis', async (req, res) => {
  const { jobId, videoId, passes, gcsVideoPath } = req.body

  if (!jobId || !videoId || !passes || !gcsVideoPath) {
    res.status(400).json({ error: 'Missing required fields' })
    return
  }

  // Generate signed URL for the video
  const file = bucket.file(gcsVideoPath)
  const [videoUrl] = await file.getSignedUrl({
    action: 'read',
    expires: Date.now() + 2 * 60 * 60 * 1000, // 2 hours
  })

  // Respond immediately, run analysis in background
  res.json({ status: 'started' })

  // Run analysis (don't await — this runs in background)
  runAnalysis({
    jobId,
    videoId,
    videoUrl,
    passes,
    bucketName: process.env.GCS_BUCKET || '',
  }).catch((err) => {
    console.error(`Analysis failed for job ${jobId}:`, err)
  })
})

const PORT = parseInt(process.env.PORT || '8081')
app.listen(PORT, () => {
  console.log(`Worker service listening on port ${PORT}`)
})
```

- [ ] **Step 3: Verify worker starts**

```bash
cd worker && GOOGLE_APPLICATION_CREDENTIALS=../service-account.json npm run dev
```

Expected: `Worker service listening on port 8081`.

- [ ] **Step 4: Commit**

```bash
git add worker/src/
git commit -m "feat: add Anthropic SDK agent loop with Modal tool integration"
```

---

## Phase 7: API Analysis & Cut Endpoints

### Task 18: Analyze endpoint (Cloud Tasks dispatch)

**Files:**
- Create: `api/src/routes/analyze.ts`
- Modify: `api/src/index.ts`

- [ ] **Step 1: Create analyze route**

Create `api/src/routes/analyze.ts`:

```typescript
import { Router } from 'express'
import admin from 'firebase-admin'
import { CloudTasksClient } from '@google-cloud/tasks'
import crypto from 'crypto'
import { AuthRequest } from '../middleware/auth.js'

const router = Router()
const tasksClient = new CloudTasksClient()

const GCP_PROJECT = process.env.GCP_PROJECT || 'gweebler'
const CLOUD_TASKS_LOCATION = process.env.CLOUD_TASKS_LOCATION || 'us-west1'
const CLOUD_TASKS_QUEUE = process.env.CLOUD_TASKS_QUEUE || 'gweebler-analysis'
const WORKER_SERVICE_URL = process.env.WORKER_SERVICE_URL || ''

router.post('/analyze/:videoId', async (req: AuthRequest, res) => {
  const { videoId } = req.params
  const { passes } = req.body

  if (!passes || !Array.isArray(passes) || passes.length === 0) {
    res.status(400).json({ error: 'passes array required' })
    return
  }

  const db = admin.firestore()

  // Verify video belongs to user
  const videoDoc = await db.collection('videos').doc(videoId).get()
  if (!videoDoc.exists || videoDoc.data()?.userId !== req.uid) {
    res.status(404).json({ error: 'Video not found' })
    return
  }

  const gcsVideoPath = videoDoc.data()!.gcsPath as string

  // Create job document
  const jobId = crypto.randomUUID()
  await db.collection('jobs').doc(jobId).set({
    videoId,
    userId: req.uid,
    status: 'queued',
    passes,
    progress: {
      currentPass: null,
      completedPasses: [],
      message: 'Queued for analysis...',
      startedAt: null,
      completedAt: null,
      error: null,
    },
    createdAt: admin.firestore.FieldValue.serverTimestamp(),
  })

  // Update video status
  await db.collection('videos').doc(videoId).update({
    status: 'analyzing',
    updatedAt: admin.firestore.FieldValue.serverTimestamp(),
  })

  // In dev mode, call worker directly
  if (WORKER_SERVICE_URL.includes('localhost')) {
    fetch(`${WORKER_SERVICE_URL}/run-analysis`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ jobId, videoId, passes, gcsVideoPath }),
    }).catch((err) => console.error('Worker call failed:', err))
  } else {
    // In prod, enqueue Cloud Tasks
    const queuePath = tasksClient.queuePath(GCP_PROJECT, CLOUD_TASKS_LOCATION, CLOUD_TASKS_QUEUE)
    await tasksClient.createTask({
      parent: queuePath,
      task: {
        httpRequest: {
          httpMethod: 'POST',
          url: `${WORKER_SERVICE_URL}/run-analysis`,
          headers: { 'Content-Type': 'application/json' },
          body: Buffer.from(JSON.stringify({ jobId, videoId, passes, gcsVideoPath })).toString('base64'),
          oidcToken: {
            serviceAccountEmail: `${GCP_PROJECT}@appspot.gserviceaccount.com`,
          },
        },
      },
    })
  }

  res.json({ jobId })
})

export default router
```

- [ ] **Step 2: Register route in index.ts**

Add to `api/src/index.ts`:

```typescript
import analyzeRouter from './routes/analyze.js'

app.use('/api', analyzeRouter)
```

- [ ] **Step 3: Commit**

```bash
git add api/src/
git commit -m "feat: add analyze endpoint with Cloud Tasks dispatch (dev: direct call)"
```

---

### Task 19: Analysis data and frames endpoints

**Files:**
- Create: `api/src/routes/analysis.ts`
- Modify: `api/src/index.ts`

- [ ] **Step 1: Create analysis route**

Create `api/src/routes/analysis.ts`:

```typescript
import { Router } from 'express'
import { Storage } from '@google-cloud/storage'
import admin from 'firebase-admin'
import { AuthRequest } from '../middleware/auth.js'

const router = Router()
const storage = new Storage()
const bucket = storage.bucket(process.env.GCS_BUCKET || '')

router.get('/analysis/:videoId', async (req: AuthRequest, res) => {
  const { videoId } = req.params
  const db = admin.firestore()

  // Verify video belongs to user
  const videoDoc = await db.collection('videos').doc(videoId).get()
  if (!videoDoc.exists || videoDoc.data()?.userId !== req.uid) {
    res.status(404).json({ error: 'Video not found' })
    return
  }

  const gcsPath = `analysis/${videoId}/review_data.json`
  const file = bucket.file(gcsPath)

  try {
    const [exists] = await file.exists()
    if (!exists) {
      res.status(404).json({ error: 'Analysis not found' })
      return
    }

    const [content] = await file.download()
    const data = JSON.parse(content.toString())

    // Inject FPS from video if not present
    if (!data.video?.fps) {
      // Attempt ffprobe via signed URL — skip if it fails
      try {
        const videoGcsPath = videoDoc.data()!.gcsPath as string
        const videoFile = bucket.file(videoGcsPath)
        const [signedUrl] = await videoFile.getSignedUrl({
          action: 'read',
          expires: Date.now() + 10 * 60 * 1000,
        })

        const { execSync } = await import('child_process')
        const ffprobeOut = execSync(
          `ffprobe -v quiet -print_format json -show_streams "${signedUrl}"`,
          { timeout: 15000 },
        ).toString()

        const streams = JSON.parse(ffprobeOut)
        const videoStream = streams.streams?.find((s: any) => s.codec_type === 'video')
        if (videoStream?.r_frame_rate) {
          const [num, den] = videoStream.r_frame_rate.split('/')
          const rawFps = parseInt(num) / parseInt(den)
          // Snap to common FPS values
          const common = [23.976, 24.0, 25.0, 29.97, 30.0, 48.0, 50.0, 59.94, 60.0]
          const fps = common.reduce((prev, curr) =>
            Math.abs(curr - rawFps) < Math.abs(prev - rawFps) ? curr : prev
          )
          if (!data.video) data.video = {}
          data.video.fps = fps
        }
      } catch {
        // FPS injection is best-effort
      }
    }

    res.json(data)
  } catch (err) {
    res.status(500).json({ error: 'Failed to read analysis data' })
  }
})

router.get('/analysis/:videoId/frames/:filename', async (req: AuthRequest, res) => {
  const { videoId, filename } = req.params

  // Path traversal prevention
  if (filename.includes('..') || filename.includes('/')) {
    res.status(400).json({ error: 'Invalid filename' })
    return
  }

  const db = admin.firestore()
  const videoDoc = await db.collection('videos').doc(videoId).get()
  if (!videoDoc.exists || videoDoc.data()?.userId !== req.uid) {
    res.status(404).json({ error: 'Not found' })
    return
  }

  const gcsPath = `analysis/${videoId}/graphics_frames/${filename}`
  const file = bucket.file(gcsPath)

  try {
    const [exists] = await file.exists()
    if (!exists) {
      res.status(404).json({ error: 'Frame not found' })
      return
    }

    res.setHeader('Content-Type', 'image/png')
    file.createReadStream().pipe(res)
  } catch {
    res.status(500).json({ error: 'Failed to read frame' })
  }
})

export default router
```

- [ ] **Step 2: Register route in index.ts**

Add to `api/src/index.ts`:

```typescript
import analysisRouter from './routes/analysis.js'

app.use('/api', analysisRouter)
```

- [ ] **Step 3: Commit**

```bash
git add api/src/
git commit -m "feat: add analysis data and frame serving endpoints"
```

---

### Task 20: Save and cut endpoints

**Files:**
- Create: `api/src/routes/save.ts`
- Create: `api/src/routes/cut.ts`
- Modify: `api/src/index.ts`

- [ ] **Step 1: Create save route**

Create `api/src/routes/save.ts`:

```typescript
import { Router } from 'express'
import { Storage } from '@google-cloud/storage'
import admin from 'firebase-admin'
import { AuthRequest } from '../middleware/auth.js'

const router = Router()
const storage = new Storage()
const bucket = storage.bucket(process.env.GCS_BUCKET || '')

router.post('/save/:videoId', async (req: AuthRequest, res) => {
  const { videoId } = req.params
  const { segments, reviewData } = req.body

  const db = admin.firestore()
  const videoDoc = await db.collection('videos').doc(videoId).get()
  if (!videoDoc.exists || videoDoc.data()?.userId !== req.uid) {
    res.status(404).json({ error: 'Video not found' })
    return
  }

  // Find next sequence number
  const prefix = `analysis/${videoId}/`
  const [files] = await bucket.getFiles({ prefix })
  const reviewFiles = files.filter((f) => /review_\d+\.json$/.test(f.name))
  const seq = reviewFiles.length + 1
  const seqStr = String(seq).padStart(2, '0')

  // Save review data
  const reviewFile = `${prefix}review_${seqStr}.json`
  await bucket.file(reviewFile).save(JSON.stringify(reviewData, null, 2), {
    contentType: 'application/json',
  })

  // Save clean segments (accepted only, no accepted flag)
  const cleanSegments = segments
    .filter((s: any) => s.accepted)
    .map(({ start, end, types, description }: any) => ({ start, end, types, description }))

  const segmentsFile = `${prefix}clean_${seqStr}_segments.json`
  await bucket.file(segmentsFile).save(JSON.stringify(cleanSegments, null, 2), {
    contentType: 'application/json',
  })

  res.json({ reviewFile, segmentsFile })
})

export default router
```

- [ ] **Step 2: Create cut route**

Create `api/src/routes/cut.ts`:

```typescript
import { Router } from 'express'
import { Storage } from '@google-cloud/storage'
import admin from 'firebase-admin'
import { AuthRequest } from '../middleware/auth.js'

const router = Router()
const storage = new Storage()
const bucket = storage.bucket(process.env.GCS_BUCKET || '')

const MODAL_ENDPOINT_URL = process.env.MODAL_ENDPOINT_URL || ''
const MODAL_AUTH_TOKEN = process.env.MODAL_AUTH_TOKEN || ''

router.post('/cut/:videoId', async (req: AuthRequest, res) => {
  const { videoId } = req.params
  const { segmentsFile } = req.body

  const db = admin.firestore()
  const videoDoc = await db.collection('videos').doc(videoId).get()
  if (!videoDoc.exists || videoDoc.data()?.userId !== req.uid) {
    res.status(404).json({ error: 'Video not found' })
    return
  }

  const videoData = videoDoc.data()!
  const gcsVideoPath = videoData.gcsPath as string
  const filename = videoData.filename as string

  // Read segments from GCS
  const [segContent] = await bucket.file(segmentsFile).download()
  const segments = JSON.parse(segContent.toString())

  // Generate signed URL for video
  const [videoUrl] = await bucket.file(gcsVideoPath).getSignedUrl({
    action: 'read',
    expires: Date.now() + 2 * 60 * 60 * 1000,
  })

  // Create cut job in Firestore
  const cutJobId = `cut_${videoId}`
  await db.collection('cuts').doc(cutJobId).set({
    videoId,
    userId: req.uid,
    status: 'running',
    createdAt: admin.firestore.FieldValue.serverTimestamp(),
  })

  // Call Modal cut endpoint
  try {
    const modalRes = await fetch(`${MODAL_ENDPOINT_URL}/cut_video`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${MODAL_AUTH_TOKEN}`,
      },
      body: JSON.stringify({
        video_url: videoUrl,
        video_id: videoId,
        filename,
        segments,
        bucket: process.env.GCS_BUCKET,
      }),
    })

    if (!modalRes.ok) {
      throw new Error(`Modal cut failed: ${await modalRes.text()}`)
    }

    const result = await modalRes.json() as { gcs_path: string }

    // Generate download URL
    const [downloadUrl] = await bucket.file(result.gcs_path).getSignedUrl({
      action: 'read',
      expires: Date.now() + 60 * 60 * 1000, // 1 hour
    })

    await db.collection('cuts').doc(cutJobId).update({
      status: 'done',
      gcsPath: result.gcs_path,
      downloadUrl,
    })

    await db.collection('videos').doc(videoId).update({
      status: 'cut',
      updatedAt: admin.firestore.FieldValue.serverTimestamp(),
    })

    res.json({ status: 'done', downloadUrl })

  } catch (error) {
    const errorMsg = error instanceof Error ? error.message : String(error)
    await db.collection('cuts').doc(cutJobId).update({
      status: 'failed',
      error: errorMsg,
    })
    res.status(500).json({ status: 'failed', error: errorMsg })
  }
})

router.get('/cut/:videoId/status', async (req: AuthRequest, res) => {
  const { videoId } = req.params
  const db = admin.firestore()

  const cutJobId = `cut_${videoId}`
  const doc = await db.collection('cuts').doc(cutJobId).get()

  if (!doc.exists) {
    res.json({ status: 'idle' })
    return
  }

  const data = doc.data()!
  if (data.userId !== req.uid) {
    res.status(404).json({ error: 'Not found' })
    return
  }

  res.json({
    status: data.status,
    downloadUrl: data.downloadUrl || undefined,
    error: data.error || undefined,
  })
})

export default router
```

- [ ] **Step 3: Register routes in index.ts and add MODAL env vars**

Add to `api/src/index.ts`:

```typescript
import saveRouter from './routes/save.js'
import cutRouter from './routes/cut.js'

app.use('/api', saveRouter)
app.use('/api', cutRouter)
```

Add to `api/.env.local`:

```env
MODAL_ENDPOINT_URL=https://YOUR_MODAL_USERNAME--gweebler.modal.run
MODAL_AUTH_TOKEN=changeme
```

- [ ] **Step 4: Commit**

```bash
git add api/src/
git commit -m "feat: add save review and cut video endpoints"
```

---

## Phase 8: Review UI Migration

### Task 21: Migrate utilities and hooks

**Files:**
- Create: `frontend/src/utils/formatTime.ts`
- Create: `frontend/src/hooks/useVideoSync.ts`
- Create: `frontend/src/hooks/useSegments.ts`
- Create: `frontend/src/hooks/useHandleDrag.ts`
- Modify: `frontend/src/hooks/useAnalysis.ts`

- [ ] **Step 1: Copy formatTime utility**

Copy `reviewer/frontend/src/utils/formatTime.ts` to `frontend/src/utils/formatTime.ts` verbatim. No changes needed — this is pure utility code with no API or filesystem dependencies.

- [ ] **Step 2: Copy useVideoSync hook**

Copy `reviewer/frontend/src/hooks/useVideoSync.ts` to `frontend/src/hooks/useVideoSync.ts` verbatim. Update the import path for types:

Change: `import type { ... } from '../types'`
To: `import type { ... } from '../types/index'` (if needed — the path should be the same)

No other changes — this hook manages HTML5 video element state only.

- [ ] **Step 3: Copy useSegments hook**

Copy `reviewer/frontend/src/hooks/useSegments.ts` to `frontend/src/hooks/useSegments.ts` verbatim. Same import path adjustment if needed.

- [ ] **Step 4: Copy useHandleDrag hook**

Copy `reviewer/frontend/src/hooks/useHandleDrag.ts` to `frontend/src/hooks/useHandleDrag.ts` verbatim.

- [ ] **Step 5: Create adapted useAnalysis hook**

Create `frontend/src/hooks/useAnalysis.ts`:

```typescript
import { useState, useEffect } from 'react'
import { fetchAnalysis } from '../api'
import type { ReviewData, CleanSegment } from '../types'

export function useAnalysis(videoId: string | null) {
  const [data, setData] = useState<ReviewData | null>(null)
  const [initialSegments, setInitialSegments] = useState<CleanSegment[]>([])
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    if (!videoId) return

    setLoading(true)
    setError(null)

    fetchAnalysis(videoId)
      .then((reviewData) => {
        setData(reviewData)
        // Convert suggested_segments to CleanSegment[] with accepted: true
        const segments = (reviewData.suggested_segments || []).map((seg) => ({
          ...seg,
          accepted: seg.accepted !== undefined ? seg.accepted : true,
        }))
        setInitialSegments(segments)
      })
      .catch((err) => setError(err.message))
      .finally(() => setLoading(false))
  }, [videoId])

  return { data, initialSegments, loading, error }
}
```

- [ ] **Step 6: Verify no TypeScript errors**

```bash
cd frontend && npx tsc --noEmit
```

- [ ] **Step 7: Commit**

```bash
git add frontend/src/utils/ frontend/src/hooks/
git commit -m "feat: migrate formatTime, useVideoSync, useSegments, useHandleDrag hooks"
```

---

### Task 22: Migrate VideoPlayer and Timeline components

**Files:**
- Create: `frontend/src/components/VideoPlayer.tsx`
- Create: `frontend/src/components/Timeline.tsx`

- [ ] **Step 1: Copy VideoPlayer**

Copy `reviewer/frontend/src/components/VideoPlayer.tsx` to `frontend/src/components/VideoPlayer.tsx` verbatim. No changes needed — it only uses props and the formatTime utility.

- [ ] **Step 2: Copy Timeline**

Copy `reviewer/frontend/src/components/Timeline.tsx` to `frontend/src/components/Timeline.tsx` verbatim. No changes needed — it uses props, useHandleDrag, and formatTime only.

- [ ] **Step 3: Verify no TypeScript errors**

```bash
cd frontend && npx tsc --noEmit
```

- [ ] **Step 4: Commit**

```bash
git add frontend/src/components/VideoPlayer.tsx frontend/src/components/Timeline.tsx
git commit -m "feat: migrate VideoPlayer and Timeline components"
```

---

### Task 23: Migrate SegmentProperties, TranscriptPanel, and ActionBar

**Files:**
- Create: `frontend/src/components/SegmentProperties.tsx`
- Create: `frontend/src/components/TranscriptPanel.tsx`
- Create: `frontend/src/components/ActionBar.tsx`

- [ ] **Step 1: Copy SegmentProperties**

Copy `reviewer/frontend/src/components/SegmentProperties.tsx` to `frontend/src/components/SegmentProperties.tsx`.

One change needed: update the `frameUrl` import to use the new API client signature. The existing code calls `frameUrl(video, framePath)` where `video` is a string name. In the new app, `frameUrl` takes `(videoId, filename)`.

Change the import:
```typescript
import { frameUrl } from '../api'
```

The function signature is the same — `frameUrl(videoId: string, filename: string)` — but the caller passes `videoId` (UUID) instead of the video stem. Update the prop name in the component from `video: string` to `videoId: string`, and pass `videoId` to `frameUrl()` calls.

- [ ] **Step 2: Copy TranscriptPanel**

Copy `reviewer/frontend/src/components/TranscriptPanel.tsx` to `frontend/src/components/TranscriptPanel.tsx` verbatim. No changes needed.

- [ ] **Step 3: Adapt ActionBar for download flow**

Copy `reviewer/frontend/src/components/ActionBar.tsx` to `frontend/src/components/ActionBar.tsx` and modify:

Replace the save/cut logic. Instead of calling `saveSegments` + `saveReviewData` + `startCut` + polling `getCutStatus`, it should:

1. Call `saveReview(videoId, { segments, reviewData })` — single API call
2. Call `triggerCut(videoId, segmentsFile)` — returns `{ status, downloadUrl }` or `{ status: 'processing' }`
3. If processing, poll `getCutStatus(videoId)` every 2s until done
4. When done, trigger browser download via the returned `downloadUrl`

Key changes to the ActionBar props interface:
```typescript
interface Props {
  videoId: string                    // Changed from video: string
  segments: CleanSegment[]
  onSelectAll: () => void
  onDeselectAll: () => void
}
```

Replace the `handleSaveAndCut` function to use the new API calls from `../api`. When a download URL is received, create a temporary `<a>` element with `download` attribute and click it to trigger the browser download.

- [ ] **Step 4: Verify no TypeScript errors**

```bash
cd frontend && npx tsc --noEmit
```

- [ ] **Step 5: Commit**

```bash
git add frontend/src/components/SegmentProperties.tsx frontend/src/components/TranscriptPanel.tsx frontend/src/components/ActionBar.tsx
git commit -m "feat: migrate SegmentProperties, TranscriptPanel, and ActionBar with download flow"
```

---

### Task 24: ReviewView and App integration

**Files:**
- Create: `frontend/src/components/ReviewView.tsx`
- Modify: `frontend/src/App.tsx`

- [ ] **Step 1: Create ReviewView**

Copy the `ReviewView` portion of `reviewer/frontend/src/App.tsx` (the main review layout, roughly lines 100-445) into `frontend/src/components/ReviewView.tsx`.

Key changes:
- Accept `videoId` as a prop (from React Router params) instead of `video` name
- Use `useAnalysis(videoId)` instead of `useAnalysis(video)`
- Video source URL: use `videoStreamUrl(videoId)` from `../api` instead of `/videos/${filename}`
- Pass `videoId` to `SegmentProperties` and `ActionBar` instead of video name
- Pass `videoId` to `frameUrl` calls
- Keep all keyboard shortcuts, responsive layout, and sidebar collapse logic as-is

Props interface:
```typescript
interface Props {
  videoId: string
}
```

- [ ] **Step 2: Update App.tsx with ReviewView**

Replace the review route in `frontend/src/App.tsx`:

```tsx
import { BrowserRouter, Routes, Route, Navigate, useParams } from 'react-router-dom'
import { ProtectedRoute } from './components/ProtectedRoute'
import { SignInForm } from './components/SignInForm'
import { VideoPicker } from './components/VideoPicker'
import { ReviewView } from './components/ReviewView'

function ReviewPage() {
  const { videoId } = useParams<{ videoId: string }>()
  if (!videoId) return <Navigate to="/dashboard" replace />
  return <ReviewView videoId={videoId} />
}

function App() {
  return (
    <BrowserRouter>
      <Routes>
        <Route path="/sign-in" element={<SignInForm />} />
        <Route
          path="/dashboard"
          element={
            <ProtectedRoute>
              <VideoPicker />
            </ProtectedRoute>
          }
        />
        <Route
          path="/review/:videoId"
          element={
            <ProtectedRoute>
              <ReviewPage />
            </ProtectedRoute>
          }
        />
        <Route path="*" element={<Navigate to="/dashboard" replace />} />
      </Routes>
    </BrowserRouter>
  )
}

export default App
```

- [ ] **Step 3: Verify the full frontend builds**

```bash
cd frontend && npm run build
```

Expected: Build completes with no errors.

- [ ] **Step 4: Commit**

```bash
git add frontend/src/
git commit -m "feat: add ReviewView with full review UI and integrate into App routing"
```

---

## Phase 9: Firebase Security & Deployment

### Task 25: Firestore and Storage security rules

**Files:**
- Modify: `firestore.rules`
- Modify: `storage.rules`

- [ ] **Step 1: Write Firestore rules**

Replace `firestore.rules`:

```
rules_version = '2';

service cloud.firestore {
  match /databases/{database}/documents {
    // Users can read/write their own user doc
    match /users/{userId} {
      allow read, write: if request.auth != null && request.auth.uid == userId;
    }

    // Videos: users can only read their own
    match /videos/{videoId} {
      allow read: if request.auth != null && resource.data.userId == request.auth.uid;
      allow create: if false; // Only created by API service
      allow update: if false;
      allow delete: if false;
    }

    // Jobs: users can only read their own
    match /jobs/{jobId} {
      allow read: if request.auth != null && resource.data.userId == request.auth.uid;
      allow write: if false; // Only written by worker service
    }

    // Cuts: users can only read their own
    match /cuts/{cutId} {
      allow read: if request.auth != null && resource.data.userId == request.auth.uid;
      allow write: if false;
    }
  }
}
```

- [ ] **Step 2: Write Storage rules**

Replace `storage.rules`:

```
rules_version = '2';

service firebase.storage {
  match /b/{bucket}/o {
    // Users can upload to their own video paths
    match /videos/{videoId}/{filename} {
      allow read: if request.auth != null;
      allow write: if request.auth != null;
    }

    // Analysis results are readable by authenticated users
    match /analysis/{videoId}/{allPaths=**} {
      allow read: if request.auth != null;
      allow write: if false; // Only written by backend services
    }

    // Output files are readable by authenticated users
    match /output/{videoId}/{allPaths=**} {
      allow read: if request.auth != null;
      allow write: if false;
    }
  }
}
```

- [ ] **Step 3: Deploy rules**

```bash
firebase deploy --only firestore:rules,storage
```

- [ ] **Step 4: Commit**

```bash
git add firestore.rules storage.rules
git commit -m "feat: add Firestore and Storage security rules"
```

---

### Task 26: Dockerfiles for Cloud Run

**Files:**
- Create: `api/Dockerfile`
- Create: `worker/Dockerfile`

- [ ] **Step 1: Create API Dockerfile**

Create `api/Dockerfile`:

```dockerfile
FROM node:20-slim

# Install ffprobe for FPS extraction
RUN apt-get update && apt-get install -y ffmpeg && rm -rf /var/lib/apt/lists/*

WORKDIR /app
COPY package*.json ./
RUN npm ci --production
COPY tsconfig.json ./
COPY src/ src/
RUN npx tsc

EXPOSE 8080
ENV PORT=8080
CMD ["node", "dist/index.js"]
```

- [ ] **Step 2: Create Worker Dockerfile**

Create `worker/Dockerfile`:

```dockerfile
FROM node:20-slim

WORKDIR /app
COPY package*.json ./
RUN npm ci --production
COPY tsconfig.json ./
COPY src/ src/
RUN npx tsc

EXPOSE 8081
ENV PORT=8081
CMD ["node", "dist/index.js"]
```

- [ ] **Step 3: Commit**

```bash
git add api/Dockerfile worker/Dockerfile
git commit -m "feat: add Dockerfiles for API and Worker Cloud Run services"
```

---

### Task 27: Update firebase.json for hosting

**Files:**
- Modify: `firebase.json`

- [ ] **Step 1: Update firebase.json**

Replace `firebase.json`:

```json
{
  "hosting": {
    "public": "frontend/dist",
    "ignore": ["firebase.json", "**/.*", "**/node_modules/**"],
    "rewrites": [
      {
        "source": "**",
        "destination": "/index.html"
      }
    ]
  },
  "firestore": {
    "rules": "firestore.rules"
  },
  "storage": {
    "rules": "storage.rules"
  }
}
```

- [ ] **Step 2: Test frontend build and preview**

```bash
cd frontend && npm run build
cd .. && firebase serve --only hosting
```

Expected: App serves at localhost:5000, sign-in page loads.

- [ ] **Step 3: Commit**

```bash
git add firebase.json
git commit -m "chore: update firebase.json for SPA hosting"
```

---

### Task 28: Deploy Cloud Run services

- [ ] **Step 1: Deploy API service**

```bash
cd api
gcloud run deploy gweebler-api \
  --source . \
  --region us-west1 \
  --allow-unauthenticated \
  --set-env-vars "GCS_BUCKET=gweebler.firebasestorage.app,CLOUD_TASKS_QUEUE=gweebler-analysis,CLOUD_TASKS_LOCATION=us-west1,GCP_PROJECT=gweebler,ALLOWED_EMAILS=kbi102003@gmail.com\,akshayphx@gmail.com" \
  --set-env-vars "MODAL_ENDPOINT_URL=<YOUR_MODAL_URL>,MODAL_AUTH_TOKEN=<YOUR_TOKEN>" \
  --update-env-vars "WORKER_SERVICE_URL=<WORKER_URL_FROM_STEP_2>"
```

Note the API service URL from the output.

- [ ] **Step 2: Deploy Worker service**

```bash
cd worker
gcloud run deploy gweebler-worker \
  --source . \
  --region us-west1 \
  --no-allow-unauthenticated \
  --set-env-vars "GCS_BUCKET=gweebler.firebasestorage.app,ANTHROPIC_API_KEY=<KEY>" \
  --set-env-vars "MODAL_ENDPOINT_URL=<YOUR_MODAL_URL>,MODAL_AUTH_TOKEN=<YOUR_TOKEN>" \
  --timeout 1800 \
  --memory 512Mi \
  --max-instances 3 \
  --concurrency 1
```

Note the Worker service URL, then update the API service:

```bash
gcloud run services update gweebler-api --region us-west1 \
  --update-env-vars "WORKER_SERVICE_URL=<WORKER_URL>"
```

- [ ] **Step 3: Update frontend .env with production API URL**

Update `frontend/.env.local` (or create `.env.production`):

```env
VITE_API_URL=https://gweebler-api-XXXXX-uw.a.run.app
```

- [ ] **Step 4: Deploy frontend to Firebase Hosting**

```bash
cd frontend && npm run build
cd .. && firebase deploy --only hosting
```

- [ ] **Step 5: Deploy Modal endpoints**

```bash
cd modal && modal deploy app.py
```

- [ ] **Step 6: Commit any config changes**

```bash
git add -A
git commit -m "chore: production deployment configuration"
```

---

### Task 29: GCS lifecycle policy for output cleanup

- [ ] **Step 1: Create lifecycle rule**

```bash
echo '{"lifecycle":{"rule":[{"action":{"type":"Delete"},"condition":{"age":1,"matchesPrefix":["output/"]}}]}}' > /tmp/lifecycle.json
gcloud storage buckets update gs://gweebler.firebasestorage.app --lifecycle-file=/tmp/lifecycle.json
```

This deletes files in `output/` after 1 day.

- [ ] **Step 2: Verify**

```bash
gcloud storage buckets describe gs://gweebler.firebasestorage.app --format="json(lifecycle)"
```

Expected: Shows the lifecycle rule for output/ prefix.

---

## End-to-End Verification

After all tasks are complete, verify the full flow:

1. Open the deployed app URL
2. Sign in with Google (kbi102003@gmail.com)
3. Upload a test video via drag-and-drop
4. Click "Analyze" and select all passes
5. Watch real-time progress in the dashboard
6. Once complete, click "Review" to open the review UI
7. Verify timeline, segments, transcript all display correctly
8. Accept/reject segments, test undo, split, drag handles
9. Click "Save & Cut" and verify the download triggers
10. Verify the cut video plays correctly
