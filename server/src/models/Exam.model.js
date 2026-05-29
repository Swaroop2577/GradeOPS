/**
 * Exam.model.js
 * --------------
 * Represents a single paper upload within an ExamType.
 *
 * New hierarchy: Course → ExamType → Exam (paper upload)
 *
 * Each upload carries student identification: name, roll number, department.
 * The roll number is the canonical student identifier shown in Submissions.
 *
 * Status lifecycle
 * ----------------
 *  uploaded  → PDF received and stored
 *  ocr       → ML pipeline running OCR / segmentation
 *  grading   → LLM grading pipeline running
 *  graded    → AI grades available; pending TA review
 *  reviewed  → All questions approved / overridden by TAs
 */

import mongoose from "mongoose";

const { Schema, model } = mongoose;

const EXAM_STATUSES = ["uploaded", "ocr", "grading", "graded", "reviewed"];

const ExamSchema = new Schema(
  {
    title: {
      type: String,
      required: [true, "Exam title is required."],
      trim: true,
      maxlength: 200,
    },

    // Parent exam type (new hierarchy)
    examType: {
      type: Schema.Types.ObjectId,
      ref: "ExamType",
      default: null, // null for exams created before this feature
    },

    course: {
      type: Schema.Types.ObjectId,
      ref: "Course",
      required: true,
    },

    // Rubric — may come from the examType (shared) or be set directly
    rubric: {
      type: Schema.Types.ObjectId,
      ref: "Rubric",
      default: null,
    },

    // ── Student identification fields ───────────────────────────────────
    studentName: {
      type: String,
      trim: true,
      default: "",
    },

    studentRollNo: {
      type: String,
      trim: true,
      default: "",
    },

    studentDepartment: {
      type: String,
      trim: true,
      default: "",
    },
    // ────────────────────────────────────────────────────────────────────

    status: {
      type: String,
      enum: EXAM_STATUSES,
      default: "uploaded",
    },

    pdfKey: {
      type: String,
      default: "",
    },

    pdfUrl: {
      type: String,
      default: "",
    },

    totalSubmissions: {
      type: Number,
      default: 0,
    },

    gradedSubmissions: {
      type: Number,
      default: 0,
    },

    reviewedSubmissions: {
      type: Number,
      default: 0,
    },

    pipelineJobId: {
      type: String,
      default: null,
    },

    pipelineStartedAt: {
      type: Date,
      default: null,
    },

    pipelineCompletedAt: {
      type: Date,
      default: null,
    },

    pipelineError: {
      type: String,
      default: null,
    },

    plagiarismRun: {
      type: Boolean,
      default: false,
    },

    plagiarismFlagCount: {
      type: Number,
      default: 0,
    },

    createdBy: {
      type: Schema.Types.ObjectId,
      ref: "User",
      required: true,
    },
  },
  { timestamps: true }
);

ExamSchema.index({ course: 1, status: 1 });
ExamSchema.index({ examType: 1 });
ExamSchema.index({ createdBy: 1 });

ExamSchema.virtual("progressPercent").get(function () {
  if (!this.totalSubmissions) return 0;
  return Math.round((this.gradedSubmissions / this.totalSubmissions) * 100);
});

ExamSchema.virtual("reviewProgressPercent").get(function () {
  if (!this.totalSubmissions) return 0;
  return Math.round((this.reviewedSubmissions / this.totalSubmissions) * 100);
});

ExamSchema.methods.advanceStatus = function () {
  const idx = EXAM_STATUSES.indexOf(this.status);
  if (idx === -1 || idx === EXAM_STATUSES.length - 1) return false;
  this.status = EXAM_STATUSES[idx + 1];
  return true;
};

const Exam = model("Exam", ExamSchema);
export default Exam;
