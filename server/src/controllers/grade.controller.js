/**
 * grade.controller.js
 */

import Grade from "../models/Grade.model.js";
import Exam from "../models/Exam.model.js";
import Submission from "../models/Submission.model.js";
import mongoose from "mongoose";
import { exportGradesCsv, exportGradesPdf } from "../services/export.service.js";

async function assertTaOrInstructor(examId, userId, res) {
  const exam = await Exam.findById(examId).populate("course", "instructor tas");
  if (!exam) { res.status(404).json({ message: "Exam not found." }); return null; }
  const course = exam.course;
  const ok =
    course.instructor.toString() === userId.toString() ||
    course.tas.some((id) => id.toString() === userId.toString());
  if (!ok) { res.status(403).json({ message: "Access denied." }); return null; }
  return exam;
}

export async function listGrades(req, res) {
  try {
    const { examId } = req.params;
    const { status, questionId, flagged, page = 1, limit = 30 } = req.query;
    const skip = (parseInt(page) - 1) * parseInt(limit);
    const exam = await assertTaOrInstructor(examId, req.user._id, res);
    if (!exam) return;
    const query = { exam: examId };
    if (status) query.status = status;
    if (questionId) query.questionId = questionId;
    if (flagged === "true") query.flaggedForReview = true;
    const [grades, total] = await Promise.all([
      Grade.find(query)
        .populate("submission", "cropImageUrl finalTranscript studentId")
        .populate("reviewedBy", "name")
        .sort({ createdAt: 1 })
        .skip(skip)
        .limit(parseInt(limit)),
      Grade.countDocuments(query),
    ]);
    return res.status(200).json({ total, page: parseInt(page), pages: Math.ceil(total / parseInt(limit)), grades });
  } catch (err) {
    console.error("[grade.listGrades]", err);
    return res.status(500).json({ message: "Server error." });
  }
}

export async function getGradesByQuestion(req, res) {
  try {
    const { examId, qId } = req.params;
    const exam = await assertTaOrInstructor(examId, req.user._id, res);
    if (!exam) return;
    const grades = await Grade.find({ exam: examId, questionId: qId })
      .populate("submission", "cropImageUrl finalTranscript studentId plagiarismFlagged")
      .sort({ "submission.studentId": 1 });
    return res.status(200).json({ grades });
  } catch (err) {
    console.error("[grade.getGradesByQuestion]", err);
    return res.status(500).json({ message: "Server error." });
  }
}

export async function approveGrade(req, res) {
  try {
    const grade = await Grade.findById(req.params.gradeId);
    if (!grade) return res.status(404).json({ message: "Grade not found." });
    if (["approved", "overridden"].includes(grade.status))
      return res.status(409).json({ message: `Grade already ${grade.status}.` });
    grade.approve(req.user._id);
    await grade.save();
    await Exam.findByIdAndUpdate(grade.exam, { $inc: { reviewedSubmissions: 1 } });
    return res.status(200).json({ message: "Grade approved.", grade });
  } catch (err) {
    console.error("[grade.approveGrade]", err);
    return res.status(500).json({ message: "Server error." });
  }
}

export async function overrideGrade(req, res) {
  try {
    const { taScore, taComment = "" } = req.body;
    if (taScore === undefined || taScore === null)
      return res.status(400).json({ message: "taScore is required." });
    const grade = await Grade.findById(req.params.gradeId);
    if (!grade) return res.status(404).json({ message: "Grade not found." });
    if (taScore < 0 || taScore > grade.maxScore)
      return res.status(400).json({ message: `taScore must be between 0 and ${grade.maxScore}.` });
    const wasAlreadyReviewed = ["approved", "overridden"].includes(grade.status);
    grade.override(req.user._id, taScore, taComment);
    await grade.save();
    if (!wasAlreadyReviewed)
      await Exam.findByIdAndUpdate(grade.exam, { $inc: { reviewedSubmissions: 1 } });
    return res.status(200).json({ message: "Grade overridden.", grade });
  } catch (err) {
    console.error("[grade.overrideGrade]", err);
    return res.status(500).json({ message: "Server error." });
  }
}

export async function exportGrades(req, res) {
  try {
    const { examId } = req.params;
    const format = req.query.format || "csv";
    const exam = await Exam.findById(examId).populate("course", "name code");
    if (!exam) return res.status(404).json({ message: "Exam not found." });
    const grades = await Grade.find({ exam: examId, status: { $in: ["approved", "overridden"] } })
      .populate("submission", "studentId");
    if (grades.length === 0)
      return res.status(404).json({ message: "No finalized grades to export." });
    if (format === "pdf") {
      const pdfBuffer = await exportGradesPdf(exam, grades);
      res.setHeader("Content-Type", "application/pdf");
      res.setHeader("Content-Disposition", `attachment; filename="${exam.course.code}_${exam.title}_grades.pdf"`);
      return res.send(pdfBuffer);
    }
    const csv = await exportGradesCsv(exam, grades);
    res.setHeader("Content-Type", "text/csv");
    res.setHeader("Content-Disposition", `attachment; filename="${exam.course.code}_${exam.title}_grades.csv"`);
    return res.send(csv);
  } catch (err) {
    console.error("[grade.exportGrades]", err);
    return res.status(500).json({ message: "Server error during export." });
  }
}

// ---------------------------------------------------------------------------
// POST /api/internal/grade-result  ← ML pipeline webhook
// ---------------------------------------------------------------------------

export async function receiveGradeResult(req, res) {
  // Step-by-step diagnostic logging so you can see exactly where it fails
  console.log("[webhook] POST /api/internal/grade-result received");

  try {
    // 1. API key check
    const key = req.headers["x-gradeops-key"];
    const expectedKey = process.env.GRADEOPS_ML_API_KEY;
    console.log(`[webhook] API key check — received: ${key ? key.slice(0,8)+"..." : "MISSING"}, expected: ${expectedKey ? expectedKey.slice(0,8)+"..." : "NOT SET"}`);
    if (key !== expectedKey) {
      console.error("[webhook] 403 — API key mismatch");
      return res.status(403).json({ message: "Invalid internal API key." });
    }

    // 2. Parse body
    const {
      submission_id,
      exam_id,
      student_id,
      question_grades = [],
      plagiarism_flags = [],
      status: pipelineStatus,
    } = req.body;

    console.log(`[webhook] exam_id=${exam_id}, submission_id=${submission_id}, status=${pipelineStatus}, question_grades=${question_grades.length}`);

    if (!exam_id) {
      console.error("[webhook] 400 — exam_id missing");
      return res.status(400).json({ message: "exam_id is required." });
    }

    // 3. FIX: Validate exam_id is a valid ObjectId before hitting Mongoose
    // The debug pipeline sends exam_id="debug_exam" which causes a CastError → 500
    if (!mongoose.Types.ObjectId.isValid(exam_id)) {
      console.warn(`[webhook] exam_id '${exam_id}' is not a valid ObjectId — ignoring (debug run)`);
      return res.status(200).json({ message: "Debug run ignored." });
    }

    const effectiveStudentId = student_id || submission_id || "unknown";

    // 4. Save each question grade
    for (const qg of question_grades) {
      console.log(`[webhook] Saving grade for question ${qg.question_id}: ${qg.total_score}/${qg.max_score}`);
      try {
        // Upsert Submission
        const submission = await Submission.findOneAndUpdate(
          { exam: exam_id, studentId: effectiveStudentId, questionId: qg.question_id },
          {
            $set: { ocrStatus: "complete", finalTranscript: qg.overall_justification || "" },
            $setOnInsert: {
              exam: exam_id,
              studentId: effectiveStudentId,
              questionId: qg.question_id,
            },
          },
          { upsert: true, new: true }
        );
        console.log(`[webhook] Submission upserted: ${submission._id}`);

        const plagiarismFlag = plagiarism_flags.find((f) => f.question_id === qg.question_id);

        // Upsert Grade
        const grade = await Grade.findOneAndUpdate(
          { submission: submission._id },
          {
            $set: {
              exam: exam_id,
              questionId: qg.question_id,
              studentId: effectiveStudentId,
              aiScore: qg.total_score,
              maxScore: qg.max_score,
              aiJustification: qg.overall_justification || "",
              studentFeedback: qg.student_feedback || "",
              criterionScores: qg.criterion_scores || [],
              confidence: qg.confidence ?? 1.0,
              flaggedForReview: qg.flag_for_review || false,
              plagiarismFlagged: plagiarismFlag?.flagged || false,
              status: qg.flag_for_review || plagiarismFlag?.flagged ? "pending_review" : "ai_graded",
            },
          },
          { upsert: true, new: true }
        );
        console.log(`[webhook] Grade upserted: ${grade._id}`);
      } catch (qErr) {
        console.error(`[webhook] ERROR saving grade for question ${qg.question_id}:`, qErr.message);
        // Don't abort — try to save remaining questions
      }
    }

    // 5. Update exam status
    const totalGraded = await Grade.countDocuments({ exam: exam_id });
    const examDoc = await Exam.findById(exam_id);
    if (examDoc) {
      examDoc.gradedSubmissions = totalGraded;
      // FIX: also update totalSubmissions so progressPercent works correctly
      examDoc.totalSubmissions = Math.max(examDoc.totalSubmissions || 0, question_grades.length);
      if (pipelineStatus === "complete" || pipelineStatus === "flagged") {
        examDoc.status = "graded";
        examDoc.pipelineCompletedAt = new Date();
        examDoc.plagiarismFlagCount = plagiarism_flags.filter((f) => f.flagged).length;
        console.log(`[webhook] Exam ${exam_id} status → graded`);
      } else if (pipelineStatus === "error") {
        examDoc.pipelineError = req.body.error_message || "Pipeline error";
        console.error(`[webhook] Exam ${exam_id} pipeline error: ${examDoc.pipelineError}`);
      }
      await examDoc.save();
    } else {
      console.error(`[webhook] Exam ${exam_id} not found in DB`);
    }

    return res.status(200).json({ message: "Grade result stored.", saved: question_grades.length });
  } catch (err) {
    console.error("[webhook] UNHANDLED ERROR in receiveGradeResult:", err);
    return res.status(500).json({ message: "Server error storing grade result.", error: err.message });
  }
}