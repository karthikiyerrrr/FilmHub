#!/usr/bin/env python3
"""
diarize.py
====================
Speaker diarization using PyAnnote (pyannote/pyannote-audio).

Identifies who is speaking when in an audio file, then aligns speaker
labels with Whisper transcript segments via temporal overlap.

The pretrained model weights are gated on HuggingFace and require a
one-time token for the initial download.  Once cached locally
(~/.cache/huggingface/), no token is needed for subsequent runs.

Requirements:
  pip install pyannote.audio
"""

import os
import sys
from collections import defaultdict


# ---------------------------------------------------------------------------
# Pipeline loading
# ---------------------------------------------------------------------------

MODEL_ID = "pyannote/speaker-diarization-community-1"


def load_pipeline(hf_token: str | None = None):
    """Load the PyAnnote speaker-diarization pipeline.

    Token resolution order:
      1. Explicit *hf_token* argument
      2. ``HF_TOKEN`` environment variable
      3. Default HuggingFace CLI cache (``huggingface-cli login``)

    Returns a ``pyannote.audio.Pipeline`` instance.
    """
    from pyannote.audio import Pipeline

    token = hf_token or os.environ.get("HF_TOKEN")

    try:
        pipeline = Pipeline.from_pretrained(MODEL_ID, token=token)
    except Exception as exc:
        if "401" in str(exc) or "gated" in str(exc).lower():
            print(
                "\nERROR: Could not load the PyAnnote diarization model.\n"
                "  The model weights must be downloaded once from HuggingFace.\n\n"
                "  1. Accept the licence at https://huggingface.co/pyannote/speaker-diarization-community-1\n"
                "  2. Create a token at https://huggingface.co/settings/tokens\n"
                "  3. Run with --hf-token YOUR_TOKEN  (or set HF_TOKEN env var)\n",
                file=sys.stderr,
            )
        raise

    # CPU is the safe default; MPS support in PyAnnote is partial.
    import torch

    if torch.backends.mps.is_available():
        pipeline.to(torch.device("mps"))
    else:
        pipeline.to(torch.device("cpu"))

    return pipeline


# ---------------------------------------------------------------------------
# Diarization
# ---------------------------------------------------------------------------

def diarize(audio_path: str, pipeline) -> "pyannote.core.Annotation":
    """Run speaker diarization on an audio file.

    Returns a ``pyannote.core.Annotation`` whose tracks contain
    ``(Segment, track, speaker_label)`` tuples.
    """
    result = pipeline(audio_path)

    # The community pipeline returns a DiarizeOutput dataclass;
    # extract the underlying Annotation.
    if hasattr(result, "speaker_diarization"):
        return result.speaker_diarization
    return result


# ---------------------------------------------------------------------------
# Alignment
# ---------------------------------------------------------------------------

def assign_speakers(
    segments: list[dict],
    annotation: "pyannote.core.Annotation",
) -> tuple[list[dict], list[str]]:
    """Assign a speaker label to each Whisper segment via temporal overlap.

    For every Whisper segment ``[start, end]`` the diarization speaker
    with the greatest overlap duration is selected.  Segments that do not
    overlap any speaker turn receive ``speaker: None``.

    Returns ``(enriched_segments, speakers)`` where *speakers* is a
    sorted list of unique speaker labels found.
    """
    all_speakers: set[str] = set()

    for seg in segments:
        overlap: dict[str, float] = defaultdict(float)
        for turn, _, speaker in annotation.itertracks(yield_label=True):
            o = min(seg["end"], turn.end) - max(seg["start"], turn.start)
            if o > 0:
                overlap[speaker] += o

        if overlap:
            best = max(overlap, key=overlap.get)
            seg["speaker"] = best
            all_speakers.add(best)
        else:
            seg["speaker"] = None

    return segments, sorted(all_speakers)
