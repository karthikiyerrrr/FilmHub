# Post-Upload Video Transcode Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Transcode uploaded videos to web-optimized H.264 MP4 after upload so the review UI has fast seeking and playback.

**Architecture:** After the frontend completes a GCS upload, it calls a new API endpoint that triggers a Modal transcode function. The transcode creates a web-optimized MP4 (H.264, AAC, `faststart`) and uploads it to `previews/{videoId}/preview.mp4` in GCS. The Firestore video doc tracks transcode status. The review UI serves the preview URL instead of the raw video.

**Tech Stack:** Modal (FFmpeg), Cloud Run API (Express), React frontend

---

## File Structure

```
modal/
  app.py                          # Add transcode endpoint
  gweebler_modal/
    transcode.py                  # New: FFmpeg transcode logic
api/
  src/routes/
    upload.ts                     # Add POST /api/videos/:videoId/transcode
    videos.ts                     # Modify: serve preview URL if available
frontend/
  src/components/
    UploadZone.tsx                # Trigger transcode after upload completes
```

---

### Task 1: Modal transcode endpoint

**Files:**
- Create: `modal/gweebler_modal/transcode.py`
- Modify: `modal/app.py`

- [ ] **Step 1: Create transcode module**

Create `modal/gweebler_modal/transcode.py`:

```python
import os
import json
import tempfile
import subprocess


def download_video(video_url: str, local_path: str) -> None:
    import urllib.request
    urllib.request.urlretrieve(video_url, local_path)


def transcode(input_path: str, output_path: str) -> None:
    """Transcode to web-optimized H.264 MP4 with faststart."""
    subprocess.run(
        [
            "ffmpeg", "-y", "-i", input_path,
            "-c:v", "libx264", "-preset", "fast", "-crf", "23",
            "-c:a", "aac", "-b:a", "128k",
            "-movflags", "+faststart",
            "-vf", "scale='min(1920,iw)':'min(1080,ih)':force_original_aspect_ratio=decrease",
            output_path,
        ],
        check=True, capture_output=True,
    )


def run(video_url: str, video_id: str, bucket_name: str) -> dict:
    """Download raw video, transcode to preview MP4, upload to GCS."""
    from gweebler_modal import get_gcs_client

    with tempfile.TemporaryDirectory() as tmpdir:
        input_path = os.path.join(tmpdir, "input")
        output_path = os.path.join(tmpdir, "preview.mp4")

        download_video(video_url, input_path)
        transcode(input_path, output_path)

        gcs_path = f"previews/{video_id}/preview.mp4"
        client = get_gcs_client()
        bucket = client.bucket(bucket_name)
        blob = bucket.blob(gcs_path)
        blob.upload_from_filename(output_path, content_type="video/mp4")

        return {"status": "completed", "gcs_path": gcs_path}
```

- [ ] **Step 2: Add transcode endpoint to Modal app**

Add to `modal/app.py` after the `cut_image` line:

```python
transcode_image = base_image.add_local_python_source("gweebler_modal")
```

Add the endpoint function at the end of the file:

```python
@app.function(
    image=transcode_image,
    timeout=900,
    secrets=[modal.Secret.from_name("gweebler")],
)
@modal.fastapi_endpoint(method="POST")
def transcode_video(item: dict) -> dict:
    from gweebler_modal.transcode import run
    return run(
        video_url=item["video_url"],
        video_id=item["video_id"],
        bucket_name=item.get("bucket", "gweebler.firebasestorage.app"),
    )
```

- [ ] **Step 3: Deploy Modal**

```bash
cd modal && modal deploy app.py
```

Note the transcode endpoint URL (e.g., `https://kbi102003--gweebler-transcode-video.modal.run`).

- [ ] **Step 4: Commit**

```bash
git add modal/
git commit -m "feat: add Modal transcode endpoint for web-optimized video preview"
```

---

### Task 2: API transcode trigger endpoint

**Files:**
- Modify: `api/src/routes/upload.ts`
- Modify: `api/src/index.ts` (if needed)

- [ ] **Step 1: Add transcode endpoint to upload.ts**

Add to `api/src/routes/upload.ts`, after the existing `POST /upload/sign` route:

```typescript
const MODAL_URL_TRANSCODE = process.env.MODAL_URL_TRANSCODE || ''
const MODAL_AUTH_TOKEN = process.env.MODAL_AUTH_TOKEN || ''

router.post('/videos/:videoId/transcode', async (req: AuthRequest, res) => {
  const videoId = req.params.videoId as string
  const db = admin.firestore()

  const videoDoc = await db.collection('videos').doc(videoId).get()
  if (!videoDoc.exists || videoDoc.data()?.userId !== req.uid) {
    res.status(404).json({ error: 'Video not found' })
    return
  }

  const gcsPath = videoDoc.data()!.gcsPath as string
  const file = bucket.file(gcsPath)

  const [videoUrl] = await file.getSignedUrl({
    action: 'read',
    expires: Date.now() + 2 * 60 * 60 * 1000,
  })

  // Update video doc with transcode status
  await db.collection('videos').doc(videoId).update({
    transcodeStatus: 'running',
    updatedAt: admin.firestore.FieldValue.serverTimestamp(),
  })

  // Call Modal transcode endpoint
  try {
    const modalRes = await fetch(MODAL_URL_TRANSCODE, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${MODAL_AUTH_TOKEN}`,
      },
      body: JSON.stringify({
        video_url: videoUrl,
        video_id: videoId,
        bucket: process.env.GCS_BUCKET,
      }),
    })

    if (!modalRes.ok) {
      throw new Error(`Modal transcode failed: ${await modalRes.text()}`)
    }

    const result = await modalRes.json() as { gcs_path: string }

    await db.collection('videos').doc(videoId).update({
      transcodeStatus: 'done',
      previewGcsPath: result.gcs_path,
      updatedAt: admin.firestore.FieldValue.serverTimestamp(),
    })

    res.json({ status: 'done', previewGcsPath: result.gcs_path })
  } catch (error) {
    const errorMsg = error instanceof Error ? error.message : String(error)
    await db.collection('videos').doc(videoId).update({
      transcodeStatus: 'failed',
      updatedAt: admin.firestore.FieldValue.serverTimestamp(),
    })
    res.status(500).json({ status: 'failed', error: errorMsg })
  }
})
```

- [ ] **Step 2: Add `MODAL_URL_TRANSCODE` to API env vars**

Add to `/tmp/env.yaml`:
```yaml
MODAL_URL_TRANSCODE: https://kbi102003--gweebler-transcode-video.modal.run
```

- [ ] **Step 3: Commit**

```bash
git add api/
git commit -m "feat: add transcode trigger API endpoint"
```

---

### Task 3: Serve preview URL in video endpoint

**Files:**
- Modify: `api/src/routes/videos.ts`

- [ ] **Step 1: Update GET /videos/:videoId/url to prefer preview**

Replace the `GET /videos/:videoId/url` route in `api/src/routes/videos.ts`:

```typescript
router.get('/videos/:videoId/url', async (req: AuthRequest, res) => {
  const videoId = req.params.videoId as string
  const db = admin.firestore()
  const doc = await db.collection('videos').doc(videoId).get()

  if (!doc.exists || doc.data()?.userId !== req.uid) {
    res.status(404).json({ error: 'Video not found' })
    return
  }

  // Prefer transcoded preview if available
  const previewGcsPath = doc.data()!.previewGcsPath as string | undefined
  const gcsPath = previewGcsPath || (doc.data()!.gcsPath as string)
  const file = bucket.file(gcsPath)

  const [signedUrl] = await file.getSignedUrl({
    action: 'read',
    expires: Date.now() + 60 * 60 * 1000,
  })

  res.json({ url: signedUrl, isPreview: !!previewGcsPath })
})
```

- [ ] **Step 2: Commit**

```bash
git add api/src/routes/videos.ts
git commit -m "feat: serve transcoded preview URL when available"
```

---

### Task 4: Trigger transcode after upload in frontend

**Files:**
- Modify: `frontend/src/api.ts`
- Modify: `frontend/src/components/UploadZone.tsx`

- [ ] **Step 1: Add transcode API function**

Add to `frontend/src/api.ts`:

```typescript
export async function triggerTranscode(videoId: string): Promise<{ status: string }> {
  return apiFetch(`/api/videos/${videoId}/transcode`, {
    method: 'POST',
  })
}
```

- [ ] **Step 2: Update UploadZone to trigger transcode after upload**

In `frontend/src/components/UploadZone.tsx`, update the `uploadFile` function. After the successful XHR upload and before calling `onUploadComplete()`, add the transcode call:

```typescript
import { getUploadUrl, triggerTranscode } from '../api'
```

In the `uploadFile` function, after the `await new Promise(...)` that completes the upload:

```typescript
      // Trigger transcode in background (don't await — it takes a while)
      triggerTranscode(videoId).catch((err) =>
        console.error('Transcode trigger failed:', err)
      )

      onUploadComplete()
```

Note: `videoId` comes from the `getUploadUrl` response — make sure it's in scope. The current code destructures `{ uploadUrl }` but we also need `videoId`:

Change:
```typescript
const { uploadUrl } = await getUploadUrl(file.name, file.type)
```
To:
```typescript
const { videoId, uploadUrl } = await getUploadUrl(file.name, file.type)
```

- [ ] **Step 3: Verify TypeScript compiles**

```bash
cd frontend && npx tsc --noEmit
```

- [ ] **Step 4: Commit**

```bash
git add frontend/
git commit -m "feat: trigger video transcode after upload completes"
```

---

### Task 5: Deploy all services

- [ ] **Step 1: Deploy Modal**

```bash
cd modal && modal deploy app.py
```

- [ ] **Step 2: Deploy API**

Update `/tmp/env.yaml` with `MODAL_URL_TRANSCODE`, then:

```bash
cd api && gcloud run deploy gweebler-api --source . --region us-west1 --allow-unauthenticated --env-vars-file /tmp/env.yaml
```

- [ ] **Step 3: Build and deploy frontend**

```bash
cd frontend && npm run build && cd .. && firebase deploy --only hosting
```

- [ ] **Step 4: Test**

Upload a video on https://gweebler.web.app. After upload, the transcode runs in the background. Once complete, navigating to the review page should load the web-optimized preview with fast seeking.
