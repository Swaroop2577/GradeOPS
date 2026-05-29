/**
 * examType.controller.js
 * -----------------------
 * CRUD for exam types (Midterm, Final, etc.) within a course.
 *
 *  POST   /api/exam-types              – create exam type       [instructor]
 *  GET    /api/exam-types?courseId=    – list for a course
 *  GET    /api/exam-types/:id          – get single exam type
 *  PATCH  /api/exam-types/:id          – rename label           [instructor]
 *  DELETE /api/exam-types/:id          – delete                 [instructor]
 */

import ExamType from "../models/ExamType.model.js";
import Course from "../models/Course.model.js";
import Exam from "../models/Exam.model.js";

// POST /api/exam-types
export async function createExamType(req, res) {
  try {
    const { courseId, label } = req.body;
    if (!courseId || !label) {
      return res.status(400).json({ message: "courseId and label are required." });
    }

    const course = await Course.findById(courseId);
    if (!course) return res.status(404).json({ message: "Course not found." });

    if (course.instructor.toString() !== req.user._id.toString()) {
      return res.status(403).json({ message: "Only the course owner can add exam types." });
    }

    const examType = await ExamType.create({
      label: label.trim(),
      course: courseId,
      createdBy: req.user._id,
    });

    return res.status(201).json({ message: "Exam type created.", examType });
  } catch (err) {
    if (err.code === 11000) {
      return res.status(409).json({ message: "An exam type with this label already exists for this course." });
    }
    console.error("[examType.createExamType]", err);
    return res.status(500).json({ message: "Server error." });
  }
}

// GET /api/exam-types?courseId=
export async function listExamTypes(req, res) {
  try {
    const { courseId } = req.query;
    if (!courseId) return res.status(400).json({ message: "courseId query param required." });

    const course = await Course.findById(courseId);
    if (!course) return res.status(404).json({ message: "Course not found." });

    // Both instructor and assigned TAs can view
    const isInstructor = course.instructor.toString() === req.user._id.toString();
    const isTa = course.tas.some((id) => id.toString() === req.user._id.toString());
    if (!isInstructor && !isTa) {
      return res.status(403).json({ message: "Access denied." });
    }

    const examTypes = await ExamType.find({ course: courseId })
      .populate("rubric", "name version isFinalized questions")
      .populate({
        path: "exams",
        select: "title studentName studentRollNo studentDepartment status totalSubmissions gradedSubmissions reviewedSubmissions createdAt",
      })
      .sort({ createdAt: 1 });

    return res.status(200).json({ examTypes });
  } catch (err) {
    console.error("[examType.listExamTypes]", err);
    return res.status(500).json({ message: "Server error." });
  }
}

// GET /api/exam-types/:id
export async function getExamType(req, res) {
  try {
    const examType = await ExamType.findById(req.params.id)
      .populate("rubric")
      .populate({
        path: "exams",
        select: "title studentName studentRollNo studentDepartment status totalSubmissions gradedSubmissions reviewedSubmissions createdAt",
        populate: { path: "course", select: "code name" },
      });

    if (!examType) return res.status(404).json({ message: "Exam type not found." });

    const course = await Course.findById(examType.course);
    const isInstructor = course.instructor.toString() === req.user._id.toString();
    const isTa = course.tas.some((id) => id.toString() === req.user._id.toString());
    if (!isInstructor && !isTa) {
      return res.status(403).json({ message: "Access denied." });
    }

    return res.status(200).json({ examType });
  } catch (err) {
    console.error("[examType.getExamType]", err);
    return res.status(500).json({ message: "Server error." });
  }
}

// PATCH /api/exam-types/:id
export async function updateExamType(req, res) {
  try {
    const examType = await ExamType.findById(req.params.id);
    if (!examType) return res.status(404).json({ message: "Exam type not found." });

    const course = await Course.findById(examType.course);
    if (course.instructor.toString() !== req.user._id.toString()) {
      return res.status(403).json({ message: "Only the course owner can update exam types." });
    }

    const { label } = req.body;
    if (label !== undefined) examType.label = label.trim();
    await examType.save();

    return res.status(200).json({ message: "Exam type updated.", examType });
  } catch (err) {
    if (err.code === 11000) {
      return res.status(409).json({ message: "Label already in use for this course." });
    }
    console.error("[examType.updateExamType]", err);
    return res.status(500).json({ message: "Server error." });
  }
}

// DELETE /api/exam-types/:id
export async function deleteExamType(req, res) {
  try {
    const examType = await ExamType.findById(req.params.id);
    if (!examType) return res.status(404).json({ message: "Exam type not found." });

    const course = await Course.findById(examType.course);
    if (course.instructor.toString() !== req.user._id.toString()) {
      return res.status(403).json({ message: "Only the course owner can delete exam types." });
    }

    // Remove all child exams
    await Exam.deleteMany({ examType: examType._id });
    await examType.deleteOne();

    return res.status(200).json({ message: "Exam type deleted." });
  } catch (err) {
    console.error("[examType.deleteExamType]", err);
    return res.status(500).json({ message: "Server error." });
  }
}
