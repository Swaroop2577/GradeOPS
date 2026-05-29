"""
rubric_parser.py
-----------------
Parses a JSON rubric (as stored in MongoDB) into a structured Python object
that the grading pipeline can iterate over.

Expected JSON schema
--------------------
{
  "exam_id": "abc123",
  "version": 1,
  "questions": [
    {
      "question_id": "q1",
      "title": "Explain Newton's second law",
      "max_points": 10,
      "criteria": [
        {
          "criterion_id": "c1",
          "description": "Correct statement of F = ma",
          "max_points": 4,
          "partial_credit_rules": [
            { "condition": "mentions force and acceleration", "points": 2 },
            { "condition": "gives correct units", "points": 1 }
          ]
        },
        ...
      ]
    },
    ...
  ]
}
"""

from __future__ import annotations

import json
from dataclasses import dataclass, field
from pathlib import Path
from typing import Any, Dict, List, Optional, Union


# ---------------------------------------------------------------------------
# Data classes
# ---------------------------------------------------------------------------


@dataclass
class PartialCreditRule:
    condition: str   # Natural-language condition string
    points: float    # Points awarded when condition is met


@dataclass
class Criterion:
    criterion_id: str
    description: str
    max_points: float
    partial_credit_rules: List[PartialCreditRule] = field(default_factory=list)

    @classmethod
    def from_dict(cls, d: Dict[str, Any]) -> "Criterion":
        rules = [
            PartialCreditRule(
                condition=r["condition"],
                points=float(r.get("points", 0)),
            )
            for r in d.get("partial_credit_rules", [])
        ]
        return cls(
            criterion_id=d["criterion_id"],
            description=d["description"],
            max_points=float(d["max_points"]),
            partial_credit_rules=rules,
        )


@dataclass
class Question:
    question_id: str
    title: str
    max_points: float
    criteria: List[Criterion] = field(default_factory=list)

    @classmethod
    def from_dict(cls, d: Dict[str, Any]) -> "Question":
        criteria = [Criterion.from_dict(c) for c in d.get("criteria", [])]
        return cls(
            question_id=d["question_id"],
            title=d.get("title", ""),
            max_points=float(d["max_points"]),
            criteria=criteria,
        )

    @property
    def total_criteria_points(self) -> float:
        return sum(c.max_points for c in self.criteria)


@dataclass
class Rubric:
    exam_id: str
    version: int
    questions: List[Question] = field(default_factory=list)

    @classmethod
    def from_dict(cls, d: Dict[str, Any]) -> "Rubric":
        questions = [Question.from_dict(q) for q in d.get("questions", [])]
        return cls(
            exam_id=d.get("exam_id", ""),
            version=int(d.get("version", 1)),
            questions=questions,
        )

    def get_question(self, question_id: str) -> Optional[Question]:
        for q in self.questions:
            if q.question_id == question_id:
                return q
        return None

    @property
    def total_points(self) -> float:
        return sum(q.max_points for q in self.questions)


# ---------------------------------------------------------------------------
# Parser functions
# ---------------------------------------------------------------------------


def parse_rubric(source: Union[str, Path, Dict[str, Any]]) -> Rubric:
    """
    Parse a rubric from a JSON string, file path, or already-decoded dict.

    Parameters
    ----------
    source : One of:
             - A dict (already parsed JSON / Mongo document).
             - A str containing raw JSON.
             - A pathlib.Path pointing to a .json file.

    Returns
    -------
    Rubric dataclass populated from the input.
    """
    if isinstance(source, dict):
        raw = source
    elif isinstance(source, Path):
        raw = json.loads(source.read_text(encoding="utf-8"))
    elif isinstance(source, str):
        # Could be a file path or raw JSON
        path = Path(source)
        if path.exists():
            raw = json.loads(path.read_text(encoding="utf-8"))
        else:
            raw = json.loads(source)
    else:
        raise TypeError(f"Unsupported source type: {type(source)}")

    return Rubric.from_dict(raw)


def rubric_to_prompt_context(rubric: Rubric, question_id: str) -> str:
    """
    Render the criteria for a single question as a plain-text block
    suitable for injection into an LLM grading prompt.

    Example output
    --------------
    Question: Explain Newton's second law  (max 10 pts)

    Criterion c1 [4 pts]: Correct statement of F = ma
      Partial credit:
        - mentions force and acceleration → 2 pts
        - gives correct units → 1 pt
    ...
    """
    question = rubric.get_question(question_id)
    if question is None:
        return f"[rubric_parser] No question found for id={question_id}"

    lines: List[str] = [
        f"Question: {question.title}  (max {question.max_points} pts)",
        "",
    ]

    for criterion in question.criteria:
        lines.append(
            f"Criterion {criterion.criterion_id} [{criterion.max_points} pts]: "
            f"{criterion.description}"
        )
        if criterion.partial_credit_rules:
            lines.append("  Partial credit rules:")
            for rule in criterion.partial_credit_rules:
                lines.append(f"    - {rule.condition} → {rule.points} pts")
        lines.append("")

    return "\n".join(lines)


# ---------------------------------------------------------------------------
# CLI helper
# ---------------------------------------------------------------------------

if __name__ == "__main__":
    import sys

    if len(sys.argv) < 2:
        print("Usage: python rubric_parser.py <rubric.json>")
        sys.exit(1)

    rubric = parse_rubric(sys.argv[1])
    print(f"Exam: {rubric.exam_id} | Version: {rubric.version}")
    print(f"Total points: {rubric.total_points}")
    for q in rubric.questions:
        print(f"\n  Q{q.question_id} – {q.title} ({q.max_points} pts)")
        for c in q.criteria:
            print(f"    [{c.max_points}] {c.description}")
