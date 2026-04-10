import modal

app = modal.App("gweebler")

base_image = (
    modal.Image.debian_slim(python_version="3.11")
    .apt_install("ffmpeg")
    .pip_install("google-cloud-storage")
)

whisper_image = base_image.pip_install("faster-whisper")
demucs_image = base_image.pip_install("demucs", "librosa", "pyacoustid")
graphics_image = base_image.pip_install("opencv-python-headless", "numpy")


@app.function(
    image=whisper_image,
    gpu="A10G",
    timeout=900,
    secrets=[modal.Secret.from_name("gweebler")],
)
@modal.web_endpoint(method="POST")
def transcribe(item: dict) -> dict:
    from gweebler_modal.transcribe import run
    return run(
        video_url=item["video_url"],
        video_id=item["video_id"],
        bucket_name=item.get("bucket", "gweebler.firebasestorage.app"),
        diarize=item.get("diarize", False),
    )


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
