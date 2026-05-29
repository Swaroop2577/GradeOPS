/**
 * rubric.controller.js
 * ---------------------
 * CRUD operations for exam rubrics.
 *
 * Rubrics can now be attached to an ExamType (shared across all its uploads)
 * OR directly to an Exam. The :examId param accepts either an Exam._id or
 * an ExamType._id — the controller detects which it is.
 *
 * Routes (wired in rubric.routes.js)
 * ------------------------------------
 *  POST   /api/rubrics                   – create rubric (examId or examTypeId)
 *  GET    /api/rubrics/:examId           – get rubric
 *  PUT    /api/rubrics/:examId           – update questions
 *  PATCH  /api/rubrics/:examId/finalize  – lock rubric
 *  GET    /api/rubrics/:examId/history   – version history
 */

import Rubric from "../models/Rubric.model.js";
import Exam from "../models/Exam.model.js";
import ExamType from "../models/ExamType.model.js";
import Course from "../models/Course.model.js";

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

/**
 * Resolve an instructor check for either an Exam or ExamType.
 * Returns { type: 'exam'|'examType', doc, courseDoc }
 */
async function resolveTarget(id, userId, res) {
  // Try Exam first
  let exam = await Exam.findById(id).populate("course", "instructor tas");
  if (exam) {
    if (exam.course.instructor.toString() !== userId.toString()) {
      res.status(403).json({ message: "Only the course instructor can manage rubrics." });
      return null;
    }
    return { type: "exam", doc: exam, courseDoc: exam.course };
  }

  // Try ExamType
  let examType = await ExamType.findById(id);
  if (examType) {
    const course = await Course.findById(examType.course);
    if (!course) { res.status(404).json({ message: "Course not found." }); return null; }
    if (course.instructor.toString() !== userId.toString()) {
      res.status(403).json({ message: "Only the course instructor can manage rubrics." });
      return null;
    }
    return { type: "examType", doc: examType, courseDoc: course };
  }

  res.status(404).json({ message: "Exam or ExamType not found." });
  return null;
}

// ---------------------------------------------------------------------------
// POST /api/rubrics
// ---------------------------------------------------------------------------

export async function createRubric(req, res) {
  try {
    const { examId, examTypeId, questions = [], name = "" } = req.body;
    const targetId = examTypeId || examId;

    if (!targetId) {
      return res.status(400).json({ message: "examId or examTypeId is required." });
    }

    const target = await resolveTarget(targetId, req.user._id, res);
    if (!target) return;

    // Check for existing rubric keyed on this target
    const existingQuery = target.type === "examType"
      ? { examType: targetId }
      : { exam: targetId, examType: null };

    const existing = await Rubric.findOne(existingQuery);
    if (existing) {
      return res.status(409).json({
        message: "A rubric already exists. Use PUT to update it.",
      });
    }

    const rubricData = {
      createdBy: req.user._id,
      name,
      questions,
    };

    if (target.type === "examType") {
      rubricData.examType = targetId;
      // Use a dummy exam ref — we relax the unique constraint via examType field
      // Actually we store examType in a new optional field; exam is required by schema
      // We'll set exam to a placeholder approach: store examType in Rubric model
    } else {
      rubricData.exam = targetId;
    }

    const rubric = await Rubric.create(rubricData);

    // Link rubric back
    if (target.type === "examType") {
      await ExamType.findByIdAndUpdate(targetId, { rubric: rubric._id });
    } else {
      await Exam.findByIdAndUpdate(targetId, { rubric: rubric._id });
    }

    return res.status(201).json({ message: "Rubric created.", rubric });
  } catch (err) {
    console.error("[rubric.createRubric]", err);
    return res.status(500).json({ message: "Server error creating rubric." });
  }
}

// ---------------------------------------------------------------------------
// GET /api/rubrics/:examId
// ---------------------------------------------------------------------------

export async function getRubric(req, res) {
  try {
    const { examId } = req.params;

    // Try to find rubric by exam first, then by examType
    let rubric = await Rubric.findOne({ exam: examId });
    if (!rubric) {
      rubric = await Rubric.findOne({ examType: examId });
    }
    if (!rubric) return res.status(404).json({ message: "No rubric found." });

    return res.status(200).json({ rubric });
  } catch (err) {
    console.error("[rubric.getRubric]", err);
    return res.status(500).json({ message: "Server error." });
  }
}

// ---------------------------------------------------------------------------
// PUT /api/rubrics/:examId
// ---------------------------------------------------------------------------

export async function updateRubric(req, res) {
  try {
    const { examId } = req.params;
    const { questions, name } = req.body;

    if (!questions || !Array.isArray(questions)) {
      return res.status(400).json({ message: "questions array is required." });
    }

    const target = await resolveTarget(examId, req.user._id, res);
    if (!target) return;

    let rubric = await Rubric.findOne(
      target.type === "examType" ? { examType: examId } : { exam: examId }
    );
    if (!rubric) return res.status(404).json({ message: "No rubric found." });

    if (rubric.isFinalized) {
      return res.status(409).json({ message: "This rubric has been finalized and cannot be edited." });
    }

    rubric.questions = questions;
    if (name !== undefined) rubric.name = name;
    await rubric.save();

    return res.status(200).json({ message: "Rubric updated.", version: rubric.version, rubric });
  } catch (err) {
    console.error("[rubric.updateRubric]", err);
    return res.status(500).json({ message: "Server error updating rubric." });
  }
}

// ---------------------------------------------------------------------------
// PATCH /api/rubrics/:examId/finalize
// ---------------------------------------------------------------------------

export async function finalizeRubric(req, res) {
  try {
    const { examId } = req.params;

    const target = await resolveTarget(examId, req.user._id, res);
    if (!target) return;

    let rubric = await Rubric.findOne(
      target.type === "examType" ? { examType: examId } : { exam: examId }
    );
    if (!rubric) return res.status(404).json({ message: "No rubric found." });
    if (rubric.isFinalized) return res.status(409).json({ message: "Rubric is already finalized." });
    if (rubric.questions.length === 0) return res.status(400).json({ message: "Cannot finalize an empty rubric." });

    rubric.isFinalized = true;
    await rubric.save();

    return res.status(200).json({ message: "Rubric finalized.", version: rubric.version });
  } catch (err) {
    console.error("[rubric.finalizeRubric]", err);
    return res.status(500).json({ message: "Server error." });
  }
}

// ---------------------------------------------------------------------------
// GET /api/rubrics/:examId/history
// ---------------------------------------------------------------------------

export async function getRubricHistory(req, res) {
  try {
    const { examId } = req.params;

    const target = await resolveTarget(examId, req.user._id, res);
    if (!target) return;

    let rubric = await Rubric.findOne(
      target.type === "examType" ? { examType: examId } : { exam: examId }
    ).select("+history");
    if (!rubric) return res.status(404).json({ message: "No rubric found." });

    return res.status(200).json({ currentVersion: rubric.version, history: rubric.history });
  } catch (err) {
    console.error("[rubric.getRubricHistory]", err);
    return res.status(500).json({ message: "Server error." });
  }
}
