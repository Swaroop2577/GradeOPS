"""
state.py
---------
Typed state schema for the GradeOps LangGraph pipeline.

LangGraph passes a single state dict between nodes. This module defines
the TypedDict (and supporting types) that describes the full shape of that
state, so every node can be written with precise type hints.

State lifecycle
---------------
Input  → ocr_node fills `transcript` fields
       → grading_node fills `question_grades`
       → plagiarism_node fills `plagiarism_flags`
       → output_node fills `final_output`
"""

from __future__ import annotations

from typing import Any, Dict, List, Optional, TypedDict


# ---------------------------------------------------------------------------
# Sub-state types
# ---------------------------------------------------------------------------


class QuestionTranscript(TypedDict):
    """OCR output for one question region."""
    question_id: str
    crop_image_url: str          # Cloud URL of the cropped image
    raw_nougat_text: str         # From nougat_processor (printed text)
    raw_qwen_text: str           # From qwen_vl_processor (handwriting)
    final_transcript: str        # Merged/selected best transcript


class CriterionScoreState(TypedDict):
    criterion_id: str
    awarded_points: float
    max_points: float
    justification: str
    clamped: bool


class QuestionGradeState(TypedDict):
    question_id: str
    total_score: float
    max_score: float
    percentage: float
    criterion_scores: List[CriterionScoreState]
    overall_justification: str
    student_feedback: str        # Refined, student-facing text
    confidence: float
    flag_for_review: bool


class PlagiarismFlag(TypedDict):
    question_id: str
    similarity_score: float      # Cosine similarity [0, 1]
    similar_submission_ids: List[str]
    flagged: bool


class FinalOutput(TypedDict):
    submission_id: str
    exam_id: str
    student_id: str
    total_score: float
    max_score: float
    percentage: float
    question_grades: List[QuestionGradeState]
    plagiarism_flags: List[PlagiarismFlag]
    any_flagged: bool
    mean_confidence: float
    status: str   # "complete" | "flagged" | "error"


# ---------------------------------------------------------------------------
# Master pipeline state
# ---------------------------------------------------------------------------


class PipelineState(TypedDict, total=False):
    """
    Full state dict threaded through every LangGraph node.

    Fields marked Optional are progressively filled as nodes execute.
    `total=False` allows partial construction at runtime.
    """

    # ── Inputs (set before pipeline starts) ──────────────────────────────
    exam_id: str
    submission_id: str
    student_id: str
    pdf_url: str                          # Cloud URL of the uploaded PDF
    rubric: Dict[str, Any]               # Raw rubric JSON (dict from MongoDB)

    # ── OCR stage ─────────────────────────────────────────────────────────
    question_transcripts: List[QuestionTranscript]
    ocr_status: str                       # "pending" | "complete" | "error"
    ocr_error: Optional[str]

    # ── Grading stage ──────────────────────────────────────────────────────
    question_grades: List[QuestionGradeState]
    grading_status: str                   # "pending" | "complete" | "error"
    grading_error: Optional[str]

    # ── Plagiarism stage ───────────────────────────────────────────────────
    plagiarism_flags: List[PlagiarismFlag]
    plagiarism_status: str               # "pending" | "complete" | "skipped"

    # ── Final output ───────────────────────────────────────────────────────
    final_output: Optional[FinalOutput]
    pipeline_status: str                 # "running" | "complete" | "error"
    error_message: Optional[str]


# ---------------------------------------------------------------------------
# Factory: build a fresh initial state
# ---------------------------------------------------------------------------


def initial_state(
    exam_id: str,
    submission_id: str,
    student_id: str,
    pdf_url: str,
    rubric: Dict[str, Any],
) -> PipelineState:
    """
    Create a PipelineState pre-populated with the required input fields
    and all status flags set to 'pending'.
    """
    return PipelineState(
        exam_id=exam_id,
        submission_id=submission_id,
        student_id=student_id,
        pdf_url=pdf_url,
        rubric=rubric,

        question_transcripts=[],
        ocr_status="pending",
        ocr_error=None,

        question_grades=[],
        grading_status="pending",
        grading_error=None,

        plagiarism_flags=[],
        plagiarism_status="pending",

        final_output=None,
        pipeline_status="running",
        error_message=None,
    )
