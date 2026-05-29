"""
main.py
--------
FastAPI microservice for the GradeOps ML pipeline.

This service is called by the Node.js backend (via BullMQ job workers) to:
  1. Trigger the full OCR + grading + plagiarism pipeline for a submission.
  2. Return OCR transcripts for a PDF (OCR-only endpoint).
  3. Provide a health-check endpoint for Docker / load-balancer probes.

All heavy work is delegated to pipeline/langgraph_pipeline.py. This file
is intentionally thin — routing, validation, and error handling only.

Start with:
    uvicorn api.main:app --host 0.0.0.0 --port 8000 --reload
"""

from __future__ import annotations

import os
from typing import Any, Dict, List, Optional

from fastapi import BackgroundTasks, FastAPI, HTTPException, Request, Security
from fastapi.middleware.cors import CORSMiddleware
from fastapi.security.api_key import APIKeyHeader
from pydantic import BaseModel, Field

from pipeline.langgraph_pipeline import run_pipeline
from pipeline.state import FinalOutput
from ocr.page_segmenter import PageSegmenter, BoundingBox
from ocr.nougat_processor import extract_text_from_bytes
from ocr.qwen_vl_processor import extract_handwriting_from_bytes
from plagiarism.embedder import embed_texts
from plagiarism.similarity_detector import build_similarity_matrix, flag_similar_pairs


# ---------------------------------------------------------------------------
# App setup
# ---------------------------------------------------------------------------

app = FastAPI(
    title="GradeOps ML API",
    description="Agentic grading pipeline: OCR + LLM grading + plagiarism detection.",
    version="1.0.0",
)

app.add_middleware(
    CORSMiddleware,
    allow_origins=os.getenv("CORS_ORIGINS", "http://localhost:3000").split(","),
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)


# ---------------------------------------------------------------------------
# Auth (simple shared API key between Node.js and Python service)
# ---------------------------------------------------------------------------

API_KEY_NAME = "X-GradeOps-Key"
api_key_header = APIKeyHeader(name=API_KEY_NAME, auto_error=False)


async def verify_api_key(api_key: str = Security(api_key_header)) -> str:
    expected = os.getenv("GRADEOPS_ML_API_KEY", "")
    if expected and api_key != expected:
        raise HTTPException(status_code=403, detail="Invalid API key.")
    return api_key


# ---------------------------------------------------------------------------
# Request / Response models
# ---------------------------------------------------------------------------


class GradeSubmissionRequest(BaseModel):
    exam_id: str
    submission_id: str
    student_id: str
    pdf_url: str = Field(..., description="Cloud storage URL of the exam PDF.")
    rubric: Dict[str, Any] = Field(..., description="Rubric JSON as stored in MongoDB.")


class GradeSubmissionResponse(BaseModel):
    submission_id: str
    status: str
    message: str


class OcrRequest(BaseModel):
    pdf_url: str
    bounding_boxes: Optional[List[Dict[str, Any]]] = None


class OcrResponse(BaseModel):
    question_id: str
    nougat_text: str
    qwen_text: str
    final_transcript: str


class PlagiarismRequest(BaseModel):
    question_id: str
    texts: List[str]
    submission_ids: List[str]
    threshold: float = 0.92


class HealthResponse(BaseModel):
    status: str
    version: str


# ---------------------------------------------------------------------------
# In-memory job store (replace with Redis/DB in production)
# ---------------------------------------------------------------------------

_job_results: Dict[str, Any] = {}


# ---------------------------------------------------------------------------
# Endpoints
# ---------------------------------------------------------------------------


@app.get("/health", response_model=HealthResponse, tags=["meta"])
async def health_check():
    """Liveness / readiness probe."""
    return {"status": "ok", "version": "1.0.0"}


@app.post(
    "/grade",
    response_model=GradeSubmissionResponse,
    tags=["grading"],
    summary="Trigger full grading pipeline for a submission",
)
async def grade_submission(
    req: GradeSubmissionRequest,
    background_tasks: BackgroundTasks,
    _key: str = Security(verify_api_key),
):
    """
    Kick off the LangGraph pipeline asynchronously.
    The result is POSTed back to Node.js via the GRADEOPS_WEBHOOK_URL env var.
    Poll /grade/{submission_id}/result to check status.
    """
    _job_results[req.submission_id] = {"status": "running"}

    async def _run():
        try:
            output = await run_pipeline(
                exam_id=req.exam_id,
                submission_id=req.submission_id,
                student_id=req.student_id,
                pdf_url=req.pdf_url,
                rubric=req.rubric,
            )
            _job_results[req.submission_id] = {"status": "complete", "result": output}
        except Exception as exc:
            _job_results[req.submission_id] = {"status": "error", "error": str(exc)}

    background_tasks.add_task(_run)

    return GradeSubmissionResponse(
        submission_id=req.submission_id,
        status="queued",
        message="Grading pipeline started. Poll /grade/{submission_id}/result for output.",
    )


@app.get(
    "/grade/{submission_id}/result",
    tags=["grading"],
    summary="Poll grading result for a submission",
)
async def get_grade_result(
    submission_id: str,
    _key: str = Security(verify_api_key),
) -> Dict[str, Any]:
    if submission_id not in _job_results:
        raise HTTPException(status_code=404, detail="Submission not found.")
    return _job_results[submission_id]


@app.post(
    "/ocr",
    response_model=List[OcrResponse],
    tags=["ocr"],
    summary="Run OCR on a PDF and return transcripts per question region",
)
async def run_ocr(
    req: OcrRequest,
    _key: str = Security(verify_api_key),
):
    """
    Download a PDF, segment it, and return OCR results.
    Useful for previewing transcripts before grading.
    """
    import httpx, io, tempfile, pathlib

    async with httpx.AsyncClient(timeout=60) as client:
        r = await client.get(req.pdf_url)
        r.raise_for_status()
        pdf_bytes = r.content

    with tempfile.NamedTemporaryFile(suffix=".pdf", delete=False) as tmp:
        tmp.write(pdf_bytes)
        tmp_path = pathlib.Path(tmp.name)

    boxes: Optional[List[BoundingBox]] = None
    if req.bounding_boxes:
        boxes = [BoundingBox(**b) for b in req.bounding_boxes]

    segmenter = PageSegmenter(dpi=200)
    crops = segmenter.segment(tmp_path, boxes)
    tmp_path.unlink(missing_ok=True)

    results: List[OcrResponse] = []
    for crop in crops:
        buf = io.BytesIO()
        crop.image.save(buf, format="PNG")
        image_bytes = buf.getvalue()

        nougat = extract_text_from_bytes(image_bytes)
        qwen = extract_handwriting_from_bytes(image_bytes)
        final = qwen if len(qwen) > len(nougat) else nougat

        results.append(
            OcrResponse(
                question_id=crop.question_id,
                nougat_text=nougat,
                qwen_text=qwen,
                final_transcript=final,
            )
        )

    return results


@app.post(
    "/plagiarism/detect",
    tags=["plagiarism"],
    summary="Compute similarity matrix and return flagged submission pairs",
)
async def detect_plagiarism(
    req: PlagiarismRequest,
    _key: str = Security(verify_api_key),
) -> Dict[str, Any]:
    """
    Accepts a list of answer texts + submission IDs for a single question,
    embeds them, and returns flagged pairs above the similarity threshold.
    """
    if len(req.texts) != len(req.submission_ids):
        raise HTTPException(
            status_code=422,
            detail="texts and submission_ids must have equal length.",
        )

    embeddings = embed_texts(req.texts)
    sim_matrix = build_similarity_matrix(embeddings)
    flags = flag_similar_pairs(
        sim_matrix=sim_matrix,
        question_ids=[req.question_id] * len(req.texts),
        submission_ids=req.submission_ids,
        threshold=req.threshold,
    )

    return {
        "question_id": req.question_id,
        "total_submissions": len(req.texts),
        "flagged_count": len(flags),
        "flags": flags,
    }


# ---------------------------------------------------------------------------
# Dev entrypoint
# ---------------------------------------------------------------------------

if __name__ == "__main__":
    import uvicorn

    uvicorn.run(
        "api.main:app",
        host="0.0.0.0",
        port=int(os.getenv("ML_PORT", "8000")),
        reload=os.getenv("ENV", "development") == "development",
    )
