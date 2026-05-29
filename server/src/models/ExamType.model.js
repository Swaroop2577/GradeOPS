/**
 * ExamType.model.js
 * ------------------
 * Represents a category of exam within a course (e.g. "Midterm", "Final").
 *
 * Hierarchy: Course → ExamType → Exam (individual paper upload)
 *
 * The rubric is defined once at this level and shared across all paper
 * uploads (Exam documents) that belong to this exam type.
 */

import mongoose from "mongoose";

const { Schema, model } = mongoose;

const ExamTypeSchema = new Schema(
  {
    // Human label: "Midterm", "Final", "Quiz 1", etc.
    label: {
      type: String,
      required: [true, "Exam type label is required."],
      trim: true,
      maxlength: 100,
    },

    // The course this exam type belongs to
    course: {
      type: Schema.Types.ObjectId,
      ref: "Course",
      required: true,
    },

    // Shared rubric — defined once, applied to every paper upload in this type
    rubric: {
      type: Schema.Types.ObjectId,
      ref: "Rubric",
      default: null,
    },

    // Individual paper uploads (Exam documents) for this exam type
    exams: [
      {
        type: Schema.Types.ObjectId,
        ref: "Exam",
      },
    ],

    createdBy: {
      type: Schema.Types.ObjectId,
      ref: "User",
      required: true,
    },
  },
  { timestamps: true }
);

ExamTypeSchema.index({ course: 1 });
ExamTypeSchema.index({ course: 1, label: 1 }, { unique: true });

const ExamType = model("ExamType", ExamTypeSchema);
export default ExamType;
