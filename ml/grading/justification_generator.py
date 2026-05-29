"""
justification_generator.py
---------------------------
Takes a QuestionGrade (from partial_credit.py) and optionally refines
the per-criterion justifications into polished, student-facing feedback
using a secondary LLM call.

Two modes
---------
1. **Fast mode** (no LLM call) – concatenates existing per-criterion
   justification strings into a structured text block.
2. **Refined mode** (LLM call) – sends the draft justification through
   prompt_templates.build_justification_refinement_prompt() and returns
   a fluent, student-friendly explanation.
"""

from __future__ import annotations

import os
from typing import Any, Dict, List, Optional

from langchain_core.messages import HumanMessage, SystemMessage
from langchain_google_genai import ChatGoogleGenerativeAI

from grading.partial_credit import CriterionScore, QuestionGrade
from grading.prompt_templates import build_justification_refinement_prompt
from grading.rubric_parser import Question


# ---------------------------------------------------------------------------
# LLM client (lazy-initialised)
# ---------------------------------------------------------------------------

_llm: Optional[ChatGoogleGenerativeAI] = None


def _get_llm() -> ChatGoogleGenerativeAI:
    global _llm
    if _llm is None:
        _llm = ChatGoogleGenerativeAI(
            model=os.getenv("GRADING_LLM_MODEL", "gemini-3.5-flash"),
            temperature=0.2,
            # google_api_key=os.getenv("GEMINI_API_KEY") or os.getenv("GOOGLE_API_KEY"),
            google_api_key="AIzaSyBDvEYFh69a-3emOb94QgKDALH8ZSdG2iQ",
        )
    return _llm


# ---------------------------------------------------------------------------
# Fast mode: structured text, no LLM
# ---------------------------------------------------------------------------


def build_fast_justification(grade: QuestionGrade) -> str:
    """
    Assemble a structured justification from existing per-criterion strings.
    No additional LLM call is made.

    Returns
    -------
    str : Multi-line feedback block.
    """
    lines: List[str] = [
        f"Score: {grade.total_score} / {grade.max_score} "
        f"({grade.percentage:.1f}%)",
        "",
    ]

    for cs in grade.criterion_scores:
        status = "✓" if cs.awarded_points == cs.max_points else (
            "½" if 0 < cs.awarded_points < cs.max_points else "✗"
        )
        lines.append(
            f"[{status}] Criterion {cs.criterion_id} "
            f"({cs.awarded_points}/{cs.max_points} pts): {cs.justification}"
        )

    if grade.overall_justification:
        lines.extend(["", grade.overall_justification])

    if grade.flag_for_review:
        lines.extend(["", "⚠ This answer has been flagged for TA review."])

    return "\n".join(lines)


# ---------------------------------------------------------------------------
# Refined mode: LLM rewrites the draft into student-facing feedback
# ---------------------------------------------------------------------------


async def refine_justification(
    grade: QuestionGrade,
    question: Question,
    use_llm: bool = True,
) -> str:
    """
    Generate student-facing feedback.

    Parameters
    ----------
    grade    : The QuestionGrade produced by partial_credit.parse_llm_response().
    question : The Question object (for title / context).
    use_llm  : If True, make a secondary LLM call to polish the text.
               If False, return fast-mode justification immediately.

    Returns
    -------
    str : Human-readable feedback string.
    """
    draft = build_fast_justification(grade)

    if not use_llm:
        return draft

    prompt = build_justification_refinement_prompt(
        draft_justification=draft,
        question_title=question.title,
        awarded_points=grade.total_score,
        max_points=grade.max_score,
    )

    llm = _get_llm()
    response = await llm.ainvoke([HumanMessage(content=prompt)])
    return response.content.strip()


# ---------------------------------------------------------------------------
# Batch helper: refine justifications for a list of grades
# ---------------------------------------------------------------------------


async def refine_all_justifications(
    grades: List[QuestionGrade],
    questions: Dict[str, Question],
    use_llm: bool = True,
) -> Dict[str, str]:
    """
    Refine justifications for all questions in an exam submission.

    Parameters
    ----------
    grades    : List of QuestionGrade objects.
    questions : Mapping of question_id → Question.
    use_llm   : Whether to use the LLM refinement step.

    Returns
    -------
    dict : { question_id → feedback_string }
    """
    import asyncio

    tasks = [
        refine_justification(
            grade=g,
            question=questions[g.question_id],
            use_llm=use_llm,
        )
        for g in grades
        if g.question_id in questions
    ]

    results = await asyncio.gather(*tasks)
    return {g.question_id: r for g, r in zip(grades, results)}


# ---------------------------------------------------------------------------
# Serialise justification into a MongoDB-ready dict
# ---------------------------------------------------------------------------


def justification_to_document(
    question_id: str,
    submission_id: str,
    feedback_text: str,
    grade: QuestionGrade,
) -> Dict[str, Any]:
    """Build a dict suitable for upserting into the Grades MongoDB collection."""
    return {
        "submission_id": submission_id,
        "question_id": question_id,
        "ai_score": grade.total_score,
        "max_score": grade.max_score,
        "justification": feedback_text,
        "confidence": grade.confidence,
        "flag_for_review": grade.flag_for_review,
        "status": "pending_review" if grade.flag_for_review else "ai_graded",
        "criterion_scores": [
            {
                "criterion_id": cs.criterion_id,
                "awarded_points": cs.awarded_points,
                "justification": cs.justification,
            }
            for cs in grade.criterion_scores
        ],
    }