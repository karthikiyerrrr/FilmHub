import os
import json
import tempfile
import subprocess
from google.cloud import storage


def download_video(video_url: str, local_path: str) -> None:
    import urllib.request
    urllib.request.urlretrieve(video_url, local_path)


def extract_audio(video_path: str, audio_path: str) -> None:
    subprocess.run(
        ["ffmpeg", "-y", "-i", video_path, "-vn", "-acodec", "pcm_s16le",
         "-ar", "44100", "-ac", "1", audio_path],
        check=True, capture_output=True,
    )


def separate_music(audio_path: str, output_dir: str, model_name: str = "htdemucs") -> str:
    subprocess.run(
        ["python", "-m", "demucs", "-n", model_name, "--two-stems", "vocals",
         "-o", output_dir, audio_path],
        check=True, capture_output=True,
    )
    stem_name = os.path.splitext(os.path.basename(audio_path))[0]
    return os.path.join(output_dir, model_name, stem_name, "no_vocals.wav")


def detect_music_segments(music_path: str, threshold: float = 0.01,
                          frame_length: int = 2048, hop_length: int = 512) -> list:
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
    from gweebler_modal import get_gcs_client
    client = get_gcs_client()
    bucket = client.bucket(bucket_name)
    blob = bucket.blob(gcs_path)
    blob.upload_from_string(json.dumps(data, indent=2), content_type="application/json")


def run(video_url: str, video_id: str, bucket_name: str) -> dict:
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
