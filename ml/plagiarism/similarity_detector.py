"""
similarity_detector.py
-----------------------
Computes pairwise cosine similarity across all student answer embeddings
for a given question and flags pairs that exceed a configurable threshold.

Because embeddings from embedder.py are L2-normalised, cosine similarity
reduces to a simple dot product, making matrix computation very fast even
for large exam cohorts (500+ students).
"""

from __future__ import annotations

import os
from dataclasses import dataclass, field
from typing import Any, Dict, List, Optional, Tuple

import numpy as np

from pipeline.state import PlagiarismFlag


# ---------------------------------------------------------------------------
# Data types
# ---------------------------------------------------------------------------


@dataclass
class SimilarPair:
    idx_a: int
    idx_b: int
    submission_id_a: str
    submission_id_b: str
    question_id: str
    similarity: float


# ---------------------------------------------------------------------------
# Core functions
# ---------------------------------------------------------------------------


def build_similarity_matrix(embeddings: np.ndarray) -> np.ndarray:
    """
    Compute the N×N cosine similarity matrix for N embedding vectors.

    Since embeddings are L2-normalised (from embedder.embed_texts with
    normalize=True), this is simply the dot-product matrix.

    Parameters
    ----------
    embeddings : np.ndarray of shape (N, D) — L2-normalised.

    Returns
    -------
    np.ndarray of shape (N, N) with values in [-1, 1].
    """
    if embeddings.ndim != 2 or embeddings.shape[0] == 0:
        return np.empty((0, 0), dtype=np.float32)

    sim_matrix = embeddings @ embeddings.T
    # Clip to [-1, 1] to handle floating-point drift
    return np.clip(sim_matrix, -1.0, 1.0).astype(np.float32)


def flag_similar_pairs(
    sim_matrix: np.ndarray,
    question_ids: List[str],
    submission_ids: List[str],
    threshold: float = 0.92,
) -> List[PlagiarismFlag]:
    """
    Identify all (i, j) pairs where similarity > threshold (excluding self-pairs
    on the diagonal) and return them as PlagiarismFlag objects.

    Parameters
    ----------
    sim_matrix     : N×N similarity matrix from build_similarity_matrix().
    question_ids   : Question ID for each row (length N).
    submission_ids : Submission ID for each row (length N).
    threshold      : Cosine similarity above which a pair is flagged.

    Returns
    -------
    List[PlagiarismFlag] — one entry per flagged submission (not per pair),
    listing all similar counterparts.
    """
    N = sim_matrix.shape[0]
    if N == 0:
        return []

    # Build adjacency: for each submission, collect who it is too similar to
    flagged_map: Dict[int, List[Tuple[int, float]]] = {}

    for i in range(N):
        for j in range(i + 1, N):
            score = float(sim_matrix[i, j])
            if score >= threshold:
                flagged_map.setdefault(i, []).append((j, score))
                flagged_map.setdefault(j, []).append((i, score))

    flags: List[PlagiarismFlag] = []
    for idx, peers in flagged_map.items():
        flags.append(
            PlagiarismFlag(
                question_id=question_ids[idx] if idx < len(question_ids) else "unknown",
                similarity_score=max(score for _, score in peers),
                similar_submission_ids=[
                    submission_ids[p] if p < len(submission_ids) else f"idx_{p}"
                    for p, _ in peers
                ],
                flagged=True,
            )
        )

    return flags


def get_top_similar(
    query_embedding: np.ndarray,
    corpus_embeddings: np.ndarray,
    submission_ids: List[str],
    top_k: int = 5,
    threshold: float = 0.85,
) -> List[Tuple[str, float]]:
    """
    Find the top-k most similar submissions to a single query embedding.
    Useful for real-time plagiarism checks when grading a single paper.

    Parameters
    ----------
    query_embedding   : 1-D array of shape (D,).
    corpus_embeddings : (M, D) array of all other submissions.
    submission_ids    : List of M submission IDs.
    top_k             : Maximum number of similar results to return.
    threshold         : Minimum similarity to include in results.

    Returns
    -------
    List of (submission_id, similarity_score) sorted by score descending.
    """
    if corpus_embeddings.shape[0] == 0:
        return []

    scores = corpus_embeddings @ query_embedding
    scores = np.clip(scores, -1.0, 1.0)

    # Sort descending, take top_k above threshold
    sorted_idx = np.argsort(scores)[::-1][:top_k]
    results: List[Tuple[str, float]] = []

    for idx in sorted_idx:
        score = float(scores[idx])
        if score < threshold:
            break
        sid = submission_ids[idx] if idx < len(submission_ids) else f"idx_{idx}"
        results.append((sid, score))

    return results


# ---------------------------------------------------------------------------
# Batch helper: process all questions across an entire exam batch
# ---------------------------------------------------------------------------


def detect_plagiarism_batch(
    question_embeddings: Dict[str, np.ndarray],
    question_submission_ids: Dict[str, List[str]],
    threshold: float | None = None,
) -> Dict[str, List[PlagiarismFlag]]:
    """
    Run plagiarism detection for every question in an exam.

    Parameters
    ----------
    question_embeddings    : { question_id → embeddings array (N_students, D) }
    question_submission_ids: { question_id → [submission_id, ...] }
    threshold              : Override default PLAGIARISM_THRESHOLD env var.

    Returns
    -------
    { question_id → [PlagiarismFlag, ...] }
    """
    thresh = threshold or float(os.getenv("PLAGIARISM_THRESHOLD", "0.92"))
    results: Dict[str, List[PlagiarismFlag]] = {}

    for qid, embs in question_embeddings.items():
        sim_matrix = build_similarity_matrix(embs)
        sub_ids = question_submission_ids.get(qid, [])
        # question_ids list — all "qid" for this batch
        q_ids = [qid] * len(sub_ids)
        flags = flag_similar_pairs(
            sim_matrix=sim_matrix,
            question_ids=q_ids,
            submission_ids=sub_ids,
            threshold=thresh,
        )
        results[qid] = flags

    return results


# ---------------------------------------------------------------------------
# CLI smoke-test
# ---------------------------------------------------------------------------

if __name__ == "__main__":
    from plagiarism.embedder import embed_texts

    answers = [
        "F = ma, so force equals mass times acceleration.",
        "Force is the product of mass and acceleration, i.e. F=ma.",
        "Newton's second law: F equals m times a.",
        "The mitochondria is the powerhouse of the cell.",
        "Energy is released by mitochondria in cells.",
    ]

    sids = [f"sub_{i}" for i in range(len(answers))]
    qids = ["q1"] * len(answers)

    embs = embed_texts(answers)
    sim = build_similarity_matrix(embs)

    print("Similarity matrix:")
    print(np.round(sim, 3))

    flags = flag_similar_pairs(sim, qids, sids, threshold=0.90)
    print(f"\nFlagged pairs (threshold=0.90): {len(flags)}")
    for f in flags:
        print(f"  {f}")
