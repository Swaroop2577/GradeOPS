"""
embedder.py
------------
Generates dense vector embeddings for student answer transcripts using
sentence-transformers. These embeddings are used by similarity_detector.py
to compute cosine similarity across submissions.

Model choice
------------
Default: "all-MiniLM-L6-v2" – fast, lightweight, good semantic similarity.
For higher accuracy at the cost of speed: "all-mpnet-base-v2".
Both are available on HuggingFace Hub.
"""

from __future__ import annotations

import os
from typing import List, Optional

import numpy as np
from sentence_transformers import SentenceTransformer


# ---------------------------------------------------------------------------
# Model singleton
# ---------------------------------------------------------------------------

_model: Optional[SentenceTransformer] = None


def _get_model(model_name: str = "all-MiniLM-L6-v2") -> SentenceTransformer:
    global _model
    # Reload if a different model name is requested
    if _model is None or getattr(_model, "_model_name", None) != model_name:
        print(f"[Embedder] Loading sentence-transformer model '{model_name}' …")
        _model = SentenceTransformer(model_name)
        _model._model_name = model_name  # type: ignore[attr-defined]
    return _model


# ---------------------------------------------------------------------------
# Public API
# ---------------------------------------------------------------------------


def embed_texts(
    texts: List[str],
    model_name: str | None = None,
    batch_size: int = 32,
    normalize: bool = True,
) -> np.ndarray:
    """
    Encode a list of text strings into L2-normalised embedding vectors.

    Parameters
    ----------
    texts      : List of strings to encode (student answer transcripts).
    model_name : Sentence-transformer model name. Defaults to the
                 EMBEDDING_MODEL env var, or "all-MiniLM-L6-v2".
    batch_size : Encoding batch size (tune for GPU memory).
    normalize  : If True, L2-normalise the embeddings so dot product == cosine sim.

    Returns
    -------
    np.ndarray of shape (len(texts), embedding_dim).
    """
    if not texts:
        return np.empty((0,), dtype=np.float32)

    model_name = model_name or os.getenv("EMBEDDING_MODEL", "all-MiniLM-L6-v2")
    model = _get_model(model_name)

    embeddings: np.ndarray = model.encode(
        texts,
        batch_size=batch_size,
        normalize_embeddings=normalize,
        show_progress_bar=len(texts) > 50,
        convert_to_numpy=True,
    )
    return embeddings


def embed_single(text: str, **kwargs) -> np.ndarray:
    """
    Embed a single string. Returns a 1-D numpy array.
    """
    result = embed_texts([text], **kwargs)
    return result[0]


# ---------------------------------------------------------------------------
# Storage helpers (for caching embeddings across exam batches)
# ---------------------------------------------------------------------------


def save_embeddings(embeddings: np.ndarray, path: str) -> None:
    """Persist an embedding matrix to disk (.npy format)."""
    np.save(path, embeddings)


def load_embeddings(path: str) -> np.ndarray:
    """Load a previously saved embedding matrix."""
    return np.load(path)


# ---------------------------------------------------------------------------
# CLI smoke-test
# ---------------------------------------------------------------------------

if __name__ == "__main__":
    sample = [
        "Newton's second law states that force equals mass times acceleration.",
        "F = ma relates force, mass, and acceleration.",
        "The sky is blue because of Rayleigh scattering.",
    ]
    vecs = embed_texts(sample)
    print(f"Embedding matrix shape: {vecs.shape}")

    # Quick similarity check
    from numpy.linalg import norm
    cos01 = float(np.dot(vecs[0], vecs[1]))   # normalised → dot == cosine
    cos02 = float(np.dot(vecs[0], vecs[2]))
    print(f"Similarity(0,1) = {cos01:.4f}  (expect HIGH – same concept)")
    print(f"Similarity(0,2) = {cos02:.4f}  (expect LOW  – different topic)")
