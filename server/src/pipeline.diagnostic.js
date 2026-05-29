/**
 * pipeline.diagnostic.js
 * -----------------------
 * Drop this file anywhere in server/src/ and import it in index.js to get
 * a /diagnostic/pipeline/:examId endpoint that shows the full state of an
 * exam's pipeline in one HTTP call.
 *
 * Usage in index.js (after app is created):
 *   import { registerDiagnosticRoutes } from "./src/pipeline.diagnostic.js";
 *   registerDiagnosticRoutes(app);
 *
 * Then visit: http://localhost:5000/diagnostic/pipeline/<examId>
 *
 * NO AUTH — development only. Remove before deploying.
 */

import Exam       from "./models/Exam.model.js";
import Rubric     from "./models/Rubric.model.js";
import Submission from "./models/Submission.model.js";
import Grade      from "./models/Grade.model.js";
import axios      from "axios";

const ML_BASE_URL = process.env.ML_SERVICE_URL || "http://localhost:8000";
const ML_API_KEY  = process.env.GRADEOPS_ML_API_KEY || "";

export function registerDiagnosticRoutes(app) {
  if (process.env.NODE_ENV === "production") {
    console.warn("[diagnostic] Skipping diagnostic routes in production.");
    return;
  }

  // ── Full pipeline state for one exam ──────────────────────────────────────
  app.get("/diagnostic/pipeline/:examId", async (req, res) => {
    const { examId } = req.params;
    const report = { examId, timestamp: new Date().toISOString() };

    // 1. Exam document
    try {
      const exam = await Exam.findById(examId)
        .populate("rubric", "version totalPoints questions isFinalized")
        .populate("course", "name code");
      if (!exam) return res.status(404).json({ error: `Exam ${examId} not found` });
      report.exam = {
        title:               exam.title,
        status:              exam.status,
        totalSubmissions:    exam.totalSubmissions,
        gradedSubmissions:   exam.gradedSubmissions,
        reviewedSubmissions: exam.reviewedSubmissions,
        pipelineJobId:       exam.pipelineJobId,
        pipelineStartedAt:   exam.pipelineStartedAt,
        pipelineCompletedAt: exam.pipelineCompletedAt,
        pipelineError:       exam.pipelineError,
        pdfKey:              exam.pdfKey,
        course:              exam.course ? `${exam.course.code} — ${exam.course.name}` : null,
      };
      report.rubric = exam.rubric ? {
        version:     exam.rubric.version,
        totalPoints: exam.rubric.totalPoints,
        questions:   exam.rubric.questions?.length,
        isFinalized: exam.rubric.isFinalized,
        questionIds: exam.rubric.questions?.map(q => q.question_id),
      } : null;
    } catch (e) {
      report.exam_error = e.message;
    }

    // 2. Submissions
    try {
      const subs = await Submission.find({ exam: examId });
      report.submissions = {
        count: subs.length,
        statuses: subs.reduce((acc, s) => { acc[s.ocrStatus] = (acc[s.ocrStatus] || 0) + 1; return acc; }, {}),
        list: subs.map(s => ({ id: s._id, studentId: s.studentId, questionId: s.questionId, ocrStatus: s.ocrStatus })),
      };
    } catch (e) {
      report.submissions_error = e.message;
    }

    // 3. Grades
    try {
      const grades = await Grade.find({ exam: examId });
      report.grades = {
        count: grades.length,
        statuses: grades.reduce((acc, g) => { acc[g.status] = (acc[g.status] || 0) + 1; return acc; }, {}),
        list: grades.map(g => ({
          id:         g._id,
          questionId: g.questionId,
          studentId:  g.studentId,
          aiScore:    g.aiScore,
          maxScore:   g.maxScore,
          status:     g.status,
        })),
      };
    } catch (e) {
      report.grades_error = e.message;
    }

    // 4. ML service health + job result
    try {
      const healthRes = await axios.get(`${ML_BASE_URL}/health`, {
        headers: { "X-GradeOps-Key": ML_API_KEY },
        timeout: 5000,
      });
      report.ml_service = { reachable: true, status: healthRes.data?.status };
    } catch (e) {
      report.ml_service = { reachable: false, error: e.message };
    }

    try {
      const jobRes = await axios.get(`${ML_BASE_URL}/grade/${examId}/result`, {
        headers: { "X-GradeOps-Key": ML_API_KEY },
        timeout: 5000,
      });
      report.ml_job = {
        status:          jobRes.data?.status,
        has_result:      !!jobRes.data?.result,
        question_grades: jobRes.data?.result?.question_grades?.length ?? 0,
        error:           jobRes.data?.error,
      };
    } catch (e) {
      report.ml_job = { found: false, error: e.message };
    }

    // 5. Webhook reachability self-test
    try {
      const webhookRes = await axios.post(
        `http://localhost:${process.env.PORT || 5000}/api/internal/grade-result`,
        { exam_id: "ping_test" },  // invalid ObjectId → returns 200 with "Debug run ignored"
        { headers: { "X-GradeOps-Key": ML_API_KEY }, timeout: 3000 }
      );
      report.webhook_test = { reachable: true, response: webhookRes.data };
    } catch (e) {
      report.webhook_test = { reachable: false, error: e.message };
    }

    return res.status(200).json(report);
  });

  // ── ML service raw job result ─────────────────────────────────────────────
  app.get("/diagnostic/ml-job/:submissionId", async (req, res) => {
    try {
      const result = await axios.get(
        `${ML_BASE_URL}/grade/${req.params.submissionId}/result`,
        { headers: { "X-GradeOps-Key": ML_API_KEY }, timeout: 5000 }
      );
      return res.json(result.data);
    } catch (e) {
      return res.status(502).json({ error: e.message });
    }
  });

  // ── Env sanity check ──────────────────────────────────────────────────────
  app.get("/diagnostic/env", (req, res) => {
    res.json({
      NODE_ENV:            process.env.NODE_ENV,
      PORT:                process.env.PORT,
      ML_SERVICE_URL:      process.env.ML_SERVICE_URL,
      GRADEOPS_ML_API_KEY: process.env.GRADEOPS_ML_API_KEY ? `${process.env.GRADEOPS_ML_API_KEY.slice(0,8)}...` : "NOT SET",
      REDIS_HOST:          process.env.REDIS_HOST,
      MONGO_URI:           process.env.MONGO_URI ? "SET (hidden)" : "NOT SET",
      CLOUD_STORAGE_PROVIDER: process.env.CLOUD_STORAGE_PROVIDER,
      SERVER_URL:          process.env.SERVER_URL,
    });
  });

  console.log("[diagnostic] Routes registered:");
  console.log("  GET /diagnostic/pipeline/:examId");
  console.log("  GET /diagnostic/ml-job/:submissionId");
  console.log("  GET /diagnostic/env");
}