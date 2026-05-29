"""
nougat_processor.py
--------------------
Handles OCR for printed / typed text regions using Google Gemini Vision.

Uses the new google-genai SDK (replaces deprecated google-generativeai).
Install: pip install google-genai

Get a free key at: https://aistudio.google.com/app/apikey
"""

import io
import os
from pathlib import Path
from typing import Union

from google import genai
from google.genai import types
from PIL import Image


# ---------------------------------------------------------------------------
# Client singleton
# ---------------------------------------------------------------------------

_client = None


def _get_client():
    global _client
    if _client is None:
        # api_key = os.getenv("GEMINI_API_KEY") or os.getenv("GOOGLE_API_KEY")
        api_key="AIzaSyBDvEYFh69a-3emOb94QgKDALH8ZSdG2iQ"
        if not api_key:
            raise EnvironmentError(
                "GEMINI_API_KEY is not set. Get a free key at "
                "https://aistudio.google.com/app/apikey and add it to ml/.env"
            )
        _client = genai.Client(api_key=api_key)
    return _client


# ---------------------------------------------------------------------------
# Prompt
# ---------------------------------------------------------------------------

_PRINTED_TEXT_PROMPT = (
    "You are an OCR engine. Transcribe ALL printed and typed text visible in "
    "this image exactly as it appears. Preserve line breaks and spacing. "
    "If there are mathematical expressions, write them in plain text "
    "(e.g. x^2 + 3x - 5 = 0). "
    "If there are tables, preserve their structure using plain text alignment. "
    "Output ONLY the transcribed text — no commentary, no explanations."
)

_MODEL = "gemini-3.5-flash"


# ---------------------------------------------------------------------------
# Public API  (same signatures as original)
# ---------------------------------------------------------------------------

def extract_text_from_image(
    image: Union[str, Path, Image.Image],
    model_name: str = _MODEL,
    max_new_tokens: int = 512,
) -> str:
    if not isinstance(image, Image.Image):
        image = Image.open(image).convert("RGB")

    print("[NougatProcessor] Sending image to Gemini Vision for OCR …")

    response = _get_client().models.generate_content(
        model=_MODEL,
        contents=[_PRINTED_TEXT_PROMPT, image],
    )
    text = response.text or ""

    print(f"[NougatProcessor] OCR complete — {len(text)} characters extracted.")
    return text.strip()


def extract_text_from_bytes(image_bytes: bytes, **kwargs) -> str:
    image = Image.open(io.BytesIO(image_bytes)).convert("RGB")
    return extract_text_from_image(image, **kwargs)


# ---------------------------------------------------------------------------
# CLI smoke-test
# ---------------------------------------------------------------------------

if __name__ == "__main__":
    import sys
    if len(sys.argv) < 2:
        print("Usage: python nougat_processor.py <image_path>")
        sys.exit(1)
    print(extract_text_from_image(sys.argv[1]))