"""
prompt_templates.py
--------------------
All LLM prompt templates used in the GradeOps grading pipeline.

Each template function accepts structured inputs and returns a ready-to-send
string. Templates are intentionally verbose and rubric-aware to minimise
hallucination and anchor the model to the grader's intent.
"""

from __future__ import annotations

from typing import List

from grading.rubric_parser import Criterion, Question, Rubric, rubric_to_prompt_context


# ---------------------------------------------------------------------------
# System prompt (shared across all grading calls)
# ---------------------------------------------------------------------------

SYSTEM_PROMPT = """\
You are an expert academic grader assistant working inside the GradeOps \
Human-in-the-Loop grading system. Your job is to evaluate a student's \
handwritten answer strictly against a provided rubric.

Rules:
1. Award points ONLY for criteria explicitly listed in the rubric.
2. If a student answer partially satisfies a criterion, apply the matching \
partial-credit rule and award the stated partial points.
3. Do NOT award points for correct reasoning that falls outside the rubric \
criteria.
4. Output ONLY valid JSON — no prose before or after the JSON block.
5. Be consistent: identical answers must receive identical scores.
6. Flag the answer for plagiarism review if you notice identical unusual \
phrasing or logic structures across multiple answers (you will be given \
context when relevant).
"""


# ---------------------------------------------------------------------------
# Grading prompt
# ---------------------------------------------------------------------------

def build_grading_prompt(
    question: Question,
    student_answer: str,
    rubric_context: str,
    student_id: str = "unknown",
) -> str:
    """
    Build the main grading prompt for a single question.

    Parameters
    ----------
    question       : The Question object from the parsed rubric.
    student_answer : Transcribed text of the student's handwritten answer.
    rubric_context : Pre-rendered rubric string from rubric_to_prompt_context().
    student_id     : Optional identifier for audit logging.

    Returns
    -------
    str : Complete user-turn prompt.
    """
    return f"""\
## Grading Task

**Student ID**: {student_id}
**Question ID**: {question.question_id}

---

### Rubric
{rubric_context}

---

### Student Answer (transcribed from handwriting)
{student_answer.strip()}

---

### Instructions
Evaluate the student answer against each criterion in the rubric above.
For EACH criterion, decide:
  - How many points to award (between 0 and the criterion's max_points).
  - A one-sentence justification for the awarded points.

Return a JSON object with this exact structure:
{{
  "question_id": "{question.question_id}",
  "criteria_scores": [
    {{
      "criterion_id": "<id>",
      "awarded_points": <float>,
      "justification": "<one sentence>"
    }}
  ],
  "total_score": <float>,
  "overall_justification": "<2-3 sentence summary of the grade>",
  "confidence": <float between 0.0 and 1.0>,
  "flag_for_review": <true|false>
}}

Important:
- "total_score" must equal the sum of all "awarded_points".
- "confidence" reflects how clearly the rubric criteria map to this answer \
(1.0 = perfectly clear, 0.0 = very ambiguous handwriting or off-topic answer).
- Set "flag_for_review" to true if the answer is ambiguous, illegible, \
or if you are uncertain about the score.
"""


# ---------------------------------------------------------------------------
# Plagiarism-aware grading prompt (extended version)
# ---------------------------------------------------------------------------

def build_grading_prompt_with_plagiarism_context(
    question: Question,
    student_answer: str,
    rubric_context: str,
    similar_answers: List[str],
    student_id: str = "unknown",
) -> str:
    """
    Extended grading prompt that includes excerpts of similar answers detected
    by the plagiarism module, so the LLM can flag copied logic.
    """
    similar_block = "\n\n".join(
        f"**Similar answer {i+1}**:\n{ans.strip()}"
        for i, ans in enumerate(similar_answers)
    )

    base = build_grading_prompt(question, student_answer, rubric_context, student_id)

    return base + f"""

---

### Plagiarism Context
The following answers from OTHER students were flagged as highly similar to \
this submission by the embedding similarity detector. Review them and set \
"flag_for_review" to true in your response if you believe the similarity is \
suspicious (not merely coincidental use of standard terminology).

{similar_block}
"""


# ---------------------------------------------------------------------------
# Justification-refinement prompt
# ---------------------------------------------------------------------------

def build_justification_refinement_prompt(
    draft_justification: str,
    question_title: str,
    awarded_points: float,
    max_points: float,
) -> str:
    """
    A secondary prompt to improve/expand a terse justification string
    into a student-facing explanation.
    """
    return f"""\
You are a teaching assistant writing feedback for a student.

**Question**: {question_title}
**Score awarded**: {awarded_points} / {max_points}

**Draft internal justification** (written by the AI grader):
{draft_justification.strip()}

Rewrite the justification as clear, constructive student feedback in 2-4 \
sentences. Be specific about what was correct and what was missing. \
Do NOT mention the rubric by name. Return only the feedback text, \
no JSON, no preamble.
"""


# ---------------------------------------------------------------------------
# Rubric-injection helper (convenience wrapper)
# ---------------------------------------------------------------------------

def make_grading_messages(
    rubric: Rubric,
    question_id: str,
    student_answer: str,
    student_id: str = "unknown",
    similar_answers: List[str] | None = None,
) -> list[dict]:
    """
    Build the full messages list (system + user) ready for an OpenAI-compatible
    or LangChain chat call.

    Returns
    -------
    list of dicts: [{"role": "system", "content": ...}, {"role": "user", "content": ...}]
    """
    question = rubric.get_question(question_id)
    if question is None:
        raise ValueError(f"Question '{question_id}' not found in rubric.")

    rubric_ctx = rubric_to_prompt_context(rubric, question_id)

    if similar_answers:
        user_content = build_grading_prompt_with_plagiarism_context(
            question, student_answer, rubric_ctx, similar_answers, student_id
        )
    else:
        user_content = build_grading_prompt(
            question, student_answer, rubric_ctx, student_id
        )

    return [
        {"role": "system", "content": SYSTEM_PROMPT},
        {"role": "user", "content": user_content},
    ]
