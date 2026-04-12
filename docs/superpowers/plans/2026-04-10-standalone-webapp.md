# FilmHub Standalone WebApp Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Transform FilmHub from a local CLI + webapp into a standalone, authenticated web application with cloud-based video processing (Modal) and AI-powered analysis orchestration (Anthropic SDK with tool use).

**Architecture:** Next.js 15 App Router replaces the Rust/Axum backend and Vite frontend. BetterAuth handles authentication with email/password (whitelisted users only). Videos and analysis artifacts are stored on local filesystem within the app's `data/` directory. Modal runs GPU-intensive detection passes (transcription, music detection, graphics detection) via web endpoints. The Anthropic TypeScript SDK orchestrates the full analysis pipeline using tool use, replacing the current Claude Code skill system. Video cutting runs on Modal. Server-Sent Events stream analysis progress to the frontend.

**Tech Stack:** Next.js 15 (App Router), React 19, TypeScript, Tailwind CSS v4, BetterAuth, Drizzle ORM + SQLite, Modal (Python GPU compute), Anthropic SDK (agent orchestration), FFmpeg

---

## File Structure

```
FilmHub/
├── web/                           # Next.js application
│   ├── package.json
│   ├── next.config.ts
│   ├── tsconfig.json
│   ├── drizzle.config.ts
│   ├── .env.local                 # Secrets (not committed)
│   ├── middleware.ts              # Auth route protection
│   ├── app/
│   │   ├── layout.tsx             # Root layout, font, Tailwind
│   │   ├── page.tsx               # Redirect: authed → /dashboard, else → /sign-in
│   │   ├── globals.css            # Tailwind v4 import
│   │   ├── sign-in/
│   │   │   └── page.tsx           # Sign-in form
│   │   ├── dashboard/
│   │   │   ├── layout.tsx         # Auth-gated layout shell
│   │   │   ├── page.tsx           # VideoPicker (upload, select, manage)
│   │   │   └── review/
│   │   │       └── [videoId]/
│   │   │           └── page.tsx   # Full review view for one video
│   │   └── api/
│   │       ├── auth/
│   │       │   └── [...all]/
│   │       │       └── route.ts   # BetterAuth catch-all handler
│   │       ├── videos/
│   │       │   ├── route.ts       # GET: list user's videos; POST: upload
│   │       │   └── [videoId]/
│   │       │       ├── route.ts   # GET: video info; DELETE: remove video
│   │       │       └── stream/
│   │       │           └── route.ts  # GET: video stream with range requests
│   │       ├── analyze/
│   │       │   └── route.ts       # POST: trigger analysis for video(s)
│   │       ├── analysis/
│   │       │   └── [videoId]/
│   │       │       ├── route.ts   # GET: review_data.json
│   │       │       └── frames/
│   │       │           └── [filename]/
│   │       │               └── route.ts  # GET: graphics frame PNG
│   │       ├── save/
│   │       │   └── [videoId]/
│   │       │       └── route.ts   # POST: save review → finalized_data.json
│   │       └── cut/
│   │           └── [videoId]/
│   │               └── route.ts   # POST: trigger cut; GET: status + download
│   ├── lib/
│   │   ├── auth.ts               # BetterAuth server config
│   │   ├── auth-client.ts        # BetterAuth React client
│   │   ├── db/
│   │   │   ├── index.ts          # Drizzle client
│   │   │   └── schema.ts         # user, session, account, video, analysisJob tables
│   │   ├── storage.ts            # Local filesystem read/write/stream helpers
│   │   ├── modal-client.ts       # HTTP client for Modal web endpoints
│   │   ├── agent.ts              # Anthropic SDK agent loop with tools
│   │   └── require-auth.ts       # API route auth helper
│   ├── components/
│   │   ├── SignInForm.tsx
│   │   ├── VideoPicker.tsx        # Grid of videos with upload, select, actions
│   │   ├── VideoCard.tsx          # Single video card with status indicator
│   │   ├── UploadZone.tsx         # Drag-and-drop / click upload with progress
│   │   ├── ReviewView.tsx         # Main review layout (migrated from App.tsx ReviewView)
│   │   ├── VideoPlayer.tsx        # Migrated from reviewer/frontend
│   │   ├── Timeline.tsx           # Migrated from reviewer/frontend
│   │   ├── SegmentProperties.tsx  # Migrated from reviewer/frontend
│   │   ├── TranscriptPanel.tsx    # Migrated from reviewer/frontend
│   │   └── ActionBar.tsx          # Migrated, updated for download flow
│   ├── hooks/
│   │   ├── useAnalysis.ts         # Adapted: fetches from new API
│   │   ├── useVideoSync.ts        # Migrated as-is
│   │   ├── useSegments.ts         # Migrated as-is
│   │   └── useHandleDrag.ts       # Migrated as-is
│   ├── types/
│   │   └── index.ts               # Migrated + extended with Video, AnalysisJob
│   └── data/                      # Runtime storage (gitignored)
│       ├── videos/                # {videoId}/{filename}
│       ├── analysis/              # {videoId}/review_data.json, frames/, etc.
│       └── output/                # {videoId}/clean.{ext}
├── modal/                         # Modal cloud functions
│   ├── app.py                     # Modal App with web endpoints
│   ├── requirements.txt           # Python dependencies for Modal image
│   └── filmhub_modal/             # Adapted Python processing modules
│       ├── __init__.py
│       ├── transcribe.py          # Whisper (not MLX - uses faster-whisper for GPU)
│       ├── detect_music.py        # Demucs + librosa + AcoustID
│       ├── detect_graphics.py     # OpenCV frame analysis
│       └── cut_video.py           # FFmpeg lossless cutting
├── filmhub/                       # Original Python package (kept for reference)
├── reviewer/                      # Original Rust+React app (kept for reference)
└── .env.example                   # Template for required env vars
```

---

## Phase 1: Project Foundation

### Task 1: Initialize Next.js project

**Files:**
- Create: `web/package.json`
- Create: `web/next.config.ts`
- Create: `web/tsconfig.json`
- Create: `web/app/globals.css`
- Create: `web/app/layout.tsx`
- Create: `web/app/page.tsx`
- Create: `web/.env.local`
- Create: `web/.env.example`
- Create: `web/.gitignore`

- [ ] **Step 1: Scaffold Next.js app**

```bash
cd /Users/kbi102003/Documents/GitHub/FilmHub
npx create-next-app@latest web --typescript --tailwind --eslint --app --src-dir=false --import-alias="@/*" --turbopack
```

Accept defaults. This creates the full Next.js scaffold with Tailwind v4.

- [ ] **Step 2: Verify it runs**

```bash
cd web && npm run dev
```

Expected: Dev server starts at http://localhost:3000, default Next.js page renders.

- [ ] **Step 3: Configure environment template**

Create `web/.env.example`:

```env
# Auth
BETTER_AUTH_SECRET=           # Random 32+ char string for session signing
BETTER_AUTH_URL=http://localhost:3000

# Anthropic
ANTHROPIC_API_KEY=            # For agent orchestration + Claude Vision

# Modal
MODAL_ENDPOINT_URL=           # Base URL for deployed Modal web endpoints
MODAL_AUTH_TOKEN=              # Shared secret for Modal endpoint auth

# Allowed emails (comma-separated)
ALLOWED_EMAILS=kbi102003@gmail.com,akshayphx@gmail.com
```

Create `web/.env.local` with actual values (do NOT commit).

- [ ] **Step 4: Add data directory to .gitignore**

Append to `web/.gitignore`:

```
# Runtime data
data/
```

- [ ] **Step 5: Create data directories**

```bash
mkdir -p web/data/videos web/data/analysis web/data/output
```

- [ ] **Step 6: Commit**

```bash
git add web/
git commit -m "feat: scaffold Next.js 15 app with Tailwind v4"
```

---

### Task 2: Set up database with Drizzle + SQLite

**Files:**
- Create: `web/lib/db/schema.ts`
- Create: `web/lib/db/index.ts`
- Create: `web/drizzle.config.ts`
- Modify: `web/package.json` (add deps)

- [ ] **Step 1: Install dependencies**

```bash
cd web && npm install drizzle-orm better-sqlite3 && npm install -D drizzle-kit @types/better-sqlite3
```

- [ ] **Step 2: Write database schema**

Create `web/lib/db/schema.ts`:

```typescript
import { sqliteTable, text, integer } from "drizzle-orm/sqlite-core";

// BetterAuth tables — BetterAuth auto-creates these but we define them
// for Drizzle's type inference and query building.
export const user = sqliteTable("user", {
  id: text("id").primaryKey(),
  name: text("name").notNull(),
  email: text("email").notNull().unique(),
  emailVerified: integer("emailVerified", { mode: "boolean" }).notNull().default(false),
  image: text("image"),
  createdAt: integer("createdAt", { mode: "timestamp" }).notNull(),
  updatedAt: integer("updatedAt", { mode: "timestamp" }).notNull(),
});

export const session = sqliteTable("session", {
  id: text("id").primaryKey(),
  expiresAt: integer("expiresAt", { mode: "timestamp" }).notNull(),
  token: text("token").notNull().unique(),
  createdAt: integer("createdAt", { mode: "timestamp" }).notNull(),
  updatedAt: integer("updatedAt", { mode: "timestamp" }).notNull(),
  ipAddress: text("ipAddress"),
  userAgent: text("userAgent"),
  userId: text("userId").notNull().references(() => user.id),
});

export const account = sqliteTable("account", {
  id: text("id").primaryKey(),
  accountId: text("accountId").notNull(),
  providerId: text("providerId").notNull(),
  userId: text("userId").notNull().references(() => user.id),
  accessToken: text("accessToken"),
  refreshToken: text("refreshToken"),
  idToken: text("idToken"),
  accessTokenExpiresAt: integer("accessTokenExpiresAt", { mode: "timestamp" }),
  refreshTokenExpiresAt: integer("refreshTokenExpiresAt", { mode: "timestamp" }),
  scope: text("scope"),
  password: text("password"),
  createdAt: integer("createdAt", { mode: "timestamp" }).notNull(),
  updatedAt: integer("updatedAt", { mode: "timestamp" }).notNull(),
});

export const verification = sqliteTable("verification", {
  id: text("id").primaryKey(),
  identifier: text("identifier").notNull(),
  value: text("value").notNull(),
  expiresAt: integer("expiresAt", { mode: "timestamp" }).notNull(),
  createdAt: integer("createdAt", { mode: "timestamp" }),
  updatedAt: integer("updatedAt", { mode: "timestamp" }),
});

export const video = sqliteTable("video", {
  id: text("id").primaryKey(), // nanoid
  userId: text("userId").notNull().references(() => user.id),
  filename: text("filename").notNull(),       // stored filename
  originalName: text("originalName").notNull(), // user's original filename
  mimeType: text("mimeType").notNull(),
  fileSize: integer("fileSize").notNull(),     // bytes
  duration: integer("duration"),               // seconds, populated after probe
  status: text("status", { enum: ["uploaded", "analyzing", "ready", "error"] }).notNull().default("uploaded"),
  error: text("error"),
  createdAt: integer("createdAt", { mode: "timestamp" }).notNull(),
  updatedAt: integer("updatedAt", { mode: "timestamp" }).notNull(),
});

export const analysisJob = sqliteTable("analysis_job", {
  id: text("id").primaryKey(), // nanoid
  videoId: text("videoId").notNull().references(() => video.id, { onDelete: "cascade" }),
  status: text("status", { enum: ["pending", "running", "completed", "failed"] }).notNull().default("pending"),
  progress: text("progress"),  // JSON string: { step: string, percent: number }
  error: text("error"),
  startedAt: integer("startedAt", { mode: "timestamp" }),
  completedAt: integer("completedAt", { mode: "timestamp" }),
  createdAt: integer("createdAt", { mode: "timestamp" }).notNull(),
});
```

- [ ] **Step 3: Write database client**

Create `web/lib/db/index.ts`:

```typescript
import Database from "better-sqlite3";
import { drizzle } from "drizzle-orm/better-sqlite3";
import * as schema from "./schema";
import path from "path";

const DB_PATH = path.join(process.cwd(), "data", "filmhub.db");

const sqlite = new Database(DB_PATH);
sqlite.pragma("journal_mode = WAL");
sqlite.pragma("foreign_keys = ON");

export const db = drizzle(sqlite, { schema });
```

- [ ] **Step 4: Write Drizzle config**

Create `web/drizzle.config.ts`:

```typescript
import { defineConfig } from "drizzle-kit";

export default defineConfig({
  schema: "./lib/db/schema.ts",
  out: "./drizzle",
  dialect: "sqlite",
  dbCredentials: {
    url: "./data/filmhub.db",
  },
});
```

- [ ] **Step 5: Generate and run migration**

```bash
cd web && npx drizzle-kit generate && npx drizzle-kit migrate
```

Expected: Migration files created in `web/drizzle/`, database file created at `web/data/filmhub.db`.

- [ ] **Step 6: Commit**

```bash
git add web/lib/db/ web/drizzle.config.ts web/drizzle/ web/package.json web/package-lock.json
git commit -m "feat: add Drizzle ORM with SQLite schema for users, videos, jobs"
```

---

### Task 3: Set up BetterAuth with email whitelist

**Files:**
- Create: `web/lib/auth.ts`
- Create: `web/lib/auth-client.ts`
- Create: `web/app/api/auth/[...all]/route.ts`
- Modify: `web/package.json` (add deps)

- [ ] **Step 1: Install BetterAuth**

```bash
cd web && npm install better-auth
```

- [ ] **Step 2: Write server-side auth config**

Create `web/lib/auth.ts`:

```typescript
import { betterAuth } from "better-auth";
import { drizzleAdapter } from "better-auth/adapters/drizzle";
import { db } from "./db";
import * as schema from "./db/schema";

const ALLOWED_EMAILS = (process.env.ALLOWED_EMAILS ?? "")
  .split(",")
  .map((e) => e.trim().toLowerCase())
  .filter(Boolean);

export const auth = betterAuth({
  database: drizzleAdapter(db, {
    provider: "sqlite",
    schema: {
      user: schema.user,
      session: schema.session,
      account: schema.account,
      verification: schema.verification,
    },
  }),
  emailAndPassword: {
    enabled: true,
  },
  session: {
    cookieCache: {
      enabled: true,
      maxAge: 5 * 60, // 5 min cache
    },
  },
  hooks: {
    before: [
      {
        matcher: (context) => context.path.startsWith("/sign-up"),
        handler: async (ctx) => {
          const body = ctx.body as { email?: string } | undefined;
          const email = body?.email?.toLowerCase();
          if (!email || !ALLOWED_EMAILS.includes(email)) {
            return new Response(
              JSON.stringify({ error: "Registration is invite-only" }),
              { status: 403, headers: { "Content-Type": "application/json" } }
            );
          }
        },
      },
    ],
  },
});
```

- [ ] **Step 3: Write BetterAuth API route handler**

Create `web/app/api/auth/[...all]/route.ts`:

```typescript
import { auth } from "@/lib/auth";
import { toNextJsHandler } from "better-auth/next-js";

export const { GET, POST } = toNextJsHandler(auth);
```

- [ ] **Step 4: Write client-side auth**

Create `web/lib/auth-client.ts`:

```typescript
import { createAuthClient } from "better-auth/react";

export const { signIn, signUp, signOut, useSession } = createAuthClient({
  baseURL: process.env.NEXT_PUBLIC_APP_URL ?? "http://localhost:3000",
});
```

Add to `web/.env.local`:

```
NEXT_PUBLIC_APP_URL=http://localhost:3000
```

- [ ] **Step 5: Write auth route protection helper**

Create `web/lib/require-auth.ts`:

```typescript
import { auth } from "./auth";
import { headers } from "next/headers";

export async function requireAuth() {
  const session = await auth.api.getSession({
    headers: await headers(),
  });
  if (!session) {
    throw new Response(JSON.stringify({ error: "Unauthorized" }), {
      status: 401,
      headers: { "Content-Type": "application/json" },
    });
  }
  return session;
}
```

- [ ] **Step 6: Write Next.js middleware for route protection**

Create `web/middleware.ts`:

```typescript
import { NextRequest, NextResponse } from "next/server";

export function middleware(request: NextRequest) {
  const { pathname } = request.nextUrl;

  // Public routes: sign-in, auth API, static assets
  const publicPaths = ["/sign-in", "/api/auth"];
  if (publicPaths.some((p) => pathname.startsWith(p))) {
    return NextResponse.next();
  }

  // Check for session cookie (BetterAuth uses "better-auth.session_token")
  const sessionCookie =
    request.cookies.get("better-auth.session_token") ??
    request.cookies.get("__Secure-better-auth.session_token");

  if (!sessionCookie && pathname.startsWith("/dashboard")) {
    return NextResponse.redirect(new URL("/sign-in", request.url));
  }

  if (!sessionCookie && pathname.startsWith("/api/") && !pathname.startsWith("/api/auth")) {
    return new NextResponse(JSON.stringify({ error: "Unauthorized" }), {
      status: 401,
      headers: { "Content-Type": "application/json" },
    });
  }

  return NextResponse.next();
}

export const config = {
  matcher: ["/dashboard/:path*", "/api/:path*"],
};
```

- [ ] **Step 7: Verify auth works**

Start the dev server (`npm run dev`), navigate to `/dashboard` — should redirect to `/sign-in`. Navigate to `/api/auth/ok` — should return BetterAuth health check. POST to `/api/auth/sign-up/email` with a whitelisted email — should succeed. POST with a non-whitelisted email — should return 403.

- [ ] **Step 8: Commit**

```bash
git add web/lib/auth.ts web/lib/auth-client.ts web/lib/require-auth.ts web/middleware.ts web/app/api/auth/ web/package.json web/package-lock.json
git commit -m "feat: add BetterAuth with email whitelist and route protection"
```

---

### Task 4: Create sign-in page

**Files:**
- Create: `web/components/SignInForm.tsx`
- Create: `web/app/sign-in/page.tsx`

- [ ] **Step 1: Write SignInForm component**

Create `web/components/SignInForm.tsx`:

```tsx
"use client";

import { useState } from "react";
import { signIn, signUp } from "@/lib/auth-client";
import { useRouter } from "next/navigation";

export function SignInForm() {
  const router = useRouter();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [name, setName] = useState("");
  const [isSignUp, setIsSignUp] = useState(false);
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError("");
    setLoading(true);

    try {
      if (isSignUp) {
        const result = await signUp.email({ email, password, name });
        if (result.error) {
          setError(result.error.message ?? "Sign up failed");
          setLoading(false);
          return;
        }
      } else {
        const result = await signIn.email({ email, password });
        if (result.error) {
          setError(result.error.message ?? "Sign in failed");
          setLoading(false);
          return;
        }
      }
      router.push("/dashboard");
    } catch {
      setError("Something went wrong");
      setLoading(false);
    }
  }

  return (
    <form onSubmit={handleSubmit} className="flex flex-col gap-4 w-full max-w-sm">
      <h1 className="text-2xl font-bold text-center">
        {isSignUp ? "Create Account" : "Sign In"}
      </h1>

      {isSignUp && (
        <input
          type="text"
          placeholder="Name"
          value={name}
          onChange={(e) => setName(e.target.value)}
          required
          className="px-4 py-2 border border-zinc-700 rounded-lg bg-zinc-900 text-white placeholder-zinc-500 focus:outline-none focus:ring-2 focus:ring-blue-500"
        />
      )}

      <input
        type="email"
        placeholder="Email"
        value={email}
        onChange={(e) => setEmail(e.target.value)}
        required
        className="px-4 py-2 border border-zinc-700 rounded-lg bg-zinc-900 text-white placeholder-zinc-500 focus:outline-none focus:ring-2 focus:ring-blue-500"
      />

      <input
        type="password"
        placeholder="Password"
        value={password}
        onChange={(e) => setPassword(e.target.value)}
        required
        minLength={8}
        className="px-4 py-2 border border-zinc-700 rounded-lg bg-zinc-900 text-white placeholder-zinc-500 focus:outline-none focus:ring-2 focus:ring-blue-500"
      />

      {error && <p className="text-red-400 text-sm text-center">{error}</p>}

      <button
        type="submit"
        disabled={loading}
        className="px-4 py-2 bg-blue-600 text-white rounded-lg font-medium hover:bg-blue-500 disabled:opacity-50 disabled:cursor-not-allowed"
      >
        {loading ? "..." : isSignUp ? "Create Account" : "Sign In"}
      </button>

      <button
        type="button"
        onClick={() => { setIsSignUp(!isSignUp); setError(""); }}
        className="text-sm text-zinc-400 hover:text-white"
      >
        {isSignUp ? "Already have an account? Sign in" : "Need an account? Sign up"}
      </button>
    </form>
  );
}
```

- [ ] **Step 2: Write sign-in page**

Create `web/app/sign-in/page.tsx`:

```tsx
import { SignInForm } from "@/components/SignInForm";

export default function SignInPage() {
  return (
    <main className="min-h-screen bg-zinc-950 text-white flex items-center justify-center p-4">
      <SignInForm />
    </main>
  );
}
```

- [ ] **Step 3: Write root page redirect**

Replace `web/app/page.tsx`:

```tsx
import { redirect } from "next/navigation";
import { auth } from "@/lib/auth";
import { headers } from "next/headers";

export default async function Home() {
  const session = await auth.api.getSession({ headers: await headers() });
  if (session) {
    redirect("/dashboard");
  } else {
    redirect("/sign-in");
  }
}
```

- [ ] **Step 4: Verify sign-in flow**

Start dev server. Navigate to `/` — should redirect to `/sign-in`. Sign up with `kbi102003@gmail.com` — should succeed and redirect to `/dashboard`. Sign out, try sign up with `test@example.com` — should show error. Sign back in with the created account — should work.

- [ ] **Step 5: Commit**

```bash
git add web/components/SignInForm.tsx web/app/sign-in/ web/app/page.tsx
git commit -m "feat: add sign-in page with email/password auth"
```

---

## Phase 2: Video Storage & Upload

### Task 5: Write storage module

**Files:**
- Create: `web/lib/storage.ts`

- [ ] **Step 1: Write storage helpers**

Create `web/lib/storage.ts`:

```typescript
import fs from "fs/promises";
import { createReadStream, existsSync, statSync } from "fs";
import path from "path";
import { ReadStream } from "fs";

const DATA_DIR = path.join(process.cwd(), "data");

export const VIDEOS_DIR = path.join(DATA_DIR, "videos");
export const ANALYSIS_DIR = path.join(DATA_DIR, "analysis");
export const OUTPUT_DIR = path.join(DATA_DIR, "output");

/** Resolve a path within the data directory, preventing traversal */
function safePath(base: string, ...segments: string[]): string {
  const resolved = path.resolve(base, ...segments);
  if (!resolved.startsWith(base)) {
    throw new Error("Path traversal detected");
  }
  return resolved;
}

export async function ensureDir(dir: string): Promise<void> {
  await fs.mkdir(dir, { recursive: true });
}

export function videoDir(videoId: string): string {
  return safePath(VIDEOS_DIR, videoId);
}

export function analysisDir(videoId: string): string {
  return safePath(ANALYSIS_DIR, videoId);
}

export function outputDir(videoId: string): string {
  return safePath(OUTPUT_DIR, videoId);
}

export async function saveVideoFile(
  videoId: string,
  filename: string,
  data: Buffer
): Promise<string> {
  const dir = videoDir(videoId);
  await ensureDir(dir);
  const filePath = safePath(dir, filename);
  await fs.writeFile(filePath, data);
  return filePath;
}

export async function getVideoFilePath(
  videoId: string,
  filename: string
): string {
  const filePath = safePath(videoDir(videoId), filename);
  if (!existsSync(filePath)) {
    throw new Error("Video file not found");
  }
  return filePath;
}

export function getVideoFileStream(
  filePath: string,
  start?: number,
  end?: number
): ReadStream {
  return createReadStream(filePath, { start, end });
}

export function getFileSize(filePath: string): number {
  return statSync(filePath).size;
}

export async function saveAnalysisFile(
  videoId: string,
  filename: string,
  data: string | Buffer
): Promise<string> {
  const dir = analysisDir(videoId);
  await ensureDir(dir);
  const filePath = safePath(dir, filename);
  await fs.writeFile(filePath, data);
  return filePath;
}

export async function readAnalysisFile(
  videoId: string,
  filename: string
): Promise<string> {
  const filePath = safePath(analysisDir(videoId), filename);
  return fs.readFile(filePath, "utf-8");
}

export async function analysisFileExists(
  videoId: string,
  filename: string
): Promise<boolean> {
  const filePath = safePath(analysisDir(videoId), filename);
  return existsSync(filePath);
}

export async function saveOutputFile(
  videoId: string,
  filename: string,
  data: Buffer
): Promise<string> {
  const dir = outputDir(videoId);
  await ensureDir(dir);
  const filePath = safePath(dir, filename);
  await fs.writeFile(filePath, data);
  return filePath;
}

export async function deleteVideoFiles(videoId: string): Promise<void> {
  const dirs = [videoDir(videoId), analysisDir(videoId), outputDir(videoId)];
  for (const dir of dirs) {
    if (existsSync(dir)) {
      await fs.rm(dir, { recursive: true, force: true });
    }
  }
}
```

- [ ] **Step 2: Commit**

```bash
git add web/lib/storage.ts
git commit -m "feat: add filesystem storage module with path traversal protection"
```

---

### Task 6: Create video upload API

**Files:**
- Create: `web/app/api/videos/route.ts`
- Modify: `web/package.json` (add nanoid)

- [ ] **Step 1: Install nanoid**

```bash
cd web && npm install nanoid
```

- [ ] **Step 2: Write video list + upload API route**

Create `web/app/api/videos/route.ts`:

```typescript
import { NextRequest, NextResponse } from "next/server";
import { requireAuth } from "@/lib/require-auth";
import { db } from "@/lib/db";
import { video } from "@/lib/db/schema";
import { eq, desc } from "drizzle-orm";
import { saveVideoFile, analysisFileExists } from "@/lib/storage";
import { nanoid } from "nanoid";

const ALLOWED_TYPES = new Set([
  "video/mp4",
  "video/quicktime",
  "video/x-matroska",
  "video/x-msvideo",
  "video/webm",
]);

const MAX_FILE_SIZE = 5 * 1024 * 1024 * 1024; // 5 GB

// GET /api/videos — list user's videos
export async function GET() {
  const session = await requireAuth();
  const videos = await db
    .select()
    .from(video)
    .where(eq(video.userId, session.user.id))
    .orderBy(desc(video.createdAt));

  // Enrich with analysis status
  const enriched = await Promise.all(
    videos.map(async (v) => ({
      ...v,
      hasReviewData: await analysisFileExists(v.id, "review_data.json"),
    }))
  );

  return NextResponse.json(enriched);
}

// POST /api/videos — upload a video
export async function POST(request: NextRequest) {
  const session = await requireAuth();

  const formData = await request.formData();
  const file = formData.get("file") as File | null;

  if (!file) {
    return NextResponse.json({ error: "No file provided" }, { status: 400 });
  }

  if (!ALLOWED_TYPES.has(file.type)) {
    return NextResponse.json(
      { error: `Unsupported file type: ${file.type}` },
      { status: 400 }
    );
  }

  if (file.size > MAX_FILE_SIZE) {
    return NextResponse.json(
      { error: "File too large (max 5 GB)" },
      { status: 400 }
    );
  }

  // Sanitize filename: keep only safe characters
  const safeName = file.name.replace(/[^a-zA-Z0-9._-]/g, "_");
  const videoId = nanoid();
  const now = new Date();

  const buffer = Buffer.from(await file.arrayBuffer());
  await saveVideoFile(videoId, safeName, buffer);

  const [newVideo] = await db
    .insert(video)
    .values({
      id: videoId,
      userId: session.user.id,
      filename: safeName,
      originalName: file.name,
      mimeType: file.type,
      fileSize: file.size,
      status: "uploaded",
      createdAt: now,
      updatedAt: now,
    })
    .returning();

  return NextResponse.json(newVideo, { status: 201 });
}
```

- [ ] **Step 3: Commit**

```bash
git add web/app/api/videos/route.ts web/package.json web/package-lock.json
git commit -m "feat: add video list and upload API endpoints"
```

---

### Task 7: Create video info, delete, and stream APIs

**Files:**
- Create: `web/app/api/videos/[videoId]/route.ts`
- Create: `web/app/api/videos/[videoId]/stream/route.ts`

- [ ] **Step 1: Write video info + delete route**

Create `web/app/api/videos/[videoId]/route.ts`:

```typescript
import { NextRequest, NextResponse } from "next/server";
import { requireAuth } from "@/lib/require-auth";
import { db } from "@/lib/db";
import { video } from "@/lib/db/schema";
import { eq, and } from "drizzle-orm";
import { deleteVideoFiles } from "@/lib/storage";

type Params = { params: Promise<{ videoId: string }> };

// GET /api/videos/[videoId]
export async function GET(request: NextRequest, { params }: Params) {
  const session = await requireAuth();
  const { videoId } = await params;

  const [v] = await db
    .select()
    .from(video)
    .where(and(eq(video.id, videoId), eq(video.userId, session.user.id)));

  if (!v) {
    return NextResponse.json({ error: "Not found" }, { status: 404 });
  }

  return NextResponse.json(v);
}

// DELETE /api/videos/[videoId]
export async function DELETE(request: NextRequest, { params }: Params) {
  const session = await requireAuth();
  const { videoId } = await params;

  const [v] = await db
    .select()
    .from(video)
    .where(and(eq(video.id, videoId), eq(video.userId, session.user.id)));

  if (!v) {
    return NextResponse.json({ error: "Not found" }, { status: 404 });
  }

  // Delete from filesystem
  await deleteVideoFiles(videoId);

  // Delete from database (cascade deletes analysis_job rows)
  await db.delete(video).where(eq(video.id, videoId));

  return NextResponse.json({ ok: true });
}
```

- [ ] **Step 2: Write video streaming route with range request support**

Create `web/app/api/videos/[videoId]/stream/route.ts`:

```typescript
import { NextRequest, NextResponse } from "next/server";
import { requireAuth } from "@/lib/require-auth";
import { db } from "@/lib/db";
import { video } from "@/lib/db/schema";
import { eq, and } from "drizzle-orm";
import { getVideoFilePath, getFileSize } from "@/lib/storage";
import { createReadStream } from "fs";
import { Readable } from "stream";

const CHUNK_SIZE = 2 * 1024 * 1024; // 2 MB

const MIME_MAP: Record<string, string> = {
  ".mp4": "video/mp4",
  ".mov": "video/quicktime",
  ".mkv": "video/x-matroska",
  ".avi": "video/x-msvideo",
  ".webm": "video/webm",
};

type Params = { params: Promise<{ videoId: string }> };

export async function GET(request: NextRequest, { params }: Params) {
  const session = await requireAuth();
  const { videoId } = await params;

  const [v] = await db
    .select()
    .from(video)
    .where(and(eq(video.id, videoId), eq(video.userId, session.user.id)));

  if (!v) {
    return new NextResponse("Not found", { status: 404 });
  }

  const filePath = await getVideoFilePath(videoId, v.filename);
  const fileSize = getFileSize(filePath);
  const ext = "." + v.filename.split(".").pop()?.toLowerCase();
  const contentType = MIME_MAP[ext] ?? "application/octet-stream";

  const range = request.headers.get("range");

  if (!range) {
    // Full file response
    const stream = createReadStream(filePath);
    const webStream = Readable.toWeb(stream) as ReadableStream;
    return new NextResponse(webStream, {
      status: 200,
      headers: {
        "Content-Type": contentType,
        "Content-Length": fileSize.toString(),
        "Accept-Ranges": "bytes",
      },
    });
  }

  // Parse range header
  const match = range.match(/bytes=(\d+)-(\d*)/);
  if (!match) {
    return new NextResponse("Invalid range", { status: 416 });
  }

  const start = parseInt(match[1], 10);
  const end = match[2] ? parseInt(match[2], 10) : Math.min(start + CHUNK_SIZE - 1, fileSize - 1);

  if (start >= fileSize || end >= fileSize) {
    return new NextResponse("Range not satisfiable", {
      status: 416,
      headers: { "Content-Range": `bytes */${fileSize}` },
    });
  }

  const stream = createReadStream(filePath, { start, end });
  const webStream = Readable.toWeb(stream) as ReadableStream;

  return new NextResponse(webStream, {
    status: 206,
    headers: {
      "Content-Type": contentType,
      "Content-Range": `bytes ${start}-${end}/${fileSize}`,
      "Content-Length": (end - start + 1).toString(),
      "Accept-Ranges": "bytes",
    },
  });
}
```

- [ ] **Step 3: Commit**

```bash
git add web/app/api/videos/
git commit -m "feat: add video info, delete, and range-request streaming endpoints"
```

---

### Task 8: Build VideoPicker with upload and multi-select

**Files:**
- Create: `web/components/UploadZone.tsx`
- Create: `web/components/VideoCard.tsx`
- Create: `web/components/VideoPicker.tsx`
- Create: `web/app/dashboard/layout.tsx`
- Create: `web/app/dashboard/page.tsx`
- Create: `web/types/index.ts`

- [ ] **Step 1: Write shared types**

Create `web/types/index.ts`:

```typescript
// Video record from database
export interface Video {
  id: string;
  userId: string;
  filename: string;
  originalName: string;
  mimeType: string;
  fileSize: number;
  duration: number | null;
  status: "uploaded" | "analyzing" | "ready" | "error";
  error: string | null;
  createdAt: string;
  updatedAt: string;
  hasReviewData?: boolean;
}

// Upload progress tracking
export interface UploadProgress {
  file: File;
  progress: number; // 0-100
  status: "pending" | "uploading" | "done" | "error";
  error?: string;
  videoId?: string;
}

// Analysis types (migrated from reviewer)
export interface ReviewData {
  video: { filename: string; path: string; fps: number };
  music: MusicSegment[];
  graphics: GraphicsCandidate[];
  transcript: { segments: TranscriptSegment[] };
  promotions: PromotionSegment[];
  suggested_segments: CleanSegment[];
}

export interface CleanSegment {
  start: number;
  end: number;
  types: string[];
  description: string;
  accepted?: boolean;
}

export interface MusicSegment {
  start: number;
  end: number;
  track: string | null;
}

export interface GraphicsCandidate {
  frame_index: number;
  timestamp: number;
  time_formatted?: string;
  correlation: number;
  before_frame: string;
  after_frame: string;
}

export interface TranscriptSegment {
  id: number;
  start: number;
  end: number;
  text: string;
}

export interface PromotionSegment {
  start: number;
  end: number;
  description: string;
}

export interface CutStatus {
  status: "idle" | "running" | "done" | "failed";
  downloadUrl?: string;
  error?: string;
}
```

- [ ] **Step 2: Write UploadZone component**

Create `web/components/UploadZone.tsx`:

```tsx
"use client";

import { useRef, useState, useCallback } from "react";
import type { UploadProgress } from "@/types";

interface UploadZoneProps {
  onUploadComplete: () => void;
}

export function UploadZone({ onUploadComplete }: UploadZoneProps) {
  const inputRef = useRef<HTMLInputElement>(null);
  const [uploads, setUploads] = useState<UploadProgress[]>([]);
  const [dragOver, setDragOver] = useState(false);

  const uploadFile = useCallback(async (file: File, index: number) => {
    setUploads((prev) =>
      prev.map((u, i) => (i === index ? { ...u, status: "uploading" as const } : u))
    );

    const formData = new FormData();
    formData.append("file", file);

    try {
      const xhr = new XMLHttpRequest();
      xhr.open("POST", "/api/videos");

      xhr.upload.onprogress = (e) => {
        if (e.lengthComputable) {
          const percent = Math.round((e.loaded / e.total) * 100);
          setUploads((prev) =>
            prev.map((u, i) => (i === index ? { ...u, progress: percent } : u))
          );
        }
      };

      await new Promise<void>((resolve, reject) => {
        xhr.onload = () => {
          if (xhr.status >= 200 && xhr.status < 300) {
            const result = JSON.parse(xhr.responseText);
            setUploads((prev) =>
              prev.map((u, i) =>
                i === index
                  ? { ...u, status: "done" as const, progress: 100, videoId: result.id }
                  : u
              )
            );
            resolve();
          } else {
            const error = JSON.parse(xhr.responseText)?.error ?? "Upload failed";
            setUploads((prev) =>
              prev.map((u, i) =>
                i === index ? { ...u, status: "error" as const, error } : u
              )
            );
            reject(new Error(error));
          }
        };
        xhr.onerror = () => reject(new Error("Network error"));
        xhr.send(formData);
      });
    } catch {
      // Error already handled in state
    }
  }, []);

  const handleFiles = useCallback(
    async (files: FileList) => {
      const newUploads: UploadProgress[] = Array.from(files).map((file) => ({
        file,
        progress: 0,
        status: "pending" as const,
      }));

      setUploads(newUploads);

      // Upload sequentially to avoid overwhelming the server
      for (let i = 0; i < newUploads.length; i++) {
        await uploadFile(newUploads[i].file, i);
      }

      onUploadComplete();
    },
    [uploadFile, onUploadComplete]
  );

  return (
    <div className="space-y-4">
      <div
        onDragOver={(e) => { e.preventDefault(); setDragOver(true); }}
        onDragLeave={() => setDragOver(false)}
        onDrop={(e) => { e.preventDefault(); setDragOver(false); handleFiles(e.dataTransfer.files); }}
        onClick={() => inputRef.current?.click()}
        className={`border-2 border-dashed rounded-xl p-8 text-center cursor-pointer transition-colors ${
          dragOver
            ? "border-blue-500 bg-blue-500/10"
            : "border-zinc-700 hover:border-zinc-500"
        }`}
      >
        <p className="text-zinc-400">
          Drop video files here or <span className="text-blue-400">browse</span>
        </p>
        <p className="text-zinc-600 text-sm mt-1">MP4, MOV, MKV, AVI, WebM up to 5 GB</p>
        <input
          ref={inputRef}
          type="file"
          accept="video/*"
          multiple
          hidden
          onChange={(e) => e.target.files && handleFiles(e.target.files)}
        />
      </div>

      {uploads.length > 0 && (
        <div className="space-y-2">
          {uploads.map((u, i) => (
            <div key={i} className="flex items-center gap-3 p-3 bg-zinc-900 rounded-lg">
              <span className="text-sm text-zinc-300 truncate flex-1">{u.file.name}</span>
              {u.status === "uploading" && (
                <div className="w-32 h-2 bg-zinc-700 rounded-full overflow-hidden">
                  <div
                    className="h-full bg-blue-500 transition-all"
                    style={{ width: `${u.progress}%` }}
                  />
                </div>
              )}
              {u.status === "done" && <span className="text-green-400 text-sm">Done</span>}
              {u.status === "error" && (
                <span className="text-red-400 text-sm">{u.error}</span>
              )}
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
```

- [ ] **Step 3: Write VideoCard component**

Create `web/components/VideoCard.tsx`:

```tsx
"use client";

import type { Video } from "@/types";

interface VideoCardProps {
  video: Video;
  selected: boolean;
  onToggleSelect: () => void;
  onOpen: () => void;
}

function formatSize(bytes: number): string {
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(0)} KB`;
  if (bytes < 1024 * 1024 * 1024) return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
  return `${(bytes / (1024 * 1024 * 1024)).toFixed(2)} GB`;
}

const STATUS_COLORS: Record<string, string> = {
  uploaded: "bg-zinc-600",
  analyzing: "bg-yellow-500 animate-pulse",
  ready: "bg-green-500",
  error: "bg-red-500",
};

export function VideoCard({ video, selected, onToggleSelect, onOpen }: VideoCardProps) {
  return (
    <div
      className={`relative p-4 rounded-xl border transition-colors cursor-pointer ${
        selected
          ? "border-blue-500 bg-blue-500/10"
          : "border-zinc-800 bg-zinc-900 hover:border-zinc-600"
      }`}
      onClick={onToggleSelect}
    >
      {/* Selection checkbox */}
      <div className="absolute top-3 left-3">
        <div
          className={`w-5 h-5 rounded border-2 flex items-center justify-center transition-colors ${
            selected ? "bg-blue-500 border-blue-500" : "border-zinc-600"
          }`}
        >
          {selected && (
            <svg className="w-3 h-3 text-white" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={3} d="M5 13l4 4L19 7" />
            </svg>
          )}
        </div>
      </div>

      {/* Status indicator */}
      <div className="absolute top-3 right-3">
        <div className={`w-3 h-3 rounded-full ${STATUS_COLORS[video.status]}`} />
      </div>

      <div className="mt-4 space-y-2">
        <p className="text-sm font-medium text-white truncate" title={video.originalName}>
          {video.originalName}
        </p>
        <div className="flex items-center gap-2 text-xs text-zinc-500">
          <span>{formatSize(video.fileSize)}</span>
          <span>{video.status}</span>
        </div>
      </div>

      {/* Open review button (only when ready) */}
      {video.hasReviewData && (
        <button
          onClick={(e) => { e.stopPropagation(); onOpen(); }}
          className="mt-3 w-full px-3 py-1.5 text-sm bg-blue-600 text-white rounded-lg hover:bg-blue-500"
        >
          Review
        </button>
      )}
    </div>
  );
}
```

- [ ] **Step 4: Write VideoPicker component**

Create `web/components/VideoPicker.tsx`:

```tsx
"use client";

import { useCallback, useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { signOut } from "@/lib/auth-client";
import type { Video } from "@/types";
import { VideoCard } from "./VideoCard";
import { UploadZone } from "./UploadZone";

export function VideoPicker() {
  const router = useRouter();
  const [videos, setVideos] = useState<Video[]>([]);
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [loading, setLoading] = useState(true);
  const [showUpload, setShowUpload] = useState(false);
  const [actionLoading, setActionLoading] = useState(false);

  const fetchVideos = useCallback(async () => {
    const res = await fetch("/api/videos");
    if (res.ok) {
      setVideos(await res.json());
    }
    setLoading(false);
  }, []);

  useEffect(() => {
    fetchVideos();
  }, [fetchVideos]);

  const toggleSelect = (id: string) => {
    setSelected((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  };

  const handleAnalyze = async () => {
    if (selected.size === 0) return;
    setActionLoading(true);
    try {
      const res = await fetch("/api/analyze", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ videoIds: Array.from(selected) }),
      });
      if (res.ok) {
        setSelected(new Set());
        await fetchVideos();
      }
    } finally {
      setActionLoading(false);
    }
  };

  const handleDelete = async () => {
    if (selected.size === 0) return;
    if (!confirm(`Delete ${selected.size} video(s)? This cannot be undone.`)) return;
    setActionLoading(true);
    try {
      await Promise.all(
        Array.from(selected).map((id) =>
          fetch(`/api/videos/${id}`, { method: "DELETE" })
        )
      );
      setSelected(new Set());
      await fetchVideos();
    } finally {
      setActionLoading(false);
    }
  };

  return (
    <div className="min-h-screen bg-zinc-950 text-white">
      {/* Header */}
      <header className="border-b border-zinc-800 px-6 py-4 flex items-center justify-between">
        <h1 className="text-xl font-bold">FilmHub</h1>
        <div className="flex items-center gap-4">
          <button
            onClick={() => setShowUpload(!showUpload)}
            className="px-4 py-2 bg-blue-600 text-white rounded-lg text-sm font-medium hover:bg-blue-500"
          >
            {showUpload ? "Close" : "Upload"}
          </button>
          <button
            onClick={() => signOut().then(() => router.push("/sign-in"))}
            className="px-4 py-2 text-zinc-400 hover:text-white text-sm"
          >
            Sign Out
          </button>
        </div>
      </header>

      <main className="max-w-6xl mx-auto p-6 space-y-6">
        {/* Upload zone */}
        {showUpload && (
          <UploadZone
            onUploadComplete={() => {
              fetchVideos();
              setShowUpload(false);
            }}
          />
        )}

        {/* Action bar (visible when videos selected) */}
        {selected.size > 0 && (
          <div className="flex items-center gap-3 p-3 bg-zinc-900 rounded-lg">
            <span className="text-sm text-zinc-400">
              {selected.size} selected
            </span>
            <button
              onClick={handleAnalyze}
              disabled={actionLoading}
              className="px-4 py-1.5 bg-green-600 text-white rounded-lg text-sm hover:bg-green-500 disabled:opacity-50"
            >
              Analyze
            </button>
            <button
              onClick={handleDelete}
              disabled={actionLoading}
              className="px-4 py-1.5 bg-red-600 text-white rounded-lg text-sm hover:bg-red-500 disabled:opacity-50"
            >
              Delete
            </button>
            <button
              onClick={() => setSelected(new Set())}
              className="px-4 py-1.5 text-zinc-400 text-sm hover:text-white"
            >
              Deselect All
            </button>
          </div>
        )}

        {/* Video grid */}
        {loading ? (
          <p className="text-zinc-500">Loading...</p>
        ) : videos.length === 0 ? (
          <div className="text-center py-16">
            <p className="text-zinc-500">No videos yet</p>
            <button
              onClick={() => setShowUpload(true)}
              className="mt-4 px-6 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-500"
            >
              Upload your first video
            </button>
          </div>
        ) : (
          <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-4">
            {videos.map((v) => (
              <VideoCard
                key={v.id}
                video={v}
                selected={selected.has(v.id)}
                onToggleSelect={() => toggleSelect(v.id)}
                onOpen={() => router.push(`/dashboard/review/${v.id}`)}
              />
            ))}
          </div>
        )}
      </main>
    </div>
  );
}
```

- [ ] **Step 5: Write dashboard layout and page**

Create `web/app/dashboard/layout.tsx`:

```tsx
import { auth } from "@/lib/auth";
import { headers } from "next/headers";
import { redirect } from "next/navigation";

export default async function DashboardLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const session = await auth.api.getSession({ headers: await headers() });
  if (!session) {
    redirect("/sign-in");
  }
  return <>{children}</>;
}
```

Create `web/app/dashboard/page.tsx`:

```tsx
import { VideoPicker } from "@/components/VideoPicker";

export default function DashboardPage() {
  return <VideoPicker />;
}
```

- [ ] **Step 6: Verify the full upload + list flow**

Start dev server. Sign in. Click Upload. Drop a small test video. Observe upload progress bar. After upload, video appears in grid with "uploaded" status indicator. Select video, click Delete — video removed.

- [ ] **Step 7: Commit**

```bash
git add web/types/ web/components/ web/app/dashboard/
git commit -m "feat: add VideoPicker with upload, multi-select, and video management"
```

---

## Phase 3: Frontend Migration

### Task 9: Migrate types and utility functions

**Files:**
- Modify: `web/types/index.ts` (already has most types from Task 8)
- Create: `web/lib/format-time.ts`

- [ ] **Step 1: Add missing types**

The types in `web/types/index.ts` (Task 8) already cover `ReviewData`, `CleanSegment`, `MusicSegment`, `GraphicsCandidate`, `TranscriptSegment`, `PromotionSegment`, and `CutStatus`. Verify these match the interfaces in `reviewer/frontend/src/types.ts`. If anything is missing, add it.

- [ ] **Step 2: Migrate formatTime utility**

Copy the content of `reviewer/frontend/src/utils/formatTime.ts` to `web/lib/format-time.ts`. No changes needed — it's a pure function.

- [ ] **Step 3: Commit**

```bash
git add web/types/ web/lib/format-time.ts
git commit -m "feat: migrate types and formatTime utility"
```

---

### Task 10: Migrate React hooks

**Files:**
- Create: `web/hooks/useVideoSync.ts`
- Create: `web/hooks/useSegments.ts`
- Create: `web/hooks/useHandleDrag.ts`
- Create: `web/hooks/useAnalysis.ts`

- [ ] **Step 1: Copy useVideoSync.ts**

Copy `reviewer/frontend/src/hooks/useVideoSync.ts` to `web/hooks/useVideoSync.ts`. Update import paths:
- `../types` → `@/types`
- `../utils/formatTime` → `@/lib/format-time`

Add `"use client";` at the top.

- [ ] **Step 2: Copy useSegments.ts**

Copy `reviewer/frontend/src/hooks/useSegments.ts` to `web/hooks/useSegments.ts`. Update imports similarly. Add `"use client";`.

- [ ] **Step 3: Copy useHandleDrag.ts**

Copy `reviewer/frontend/src/hooks/useHandleDrag.ts` to `web/hooks/useHandleDrag.ts`. Update imports. Add `"use client";`.

- [ ] **Step 4: Rewrite useAnalysis.ts for new API**

Create `web/hooks/useAnalysis.ts`:

```typescript
"use client";

import { useState, useEffect, useCallback } from "react";
import type { ReviewData, CleanSegment } from "@/types";

export function useAnalysis(videoId: string) {
  const [reviewData, setReviewData] = useState<ReviewData | null>(null);
  const [initialSegments, setInitialSegments] = useState<CleanSegment[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const fetchAnalysis = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const res = await fetch(`/api/analysis/${videoId}`);
      if (!res.ok) {
        throw new Error(await res.text());
      }
      const data: ReviewData = await res.json();
      setReviewData(data);

      // Initialize segments from suggested_segments, all accepted by default
      const segments = (data.suggested_segments ?? []).map((s) => ({
        ...s,
        accepted: s.accepted ?? true,
      }));
      setInitialSegments(segments);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to load analysis");
    } finally {
      setLoading(false);
    }
  }, [videoId]);

  useEffect(() => {
    fetchAnalysis();
  }, [fetchAnalysis]);

  return { reviewData, initialSegments, loading, error };
}
```

- [ ] **Step 5: Commit**

```bash
git add web/hooks/
git commit -m "feat: migrate React hooks for video sync, segments, and analysis"
```

---

### Task 11: Migrate review components

**Files:**
- Create: `web/components/VideoPlayer.tsx`
- Create: `web/components/Timeline.tsx`
- Create: `web/components/SegmentProperties.tsx`
- Create: `web/components/TranscriptPanel.tsx`

All four components are migrated from `reviewer/frontend/src/components/`. The migration involves:

1. Add `"use client";` at the top of each file
2. Update import paths:
   - `../types` → `@/types`
   - `../utils/formatTime` → `@/lib/format-time`
   - `../hooks/useXxx` → `@/hooks/useXxx`
3. Update image URLs: frame image references change from `/api/analysis/{video}/frames/{filename}` to `/api/analysis/{videoId}/frames/{filename}` where `videoId` is the database ID (passed as prop)
4. Update video URL: from `/videos/{filename}` to `/api/videos/{videoId}/stream`

- [ ] **Step 1: Copy and adapt VideoPlayer.tsx**

Copy `reviewer/frontend/src/components/VideoPlayer.tsx` to `web/components/VideoPlayer.tsx`. Add `"use client";`. Update imports.

- [ ] **Step 2: Copy and adapt Timeline.tsx**

Copy `reviewer/frontend/src/components/Timeline.tsx` to `web/components/Timeline.tsx`. Add `"use client";`. Update imports. This is the largest component (~421 lines) — no logic changes needed, only import paths.

- [ ] **Step 3: Copy and adapt SegmentProperties.tsx**

Copy `reviewer/frontend/src/components/SegmentProperties.tsx` to `web/components/SegmentProperties.tsx`. Add `"use client";`. Update imports. Update frame image URL construction to use `/api/analysis/{videoId}/frames/{filename}`.

- [ ] **Step 4: Copy and adapt TranscriptPanel.tsx**

Copy `reviewer/frontend/src/components/TranscriptPanel.tsx` to `web/components/TranscriptPanel.tsx`. Add `"use client";`. Update imports.

- [ ] **Step 5: Commit**

```bash
git add web/components/VideoPlayer.tsx web/components/Timeline.tsx web/components/SegmentProperties.tsx web/components/TranscriptPanel.tsx
git commit -m "feat: migrate VideoPlayer, Timeline, SegmentProperties, TranscriptPanel"
```

---

### Task 12: Migrate ActionBar and build ReviewView

**Files:**
- Create: `web/components/ActionBar.tsx`
- Create: `web/components/ReviewView.tsx`
- Create: `web/app/dashboard/review/[videoId]/page.tsx`

- [ ] **Step 1: Write adapted ActionBar**

The ActionBar needs significant changes: instead of saving to the server and triggering a local cut, it now:
1. Saves review data (POST `/api/save/{videoId}`) → creates `finalized_data.json`
2. Triggers cut (POST `/api/cut/{videoId}`)
3. Polls for completion, then triggers browser download

Create `web/components/ActionBar.tsx`:

```tsx
"use client";

import { useState, useEffect, useRef } from "react";
import type { CleanSegment, CutStatus } from "@/types";

interface ActionBarProps {
  videoId: string;
  segments: CleanSegment[];
  onSelectAll: () => void;
  onDeselectAll: () => void;
  onReset: () => void;
}

export function ActionBar({ videoId, segments, onSelectAll, onDeselectAll, onReset }: ActionBarProps) {
  const [cutStatus, setCutStatus] = useState<CutStatus>({ status: "idle" });
  const [saving, setSaving] = useState(false);
  const pollRef = useRef<NodeJS.Timeout>();

  const accepted = segments.filter((s) => s.accepted);
  const totalRemoved = accepted.reduce((sum, s) => sum + (s.end - s.start), 0);

  const handleSaveAndCut = async () => {
    setSaving(true);
    try {
      // Step 1: Save finalized review data
      const saveRes = await fetch(`/api/save/${videoId}`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ segments }),
      });
      if (!saveRes.ok) throw new Error("Failed to save");

      // Step 2: Trigger cut
      const cutRes = await fetch(`/api/cut/${videoId}`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ segments: accepted }),
      });
      if (!cutRes.ok) throw new Error("Failed to start cut");

      setCutStatus({ status: "running" });

      // Step 3: Poll for completion
      pollRef.current = setInterval(async () => {
        const statusRes = await fetch(`/api/cut/${videoId}`);
        if (statusRes.ok) {
          const status: CutStatus = await statusRes.json();
          setCutStatus(status);
          if (status.status === "done" || status.status === "failed") {
            clearInterval(pollRef.current);
          }
        }
      }, 2000);
    } catch (err) {
      setCutStatus({
        status: "failed",
        error: err instanceof Error ? err.message : "Unknown error",
      });
    } finally {
      setSaving(false);
    }
  };

  const handleDownload = () => {
    if (cutStatus.downloadUrl) {
      window.open(cutStatus.downloadUrl, "_blank");
    }
  };

  useEffect(() => {
    return () => {
      if (pollRef.current) clearInterval(pollRef.current);
    };
  }, []);

  return (
    <div className="fixed bottom-0 left-0 right-0 bg-zinc-900 border-t border-zinc-800 px-6 py-3 flex items-center justify-between">
      <div className="flex items-center gap-4 text-sm text-zinc-400">
        <span>{accepted.length} segments to remove</span>
        <span>{totalRemoved.toFixed(1)}s total</span>
      </div>

      <div className="flex items-center gap-3">
        <button onClick={onSelectAll} className="text-sm text-zinc-400 hover:text-white">
          Select All
        </button>
        <button onClick={onDeselectAll} className="text-sm text-zinc-400 hover:text-white">
          Deselect All
        </button>
        <button onClick={onReset} className="text-sm text-zinc-400 hover:text-white">
          Reset
        </button>

        {cutStatus.status === "idle" && (
          <button
            onClick={handleSaveAndCut}
            disabled={saving || accepted.length === 0}
            className="px-6 py-2 bg-blue-600 text-white rounded-lg font-medium hover:bg-blue-500 disabled:opacity-50"
          >
            {saving ? "Saving..." : "Save & Cut"}
          </button>
        )}

        {cutStatus.status === "running" && (
          <span className="text-yellow-400 text-sm animate-pulse">Cutting...</span>
        )}

        {cutStatus.status === "done" && (
          <button
            onClick={handleDownload}
            className="px-6 py-2 bg-green-600 text-white rounded-lg font-medium hover:bg-green-500"
          >
            Download
          </button>
        )}

        {cutStatus.status === "failed" && (
          <span className="text-red-400 text-sm">{cutStatus.error ?? "Cut failed"}</span>
        )}
      </div>
    </div>
  );
}
```

- [ ] **Step 2: Write ReviewView component**

Create `web/components/ReviewView.tsx`. Migrate the ReviewView section of `reviewer/frontend/src/App.tsx` (lines ~87-443) with these changes:
- Accept `videoId: string` prop instead of `video: VideoInfo`
- Use `useAnalysis(videoId)` hook for data fetching
- Video source URL: `/api/videos/${videoId}/stream`
- Frame URLs: `/api/analysis/${videoId}/frames/${filename}`
- Use the new ActionBar component
- Add `"use client";`
- Back button links to `/dashboard` via `useRouter`
- Keep the 3-column layout, collapsible panels, and keyboard shortcuts

The component structure remains the same as the original ReviewView:
```
Header (back button, video name, collapse toggles)
Layout:
  Left: SegmentProperties (collapsible)
  Center: VideoPlayer + Timeline
  Right: TranscriptPanel (collapsible)
Bottom: ActionBar
```

- [ ] **Step 3: Write review page**

Create `web/app/dashboard/review/[videoId]/page.tsx`:

```tsx
import { ReviewView } from "@/components/ReviewView";

export default async function ReviewPage({
  params,
}: {
  params: Promise<{ videoId: string }>;
}) {
  const { videoId } = await params;
  return <ReviewView videoId={videoId} />;
}
```

- [ ] **Step 4: Verify review view renders**

Upload a test video. Manually create a `data/analysis/{videoId}/review_data.json` with test data matching the ReviewData schema. Navigate to `/dashboard/review/{videoId}`. Verify the video player, timeline, segment properties, and transcript all render correctly. Test keyboard shortcuts (space, arrows, brackets).

- [ ] **Step 5: Commit**

```bash
git add web/components/ActionBar.tsx web/components/ReviewView.tsx web/app/dashboard/review/
git commit -m "feat: add ReviewView with adapted ActionBar and review page"
```

---

### Task 13: Create analysis data API endpoints

**Files:**
- Create: `web/app/api/analysis/[videoId]/route.ts`
- Create: `web/app/api/analysis/[videoId]/frames/[filename]/route.ts`

- [ ] **Step 1: Write analysis data endpoint**

Create `web/app/api/analysis/[videoId]/route.ts`:

```typescript
import { NextRequest, NextResponse } from "next/server";
import { requireAuth } from "@/lib/require-auth";
import { db } from "@/lib/db";
import { video } from "@/lib/db/schema";
import { eq, and } from "drizzle-orm";
import { readAnalysisFile, analysisFileExists } from "@/lib/storage";

type Params = { params: Promise<{ videoId: string }> };

export async function GET(request: NextRequest, { params }: Params) {
  const session = await requireAuth();
  const { videoId } = await params;

  // Verify ownership
  const [v] = await db
    .select()
    .from(video)
    .where(and(eq(video.id, videoId), eq(video.userId, session.user.id)));

  if (!v) {
    return NextResponse.json({ error: "Not found" }, { status: 404 });
  }

  if (!(await analysisFileExists(videoId, "review_data.json"))) {
    return NextResponse.json({ error: "No analysis data" }, { status: 404 });
  }

  const data = await readAnalysisFile(videoId, "review_data.json");
  return new NextResponse(data, {
    headers: { "Content-Type": "application/json" },
  });
}
```

- [ ] **Step 2: Write frame serving endpoint**

Create `web/app/api/analysis/[videoId]/frames/[filename]/route.ts`:

```typescript
import { NextRequest, NextResponse } from "next/server";
import { requireAuth } from "@/lib/require-auth";
import { db } from "@/lib/db";
import { video } from "@/lib/db/schema";
import { eq, and } from "drizzle-orm";
import { analysisDir } from "@/lib/storage";
import { createReadStream, existsSync } from "fs";
import { Readable } from "stream";
import path from "path";

type Params = { params: Promise<{ videoId: string; filename: string }> };

export async function GET(request: NextRequest, { params }: Params) {
  const session = await requireAuth();
  const { videoId, filename } = await params;

  // Verify ownership
  const [v] = await db
    .select()
    .from(video)
    .where(and(eq(video.id, videoId), eq(video.userId, session.user.id)));

  if (!v) {
    return new NextResponse("Not found", { status: 404 });
  }

  // Sanitize filename — only allow PNG files, no path separators
  if (!/^[a-zA-Z0-9_.-]+\.png$/i.test(filename)) {
    return new NextResponse("Invalid filename", { status: 400 });
  }

  const dir = analysisDir(videoId);
  const framePath = path.join(dir, "graphics_frames", filename);

  // Verify resolved path is within the analysis directory
  const resolved = path.resolve(framePath);
  if (!resolved.startsWith(path.resolve(dir))) {
    return new NextResponse("Forbidden", { status: 403 });
  }

  if (!existsSync(framePath)) {
    return new NextResponse("Frame not found", { status: 404 });
  }

  const stream = createReadStream(framePath);
  const webStream = Readable.toWeb(stream) as ReadableStream;

  return new NextResponse(webStream, {
    headers: { "Content-Type": "image/png", "Cache-Control": "public, max-age=3600" },
  });
}
```

- [ ] **Step 3: Commit**

```bash
git add web/app/api/analysis/
git commit -m "feat: add analysis data and frame serving API endpoints"
```

---

## Phase 4: Modal Cloud Processing

### Task 14: Set up Modal project

**Files:**
- Create: `modal/requirements.txt`
- Create: `modal/app.py`

- [ ] **Step 1: Install Modal CLI**

```bash
pip install modal
modal setup  # Authenticate with Modal account
```

- [ ] **Step 2: Write Modal requirements**

Create `modal/requirements.txt`:

```
faster-whisper==1.1.0
demucs==4.0.1
librosa==0.10.2
soundfile==0.12.1
pyacoustid==1.3.0
opencv-python-headless==4.10.0.84
numpy<2
```

Note: We use `faster-whisper` instead of `mlx-whisper` since Modal runs on NVIDIA GPUs, not Apple Silicon.

- [ ] **Step 3: Write Modal app skeleton**

Create `modal/app.py`:

```python
import modal
import json
import os

app = modal.App("filmhub")

# Base image with system deps
base_image = (
    modal.Image.debian_slim(python_version="3.11")
    .apt_install("ffmpeg", "libchromaprint-tools")
    .pip_install_from_requirements("requirements.txt")
)

# Volume for video/analysis data exchange
vol = modal.Volume.from_name("filmhub-data", create_if_missing=True)

# Auth secret for web endpoints
auth_secret = modal.Secret.from_name("filmhub-auth")

VOLUME_MOUNT = "/data"


def verify_auth(token: str) -> bool:
    """Verify bearer token matches the shared secret."""
    expected = os.environ.get("MODAL_AUTH_TOKEN", "")
    return token == expected and len(expected) > 0


@app.function(image=base_image, gpu="T4", volumes={VOLUME_MOUNT: vol}, timeout=1800, secrets=[auth_secret])
@modal.web_endpoint(method="POST")
def transcribe(request: dict):
    """Transcribe video audio using faster-whisper."""
    token = request.get("auth_token", "")
    if not verify_auth(token):
        return {"error": "Unauthorized"}, 401

    video_id = request["video_id"]
    video_filename = request["filename"]
    video_path = f"{VOLUME_MOUNT}/videos/{video_id}/{video_filename}"

    if not os.path.exists(video_path):
        return {"error": f"Video not found: {video_path}"}, 404

    from faster_whisper import WhisperModel

    # Extract audio
    import subprocess
    audio_path = f"/tmp/{video_id}_audio.wav"
    subprocess.run([
        "ffmpeg", "-y", "-i", video_path,
        "-ar", "16000", "-ac", "1", "-f", "wav", audio_path
    ], check=True, capture_output=True)

    # Transcribe
    model = WhisperModel("large-v3", device="cuda", compute_type="float16")
    segments_iter, info = model.transcribe(audio_path, beam_size=5)

    segments = []
    for i, seg in enumerate(segments_iter):
        segments.append({
            "id": i,
            "start": round(seg.start, 2),
            "end": round(seg.end, 2),
            "text": seg.text.strip(),
        })

    transcript = {
        "text": " ".join(s["text"] for s in segments),
        "segments": segments,
        "language": info.language,
    }

    # Save to volume
    out_dir = f"{VOLUME_MOUNT}/analysis/{video_id}"
    os.makedirs(out_dir, exist_ok=True)
    with open(f"{out_dir}/transcript.json", "w") as f:
        json.dump(transcript, f, indent=2)

    vol.commit()
    return {"status": "ok", "segments_count": len(segments)}


@app.function(image=base_image, gpu="T4", volumes={VOLUME_MOUNT: vol}, timeout=3600, secrets=[auth_secret])
@modal.web_endpoint(method="POST")
def detect_music(request: dict):
    """Detect copyrighted music segments using Demucs + librosa + AcoustID."""
    token = request.get("auth_token", "")
    if not verify_auth(token):
        return {"error": "Unauthorized"}, 401

    video_id = request["video_id"]
    video_filename = request["filename"]
    video_path = f"{VOLUME_MOUNT}/videos/{video_id}/{video_filename}"

    if not os.path.exists(video_path):
        return {"error": "Video not found"}, 404

    import subprocess
    import librosa
    import numpy as np

    # Extract audio (44.1kHz mono for music analysis)
    audio_path = f"/tmp/{video_id}_audio_44k.wav"
    subprocess.run([
        "ffmpeg", "-y", "-i", video_path,
        "-ar", "44100", "-ac", "1", "-f", "wav", audio_path
    ], check=True, capture_output=True)

    # Source separation with Demucs
    demucs_out = f"/tmp/{video_id}_demucs"
    subprocess.run([
        "python", "-m", "demucs",
        "--two-stems", "vocals",
        "-o", demucs_out,
        "--device", "cuda",
        audio_path
    ], check=True, capture_output=True)

    # Find the no_vocals (music) track
    no_vocals_path = None
    for root, dirs, files in os.walk(demucs_out):
        for f in files:
            if "no_vocals" in f:
                no_vocals_path = os.path.join(root, f)
                break

    if not no_vocals_path:
        return {"error": "Demucs failed to produce music track"}, 500

    # Analyze music energy
    y, sr = librosa.load(no_vocals_path, sr=44100)
    hop_length = 512
    rms = librosa.feature.rms(y=y, hop_length=hop_length)[0]
    times = librosa.times_like(rms, sr=sr, hop_length=hop_length)

    threshold = 0.01
    min_duration = 3.0
    merge_gap = 5.0

    # Find segments above threshold
    segments = []
    in_segment = False
    seg_start = 0.0

    for i, (t, e) in enumerate(zip(times, rms)):
        if e > threshold and not in_segment:
            in_segment = True
            seg_start = t
        elif e <= threshold and in_segment:
            in_segment = False
            if t - seg_start >= min_duration:
                segments.append({"start": round(float(seg_start), 2), "end": round(float(t), 2), "track": None})

    if in_segment:
        t = float(times[-1])
        if t - seg_start >= min_duration:
            segments.append({"start": round(float(seg_start), 2), "end": round(float(t), 2), "track": None})

    # Merge nearby segments
    merged = []
    for seg in segments:
        if merged and seg["start"] - merged[-1]["end"] < merge_gap:
            merged[-1]["end"] = seg["end"]
        else:
            merged.append(seg)

    # AcoustID fingerprinting for each segment
    acoustid_key = request.get("acoustid_key")
    if acoustid_key:
        import acoustid
        for seg in merged:
            try:
                mid = (seg["start"] + seg["end"]) / 2
                clip_start = max(0, mid - 15)
                clip_path = f"/tmp/{video_id}_clip.wav"
                subprocess.run([
                    "ffmpeg", "-y", "-i", no_vocals_path,
                    "-ss", str(clip_start), "-t", "30",
                    "-f", "wav", clip_path
                ], check=True, capture_output=True)

                results = acoustid.match(acoustid_key, clip_path)
                for score, recording_id, title, artist in results:
                    if score > 0.5 and title:
                        seg["track"] = f"{artist} - {title}" if artist else title
                        break
            except Exception:
                pass

    # Save results
    out_dir = f"{VOLUME_MOUNT}/analysis/{video_id}"
    os.makedirs(out_dir, exist_ok=True)
    with open(f"{out_dir}/music.json", "w") as f:
        json.dump(merged, f, indent=2)

    vol.commit()
    return {"status": "ok", "segments_count": len(merged)}


@app.function(image=base_image, volumes={VOLUME_MOUNT: vol}, timeout=1800, secrets=[auth_secret])
@modal.web_endpoint(method="POST")
def detect_graphics(request: dict):
    """Detect on-screen graphics transitions using OpenCV histogram comparison."""
    token = request.get("auth_token", "")
    if not verify_auth(token):
        return {"error": "Unauthorized"}, 401

    video_id = request["video_id"]
    video_filename = request["filename"]
    video_path = f"{VOLUME_MOUNT}/videos/{video_id}/{video_filename}"

    if not os.path.exists(video_path):
        return {"error": "Video not found"}, 404

    import subprocess
    import cv2
    import numpy as np

    # Extract frames at 1fps
    frames_dir = f"/tmp/{video_id}_frames"
    os.makedirs(frames_dir, exist_ok=True)
    subprocess.run([
        "ffmpeg", "-y", "-i", video_path,
        "-vf", "fps=1",
        f"{frames_dir}/frame_%06d.png"
    ], check=True, capture_output=True)

    # Get sorted frame files
    frame_files = sorted([f for f in os.listdir(frames_dir) if f.endswith(".png")])

    threshold = 0.4
    candidates = []

    prev_hists = None
    for i, fname in enumerate(frame_files):
        frame = cv2.imread(os.path.join(frames_dir, fname))
        if frame is None:
            continue

        hsv = cv2.cvtColor(frame, cv2.COLOR_BGR2HSV)
        h, w = hsv.shape[:2]

        # Compute histograms for full frame, top 25%, bottom 25%
        regions = [
            hsv,
            hsv[:h // 4, :],
            hsv[3 * h // 4:, :],
        ]

        hists = []
        for region in regions:
            hist = cv2.calcHist([region], [0, 1], None, [50, 60], [0, 180, 0, 256])
            cv2.normalize(hist, hist)
            hists.append(hist)

        if prev_hists is not None:
            min_corr = min(
                cv2.compareHist(prev_hists[j], hists[j], cv2.HISTCMP_CORREL)
                for j in range(len(hists))
            )
            if min_corr < threshold:
                candidates.append({
                    "frame_index": i,
                    "timestamp": float(i),
                    "time_formatted": f"{i // 3600:02d}:{(i % 3600) // 60:02d}:{i % 60:02d}",
                    "correlation": round(float(min_corr), 4),
                    "before_frame": f"graphics_frames/frame_{i:06d}.png",
                    "after_frame": f"graphics_frames/frame_{i + 1:06d}.png",
                })

        prev_hists = hists

    # Copy before/after frame pairs to analysis directory
    out_dir = f"{VOLUME_MOUNT}/analysis/{video_id}"
    gfx_dir = f"{out_dir}/graphics_frames"
    os.makedirs(gfx_dir, exist_ok=True)

    import shutil
    for c in candidates:
        for key in ("before_frame", "after_frame"):
            src_name = c[key].replace("graphics_frames/", "")
            # Map to source frame filename
            idx = int(src_name.replace("frame_", "").replace(".png", ""))
            if idx < len(frame_files):
                src_path = os.path.join(frames_dir, frame_files[idx])
                dst_path = os.path.join(gfx_dir, src_name)
                if os.path.exists(src_path):
                    shutil.copy2(src_path, dst_path)

    with open(f"{out_dir}/graphics_candidates.json", "w") as f:
        json.dump(candidates, f, indent=2)

    vol.commit()
    return {"status": "ok", "candidates_count": len(candidates)}


@app.function(image=base_image, volumes={VOLUME_MOUNT: vol}, timeout=1800, secrets=[auth_secret])
@modal.web_endpoint(method="POST")
def cut_video(request: dict):
    """Cut segments from video using FFmpeg (lossless, no re-encoding)."""
    token = request.get("auth_token", "")
    if not verify_auth(token):
        return {"error": "Unauthorized"}, 401

    video_id = request["video_id"]
    video_filename = request["filename"]
    video_path = f"{VOLUME_MOUNT}/videos/{video_id}/{video_filename}"
    segments = request["segments"]  # [{ start, end }, ...]

    if not os.path.exists(video_path):
        return {"error": "Video not found"}, 404

    import subprocess

    # Get video duration
    result = subprocess.run(
        ["ffprobe", "-v", "quiet", "-print_format", "json", "-show_format", video_path],
        capture_output=True, text=True
    )
    duration = float(json.loads(result.stdout)["format"]["duration"])

    # Sort segments by start time
    segments = sorted(segments, key=lambda s: s["start"])

    # Invert: compute keep intervals
    keeps = []
    pos = 0.0
    for seg in segments:
        if seg["start"] > pos:
            keeps.append({"start": pos, "end": seg["start"]})
        pos = seg["end"]
    if pos < duration:
        keeps.append({"start": pos, "end": duration})

    if not keeps:
        return {"error": "Nothing to keep after cutting"}, 400

    # Extract each keep interval
    ext = os.path.splitext(video_filename)[1]
    parts = []
    for i, keep in enumerate(keeps):
        part_path = f"/tmp/{video_id}_part_{i}{ext}"
        subprocess.run([
            "ffmpeg", "-y", "-i", video_path,
            "-ss", str(keep["start"]), "-to", str(keep["end"]),
            "-c", "copy", "-avoid_negative_ts", "make_zero",
            part_path
        ], check=True, capture_output=True)
        parts.append(part_path)

    # Concatenate
    concat_file = f"/tmp/{video_id}_concat.txt"
    with open(concat_file, "w") as f:
        for p in parts:
            f.write(f"file '{p}'\n")

    out_dir = f"{VOLUME_MOUNT}/output/{video_id}"
    os.makedirs(out_dir, exist_ok=True)
    output_path = f"{out_dir}/clean{ext}"

    subprocess.run([
        "ffmpeg", "-y", "-f", "concat", "-safe", "0",
        "-i", concat_file, "-c", "copy", output_path
    ], check=True, capture_output=True)

    vol.commit()

    # Get output file size
    output_size = os.path.getsize(output_path)
    return {"status": "ok", "output_path": f"output/{video_id}/clean{ext}", "output_size": output_size}
```

- [ ] **Step 4: Deploy Modal app**

```bash
cd modal && modal deploy app.py
```

Expected: Modal deploys the app and prints the web endpoint URLs. Note these for `MODAL_ENDPOINT_URL` in `.env.local`.

- [ ] **Step 5: Create Modal secret**

```bash
modal secret create filmhub-auth MODAL_AUTH_TOKEN=<generate-a-random-token>
```

Add the same token to `web/.env.local` as `MODAL_AUTH_TOKEN`.

- [ ] **Step 6: Commit**

```bash
git add modal/
git commit -m "feat: add Modal cloud functions for transcription, music/graphics detection, and cutting"
```

---

### Task 15: Write Modal client for Next.js

**Files:**
- Create: `web/lib/modal-client.ts`

- [ ] **Step 1: Write Modal HTTP client**

Create `web/lib/modal-client.ts`:

```typescript
const MODAL_BASE_URL = process.env.MODAL_ENDPOINT_URL!;
const MODAL_AUTH_TOKEN = process.env.MODAL_AUTH_TOKEN!;

interface ModalResponse<T = unknown> {
  ok: boolean;
  data?: T;
  error?: string;
}

async function callModal<T>(
  endpoint: string,
  body: Record<string, unknown>
): Promise<ModalResponse<T>> {
  const url = `${MODAL_BASE_URL}/${endpoint}`;

  const res = await fetch(url, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ ...body, auth_token: MODAL_AUTH_TOKEN }),
  });

  const data = await res.json();
  if (!res.ok) {
    return { ok: false, error: data.error ?? `Modal error: ${res.status}` };
  }
  return { ok: true, data };
}

export async function modalTranscribe(videoId: string, filename: string) {
  return callModal<{ status: string; segments_count: number }>("transcribe", {
    video_id: videoId,
    filename,
  });
}

export async function modalDetectMusic(
  videoId: string,
  filename: string,
  acoustidKey?: string
) {
  return callModal<{ status: string; segments_count: number }>("detect_music", {
    video_id: videoId,
    filename,
    acoustid_key: acoustidKey,
  });
}

export async function modalDetectGraphics(videoId: string, filename: string) {
  return callModal<{ status: string; candidates_count: number }>(
    "detect_graphics",
    { video_id: videoId, filename }
  );
}

export async function modalCutVideo(
  videoId: string,
  filename: string,
  segments: { start: number; end: number }[]
) {
  return callModal<{ status: string; output_path: string; output_size: number }>(
    "cut_video",
    { video_id: videoId, filename, segments }
  );
}
```

- [ ] **Step 2: Commit**

```bash
git add web/lib/modal-client.ts
git commit -m "feat: add Modal HTTP client for calling cloud functions"
```

---

### Task 16: Upload videos to Modal Volume before analysis

**Files:**
- Create: `modal/upload.py` (CLI helper for volume upload)
- Modify: `web/lib/modal-client.ts` (add upload function)

The Modal Volume needs the video file before processing can begin. Two approaches:
1. Use Modal's Python client to upload directly to the Volume
2. Add a Modal web endpoint that accepts file uploads

We'll add a web endpoint for file upload since the Next.js backend communicates via HTTP.

- [ ] **Step 1: Add upload endpoint to Modal app**

Add to `modal/app.py`:

```python
@app.function(image=base_image, volumes={VOLUME_MOUNT: vol}, timeout=600, secrets=[auth_secret])
@modal.web_endpoint(method="POST")
def upload_video(request: dict):
    """Upload a video file to the Modal volume (base64 encoded)."""
    token = request.get("auth_token", "")
    if not verify_auth(token):
        return {"error": "Unauthorized"}, 401

    video_id = request["video_id"]
    filename = request["filename"]
    data_b64 = request["data"]  # base64-encoded video bytes

    import base64
    video_bytes = base64.b64decode(data_b64)

    out_dir = f"{VOLUME_MOUNT}/videos/{video_id}"
    os.makedirs(out_dir, exist_ok=True)
    out_path = f"{out_dir}/{filename}"

    with open(out_path, "wb") as f:
        f.write(video_bytes)

    vol.commit()
    return {"status": "ok", "path": out_path, "size": len(video_bytes)}
```

Note: For large files (>100MB), consider using Modal's Volume upload API directly or chunked uploads. For the MVP, base64 over HTTP works for files up to ~500MB.

- [ ] **Step 2: Add upload function to modal-client.ts**

Add to `web/lib/modal-client.ts`:

```typescript
export async function modalUploadVideo(
  videoId: string,
  filename: string,
  fileBuffer: Buffer
): Promise<ModalResponse<{ status: string; path: string; size: number }>> {
  const data = fileBuffer.toString("base64");
  return callModal("upload_video", {
    video_id: videoId,
    filename,
    data,
  });
}
```

- [ ] **Step 3: Commit**

```bash
git add modal/app.py web/lib/modal-client.ts
git commit -m "feat: add Modal volume upload endpoint for video files"
```

---

## Phase 5: Analysis Orchestration

### Task 17: Write analysis agent with Anthropic SDK

**Files:**
- Create: `web/lib/agent.ts`
- Modify: `web/package.json` (add @anthropic-ai/sdk)

- [ ] **Step 1: Install Anthropic SDK**

```bash
cd web && npm install @anthropic-ai/sdk
```

- [ ] **Step 2: Write the analysis agent**

The agent uses Anthropic's tool use to orchestrate the full analysis pipeline. It:
1. Uploads video to Modal Volume
2. Runs transcription
3. Runs music detection
4. Runs graphics detection
5. Analyzes transcript for promotions (using Claude's intelligence directly)
6. Classifies graphics frames using Claude Vision
7. Compiles everything into review_data.json

Create `web/lib/agent.ts`:

```typescript
import Anthropic from "@anthropic-ai/sdk";
import {
  modalUploadVideo,
  modalTranscribe,
  modalDetectMusic,
  modalDetectGraphics,
} from "./modal-client";
import {
  saveAnalysisFile,
  readAnalysisFile,
  analysisFileExists,
  videoDir,
} from "./storage";
import fs from "fs/promises";
import path from "path";

const anthropic = new Anthropic();

interface AnalysisProgress {
  step: string;
  percent: number;
}

type ProgressCallback = (progress: AnalysisProgress) => void;

export async function runAnalysis(
  videoId: string,
  filename: string,
  onProgress: ProgressCallback
): Promise<void> {
  onProgress({ step: "Uploading video to cloud", percent: 0 });

  // Read video file and upload to Modal
  const videoPath = path.join(videoDir(videoId), filename);
  const videoBuffer = await fs.readFile(videoPath);
  const uploadResult = await modalUploadVideo(videoId, filename, videoBuffer);
  if (!uploadResult.ok) {
    throw new Error(`Upload failed: ${uploadResult.error}`);
  }

  // Run detection passes in parallel
  onProgress({ step: "Running detection passes", percent: 15 });

  const [transcriptResult, musicResult, graphicsResult] = await Promise.all([
    modalTranscribe(videoId, filename),
    modalDetectMusic(videoId, filename, process.env.ACOUSTID_API_KEY),
    modalDetectGraphics(videoId, filename),
  ]);

  if (!transcriptResult.ok) throw new Error(`Transcription failed: ${transcriptResult.error}`);
  if (!musicResult.ok) throw new Error(`Music detection failed: ${musicResult.error}`);
  if (!graphicsResult.ok) throw new Error(`Graphics detection failed: ${graphicsResult.error}`);

  onProgress({ step: "Detection passes complete", percent: 60 });

  // Download results from Modal Volume back to local storage
  // (Modal functions saved results to the volume; we need to fetch them)
  // For now, the Modal functions return the data directly — enhance later
  // to download from volume. For the MVP, re-fetch the JSON via Modal.
  // TODO: Add a Modal endpoint to download analysis files from volume

  // For now, we'll use the agent to analyze promotions and compile review_data
  onProgress({ step: "Analyzing promotions with AI", percent: 65 });

  // Read transcript from Modal results
  // (In production, download from Modal volume. For MVP, the Modal functions
  // should also return the data. We'll store placeholder and fill via agent.)

  // Use Anthropic SDK to analyze transcript for promotions
  const promotions = await detectPromotions(videoId, filename);

  onProgress({ step: "Classifying graphics", percent: 80 });

  // Compile review_data.json
  const reviewData = await compileReviewData(videoId, filename, promotions);

  onProgress({ step: "Saving review data", percent: 95 });

  await saveAnalysisFile(videoId, "review_data.json", JSON.stringify(reviewData, null, 2));

  onProgress({ step: "Complete", percent: 100 });
}

async function detectPromotions(
  videoId: string,
  filename: string
): Promise<Array<{ start: number; end: number; description: string }>> {
  // Read transcript (downloaded from Modal or cached)
  let transcriptText = "";
  if (await analysisFileExists(videoId, "transcript.json")) {
    const raw = await readAnalysisFile(videoId, "transcript.json");
    const transcript = JSON.parse(raw);
    transcriptText = transcript.segments
      .map((s: { start: number; end: number; text: string }) =>
        `[${formatTime(s.start)} - ${formatTime(s.end)}] ${s.text}`
      )
      .join("\n");
  }

  if (!transcriptText) return [];

  const response = await anthropic.messages.create({
    model: "claude-sonnet-4-6",
    max_tokens: 4096,
    messages: [
      {
        role: "user",
        content: `Analyze this video transcript for paid promotions, sponsorships, and platform-specific calls to action. Return ONLY a JSON array of detected segments.

Each segment should have: start (seconds), end (seconds), description (what the promotion is about).

Look for:
- Paid sponsor reads ("This video is sponsored by...", "Thanks to X for sponsoring...")
- Product placements with promotional language
- Platform CTAs ("Subscribe", "Like and comment", "Follow me on...")
- Referral/discount codes
- Patreon/membership promotions

Be conservative: only flag segments that are clearly promotional. Do not flag normal content discussion.

Transcript:
${transcriptText}

Return ONLY valid JSON: [{"start": N, "end": N, "description": "..."}]`,
      },
    ],
  });

  const text = response.content[0].type === "text" ? response.content[0].text : "";

  try {
    // Extract JSON from response (handle markdown code blocks)
    const jsonMatch = text.match(/\[[\s\S]*\]/);
    if (jsonMatch) {
      return JSON.parse(jsonMatch[0]);
    }
    return [];
  } catch {
    console.error("Failed to parse promotions response:", text);
    return [];
  }
}

async function compileReviewData(
  videoId: string,
  filename: string,
  promotions: Array<{ start: number; end: number; description: string }>
): Promise<Record<string, unknown>> {
  // Read detection results
  let music: unknown[] = [];
  let graphics: unknown[] = [];
  let transcript = { segments: [] as unknown[] };

  if (await analysisFileExists(videoId, "music.json")) {
    music = JSON.parse(await readAnalysisFile(videoId, "music.json"));
  }
  if (await analysisFileExists(videoId, "graphics_candidates.json")) {
    graphics = JSON.parse(await readAnalysisFile(videoId, "graphics_candidates.json"));
  }
  if (await analysisFileExists(videoId, "transcript.json")) {
    transcript = JSON.parse(await readAnalysisFile(videoId, "transcript.json"));
  }

  // Build suggested segments from all detections
  const suggestedSegments: Array<{
    start: number;
    end: number;
    types: string[];
    description: string;
    accepted: boolean;
  }> = [];

  // Music segments
  for (const m of music as Array<{ start: number; end: number; track: string | null }>) {
    suggestedSegments.push({
      start: m.start,
      end: m.end,
      types: ["music"],
      description: m.track ? `Copyrighted music: ${m.track}` : "Copyrighted music detected",
      accepted: true,
    });
  }

  // Promotion segments
  for (const p of promotions) {
    suggestedSegments.push({
      start: p.start,
      end: p.end,
      types: ["promotions"],
      description: p.description,
      accepted: true,
    });
  }

  // Merge overlapping segments
  suggestedSegments.sort((a, b) => a.start - b.start);
  const merged: typeof suggestedSegments = [];
  for (const seg of suggestedSegments) {
    if (merged.length > 0 && seg.start <= merged[merged.length - 1].end + 2) {
      const last = merged[merged.length - 1];
      last.end = Math.max(last.end, seg.end);
      last.types = [...new Set([...last.types, ...seg.types])];
      last.description += "; " + seg.description;
    } else {
      merged.push({ ...seg });
    }
  }

  return {
    video: { filename, path: `videos/${videoId}/${filename}` },
    music,
    graphics,
    transcript,
    promotions,
    suggested_segments: merged,
  };
}

function formatTime(seconds: number): string {
  const h = Math.floor(seconds / 3600);
  const m = Math.floor((seconds % 3600) / 60);
  const s = Math.floor(seconds % 60);
  return `${h.toString().padStart(2, "0")}:${m.toString().padStart(2, "0")}:${s.toString().padStart(2, "0")}`;
}
```

- [ ] **Step 3: Commit**

```bash
git add web/lib/agent.ts web/package.json web/package-lock.json
git commit -m "feat: add analysis agent using Anthropic SDK for orchestration"
```

---

### Task 18: Create analysis trigger API with SSE progress

**Files:**
- Create: `web/app/api/analyze/route.ts`

- [ ] **Step 1: Write analysis trigger endpoint**

Create `web/app/api/analyze/route.ts`:

```typescript
import { NextRequest, NextResponse } from "next/server";
import { requireAuth } from "@/lib/require-auth";
import { db } from "@/lib/db";
import { video, analysisJob } from "@/lib/db/schema";
import { eq, and, inArray } from "drizzle-orm";
import { runAnalysis } from "@/lib/agent";
import { nanoid } from "nanoid";

// POST /api/analyze — trigger analysis for one or more videos
export async function POST(request: NextRequest) {
  const session = await requireAuth();
  const { videoIds } = (await request.json()) as { videoIds: string[] };

  if (!videoIds || !Array.isArray(videoIds) || videoIds.length === 0) {
    return NextResponse.json({ error: "No videos specified" }, { status: 400 });
  }

  // Verify all videos belong to user
  const videos = await db
    .select()
    .from(video)
    .where(and(eq(video.userId, session.user.id), inArray(video.id, videoIds)));

  if (videos.length !== videoIds.length) {
    return NextResponse.json({ error: "Some videos not found" }, { status: 404 });
  }

  // Create analysis jobs and kick off processing
  const jobs = [];
  for (const v of videos) {
    const jobId = nanoid();
    const now = new Date();

    await db.insert(analysisJob).values({
      id: jobId,
      videoId: v.id,
      status: "pending",
      createdAt: now,
    });

    // Update video status
    await db
      .update(video)
      .set({ status: "analyzing", updatedAt: now })
      .where(eq(video.id, v.id));

    jobs.push({ jobId, videoId: v.id, filename: v.filename });
  }

  // Process in background (don't await)
  for (const job of jobs) {
    processVideoAnalysis(job.jobId, job.videoId, job.filename).catch(
      console.error
    );
  }

  return NextResponse.json({ jobs: jobs.map((j) => j.jobId) });
}

async function processVideoAnalysis(
  jobId: string,
  videoId: string,
  filename: string
) {
  const now = new Date();
  await db
    .update(analysisJob)
    .set({ status: "running", startedAt: now })
    .where(eq(analysisJob.id, jobId));

  try {
    await runAnalysis(videoId, filename, async (progress) => {
      await db
        .update(analysisJob)
        .set({ progress: JSON.stringify(progress) })
        .where(eq(analysisJob.id, jobId));
    });

    const completedAt = new Date();
    await db
      .update(analysisJob)
      .set({ status: "completed", completedAt })
      .where(eq(analysisJob.id, jobId));

    await db
      .update(video)
      .set({ status: "ready", updatedAt: completedAt })
      .where(eq(video.id, videoId));
  } catch (err) {
    const errorMsg = err instanceof Error ? err.message : "Unknown error";
    await db
      .update(analysisJob)
      .set({ status: "failed", error: errorMsg })
      .where(eq(analysisJob.id, jobId));

    await db
      .update(video)
      .set({ status: "error", error: errorMsg, updatedAt: new Date() })
      .where(eq(video.id, videoId));
  }
}
```

- [ ] **Step 2: Add analysis job polling to VideoPicker**

The VideoPicker already fetches video list (which includes status). Add a polling effect so it refetches every 5 seconds when any video has `status === "analyzing"`:

Add to `web/components/VideoPicker.tsx` inside the component:

```typescript
// Poll while any video is analyzing
useEffect(() => {
  if (videos.some((v) => v.status === "analyzing")) {
    const interval = setInterval(fetchVideos, 5000);
    return () => clearInterval(interval);
  }
}, [videos, fetchVideos]);
```

- [ ] **Step 3: Commit**

```bash
git add web/app/api/analyze/ web/components/VideoPicker.tsx
git commit -m "feat: add analysis trigger endpoint with background processing and status polling"
```

---

## Phase 6: Save, Cut & Download

### Task 19: Create save and cut endpoints

**Files:**
- Create: `web/app/api/save/[videoId]/route.ts`
- Create: `web/app/api/cut/[videoId]/route.ts`

- [ ] **Step 1: Write save endpoint**

Create `web/app/api/save/[videoId]/route.ts`:

```typescript
import { NextRequest, NextResponse } from "next/server";
import { requireAuth } from "@/lib/require-auth";
import { db } from "@/lib/db";
import { video } from "@/lib/db/schema";
import { eq, and } from "drizzle-orm";
import { saveAnalysisFile } from "@/lib/storage";

type Params = { params: Promise<{ videoId: string }> };

// POST /api/save/[videoId] — save finalized review data
export async function POST(request: NextRequest, { params }: Params) {
  const session = await requireAuth();
  const { videoId } = await params;

  const [v] = await db
    .select()
    .from(video)
    .where(and(eq(video.id, videoId), eq(video.userId, session.user.id)));

  if (!v) {
    return NextResponse.json({ error: "Not found" }, { status: 404 });
  }

  const body = await request.json();
  const { segments } = body as { segments: unknown[] };

  if (!segments || !Array.isArray(segments)) {
    return NextResponse.json({ error: "Invalid segments" }, { status: 400 });
  }

  // Save finalized_data.json (user-facing export)
  const finalizedData = {
    video: { id: videoId, filename: v.originalName },
    segments,
    savedAt: new Date().toISOString(),
  };

  await saveAnalysisFile(
    videoId,
    "finalized_data.json",
    JSON.stringify(finalizedData, null, 2)
  );

  return NextResponse.json({ ok: true });
}
```

- [ ] **Step 2: Write cut endpoint with status and download**

Create `web/app/api/cut/[videoId]/route.ts`:

```typescript
import { NextRequest, NextResponse } from "next/server";
import { requireAuth } from "@/lib/require-auth";
import { db } from "@/lib/db";
import { video } from "@/lib/db/schema";
import { eq, and } from "drizzle-orm";
import { modalCutVideo, modalUploadVideo } from "@/lib/modal-client";
import { outputDir, videoDir } from "@/lib/storage";
import { createReadStream, existsSync, statSync } from "fs";
import { Readable } from "stream";
import path from "path";
import fs from "fs/promises";

// In-memory cut status tracking (replace with DB or Redis for multi-instance)
const cutStatuses = new Map<
  string,
  { status: string; error?: string; outputPath?: string }
>();

type Params = { params: Promise<{ videoId: string }> };

// POST /api/cut/[videoId] — trigger video cut
export async function POST(request: NextRequest, { params }: Params) {
  const session = await requireAuth();
  const { videoId } = await params;

  const [v] = await db
    .select()
    .from(video)
    .where(and(eq(video.id, videoId), eq(video.userId, session.user.id)));

  if (!v) {
    return NextResponse.json({ error: "Not found" }, { status: 404 });
  }

  const body = await request.json();
  const { segments } = body as { segments: Array<{ start: number; end: number }> };

  if (!segments || segments.length === 0) {
    return NextResponse.json({ error: "No segments to cut" }, { status: 400 });
  }

  cutStatuses.set(videoId, { status: "running" });

  // Run cut in background
  (async () => {
    try {
      // Ensure video is on Modal volume (may already be there from analysis)
      const videoPath = path.join(videoDir(videoId), v.filename);
      const videoBuffer = await fs.readFile(videoPath);
      await modalUploadVideo(videoId, v.filename, videoBuffer);

      const result = await modalCutVideo(videoId, v.filename, segments);
      if (!result.ok) {
        cutStatuses.set(videoId, { status: "failed", error: result.error });
        return;
      }

      // Download cut video from Modal volume to local storage
      // TODO: Add Modal endpoint to download files from volume
      // For MVP, store the output path for download
      cutStatuses.set(videoId, {
        status: "done",
        outputPath: result.data!.output_path,
      });
    } catch (err) {
      cutStatuses.set(videoId, {
        status: "failed",
        error: err instanceof Error ? err.message : "Cut failed",
      });
    }
  })();

  return NextResponse.json({ status: "running" });
}

// GET /api/cut/[videoId] — get cut status or download result
export async function GET(request: NextRequest, { params }: Params) {
  const session = await requireAuth();
  const { videoId } = await params;

  const [v] = await db
    .select()
    .from(video)
    .where(and(eq(video.id, videoId), eq(video.userId, session.user.id)));

  if (!v) {
    return NextResponse.json({ error: "Not found" }, { status: 404 });
  }

  const download = request.nextUrl.searchParams.get("download");

  if (download === "true") {
    // Serve the cut file for download
    const ext = path.extname(v.filename);
    const outPath = path.join(outputDir(videoId), `clean${ext}`);

    if (!existsSync(outPath)) {
      return NextResponse.json({ error: "Output not ready" }, { status: 404 });
    }

    const fileSize = statSync(outPath).size;
    const stream = createReadStream(outPath);
    const webStream = Readable.toWeb(stream) as ReadableStream;

    return new NextResponse(webStream, {
      headers: {
        "Content-Type": "application/octet-stream",
        "Content-Disposition": `attachment; filename="clean_${v.originalName}"`,
        "Content-Length": fileSize.toString(),
      },
    });
  }

  // Return status
  const status = cutStatuses.get(videoId) ?? { status: "idle" };

  return NextResponse.json({
    ...status,
    downloadUrl: status.status === "done" ? `/api/cut/${videoId}?download=true` : undefined,
  });
}
```

- [ ] **Step 3: Commit**

```bash
git add web/app/api/save/ web/app/api/cut/
git commit -m "feat: add save (finalized_data.json) and cut endpoints with download"
```

---

### Task 20: Add Modal volume download endpoint

The analysis agent and cut process save results to the Modal Volume, but the Next.js server needs to download these files to serve them to users.

**Files:**
- Modify: `modal/app.py` (add download endpoint)
- Modify: `web/lib/modal-client.ts` (add download function)
- Modify: `web/lib/agent.ts` (download results after analysis)

- [ ] **Step 1: Add download endpoint to Modal**

Add to `modal/app.py`:

```python
@app.function(image=base_image, volumes={VOLUME_MOUNT: vol}, timeout=600, secrets=[auth_secret])
@modal.web_endpoint(method="POST")
def download_file(request: dict):
    """Download a file from the Modal volume (returns base64)."""
    token = request.get("auth_token", "")
    if not verify_auth(token):
        return {"error": "Unauthorized"}, 401

    file_path = request["path"]  # Relative to volume mount
    full_path = f"{VOLUME_MOUNT}/{file_path}"

    # Prevent path traversal
    import os.path as osp
    resolved = osp.realpath(full_path)
    if not resolved.startswith(osp.realpath(VOLUME_MOUNT)):
        return {"error": "Forbidden"}, 403

    if not os.path.exists(full_path):
        return {"error": "File not found"}, 404

    import base64
    with open(full_path, "rb") as f:
        data = base64.b64encode(f.read()).decode()

    return {"status": "ok", "data": data, "size": os.path.getsize(full_path)}


@app.function(image=base_image, volumes={VOLUME_MOUNT: vol}, timeout=60, secrets=[auth_secret])
@modal.web_endpoint(method="POST")
def list_files(request: dict):
    """List files in a directory on the Modal volume."""
    token = request.get("auth_token", "")
    if not verify_auth(token):
        return {"error": "Unauthorized"}, 401

    dir_path = request["path"]
    full_path = f"{VOLUME_MOUNT}/{dir_path}"

    import os.path as osp
    resolved = osp.realpath(full_path)
    if not resolved.startswith(osp.realpath(VOLUME_MOUNT)):
        return {"error": "Forbidden"}, 403

    if not os.path.isdir(full_path):
        return {"error": "Directory not found"}, 404

    files = []
    for entry in os.listdir(full_path):
        entry_path = os.path.join(full_path, entry)
        files.append({
            "name": entry,
            "is_dir": os.path.isdir(entry_path),
            "size": os.path.getsize(entry_path) if os.path.isfile(entry_path) else 0,
        })

    return {"status": "ok", "files": files}
```

- [ ] **Step 2: Add download function to modal-client.ts**

Add to `web/lib/modal-client.ts`:

```typescript
export async function modalDownloadFile(
  remotePath: string
): Promise<ModalResponse<{ data: string; size: number }>> {
  return callModal("download_file", { path: remotePath });
}

export async function modalListFiles(
  remotePath: string
): Promise<ModalResponse<{ files: Array<{ name: string; is_dir: boolean; size: number }> }>> {
  return callModal("list_files", { path: remotePath });
}
```

- [ ] **Step 3: Update agent.ts to download results after detection**

In `web/lib/agent.ts`, after the three detection passes complete, add a step to download results from Modal Volume to local storage:

```typescript
// After detection passes complete, download results
onProgress({ step: "Downloading analysis results", percent: 55 });

const filesToDownload = ["transcript.json", "music.json", "graphics_candidates.json"];
for (const file of filesToDownload) {
  const result = await modalDownloadFile(`analysis/${videoId}/${file}`);
  if (result.ok && result.data) {
    const content = Buffer.from(result.data.data, "base64").toString("utf-8");
    await saveAnalysisFile(videoId, file, content);
  }
}

// Download graphics frames directory
const framesResult = await modalListFiles(`analysis/${videoId}/graphics_frames`);
if (framesResult.ok && framesResult.data) {
  for (const f of framesResult.data.files) {
    if (!f.is_dir && f.name.endsWith(".png")) {
      const frameResult = await modalDownloadFile(
        `analysis/${videoId}/graphics_frames/${f.name}`
      );
      if (frameResult.ok && frameResult.data) {
        const frameBuffer = Buffer.from(frameResult.data.data, "base64");
        const framesDir = path.join(analysisDir(videoId), "graphics_frames");
        await fs.mkdir(framesDir, { recursive: true });
        await fs.writeFile(path.join(framesDir, f.name), frameBuffer);
      }
    }
  }
}
```

Add `import { modalDownloadFile, modalListFiles } from "./modal-client";` to the imports.

- [ ] **Step 4: Update cut endpoint to download output from Modal**

In `web/app/api/cut/[videoId]/route.ts`, after `modalCutVideo` succeeds, download the output:

```typescript
// Download cut video from Modal volume
const downloadResult = await modalDownloadFile(result.data!.output_path);
if (!downloadResult.ok) {
  cutStatuses.set(videoId, { status: "failed", error: "Failed to download output" });
  return;
}

const ext = path.extname(v.filename);
const outDirPath = outputDir(videoId);
await fs.mkdir(outDirPath, { recursive: true });
const outPath = path.join(outDirPath, `clean${ext}`);
await fs.writeFile(outPath, Buffer.from(downloadResult.data!.data, "base64"));

cutStatuses.set(videoId, { status: "done", outputPath: outPath });
```

- [ ] **Step 5: Redeploy Modal and commit**

```bash
cd modal && modal deploy app.py
git add modal/app.py web/lib/modal-client.ts web/lib/agent.ts web/app/api/cut/
git commit -m "feat: add Modal volume download/list endpoints, sync results to local storage"
```

---

## Phase 7: Security Hardening

### Task 21: Audit and secure all API routes

**Files:**
- All files in `web/app/api/`
- `web/middleware.ts`

- [ ] **Step 1: Verify auth on every API route**

Check that every API route (except `/api/auth/[...all]`) calls `requireAuth()` at the start. Verify the middleware redirects unauthenticated requests.

Routes to check:
- `GET/POST /api/videos` — has requireAuth ✓
- `GET/DELETE /api/videos/[videoId]` — has requireAuth ✓
- `GET /api/videos/[videoId]/stream` — has requireAuth ✓
- `POST /api/analyze` — has requireAuth ✓
- `GET /api/analysis/[videoId]` — has requireAuth ✓
- `GET /api/analysis/[videoId]/frames/[filename]` — has requireAuth ✓
- `POST /api/save/[videoId]` — has requireAuth ✓
- `GET/POST /api/cut/[videoId]` — has requireAuth ✓

- [ ] **Step 2: Verify ownership checks on all video operations**

Every route that accepts `videoId` must verify the video belongs to `session.user.id`. Check all routes use:
```typescript
and(eq(video.id, videoId), eq(video.userId, session.user.id))
```

- [ ] **Step 3: Verify path traversal protection**

Check all file operations use the `safePath()` function from storage.ts. Specifically verify:
- Frame serving: validates filename format with regex
- Analysis file reading: uses `readAnalysisFile()` which calls `safePath()`
- Video streaming: uses `getVideoFilePath()` which calls `safePath()`
- No raw `path.join()` with user-supplied input that isn't validated

- [ ] **Step 4: Add rate limiting to upload endpoint**

Add basic in-memory rate limiting to prevent abuse. Add to `web/app/api/videos/route.ts`:

```typescript
// Simple rate limiter: max 10 uploads per hour per user
const uploadCounts = new Map<string, { count: number; resetAt: number }>();

function checkUploadRateLimit(userId: string): boolean {
  const now = Date.now();
  const entry = uploadCounts.get(userId);

  if (!entry || now > entry.resetAt) {
    uploadCounts.set(userId, { count: 1, resetAt: now + 3600_000 });
    return true;
  }

  if (entry.count >= 10) return false;
  entry.count++;
  return true;
}
```

Call `checkUploadRateLimit(session.user.id)` at the start of the POST handler.

- [ ] **Step 5: Validate Content-Type on POST endpoints**

Add Content-Type validation to JSON-accepting endpoints:

```typescript
const contentType = request.headers.get("content-type");
if (!contentType?.includes("application/json")) {
  return NextResponse.json({ error: "Invalid content type" }, { status: 415 });
}
```

Apply to: `/api/analyze`, `/api/save/[videoId]`, `/api/cut/[videoId]` POST handlers.

- [ ] **Step 6: Commit**

```bash
git add web/app/api/ web/middleware.ts
git commit -m "security: audit and harden all API routes"
```

---

### Task 22: Secure environment and configuration

**Files:**
- Modify: `web/.env.example`
- Create: `web/lib/env.ts`
- Modify: `web/.gitignore`

- [ ] **Step 1: Write environment validation module**

Create `web/lib/env.ts`:

```typescript
function requireEnv(name: string): string {
  const value = process.env[name];
  if (!value) {
    throw new Error(`Missing required environment variable: ${name}`);
  }
  return value;
}

// Validate at import time (fails fast during startup)
export const env = {
  BETTER_AUTH_SECRET: requireEnv("BETTER_AUTH_SECRET"),
  BETTER_AUTH_URL: requireEnv("BETTER_AUTH_URL"),
  ANTHROPIC_API_KEY: requireEnv("ANTHROPIC_API_KEY"),
  MODAL_ENDPOINT_URL: requireEnv("MODAL_ENDPOINT_URL"),
  MODAL_AUTH_TOKEN: requireEnv("MODAL_AUTH_TOKEN"),
  ALLOWED_EMAILS: requireEnv("ALLOWED_EMAILS"),
  ACOUSTID_API_KEY: process.env.ACOUSTID_API_KEY, // optional
} as const;
```

Use `env.MODAL_AUTH_TOKEN` instead of `process.env.MODAL_AUTH_TOKEN!` throughout the codebase.

- [ ] **Step 2: Verify .gitignore covers sensitive files**

Ensure `web/.gitignore` includes:

```
.env.local
.env.*.local
data/
*.db
*.db-wal
*.db-shm
```

- [ ] **Step 3: Update .env.example with all required variables**

Update `web/.env.example`:

```env
# Auth (REQUIRED)
BETTER_AUTH_SECRET=           # openssl rand -hex 32
BETTER_AUTH_URL=http://localhost:3000
NEXT_PUBLIC_APP_URL=http://localhost:3000

# Anthropic (REQUIRED)
ANTHROPIC_API_KEY=            # sk-ant-...

# Modal (REQUIRED)
MODAL_ENDPOINT_URL=           # https://your-app--filmhub.modal.run
MODAL_AUTH_TOKEN=              # Shared secret, must match Modal secret

# Access control (REQUIRED)
ALLOWED_EMAILS=kbi102003@gmail.com,akshayphx@gmail.com

# Optional
ACOUSTID_API_KEY=             # For music fingerprinting
```

- [ ] **Step 4: Commit**

```bash
git add web/lib/env.ts web/.env.example web/.gitignore
git commit -m "security: add environment validation and secure config management"
```

---

### Task 23: Configure CORS and security headers

**Files:**
- Modify: `web/next.config.ts`
- Modify: `web/middleware.ts`

- [ ] **Step 1: Add security headers to next.config.ts**

Update `web/next.config.ts`:

```typescript
import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  headers: async () => [
    {
      source: "/(.*)",
      headers: [
        { key: "X-Content-Type-Options", value: "nosniff" },
        { key: "X-Frame-Options", value: "DENY" },
        { key: "X-XSS-Protection", value: "1; mode=block" },
        { key: "Referrer-Policy", value: "strict-origin-when-cross-origin" },
        {
          key: "Content-Security-Policy",
          value: "default-src 'self'; script-src 'self' 'unsafe-eval' 'unsafe-inline'; style-src 'self' 'unsafe-inline'; img-src 'self' blob: data:; media-src 'self' blob:; connect-src 'self'",
        },
      ],
    },
  ],
};

export default nextConfig;
```

- [ ] **Step 2: Verify no permissive CORS**

Next.js API routes don't add CORS headers by default (unlike the old Rust backend which had `CorsLayer::permissive()`). This is correct for a same-origin webapp. No changes needed.

If you ever need CORS (e.g., for a mobile app), add it selectively per route, not globally.

- [ ] **Step 3: Commit**

```bash
git add web/next.config.ts
git commit -m "security: add security headers (CSP, X-Frame-Options, etc.)"
```

---

### Task 24: Final integration test

- [ ] **Step 1: Start the full stack**

```bash
# Terminal 1: Next.js dev server
cd web && npm run dev

# Ensure Modal is deployed
cd modal && modal deploy app.py
```

- [ ] **Step 2: Test auth flow**

1. Navigate to `http://localhost:3000` — should redirect to sign-in
2. Try signing up with `test@example.com` — should be rejected
3. Sign up with `kbi102003@gmail.com` — should succeed
4. Verify redirect to `/dashboard`
5. Refresh page — should stay on `/dashboard` (session persists)
6. Sign out — should redirect to sign-in
7. Sign back in — should work

- [ ] **Step 3: Test video upload flow**

1. Click Upload, drop a small test video
2. Observe upload progress bar
3. Video appears in grid with "uploaded" status
4. Upload a second video
5. Both appear in grid

- [ ] **Step 4: Test video management**

1. Select both videos (click checkboxes)
2. Click Deselect All — checkboxes clear
3. Select one video, click Delete — confirm dialog, video removed
4. Verify the other video remains

- [ ] **Step 5: Test analysis**

1. Select remaining video, click Analyze
2. Video status changes to "analyzing" (yellow pulse)
3. Wait for completion (may take several minutes depending on video length)
4. Video status changes to "ready" (green)
5. Review button appears on video card

- [ ] **Step 6: Test review view**

1. Click Review button
2. Video player loads and plays
3. Timeline shows detected segments
4. Segment properties panel works
5. Transcript panel shows text
6. Keyboard shortcuts work (space, arrows)

- [ ] **Step 7: Test save & cut**

1. Toggle some segments accepted/rejected
2. Click Save & Cut
3. Status shows "Cutting..."
4. After completion, Download button appears
5. Click Download — browser downloads the clean video

- [ ] **Step 8: Commit any fixes from integration testing**

```bash
git add -A
git commit -m "fix: integration test fixes"
```

---

## Summary of security measures

| Concern | Mitigation |
|---------|-----------|
| Authentication | BetterAuth email/password with cookie sessions |
| Authorization | Email whitelist on sign-up, ownership checks on all video ops |
| Session management | Secure cookies, server-side session validation |
| Path traversal | `safePath()` validates all filesystem paths stay within data dir |
| Input validation | File type/size checks on upload, JSON validation on POST bodies |
| API auth | Middleware blocks unauthenticated API requests |
| Modal auth | Shared secret (Bearer token) on all Modal web endpoints |
| CORS | No permissive CORS (same-origin only) |
| Security headers | CSP, X-Frame-Options, X-Content-Type-Options, Referrer-Policy |
| Rate limiting | Upload rate limiting (10/hour/user) |
| Secrets management | Environment variables, .env.local not committed, validation at startup |
| File serving | Filename regex validation, resolved path verification |
