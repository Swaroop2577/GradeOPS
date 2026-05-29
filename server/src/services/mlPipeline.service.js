/**
 * mlPipeline.service.js
 * ----------------------
 * HTTP client for the Python FastAPI ML service.
 * All communication with the ML service goes through this module — no other
 * file in server/ should call the ML API directly.
 *
 * Endpoints proxied
 * -----------------
 *  POST  /grade              – trigger full grading pipeline
 *  GET   /grade/:id/result   – poll pipeline result
 *  POST  /ocr                – OCR-only (no grading)
 *  POST  /plagiarism/detect  – standalone plagiarism check
 *  GET   /health             – liveness probe
 */

import axios from "axios";

// ---------------------------------------------------------------------------
// Axios instance
// ---------------------------------------------------------------------------

const ML_BASE_URL = process.env.ML_SERVICE_URL || "http://localhost:8000";
const ML_API_KEY = process.env.GRADEOPS_ML_API_KEY || "";

const mlClient = axios.create({
  baseURL: ML_BASE_URL,
  timeout: 120_000, // 2 min — grading can be slow
  headers: {
    "Content-Type": "application/json",
    "X-GradeOps-Key": ML_API_KEY,
  },
});

// Log outgoing ML requests in development
mlClient.interceptors.request.use((config) => {
  if (process.env.NODE_ENV !== "production") {
    console.log(`[mlPipeline] → ${config.method?.toUpperCase()} ${config.url}`);
  }
  return config;
});

mlClient.interceptors.response.use(
  (res) => res,
  (err) => {
    const status = err.response?.status;
    const detail = err.response?.data?.detail || err.response?.data?.message || err.message;
    console.error(`[mlPipeline] ← ERROR ${status}: ${detail}`);
    throw new Error(`ML service error (${status}): ${detail}`);
  }
);

// ---------------------------------------------------------------------------
// Grading
// ---------------------------------------------------------------------------

/**
 * Trigger the full OCR + grading + plagiarism pipeline for a submission.
 *
 * @param {object} payload
 * @param {string} payload.examId
 * @param {string} payload.submissionId
 * @param {string} payload.studentId
 * @param {string} payload.pdfUrl        – presigned cloud URL
 * @param {object} payload.rubric        – rubric JSON (toMLPayload() output)
 * @returns {Promise<{ submissionId: string, status: string, message: string }>}
 */
export async function triggerGrading({ examId, submissionId, studentId, pdfUrl, rubric }) {
  const { data } = await mlClient.post("/grade", {
    exam_id: examId,
    submission_id: submissionId,
    student_id: studentId,
    pdf_url: pdfUrl,
    rubric,
  });
  return data;
}

/**
 * Poll the ML service for the result of a previously triggered grading job.
 *
 * @param {string} submissionId
 * @returns {Promise<{ status: "running"|"complete"|"error", result?: object }>}
 */
export async function pollGradingResult(submissionId) {
  const { data } = await mlClient.get(`/grade/${submissionId}/result`);
  return data;
}

// ---------------------------------------------------------------------------
// OCR only
// ---------------------------------------------------------------------------

/**
 * Run OCR on a PDF and return per-question transcripts.
 * Useful for previewing OCR output before grading.
 *
 * @param {string}   pdfUrl
 * @param {object[]} [boundingBoxes]  – optional pre-defined crop regions
 * @returns {Promise<Array<{ question_id, nougat_text, qwen_text, final_transcript }>>}
 */
export async function runOcr(pdfUrl, boundingBoxes = null) {
  const body = { pdf_url: pdfUrl };
  if (boundingBoxes) body.bounding_boxes = boundingBoxes;
  const { data } = await mlClient.post("/ocr", body);
  return data;
}

// ---------------------------------------------------------------------------
// Plagiarism
// ---------------------------------------------------------------------------

/**
 * Run a standalone plagiarism check for a single question across submissions.
 *
 * @param {string}   questionId
 * @param {string[]} texts           – answer transcripts
 * @param {string[]} submissionIds   – parallel array of submission IDs
 * @param {number}   [threshold]     – cosine similarity threshold (default 0.92)
 * @returns {Promise<object>}        – { flagged_count, flags: [...] }
 */
export async function detectPlagiarism(questionId, texts, submissionIds, threshold = 0.92) {
  const { data } = await mlClient.post("/plagiarism/detect", {
    question_id: questionId,
    texts,
    submission_ids: submissionIds,
    threshold,
  });
  return data;
}

// ---------------------------------------------------------------------------
// Health check
// ---------------------------------------------------------------------------

/**
 * Ping the ML service. Returns true if reachable and healthy.
 * @returns {Promise<boolean>}
 */
export async function checkMlHealth() {
  try {
    const { data } = await mlClient.get("/health");
    return data?.status === "ok";
  } catch {
    return false;
  }
}

export default {
  triggerGrading,
  pollGradingResult,
  runOcr,
  detectPlagiarism,
  checkMlHealth,
};
