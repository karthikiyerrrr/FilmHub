import os
import json
import tempfile
import subprocess
from google.cloud import storage


def download_video(video_url: str, local_path: str) -> None:
    import urllib.request
    urllib.request.urlretrieve(video_url, local_path)


def get_duration(video_path: str) -> float:
    result = subprocess.run(
        ["ffprobe", "-v", "quiet", "-print_format", "json", "-show_format", video_path],
        capture_output=True, text=True, check=True,
    )
    info = json.loads(result.stdout)
    return float(info["format"]["duration"])


def compute_keep_intervals(segments: list, duration: float) -> list:
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
    duration = get_duration(video_path)
    keeps = compute_keep_intervals(segments, duration)
    if not keeps:
        raise ValueError("No content left after removing all segments")
    with tempfile.TemporaryDirectory() as tmpdir:
        chunk_paths = []
        for i, (start, end) in enumerate(keeps):
            chunk = os.path.join(tmpdir, f"chunk_{i:04d}.mkv")
            subprocess.run(
                ["ffmpeg", "-y", "-i", video_path, "-ss", str(start),
                 "-to", str(end), "-c", "copy", "-avoid_negative_ts", "make_zero", chunk],
                check=True, capture_output=True,
            )
            chunk_paths.append(chunk)
        concat_file = os.path.join(tmpdir, "concat.txt")
        with open(concat_file, "w") as f:
            for path in chunk_paths:
                f.write(f"file '{path}'\n")
        subprocess.run(
            ["ffmpeg", "-y", "-f", "concat", "-safe", "0", "-i", concat_file,
             "-c", "copy", output_path],
            check=True, capture_output=True,
        )


def run(video_url: str, video_id: str, filename: str, segments: list, bucket_name: str) -> dict:
    with tempfile.TemporaryDirectory() as tmpdir:
        ext = os.path.splitext(filename)[1] or ".mp4"
        video_path = os.path.join(tmpdir, f"input{ext}")
        output_path = os.path.join(tmpdir, f"clean_{filename}")
        download_video(video_url, video_path)
        cut_video(video_path, segments, output_path)
        gcs_path = f"output/{video_id}/clean_{filename}"
        from gweebler_modal import get_gcs_client
        client = get_gcs_client()
        bucket = client.bucket(bucket_name)
        blob = bucket.blob(gcs_path)
        blob.upload_from_filename(output_path)
        return {"status": "completed", "gcs_path": gcs_path}
