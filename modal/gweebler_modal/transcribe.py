import os
import json
import tempfile
import subprocess
from google.cloud import storage


def extract_audio(video_path: str, audio_path: str) -> None:
    subprocess.run(
        ["ffmpeg", "-y", "-i", video_path, "-vn", "-acodec", "pcm_s16le",
         "-ar", "16000", "-ac", "1", audio_path],
        check=True, capture_output=True,
    )


def transcribe_audio(audio_path: str, model_size: str = "large-v3") -> dict:
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
    import urllib.request
    urllib.request.urlretrieve(video_url, local_path)


def upload_json(data: dict, bucket_name: str, gcs_path: str) -> None:
    client = storage.Client()
    bucket = client.bucket(bucket_name)
    blob = bucket.blob(gcs_path)
    blob.upload_from_string(json.dumps(data, indent=2), content_type="application/json")


def run(video_url: str, video_id: str, bucket_name: str, diarize: bool = False) -> dict:
    with tempfile.TemporaryDirectory() as tmpdir:
        video_path = os.path.join(tmpdir, "video.mp4")
        audio_path = os.path.join(tmpdir, "audio.wav")
        download_video(video_url, video_path)
        extract_audio(video_path, audio_path)
        result = transcribe_audio(audio_path)
        gcs_path = f"analysis/{video_id}/transcript.json"
        upload_json(result, bucket_name, gcs_path)
        return {"status": "completed", "gcs_path": gcs_path, "segment_count": len(result["segments"])}
