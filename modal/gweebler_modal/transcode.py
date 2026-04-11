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
