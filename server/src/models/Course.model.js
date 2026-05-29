/**
 * Course.model.js
 * ----------------
 * Represents an academic course within GradeOps.
 * Instructors own courses; TAs are assigned to them.
 */

import mongoose from "mongoose";

const { Schema, model } = mongoose;

const CourseSchema = new Schema(
  {
    name: {
      type: String,
      required: [true, "Course name is required."],
      trim: true,
      maxlength: 200,
    },

    code: {
      type: String,
      required: [true, "Course code is required."],
      trim: true,
      uppercase: true,
      maxlength: 20,
      // e.g. "CS101", "MATH301"
    },

    description: {
      type: String,
      trim: true,
      maxlength: 1000,
      default: "",
    },

    // The instructor who owns this course
    instructor: {
      type: Schema.Types.ObjectId,
      ref: "User",
      required: true,
    },

    // TAs assigned to grade exams in this course
    tas: [
      {
        type: Schema.Types.ObjectId,
        ref: "User",
      },
    ],

    // Exams belonging to this course
    exams: [
      {
        type: Schema.Types.ObjectId,
        ref: "Exam",
      },
    ],

    semester: {
      type: String,
      trim: true,
      maxlength: 40,
      // e.g. "Fall 2025", "Spring 2026"
    },

    isArchived: {
      type: Boolean,
      default: false,
    },
  },
  {
    timestamps: true,
  }
);

// ---------------------------------------------------------------------------
// Indexes
// ---------------------------------------------------------------------------

CourseSchema.index({ instructor: 1 });
CourseSchema.index({ code: 1, semester: 1 });

// ---------------------------------------------------------------------------
// Instance helpers
// ---------------------------------------------------------------------------

/**
 * Check whether a given user ID is a TA on this course.
 * @param {string|ObjectId} userId
 * @returns {boolean}
 */
CourseSchema.methods.hasTa = function (userId) {
  return this.tas.some((id) => id.toString() === userId.toString());
};

const Course = model("Course", CourseSchema);
export default Course;
