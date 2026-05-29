/**
 * Grade.model.js
 * ---------------
 * Stores the AI-proposed grade and the TA's final decision for one
 * (Submission × question) pair.
 *
 * Status lifecycle
 * ----------------
 *  ai_graded       → ML pipeline has written a score + justification
 *  pending_review  → Flagged for mandatory TA review (low confidence /
 *                    plagiarism flag / score clamped)
 *  approved        → TA accepted the AI grade as-is
 *  overridden      → TA changed the score (taScore is authoritative)
 */

import mongoose from "mongoose";

const { Schema, model } = mongoose;

const GRADE_STATUSES = ["ai_graded", "pending_review", "approved", "overridden"];

// ---------------------------------------------------------------------------
// Per-criterion score sub-document
// ---------------------------------------------------------------------------

const CriterionScoreSchema = new Schema(
  {
    criterion_id: { type: String, required: true },
    awarded_points: { type: Number, required: true, min: 0 },
    max_points: { type: Number, required: true, min: 0 },
    justification: { type: String, default: "" },
    // True if the ML service clamped an out-of-range value
    clamped: { type: Boolean, default: false },
  },
  { _id: false }
);

// ---------------------------------------------------------------------------
// Main schema
// ---------------------------------------------------------------------------

const GradeSchema = new Schema(
  {
    submission: {
      type: Schema.Types.ObjectId,
      ref: "Submission",
      required: true,
      unique: true, // one Grade document per Submission
    },

    exam: {
      type: Schema.Types.ObjectId,
      ref: "Exam",
      required: true,
    },

    questionId: {
      type: String,
      required: true,
      trim: true,
    },

    studentId: {
      type: String,
      required: true,
      trim: true,
    },

    // ---------------------------------------------------------------------------
    // AI-proposed grade (written by the ML pipeline)
    // ---------------------------------------------------------------------------

    aiScore: {
      type: Number,
      default: null,
      min: 0,
    },

    maxScore: {
      type: Number,
      required: true,
      min: 0,
    },

    aiJustification: {
      type: String,
      default: "",
    },

    // Student-facing feedback (refined by justification_generator.py)
    studentFeedback: {
      type: String,
      default: "",
    },

    // Per-criterion breakdown from the ML pipeline
    criterionScores: {
      type: [CriterionScoreSchema],
      default: [],
    },

    // ML model confidence [0–1]; low values trigger pending_review
    confidence: {
      type: Number,
      default: 1.0,
      min: 0,
      max: 1,
    },

    // ---------------------------------------------------------------------------
    // TA decision
    // ---------------------------------------------------------------------------

    status: {
      type: String,
      enum: GRADE_STATUSES,
      default: "ai_graded",
    },

    // Set when status = "overridden"
    taScore: {
      type: Number,
      default: null,
      min: 0,
    },

    taComment: {
      type: String,
      default: "",
    },

    reviewedBy: {
      type: Schema.Types.ObjectId,
      ref: "User",
      default: null,
    },

    reviewedAt: {
      type: Date,
      default: null,
    },

    // ---------------------------------------------------------------------------
    // Flags
    // ---------------------------------------------------------------------------

    flaggedForReview: {
      type: Boolean,
      default: false,
    },

    plagiarismFlagged: {
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

GradeSchema.index({ exam: 1, status: 1 });
GradeSchema.index({ exam: 1, questionId: 1 });
GradeSchema.index({ exam: 1, studentId: 1 });
GradeSchema.index({ reviewedBy: 1 });

// ---------------------------------------------------------------------------
// Virtuals
// ---------------------------------------------------------------------------

/** The authoritative final score: taScore if overridden, else aiScore. */
GradeSchema.virtual("finalScore").get(function () {
  return this.status === "overridden" ? this.taScore : this.aiScore;
});

GradeSchema.virtual("percentage").get(function () {
  const score = this.finalScore;
  if (score == null || !this.maxScore) return 0;
  return Math.round((score / this.maxScore) * 100);
});

// ---------------------------------------------------------------------------
// Instance helpers
// ---------------------------------------------------------------------------

/**
 * Approve the AI grade. Sets status to "approved".
 * @param {ObjectId} taUserId
 */
GradeSchema.methods.approve = function (taUserId) {
  this.status = "approved";
  this.reviewedBy = taUserId;
  this.reviewedAt = new Date();
};

/**
 * Override the AI grade with a TA-specified score and comment.
 * @param {ObjectId} taUserId
 * @param {number}   newScore
 * @param {string}   comment
 */
GradeSchema.methods.override = function (taUserId, newScore, comment = "") {
  this.status = "overridden";
  this.taScore = newScore;
  this.taComment = comment;
  this.reviewedBy = taUserId;
  this.reviewedAt = new Date();
};

const Grade = model("Grade", GradeSchema);
export default Grade;
