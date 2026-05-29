"""
langgraph_pipeline.py
"""

from __future__ import annotations

import asyncio
import io
import os
import pathlib
import tempfile
from typing import Any, Dict

import httpx
from langchain_google_genai import ChatGoogleGenerativeAI
from langgraph.graph import END, StateGraph

from grading.partial_credit import aggregate_exam_scores, grade_to_dict, parse_llm_response
from grading.prompt_templates import make_grading_messages
from grading.rubric_parser import Rubric, parse_rubric
from grading.justification_generator import refine_all_justifications
from ocr.nougat_processor import extract_text_from_bytes
from ocr.page_segmenter import BoundingBox, PageSegmenter
from pipeline.state import (
    FinalOutput,
    PipelineState,
    QuestionGradeState,
    QuestionTranscript,
    initial_state,
)
from plagiarism.embedder import embed_texts
from plagiarism.similarity_detector import build_similarity_matrix, flag_similar_pairs


OCR_TIMEOUT_SECONDS      = int(os.getenv("OCR_TIMEOUT_SECONDS",      "180"))
GRADING_TIMEOUT_SECONDS  = int(os.getenv("GRADING_TIMEOUT_SECONDS",  "120"))
DOWNLOAD_TIMEOUT_SECONDS = int(os.getenv("DOWNLOAD_TIMEOUT_SECONDS",  "60"))


def _llm() -> ChatGoogleGenerativeAI:
    # api_key = os.getenv("GEMINI_API_KEY") or os.getenv("GOOGLE_API_KEY")
    api_key = "AIzaSyBDvEYFh69a-3emOb94QgKDALH8ZSdG2iQ"
    if not api_key:
        raise EnvironmentError("GEMINI_API_KEY is not set.")
    return ChatGoogleGenerativeAI(
        model=os.getenv("GRADING_LLM_MODEL", "gemini-3.5-flash"),
        temperature=0.1,
        google_api_key=api_key,
    )


async def _download_pdf(url: str) -> bytes:
    if url.startswith("file:///"):
        import urllib.request
        local_path = urllib.request.url2pathname(url[7:])
        return pathlib.Path(local_path).read_bytes()
    if not url.startswith("http"):
        return pathlib.Path(url).read_bytes()
    async with httpx.AsyncClient(timeout=DOWNLOAD_TIMEOUT_SECONDS) as client:
        r = await client.get(url)
        r.raise_for_status()
        return r.content


def _rasterize_and_segment(pdf_bytes: bytes) -> list:
    with tempfile.NamedTemporaryFile(suffix=".pdf", delete=False) as tmp:
        tmp.write(pdf_bytes)
        tmp_path = pathlib.Path(tmp.name)
    try:
        segmenter = PageSegmenter(dpi=200)
        return segmenter.segment(tmp_path)
    finally:
        tmp_path.unlink(missing_ok=True)


def _run_ocr_on_crop(crop) -> str:
    buf = io.BytesIO()
    crop.image.save(buf, format="PNG")
    return extract_text_from_bytes(buf.getvalue())


# ---------------------------------------------------------------------------
# Node 1 – OCR
# ---------------------------------------------------------------------------

async def ocr_node(state: PipelineState) -> PipelineState:
    try:
        pdf_bytes = await asyncio.wait_for(
            _download_pdf(state["pdf_url"]),
            timeout=DOWNLOAD_TIMEOUT_SECONDS,
        )
        crops = await asyncio.wait_for(
            asyncio.to_thread(_rasterize_and_segment, pdf_bytes),
            timeout=OCR_TIMEOUT_SECONDS,
        )

        print(f"[ocr_node] PDF segmented into {len(crops)} crop(s): {[c.question_id for c in crops]}")

        async def _ocr_crop(crop):
            text = await asyncio.to_thread(_run_ocr_on_crop, crop)
            print(f"[ocr_node] OCR for {crop.question_id}: {len(text)} chars")
            return QuestionTranscript(
                question_id=crop.question_id,
                crop_image_url="",
                raw_nougat_text=text,
                raw_qwen_text=text,
                final_transcript=text,
            )

        transcripts = await asyncio.wait_for(
            asyncio.gather(*[_ocr_crop(crop) for crop in crops]),
            timeout=OCR_TIMEOUT_SECONDS,
        )

        state["question_transcripts"] = list(transcripts)
        state["ocr_status"] = "complete"
        print(f"[ocr_node] Complete — {len(state['question_transcripts'])} transcript(s)")

    except asyncio.TimeoutError:
        msg = f"OCR timed out after {OCR_TIMEOUT_SECONDS}s."
        print(f"[ocr_node] TIMEOUT: {msg}")
        state["ocr_status"] = "error"
        state["ocr_error"] = msg
        state["pipeline_status"] = "error"
        state["error_message"] = msg

    except Exception as exc:
        print(f"[ocr_node] ERROR: {exc}")
        state["ocr_status"] = "error"
        state["ocr_error"] = str(exc)
        state["pipeline_status"] = "error"
        state["error_message"] = f"OCR failed: {exc}"

    return state


# ---------------------------------------------------------------------------
# Node 2 – Grading
# ---------------------------------------------------------------------------

async def grading_node(state: PipelineState) -> PipelineState:
    if state.get("ocr_status") != "complete":
        state["grading_status"] = "error"
        state["grading_error"] = "Skipped: OCR did not complete."
        return state

    try:
        rubric: Rubric = parse_rubric(state["rubric"])
        rubric_qids = [q.question_id for q in rubric.questions]
        transcript_qids = [t["question_id"] for t in state["question_transcripts"]]
        print(f"[grading_node] Rubric question IDs: {rubric_qids}")
        print(f"[grading_node] Transcript question IDs: {transcript_qids}")

        llm = _llm()
        grades: list[QuestionGradeState] = []

        async def _grade_question(transcript):
            qid = transcript["question_id"]
            question = rubric.get_question(qid)
            if question is None:
                # FIX: Try matching by index — if rubric has q1 but transcript
                # has q1, they should match. If they don't, it means the rubric
                # question_id format doesn't match the auto-segmenter's "q{N}" format.
                # Fall back to the first rubric question if there's only one.
                if len(rubric.questions) == 1:
                    question = rubric.questions[0]
                    print(f"[grading_node] question_id '{qid}' not in rubric — "
                          f"falling back to only rubric question '{question.question_id}'")
                else:
                    print(f"[grading_node] WARNING: question_id '{qid}' not found in rubric "
                          f"(rubric has: {rubric_qids}). Skipping.")
                    return None

            print(f"[grading_node] Grading transcript '{qid}' against rubric question '{question.question_id}'")

            messages = make_grading_messages(
                rubric=rubric,
                question_id=question.question_id,
                student_answer=transcript["final_transcript"],
                student_id=state.get("student_id", "unknown"),
            )

            lc_messages = [
                ("system", messages[0]["content"]),
                ("human",  messages[1]["content"]),
            ]
            response = await asyncio.wait_for(
                llm.ainvoke(lc_messages),
                timeout=GRADING_TIMEOUT_SECONDS,
            )
            grade = parse_llm_response(response.content, question)
            result = QuestionGradeState(**grade_to_dict(grade))
            # Normalize question_id to match what rubric says
            result["question_id"] = question.question_id
            print(f"[grading_node] Graded '{question.question_id}': {result['total_score']}/{result['max_score']}")
            return result

        results = await asyncio.gather(
            *[_grade_question(t) for t in state["question_transcripts"]],
            return_exceptions=True,
        )

        for r in results:
            if isinstance(r, Exception):
                # FIX: was silently swallowed — now logged AND stored in state
                print(f"[grading_node] ERROR grading question: {r}")
                state["grading_error"] = str(r)
            elif r is not None:
                grades.append(r)

        print(f"[grading_node] {len(grades)} grade(s) produced out of {len(results)} transcript(s)")

        if not grades:
            # No grades at all — this is a real error, not a silent skip
            state["grading_status"] = "error"
            state["grading_error"] = (
                state.get("grading_error") or
                f"No grades produced. Transcript IDs {transcript_qids} "
                f"did not match rubric IDs {rubric_qids}."
            )
            state["pipeline_status"] = "error"
            state["error_message"] = state["grading_error"]
            print(f"[grading_node] FATAL: {state['grading_error']}")
            return state

        questions_map = {q.question_id: q for q in rubric.questions}
        from grading.partial_credit import QuestionGrade
        grade_objs = [
            QuestionGrade(
                question_id=g["question_id"],
                total_score=g["total_score"],
                max_score=g["max_score"],
                overall_justification=g.get("overall_justification", ""),
                confidence=g.get("confidence", 1.0),
                flag_for_review=g.get("flag_for_review", False),
            )
            for g in grades
        ]
        feedback_map = await refine_all_justifications(grade_objs, questions_map, use_llm=False)
        for g in grades:
            g["student_feedback"] = feedback_map.get(g["question_id"], "")

        state["question_grades"] = grades
        state["grading_status"] = "complete"

    except Exception as exc:
        print(f"[grading_node] FATAL ERROR: {exc}")
        state["grading_status"] = "error"
        state["grading_error"] = str(exc)
        state["pipeline_status"] = "error"
        state["error_message"] = f"Grading failed: {exc}"

    return state


# ---------------------------------------------------------------------------
# Node 3 – Plagiarism
# ---------------------------------------------------------------------------

async def plagiarism_node(state: PipelineState) -> PipelineState:
    try:
        transcripts = state.get("question_transcripts", [])
        if not transcripts:
            state["plagiarism_status"] = "skipped"
            return state

        texts = [t["final_transcript"] for t in transcripts]
        embeddings = await asyncio.to_thread(embed_texts, texts)
        sim_matrix = await asyncio.to_thread(build_similarity_matrix, embeddings)
        flags = flag_similar_pairs(
            sim_matrix=sim_matrix,
            question_ids=[t["question_id"] for t in transcripts],
            submission_ids=[state.get("submission_id", "self")],
            threshold=float(os.getenv("PLAGIARISM_THRESHOLD", "0.92")),
        )
        state["plagiarism_flags"] = flags
        state["plagiarism_status"] = "complete"

    except Exception as exc:
        state["plagiarism_status"] = "skipped"
        state["error_message"] = (
            (state.get("error_message") or "") + f" | Plagiarism check failed: {exc}"
        )

    return state


# ---------------------------------------------------------------------------
# Node 4 – Output
# ---------------------------------------------------------------------------

async def output_node(state: PipelineState) -> PipelineState:
    grades = state.get("question_grades", [])

    # If pipeline errored and produced no grades, still build a valid FinalOutput
    if not grades:
        final: FinalOutput = {
            "submission_id":    state.get("submission_id", ""),
            "exam_id":          state.get("exam_id", ""),
            "student_id":       state.get("student_id", ""),
            "total_score":      0.0,
            "max_score":        0.0,
            "percentage":       0.0,
            "question_grades":  [],
            "plagiarism_flags": state.get("plagiarism_flags", []),
            "any_flagged":      False,
            "mean_confidence":  0.0,
            "status":           "error",
            "error_message":    state.get("error_message", "No grades produced"),
        }
        state["final_output"] = final
        state["pipeline_status"] = "error"
        print(f"[output_node] Pipeline errored: {final['error_message']}")
        return state

    agg = aggregate_exam_scores(
        [
            type("QG", (), {
                "total_score":     g["total_score"],
                "max_score":       g["max_score"],
                "percentage":      g.get("percentage", 0.0),
                "flag_for_review": g.get("flag_for_review", False),
                "confidence":      g.get("confidence", 1.0),
                "question_id":     g["question_id"],
            })()
            for g in grades
        ]
    )

    any_flagged = agg["any_flagged"] or any(
        f.get("flagged") for f in state.get("plagiarism_flags", [])
    )

    final: FinalOutput = {
        "submission_id":    state.get("submission_id", ""),
        "exam_id":          state.get("exam_id", ""),
        "student_id":       state.get("student_id", ""),
        "total_score":      agg["total_score"],
        "max_score":        agg["max_score"],
        "percentage":       agg["percentage"],
        "question_grades":  grades,
        "plagiarism_flags": state.get("plagiarism_flags", []),
        "any_flagged":      any_flagged,
        "mean_confidence":  agg["mean_confidence"],
        "status":           "flagged" if any_flagged else "complete",
    }

    state["final_output"] = final
    state["pipeline_status"] = "complete"
    print(f"[output_node] Final: {len(grades)} grade(s), total={agg['total_score']}/{agg['max_score']}")

    # Webhook (best-effort, non-blocking)
    webhook_url = os.getenv("GRADEOPS_WEBHOOK_URL")
    if webhook_url:
        api_key = os.getenv("GRADEOPS_ML_API_KEY", "")
        try:
            async with httpx.AsyncClient(timeout=10) as client:
                response = await client.post(
                    webhook_url,
                    json=final,
                    headers={"X-GradeOps-Key": api_key},
                )
                print(f"[output_node] Webhook → {response.status_code}")
        except Exception as exc:
            print(f"[output_node] Webhook failed (non-fatal): {exc}")

    return state


# ---------------------------------------------------------------------------
# Routing
# ---------------------------------------------------------------------------

def route_after_ocr(state: PipelineState) -> str:
    return "grading" if state.get("ocr_status") == "complete" else "output"


def route_after_grading(state: PipelineState) -> str:
    return "plagiarism" if state.get("grading_status") == "complete" else "output"


# ---------------------------------------------------------------------------
# Graph assembly
# ---------------------------------------------------------------------------

def build_pipeline() -> StateGraph:
    graph = StateGraph(PipelineState)
    graph.add_node("ocr",        ocr_node)
    graph.add_node("grading",    grading_node)
    graph.add_node("plagiarism", plagiarism_node)
    graph.add_node("output",     output_node)
    graph.set_entry_point("ocr")
    graph.add_conditional_edges("ocr", route_after_ocr, {"grading": "grading", "output": "output"})
    graph.add_conditional_edges("grading", route_after_grading, {"plagiarism": "plagiarism", "output": "output"})
    graph.add_edge("plagiarism", "output")
    graph.add_edge("output", END)
    return graph


compiled_pipeline = build_pipeline().compile()


async def run_pipeline(
    exam_id: str,
    submission_id: str,
    student_id: str,
    pdf_url: str,
    rubric: Dict[str, Any],
) -> FinalOutput:
    state = initial_state(
        exam_id=exam_id,
        submission_id=submission_id,
        student_id=student_id,
        pdf_url=pdf_url,
        rubric=rubric,
    )
    result = await compiled_pipeline.ainvoke(state)
    return result["final_output"]


if __name__ == "__main__":
    import json, sys
    if len(sys.argv) < 4:
        print("Usage: python langgraph_pipeline.py <pdf_url> <rubric.json> <submission_id>")
        sys.exit(1)
    pdf_url = sys.argv[1]
    rubric  = json.loads(open(sys.argv[2]).read())
    sid     = sys.argv[3]
    output = asyncio.run(run_pipeline("test_exam", sid, "test_student", pdf_url, rubric))
    print(json.dumps(output, indent=2))