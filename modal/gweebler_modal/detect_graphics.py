import os
import json
import tempfile
import subprocess
from google.cloud import storage


def download_video(video_url: str, local_path: str) -> None:
    import urllib.request
    urllib.request.urlretrieve(video_url, local_path)


def extract_frames(video_path: str, output_dir: str, fps: int = 1) -> int:
    subprocess.run(
        ["ffmpeg", "-y", "-i", video_path, "-vf", f"fps={fps}",
         os.path.join(output_dir, "frame_%06d.png")],
        check=True, capture_output=True,
    )
    return len([f for f in os.listdir(output_dir) if f.startswith("frame_")])


def compute_frame_metrics(frame_path: str) -> dict | None:
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
    client = storage.Client()
    bucket = client.bucket(bucket_name)
    for c in candidates:
        for key in ["before_frame", "after_frame"]:
            local = os.path.join(frames_dir, c[key])
            gcs_path = f"analysis/{video_id}/graphics_frames/{c[key]}"
            blob = bucket.blob(gcs_path)
            blob.upload_from_filename(local, content_type="image/png")
    return candidates


def upload_json(data, bucket_name: str, gcs_path: str) -> None:
    client = storage.Client()
    bucket = client.bucket(bucket_name)
    blob = bucket.blob(gcs_path)
    blob.upload_from_string(json.dumps(data, indent=2), content_type="application/json")


def run(video_url: str, video_id: str, bucket_name: str, threshold: float = 0.4) -> dict:
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
