/**
 * exam.controller.js
 */

import Exam from "../models/Exam.model.js";
import ExamType from "../models/ExamType.model.js";
import Submission from "../models/Submission.model.js";
import Rubric from "../models/Rubric.model.js";
import Course from "../models/Course.model.js";
import { uploadFile, getPresignedUrl } from "../config/cloudStorage.js";
import { enqueueGradingJob } from "../services/queue.service.js";

// ---------------------------------------------------------------------------
// POST /api/exams
// ---------------------------------------------------------------------------

export async function createExam(req, res) {
  try {
    const {
      title,
      courseId,
      examTypeId,          // optional — links to an ExamType
      studentName,         // required when examTypeId present
      studentRollNo,       // required when examTypeId present
      studentDepartment,   // required when examTypeId present
    } = req.body;

    if (!title || !courseId) {
      return res.status(400).json({ message: "title and courseId are required." });
    }

    // When uploading under an exam type, all three student fields are required
    if (examTypeId) {
      if (!studentName || !studentRollNo || !studentDepartment) {
        return res.status(400).json({
          message: "studentName, studentRollNo, and studentDepartment are required when uploading under an exam type.",
        });
      }
    }

    const course = await Course.findById(courseId);
    if (!course) return res.status(404).json({ message: "Course not found." });

    if (course.instructor.toString() !== req.user._id.toString()) {
      return res.status(403).json({ message: "You do not own this course." });
    }

    // Validate exam type if provided
    if (examTypeId) {
      const examType = await ExamType.findById(examTypeId);
      if (!examType) return res.status(404).json({ message: "Exam type not found." });
      if (examType.course.toString() !== courseId) {
        return res.status(400).json({ message: "Exam type does not belong to this course." });
      }
    }

    const { key: pdfKey, url: pdfUrl } = req.uploadedFile || {};
    if (!pdfKey) {
      return res.status(400).json({ message: "No PDF file received." });
    }

    // If examType has a rubric, inherit it so grading can start immediately
    let rubricId = null;
    if (examTypeId) {
      const et = await ExamType.findById(examTypeId).select("rubric");
      if (et?.rubric) rubricId = et.rubric;
    }

    const exam = await Exam.create({
      title,
      course: courseId,
      examType: examTypeId || null,
      studentName:       studentName?.trim()       || "",
      studentRollNo:     studentRollNo?.trim()     || "",
      studentDepartment: studentDepartment?.trim() || "",
      rubric: rubricId,
      pdfKey,
      pdfUrl,
      status: "uploaded",
      createdBy: req.user._id,
    });

    await Course.findByIdAndUpdate(courseId, { $push: { exams: exam._id } });

    // Link exam to its exam type
    if (examTypeId) {
      await ExamType.findByIdAndUpdate(examTypeId, { $push: { exams: exam._id } });
    }

    return res.status(201).json({ message: "Exam created.", exam });
  } catch (err) {
    console.error("[exam.createExam]", err);
    return res.status(500).json({ message: "Server error creating exam." });
  }
}

// ---------------------------------------------------------------------------
// GET /api/exams
// ---------------------------------------------------------------------------

export async function listExams(req, res) {
  try {
    const { status, courseId, examTypeId, page = 1, limit = 20 } = req.query;
    const skip = (parseInt(page) - 1) * parseInt(limit);

    let courseFilter;
    if (req.user.role === "instructor") {
      const courses = await Course.find({ instructor: req.user._id }).select("_id");
      courseFilter = courses.map((c) => c._id);
    } else {
      const courses = await Course.find({ tas: req.user._id }).select("_id");
      courseFilter = courses.map((c) => c._id);
    }

    const query = { course: { $in: courseFilter } };
    if (status) query.status = status;
    if (courseId) query.course = courseId;
    if (examTypeId) query.examType = examTypeId;

    const [exams, total] = await Promise.all([
      Exam.find(query)
        .populate("course", "name code")
        .populate("examType", "label")
        .populate("rubric", "version totalPoints")
        .sort({ createdAt: -1 })
        .skip(skip)
        .limit(parseInt(limit)),
      Exam.countDocuments(query),
    ]);

    return res.status(200).json({
      total,
      page: parseInt(page),
      pages: Math.ceil(total / parseInt(limit)),
      exams,
    });
  } catch (err) {
    console.error("[exam.listExams]", err);
    return res.status(500).json({ message: "Server error listing exams." });
  }
}

// ---------------------------------------------------------------------------
// GET /api/exams/:id
// ---------------------------------------------------------------------------

export async function getExam(req, res) {
  try {
    const exam = await Exam.findById(req.params.id)
      .populate("course", "name code instructor tas")
      .populate("examType", "label rubric")
      .populate("rubric")
      .populate("createdBy", "name email");

    if (!exam) return res.status(404).json({ message: "Exam not found." });

    const courseDoc = exam.course;
    const isInstructor = courseDoc.instructor.toString() === req.user._id.toString();
    const isTa = courseDoc.tas.some((id) => id.toString() === req.user._id.toString());
    if (!isInstructor && !isTa) {
      return res.status(403).json({ message: "Access denied." });
    }

    let pdfPresignedUrl = exam.pdfUrl;
    if (exam.pdfKey) {
      try { pdfPresignedUrl = await getPresignedUrl(exam.pdfKey, 900); } catch (_) {}
    }

    return res.status(200).json({ ...exam.toObject(), pdfPresignedUrl });
  } catch (err) {
    console.error("[exam.getExam]", err);
    return res.status(500).json({ message: "Server error." });
  }
}

// ---------------------------------------------------------------------------
// GET /api/exams/:id/status
// ---------------------------------------------------------------------------

export async function getExamStatus(req, res) {
  try {
    const exam = await Exam.findById(req.params.id).select(
      "status totalSubmissions gradedSubmissions reviewedSubmissions " +
      "pipelineStartedAt pipelineCompletedAt pipelineError plagiarismFlagCount"
    );
    if (!exam) return res.status(404).json({ message: "Exam not found." });

    return res.status(200).json({
      status: exam.status,
      progress: {
        total: exam.totalSubmissions,
        graded: exam.gradedSubmissions,
        reviewed: exam.reviewedSubmissions,
        gradingPercent: exam.progressPercent,
        reviewPercent: exam.reviewProgressPercent,
      },
      pipelineStartedAt: exam.pipelineStartedAt,
      pipelineCompletedAt: exam.pipelineCompletedAt,
      pipelineError: exam.pipelineError,
      plagiarismFlagCount: exam.plagiarismFlagCount,
    });
  } catch (err) {
    console.error("[exam.getExamStatus]", err);
    return res.status(500).json({ message: "Server error." });
  }
}

// ---------------------------------------------------------------------------
// GET /api/exams/:id/submissions-detail
// Returns per-student submission summary with grades for the View button
// ---------------------------------------------------------------------------

export async function getExamSubmissionsDetail(req, res) {
  try {
    const exam = await Exam.findById(req.params.id)
      .populate("course", "instructor tas");

    if (!exam) return res.status(404).json({ message: "Exam not found." });

    const isInstructor = exam.course.instructor.toString() === req.user._id.toString();
    const isTa = exam.course.tas.some((id) => id.toString() === req.user._id.toString());
    if (!isInstructor && !isTa) {
      return res.status(403).json({ message: "Access denied." });
    }

    // Import Grade model here to avoid circular refs
    const { default: Grade } = await import("../models/Grade.model.js");

    const grades = await Grade.find({ exam: exam._id })
      .populate("submission", "studentId questionId finalTranscript cropImageUrl ocrStatus")
      .sort({ "submission.questionId": 1 });

    return res.status(200).json({
      exam: {
        _id: exam._id,
        title: exam.title,
        studentName: exam.studentName,
        studentRollNo: exam.studentRollNo,
        studentDepartment: exam.studentDepartment,
      },
      grades,
    });
  } catch (err) {
    console.error("[exam.getExamSubmissionsDetail]", err);
    return res.status(500).json({ message: "Server error." });
  }
}

// ---------------------------------------------------------------------------
// POST /api/exams/:id/trigger-grading
// ---------------------------------------------------------------------------

export async function triggerGrading(req, res) {
  try {
    const exam = await Exam.findOneAndUpdate(
      { _id: req.params.id, status: "uploaded" },
      { $set: { status: "ocr", pipelineStartedAt: new Date() } },
      { new: true }
    ).populate("rubric");

    if (!exam) {
      const existing = await Exam.findById(req.params.id).select("status rubric examType");
      if (!existing) return res.status(404).json({ message: "Exam not found." });

      // Try to pull rubric from exam type if not directly attached
      if (!existing.rubric && existing.examType) {
        const et = await ExamType.findById(existing.examType).select("rubric");
        if (et?.rubric) {
          await Exam.findByIdAndUpdate(existing._id, { rubric: et.rubric });
        }
      }

      if (!existing.rubric) {
        return res.status(400).json({ message: "Attach a rubric before triggering grading." });
      }
      return res.status(409).json({
        message: `Grading cannot be triggered in status '${existing.status}'.`,
      });
    }

    // If rubric not directly set, inherit from exam type
    if (!exam.rubric && exam.examType) {
      const et = await ExamType.findById(exam.examType).populate("rubric");
      if (et?.rubric) {
        exam.rubric = et.rubric;
        await Exam.findByIdAndUpdate(exam._id, { rubric: et.rubric._id });
      }
    }

    if (!exam.rubric) {
      await Exam.findByIdAndUpdate(req.params.id, { status: "uploaded" });
      return res.status(400).json({ message: "Attach a rubric before triggering grading." });
    }

    const pdfUrl = await getPresignedUrl(exam.pdfKey, 900);

    const rubricDoc = exam.rubric?.toMLPayload
      ? exam.rubric.toMLPayload()
      : exam.rubric;

    const jobId = await enqueueGradingJob({
      examId: exam._id.toString(),
      pdfUrl,
      rubric: rubricDoc,
    });

    await Exam.findByIdAndUpdate(exam._id, { pipelineJobId: jobId });

    return res.status(202).json({ message: "Grading pipeline started.", jobId });
  } catch (err) {
    console.error("[exam.triggerGrading]", err);
    return res.status(500).json({ message: "Server error triggering grading." });
  }
}

// ---------------------------------------------------------------------------
// DELETE /api/exams/:id
// ---------------------------------------------------------------------------

export async function deleteExam(req, res) {
  try {
    const exam = await Exam.findById(req.params.id);
    if (!exam) return res.status(404).json({ message: "Exam not found." });

    if (exam.createdBy.toString() !== req.user._id.toString()) {
      return res.status(403).json({ message: "Only the exam creator can delete it." });
    }

    await Submission.deleteMany({ exam: exam._id });
    await Course.findByIdAndUpdate(exam.course, { $pull: { exams: exam._id } });
    if (exam.examType) {
      await ExamType.findByIdAndUpdate(exam.examType, { $pull: { exams: exam._id } });
    }
    await exam.deleteOne();

    return res.status(200).json({ message: "Exam deleted." });
  } catch (err) {
    console.error("[exam.deleteExam]", err);
    return res.status(500).json({ message: "Server error." });
  }
}
