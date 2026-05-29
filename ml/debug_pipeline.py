"""
debug_pipeline.py
------------------
Run this to diagnose exactly where the OCR pipeline is getting stuck.
Tests each stage independently with verbose output and per-step timing.

Usage (from the ml/ directory with venv active):
    python debug_pipeline.py --pdf-url <url> --rubric-id <examId>

Or to test with a local PDF file:
    python debug_pipeline.py --pdf-path /path/to/exam.pdf

Or to test only a specific stage:
    python debug_pipeline.py --stage env
    python debug_pipeline.py --stage download --pdf-url <url>
    python debug_pipeline.py --stage ocr      --pdf-url <url>
    python debug_pipeline.py --stage grading  --pdf-url <url> --rubric-json rubric.json
"""

from __future__ import annotations

import argparse
import asyncio
import io
import json
import os
import pathlib
import sys
import tempfile
import time
import traceback
from datetime import datetime

# ── Load .env if present ─────────────────────────────────────────────────────
env_path = pathlib.Path(__file__).parent / ".env"
if env_path.exists():
    for line in env_path.read_text().splitlines():
        line = line.strip()
        if not line or line.startswith("#") or "=" not in line:
            continue
        key, _, val = line.partition("=")
        # strip inline comments
        val = val.split("#")[0].strip().strip('"').strip("'")
        os.environ.setdefault(key.strip(), val)
    print(f"[env] Loaded .env from {env_path}")

# ─────────────────────────────────────────────────────────────────────────────

SEPARATOR = "─" * 70


def section(title: str):
    print(f"\n{SEPARATOR}")
    print(f"  {title}")
    print(SEPARATOR)


def ok(msg: str):
    print(f"  ✓  {msg}")


def fail(msg: str):
    print(f"  ✗  {msg}")


def info(msg: str):
    print(f"  →  {msg}")


def timing(label: str, elapsed: float):
    print(f"  ⏱  {label}: {elapsed:.2f}s")


# ─────────────────────────────────────────────────────────────────────────────
# Stage 1: Environment check
# ─────────────────────────────────────────────────────────────────────────────

def check_env():
    section("STAGE 1 — Environment & imports")

    required = {
        "GEMINI_API_KEY":      os.getenv("GEMINI_API_KEY") or os.getenv("GOOGLE_API_KEY"),
        "GRADING_LLM_MODEL":   os.getenv("GRADING_LLM_MODEL", "(not set — will default to gemini-1.5-flash)"),
        "GRADEOPS_ML_API_KEY": os.getenv("GRADEOPS_ML_API_KEY"),
        "GRADEOPS_WEBHOOK_URL":os.getenv("GRADEOPS_WEBHOOK_URL"),
    }

    all_ok = True
    for k, v in required.items():
        if v:
            masked = v[:8] + "…" + v[-4:] if len(v or "") > 12 else v
            ok(f"{k} = {masked}")
        else:
            fail(f"{k} is NOT SET")
            all_ok = False

    # Test imports
    imports_ok = True
    for module in ["fitz", "PIL", "google.genai", "httpx", "langgraph", "langchain_google_genai"]:
        try:
            __import__(module.split(".")[0])
            ok(f"import {module}")
        except ImportError as e:
            fail(f"import {module} — {e}")
            imports_ok = False

    # pymupdf check (replaces Poppler/pdf2image — no system deps needed)
    try:
        import fitz
        ok(f"pymupdf (fitz) found — version {fitz.version[0]}")
    except ImportError:
        fail("pymupdf NOT found — run: pip install pymupdf")
        all_ok = False

    return all_ok and imports_ok


# ─────────────────────────────────────────────────────────────────────────────
# Stage 2: PDF download
# ─────────────────────────────────────────────────────────────────────────────

async def check_download(pdf_url: str) -> bytes | None:
    section(f"STAGE 2 — PDF download\n  URL: {pdf_url}")

    import httpx
    t0 = time.perf_counter()
    try:
        async with httpx.AsyncClient(timeout=60) as client:
            info("Sending GET request…")
            r = await client.get(pdf_url)
            elapsed = time.perf_counter() - t0

            info(f"HTTP {r.status_code}  content-type={r.headers.get('content-type', '?')}  size={len(r.content):,} bytes")
            timing("Download", elapsed)

            if r.status_code != 200:
                fail(f"Non-200 response: {r.status_code}")
                return None

            if not r.content.startswith(b"%PDF"):
                fail(f"Response is NOT a PDF (first bytes: {r.content[:8]!r})")
                return None

            ok(f"PDF downloaded — {len(r.content):,} bytes")
            return r.content

    except httpx.TimeoutException:
        fail(f"Request timed out after {time.perf_counter() - t0:.1f}s")
    except Exception as e:
        fail(f"Download failed: {e}")
        traceback.print_exc()

    return None


# ─────────────────────────────────────────────────────────────────────────────
# Stage 3: PDF rasterization (pymupdf / fitz)
# ─────────────────────────────────────────────────────────────────────────────

def check_rasterize(pdf_bytes: bytes) -> list | None:
    section("STAGE 3 — PDF rasterization (pymupdf / fitz)")

    try:
        import fitz
        from PIL import Image
    except ImportError as e:
        fail(f"Missing dependency: {e} — run: pip install pymupdf")
        return None

    t0 = time.perf_counter()
    try:
        info(f"Opening PDF ({len(pdf_bytes):,} bytes) with fitz…")
        doc = fitz.open(stream=pdf_bytes, filetype="pdf")
        scale = 200 / 72.0  # 200 dpi
        matrix = fitz.Matrix(scale, scale)

        pages = []
        for page in doc:
            pix = page.get_pixmap(matrix=matrix, alpha=False)
            img = Image.frombytes("RGB", [pix.width, pix.height], pix.samples)
            pages.append(img)
        doc.close()

        elapsed = time.perf_counter() - t0
        ok(f"Rasterized {len(pages)} page(s)")
        timing("Rasterization", elapsed)

        for i, page in enumerate(pages):
            info(f"  Page {i+1}: {page.size[0]}×{page.size[1]} px  mode={page.mode}")

        return pages

    except Exception as e:
        elapsed = time.perf_counter() - t0
        fail(f"Rasterization FAILED after {elapsed:.1f}s: {e}")
        traceback.print_exc()
        return None


# ─────────────────────────────────────────────────────────────────────────────
# Stage 4: OCR on first page (OpenAI Vision)
# ─────────────────────────────────────────────────────────────────────────────

def check_ocr_single_page(pages: list) -> bool:
    section("STAGE 4 — OCR on page 1 (Gemini Vision / gemini-1.5-flash)")

    if not pages:
        fail("No pages to test OCR on")
        return False

    page = pages[0]

    # Convert page to bytes
    buf = io.BytesIO()
    page.save(buf, format="PNG")
    image_bytes = buf.getvalue()
    info(f"Page 1 PNG size: {len(image_bytes):,} bytes")

    # Test nougat (printed text)
    info("Running nougat OCR (extract_text_from_bytes)…")
    t0 = time.perf_counter()
    try:
        from ocr.nougat_processor import extract_text_from_bytes
        nougat_text = extract_text_from_bytes(image_bytes)
        elapsed = time.perf_counter() - t0
        ok(f"Nougat OCR completed in {elapsed:.2f}s — {len(nougat_text)} chars")
        info(f"  Preview: {nougat_text[:200]!r}…")
    except Exception as e:
        elapsed = time.perf_counter() - t0
        fail(f"Nougat OCR FAILED after {elapsed:.1f}s: {e}")
        traceback.print_exc()
        return False

    # Test qwen (handwriting)
    ok("Single OCR call per crop — no duplicate Qwen call needed.")
    return True


# ─────────────────────────────────────────────────────────────────────────────
# Stage 5: Full OCR node (async, with asyncio.to_thread)
# ─────────────────────────────────────────────────────────────────────────────

async def check_full_ocr_node(pdf_url: str) -> list | None:
    section("STAGE 5 — Full ocr_node (async pipeline with to_thread / pymupdf)")

    # Inline the ocr_node logic so we can see exactly where it hangs
    import httpx
    from ocr.page_segmenter import PageSegmenter
    from ocr.nougat_processor import extract_text_from_bytes

    def _rasterize(pdf_bytes: bytes):
        info("[thread] Opening PDF with pymupdf (fitz)…")
        import fitz
        segmenter = PageSegmenter(dpi=200)
        # PageSegmenter.segment() expects a file path — write to temp file
        with tempfile.NamedTemporaryFile(suffix=".pdf", delete=False) as tmp:
            tmp.write(pdf_bytes)
            tmp_path = pathlib.Path(tmp.name)
        try:
            info(f"[thread] Calling PageSegmenter(dpi=200).segment({tmp_path})…")
            crops = segmenter.segment(tmp_path)
            info(f"[thread] segment() returned {len(crops)} crop(s)")
            return crops
        finally:
            tmp_path.unlink(missing_ok=True)

    def _ocr_crop(crop):
        info(f"[thread] OCR on crop question_id={crop.question_id!r}…")
        buf = io.BytesIO()
        crop.image.save(buf, format="PNG")
        image_bytes = buf.getvalue()
        info(f"[thread]   PNG size={len(image_bytes):,} bytes")

        t0 = time.perf_counter()
        text = extract_text_from_bytes(image_bytes)
        info(f"[thread]   OCR done ({time.perf_counter()-t0:.2f}s) — {len(text)} chars")

        return {
            "question_id":      crop.question_id,
            "raw_nougat_text":  text,
            "raw_qwen_text":    text,
            "final_transcript": text,
        }

    overall_t0 = time.perf_counter()

    # Step A: download
    info("Downloading PDF…")
    t0 = time.perf_counter()
    try:
        async with httpx.AsyncClient(timeout=60) as client:
            r = await client.get(pdf_url)
            r.raise_for_status()
            pdf_bytes = r.content
        timing("Download", time.perf_counter() - t0)
        ok(f"{len(pdf_bytes):,} bytes received")
    except Exception as e:
        fail(f"Download failed: {e}")
        return None

    # Step B: rasterize in thread
    info("Rasterizing PDF in thread pool…")
    t0 = time.perf_counter()
    try:
        crops = await asyncio.wait_for(
            asyncio.to_thread(_rasterize, pdf_bytes),
            timeout=120,
        )
        timing("Rasterization (threaded)", time.perf_counter() - t0)
        ok(f"{len(crops)} crop(s) produced")
    except asyncio.TimeoutError:
        fail(f"Rasterization TIMED OUT after 120s")
        return None
    except Exception as e:
        fail(f"Rasterization failed: {e}")
        traceback.print_exc()
        return None

    # Step C: OCR each crop in threads (concurrently)
    info(f"Running OCR on {len(crops)} crop(s) concurrently…")
    t0 = time.perf_counter()
    try:
        results = await asyncio.wait_for(
            asyncio.gather(*[asyncio.to_thread(_ocr_crop, crop) for crop in crops]),
            timeout=180,
        )
        timing("OCR (all crops)", time.perf_counter() - t0)
        ok(f"OCR complete — {len(results)} transcript(s)")

        for r in results:
            info(f"  question_id={r['question_id']!r}  "
                 f"nougat={len(r['raw_nougat_text'])}c  "
                 f"qwen={len(r['raw_qwen_text'])}c  "
                 f"final={len(r['final_transcript'])}c")
            info(f"  final_transcript preview: {r['final_transcript'][:150]!r}")

    except asyncio.TimeoutError:
        fail(f"OCR TIMED OUT after 180s — OpenAI API may be slow or unreachable")
        return None
    except Exception as e:
        fail(f"OCR failed: {e}")
        traceback.print_exc()
        return None

    timing("Full ocr_node", time.perf_counter() - overall_t0)
    return list(results)


# ─────────────────────────────────────────────────────────────────────────────
# Stage 6: Rubric parsing
# ─────────────────────────────────────────────────────────────────────────────

def check_rubric(rubric_dict: dict) -> bool:
    section("STAGE 6 — Rubric parsing")

    info(f"Rubric keys: {list(rubric_dict.keys())}")
    questions = rubric_dict.get("questions", [])
    info(f"Questions found: {len(questions)}")

    if not questions:
        fail("No questions in rubric — grading node will silently produce 0 grades")
        return False

    try:
        from grading.rubric_parser import parse_rubric
        rubric = parse_rubric(rubric_dict)
        ok(f"parse_rubric() succeeded — {len(rubric.questions)} question(s)")

        for q in rubric.questions:
            criteria_pts = sum(c.max_points for c in q.criteria)
            info(f"  {q.question_id!r}: title={q.title!r}  max_pts={q.max_points}  "
                 f"criteria={len(q.criteria)}  criteria_pts={criteria_pts}")
            for c in q.criteria:
                info(f"      criterion {c.criterion_id!r}: {c.description!r}  max={c.max_points}")

        return True

    except Exception as e:
        fail(f"parse_rubric() failed: {e}")
        traceback.print_exc()
        return False


# ─────────────────────────────────────────────────────────────────────────────
# Stage 7: Single-question grading (LLM call)
# ─────────────────────────────────────────────────────────────────────────────

async def check_grading_single(rubric_dict: dict, transcript: str = "This is a test answer.") -> bool:
    section("STAGE 7 — LLM grading / Gemini (single question smoke-test)")

    try:
        from grading.rubric_parser import parse_rubric
        from grading.prompt_templates import make_grading_messages
        from grading.partial_credit import parse_llm_response
        from langchain_google_genai import ChatGoogleGenerativeAI

        rubric = parse_rubric(rubric_dict)
        if not rubric.questions:
            fail("No questions to grade")
            return False

        q = rubric.questions[0]
        info(f"Testing grading for question: {q.question_id!r} — {q.title!r}")
        info(f"Using answer text: {transcript!r}")

        messages = make_grading_messages(
            rubric=rubric,
            question_id=q.question_id,
            student_answer=transcript,
            student_id="debug_student",
        )

        info(f"System prompt length: {len(messages[0]['content'])} chars")
        info(f"User prompt length:   {len(messages[1]['content'])} chars")
        info(f"System prompt preview:\n    {messages[0]['content'][:300]}…")
        info(f"User prompt preview:\n    {messages[1]['content'][:300]}…")

        model = os.getenv("GRADING_LLM_MODEL", "gemini-2.0-flash")
        info(f"Calling {model}…")

        from langchain_google_genai import ChatGoogleGenerativeAI
        llm = ChatGoogleGenerativeAI(
            model=model,
            temperature=0.1,
            google_api_key=os.getenv("GEMINI_API_KEY") or os.getenv("GOOGLE_API_KEY"),
        )

        t0 = time.perf_counter()
        response = await asyncio.wait_for(
            llm.ainvoke([("system", messages[0]["content"]), ("human", messages[1]["content"])]),
            timeout=60,
        )
        timing("LLM call", time.perf_counter() - t0)

        raw_json = response.content
        ok(f"LLM responded — {len(raw_json)} chars")
        info(f"Raw LLM output:\n{raw_json[:800]}")

        grade = parse_llm_response(raw_json, q)
        ok(f"Parsed grade: score={grade.total_score}/{grade.max_score}  confidence={grade.confidence:.2f}  flag={grade.flag_for_review}")
        info(f"Justification: {grade.overall_justification[:200]!r}")

        return True

    except asyncio.TimeoutError:
        fail("LLM call timed out after 60s — check OPENAI_API_KEY and network")
        return False
    except Exception as e:
        fail(f"Grading failed: {e}")
        traceback.print_exc()
        return False


# ─────────────────────────────────────────────────────────────────────────────
# Stage 8: Full pipeline end-to-end
# ─────────────────────────────────────────────────────────────────────────────

async def check_full_pipeline(pdf_url: str | None, rubric_dict: dict, local_pdf_bytes: bytes | None = None) -> bool:
    section("STAGE 8 — Full pipeline end-to-end")

    from pipeline.langgraph_pipeline import run_pipeline
    from pipeline.state import initial_state
    import tempfile, pathlib

    submission_id = f"debug_{int(time.time())}"

    # If a local file was provided, write it to a temp URL the pipeline can load
    # We patch the ocr_node to accept bytes directly by writing to a temp file
    # and passing a file path as the pdf_url
    effective_url = pdf_url or ""
    tmp_path = None
    if local_pdf_bytes and not pdf_url:
        tmp = tempfile.NamedTemporaryFile(suffix=".pdf", delete=False)
        tmp.write(local_pdf_bytes)
        tmp.close()
        tmp_path = pathlib.Path(tmp.name)
        effective_url = tmp_path.as_uri()  # file:///...
        info(f"Local PDF written to temp: {tmp_path}")

    info(f"submission_id = {submission_id!r}")
    info(f"exam_id       = debug_exam")
    info(f"pdf_url       = {effective_url!r}")
    info(f"rubric keys   = {list(rubric_dict.keys())}")
    info("Invoking pipeline…")
    t0 = time.perf_counter()

    try:
        result = await asyncio.wait_for(
            run_pipeline(
                exam_id="debug_exam",
                submission_id=submission_id,
                student_id="debug_student",
                pdf_url=effective_url,
                rubric=rubric_dict,
            ),
            timeout=600,
        )
        timing("Full pipeline", time.perf_counter() - t0)
        if tmp_path: tmp_path.unlink(missing_ok=True)

        ok("Pipeline completed!")
        info(f"  status:          {result.get('status')}")
        info(f"  total_score:     {result.get('total_score')} / {result.get('max_score')}")
        info(f"  percentage:      {result.get('percentage')}%")
        info(f"  mean_confidence: {result.get('mean_confidence')}")
        info(f"  any_flagged:     {result.get('any_flagged')}")
        info(f"  question_grades: {len(result.get('question_grades', []))} grade(s)")
        info(f"  plagiarism_flags:{len(result.get('plagiarism_flags', []))} flag(s)")

        print("\n  Full result JSON:")
        print(json.dumps(result, indent=4, default=str))
        return True

    except asyncio.TimeoutError:
        fail(f"Pipeline timed out after 600s")
        return False
    except Exception as e:
        fail(f"Pipeline error: {e}")
        traceback.print_exc()
        return False


# ─────────────────────────────────────────────────────────────────────────────
# CLI
# ─────────────────────────────────────────────────────────────────────────────

SAMPLE_RUBRIC = {
    "name": "Debug Rubric",
    "questions": [
        {
            "question_id": "q1",
            "title": "Sample question for debugging",
            "max_points": 10,
            "criteria": [
                {
                    "criterion_id": "q1_c1",
                    "description": "Correct answer",
                    "max_points": 5,
                    "partial_credit_rules": [],
                },
                {
                    "criterion_id": "q1_c2",
                    "description": "Clear explanation",
                    "max_points": 5,
                    "partial_credit_rules": [],
                },
            ],
        }
    ],
}


async def main():
    parser = argparse.ArgumentParser(description="GradeOPS pipeline diagnostic tool")
    parser.add_argument("--stage", default="all",
                        choices=["env", "download", "rasterize", "ocr", "rubric", "grading", "full", "all"],
                        help="Which stage to test")
    parser.add_argument("--pdf-url",  default=None, help="URL of the exam PDF")
    parser.add_argument("--pdf-path", default=None, help="Local path to exam PDF (for rasterize/ocr tests)")
    parser.add_argument("--rubric-json", default=None,
                        help="Path to rubric JSON file (uses built-in sample if not provided)")

    args = parser.parse_args()

    print(f"\n{'═'*70}")
    print(f"  GradeOPS Pipeline Diagnostics — {datetime.now().strftime('%Y-%m-%d %H:%M:%S')}")
    print(f"{'═'*70}")

    # Load rubric
    rubric_dict = SAMPLE_RUBRIC
    if args.rubric_json:
        try:
            rubric_dict = json.loads(pathlib.Path(args.rubric_json).read_text())
            info(f"Loaded rubric from {args.rubric_json}")
        except Exception as e:
            print(f"[warn] Could not load rubric JSON: {e} — using sample rubric")

    stage = args.stage
    pdf_url = args.pdf_url

    # ── Stage: env ────────────────────────────────────────────────────────────
    if stage in ("env", "all"):
        env_ok = check_env()
        if stage == "env":
            sys.exit(0 if env_ok else 1)
        if not env_ok:
            print("\n[abort] Fix environment issues before continuing.\n")
            sys.exit(1)

    # ── Stage: download ───────────────────────────────────────────────────────
    pdf_bytes = None
    if stage in ("download", "rasterize", "ocr", "full", "all"):
        if not pdf_url and not args.pdf_path:
            fail("--pdf-url or --pdf-path required for this stage")
            sys.exit(1)

        if args.pdf_path:
            pdf_bytes = pathlib.Path(args.pdf_path).read_bytes()
            info(f"Loaded local PDF: {args.pdf_path} ({len(pdf_bytes):,} bytes)")
        else:
            pdf_bytes = await check_download(pdf_url)
            if stage == "download":
                sys.exit(0 if pdf_bytes else 1)
            if pdf_bytes is None:
                print("\n[abort] Cannot continue without a valid PDF.\n")
                sys.exit(1)

    # ── Stage: rasterize ──────────────────────────────────────────────────────
    pages = None
    if stage in ("rasterize", "ocr", "all"):
        if pdf_bytes is None:
            fail("pdf_bytes is None — cannot rasterize")
            sys.exit(1)
        pages = check_rasterize(pdf_bytes)
        if stage == "rasterize":
            sys.exit(0 if pages else 1)
        if pages is None:
            print("\n[abort] Rasterization failed — Poppler likely missing or broken.\n")
            sys.exit(1)

    # ── Stage: ocr ────────────────────────────────────────────────────────────
    if stage in ("ocr", "all"):
        if pages is None:
            fail("pages is None — cannot run OCR")
            sys.exit(1)
        ocr_ok = check_ocr_single_page(pages)
        if stage == "ocr":
            sys.exit(0 if ocr_ok else 1)

    # ── Stage: rubric ─────────────────────────────────────────────────────────
    if stage in ("rubric", "grading", "full", "all"):
        rubric_ok = check_rubric(rubric_dict)
        if stage == "rubric":
            sys.exit(0 if rubric_ok else 1)

    # ── Stage: grading ────────────────────────────────────────────────────────
    if stage in ("grading", "all"):
        grading_ok = await check_grading_single(rubric_dict)
        if stage == "grading":
            sys.exit(0 if grading_ok else 1)

    # ── Stage: full ───────────────────────────────────────────────────────────
    if stage in ("full", "all"):
        if not pdf_url and not args.pdf_path:
            fail("--pdf-url or --pdf-path required for full pipeline test")
            sys.exit(1)
        # For local files, write to a temp file and pass a file:// style path
        # but run_pipeline expects a URL — instead pass bytes directly via state
        full_ok = await check_full_pipeline(pdf_url, rubric_dict, local_pdf_bytes=pdf_bytes)
        sys.exit(0 if full_ok else 1)

    print(f"\n{'═'*70}")
    print("  All stages passed!")
    print(f"{'═'*70}\n")


if __name__ == "__main__":
    asyncio.run(main())