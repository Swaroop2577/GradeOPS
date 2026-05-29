"""
partial_credit.py
------------------
Aggregates per-criterion scores returned by the LLM grader into a final
score for a question, enforces rubric bounds, and computes a confidence
score for the overall grade.

This module is intentionally stateless — it operates on plain dicts/dataclasses
and has no model loading or network calls.
"""

from __future__ import annotations

import json
import re
from dataclasses import dataclass, field
from typing import Any, Dict, List, Optional

from grading.rubric_parser import Question


# ---------------------------------------------------------------------------
# Data classes
# ---------------------------------------------------------------------------


@dataclass
class CriterionScore:
    criterion_id: str
    awarded_points: float
    max_points: float
    justification: str
    clamped: bool = False          # True if LLM returned out-of-range value


@dataclass
class QuestionGrade:
    question_id: str
    total_score: float
    max_score: float
    criterion_scores: List[CriterionScore] = field(default_factory=list)
    overall_justification: str = ""
    confidence: float = 1.0
    flag_for_review: bool = False

    @property
    def percentage(self) -> float:
        return (self.total_score / self.max_score * 100) if self.max_score else 0.0


# ---------------------------------------------------------------------------
# Parser: turn raw LLM JSON output → QuestionGrade
# ---------------------------------------------------------------------------


def _extract_json(raw: str) -> Dict[str, Any]:
    """
    Extract the first JSON object from a string.
    Handles cases where the LLM wraps the JSON in markdown fences.
    """
    # Strip markdown code fences if present
    cleaned = re.sub(r"```(?:json)?", "", raw).strip()
    # Find the outermost {...}
    start = cleaned.find("{")
    end = cleaned.rfind("}") + 1
    if start == -1 or end == 0:
        raise ValueError(f"No JSON object found in LLM output:\n{raw[:200]}")
    return json.loads(cleaned[start:end])


def parse_llm_response(
    raw_response: str,
    question: Question,
) -> QuestionGrade:
    """
    Parse the raw JSON string returned by the LLM grader and validate it
    against the rubric's max points per criterion.

    Parameters
    ----------
    raw_response : Raw text output from the LLM (may contain markdown fences).
    question     : The Question object for bounds checking.

    Returns
    -------
    QuestionGrade with clamped scores if the LLM hallucinated out-of-range values.
    """
    try:
        data = _extract_json(raw_response)
    except (ValueError, json.JSONDecodeError) as exc:
        # Return a zero-score grade flagged for review on parse failure
        return QuestionGrade(
            question_id=question.question_id,
            total_score=0.0,
            max_score=question.max_points,
            overall_justification=f"[PARSE ERROR] {exc}",
            confidence=0.0,
            flag_for_review=True,
        )

    # Build a lookup from criterion_id → max_points from the rubric
    criterion_max: Dict[str, float] = {
        c.criterion_id: c.max_points for c in question.criteria
    }

    criterion_scores: List[CriterionScore] = []
    running_total = 0.0

    for raw_cs in data.get("criteria_scores", []):
        cid = raw_cs.get("criterion_id", "")
        awarded = float(raw_cs.get("awarded_points", 0.0))
        max_pts = criterion_max.get(cid, 0.0)
        justification = raw_cs.get("justification", "")

        clamped = False
        if awarded < 0:
            awarded = 0.0
            clamped = True
        elif awarded > max_pts:
            awarded = max_pts
            clamped = True

        criterion_scores.append(
            CriterionScore(
                criterion_id=cid,
                awarded_points=awarded,
                max_points=max_pts,
                justification=justification,
                clamped=clamped,
            )
        )
        running_total += awarded

    # Trust rubric bounds over LLM's self-reported total
    total_score = min(running_total, question.max_points)

    confidence = float(data.get("confidence", 1.0))
    confidence = max(0.0, min(1.0, confidence))   # clamp to [0, 1]

    flag = bool(data.get("flag_for_review", False))
    # Auto-flag if any score was clamped (indicates LLM over/under-awarded)
    if any(cs.clamped for cs in criterion_scores):
        flag = True

    return QuestionGrade(
        question_id=question.question_id,
        total_score=total_score,
        max_score=question.max_points,
        criterion_scores=criterion_scores,
        overall_justification=data.get("overall_justification", ""),
        confidence=confidence,
        flag_for_review=flag,
    )


# ---------------------------------------------------------------------------
# Aggregation helpers
# ---------------------------------------------------------------------------


def aggregate_exam_scores(grades: List[QuestionGrade]) -> Dict[str, Any]:
    """
    Roll up per-question grades into an exam-level summary dict.

    Returns
    -------
    {
      "total_score": float,
      "max_score": float,
      "percentage": float,
      "questions": [ {question_id, total_score, max_score, ...} ],
      "any_flagged": bool,
      "mean_confidence": float
    }
    """
    total = sum(g.total_score for g in grades)
    max_total = sum(g.max_score for g in grades)
    any_flagged = any(g.flag_for_review for g in grades)
    mean_conf = (
        sum(g.confidence for g in grades) / len(grades) if grades else 0.0
    )

    return {
        "total_score": round(total, 2),
        "max_score": round(max_total, 2),
        "percentage": round(total / max_total * 100, 1) if max_total else 0.0,
        "any_flagged": any_flagged,
        "mean_confidence": round(mean_conf, 3),
        "questions": [
            {
                "question_id": g.question_id,
                "total_score": g.total_score,
                "max_score": g.max_score,
                "percentage": round(g.percentage, 1),
                "flag_for_review": g.flag_for_review,
                "confidence": g.confidence,
            }
            for g in grades
        ],
    }


def grade_to_dict(grade: QuestionGrade) -> Dict[str, Any]:
    """Serialise a QuestionGrade to a JSON-safe dict for MongoDB storage."""
    return {
        "question_id": grade.question_id,
        "total_score": grade.total_score,
        "max_score": grade.max_score,
        "percentage": round(grade.percentage, 1),
        "overall_justification": grade.overall_justification,
        "confidence": grade.confidence,
        "flag_for_review": grade.flag_for_review,
        "criterion_scores": [
            {
                "criterion_id": cs.criterion_id,
                "awarded_points": cs.awarded_points,
                "max_points": cs.max_points,
                "justification": cs.justification,
                "clamped": cs.clamped,
            }
            for cs in grade.criterion_scores
        ],
    }
