/**
 * Rubric.model.js
 */

import mongoose from "mongoose";
const { Schema, model } = mongoose;

const PartialCreditRuleSchema = new Schema(
  {
    condition: { type: String, required: true, trim: true },
    points:    { type: Number, required: true, min: 0 },
  },
  { _id: false }
);

const CriterionSchema = new Schema(
  {
    criterion_id: { type: String, required: true, trim: true },
    description:  { type: String, required: true, trim: true },
    detail:       { type: String, default: "", trim: true },
    max_points:   { type: Number, required: true, min: 0 },
    partial_credit_rules: { type: [PartialCreditRuleSchema], default: [] },
  },
  { _id: false }
);

const QuestionSchema = new Schema(
  {
    question_id:          { type: String, required: true, trim: true },
    title:                { type: String, required: true, trim: true },
    max_points:           { type: Number, required: true, min: 0 },
    notes:                { type: String, default: "", trim: true },
    allow_partial_credit: { type: Boolean, default: true },
    criteria:             { type: [CriterionSchema], default: [] },
  },
  { _id: false }
);

const RubricVersionSchema = new Schema(
  {
    version:   { type: Number, required: true },
    questions: { type: Schema.Types.Mixed },
    savedAt:   { type: Date, default: Date.now },
  },
  { _id: false }
);

const RubricSchema = new Schema(
  {
    exam: {
      type: Schema.Types.ObjectId,
      ref: "Exam",
      default: null,
    },

    // When set, this rubric is shared across all uploads in the ExamType.
    examType: {
      type: Schema.Types.ObjectId,
      ref: "ExamType",
      default: null,
    },
    createdBy: {
      type: Schema.Types.ObjectId,
      ref: "User",
      required: true,
    },
    name:        { type: String, default: "", trim: true },
    version:     { type: Number, default: 1 },
    isFinalized: { type: Boolean, default: false },
    questions:   { type: [QuestionSchema], default: [] },
    history:     { type: [RubricVersionSchema], default: [], select: false },
  },
  { timestamps: true }
);

// ---------------------------------------------------------------------------
// Hooks
// ---------------------------------------------------------------------------

RubricSchema.pre("save", function (next) {
  if (this.isModified("questions") && !this.isNew) {
    this.history.push({
      version:   this.version,
      questions: this.toObject().questions,
    });
    this.version += 1;
  }
  next();
});

// ---------------------------------------------------------------------------
// Virtuals
// ---------------------------------------------------------------------------

RubricSchema.virtual("totalPoints").get(function () {
  return this.questions.reduce((sum, q) => sum + q.max_points, 0);
});

// ---------------------------------------------------------------------------
// Methods
// ---------------------------------------------------------------------------

/**
 * toMLPayload — serialize rubric for the Python ML service.
 *
 * FIX: Previously returned `this.questions` directly (Mongoose DocumentArray)
 * which could carry internal Mongoose metadata. Now uses toObject() to get
 * a clean plain JS array with only the schema-defined fields.
 */
RubricSchema.methods.toMLPayload = function () {
  const plain = this.toObject({ virtuals: false, versionKey: false });
  return {
    exam_id:   (this.exam || this.examType)?.toString() || '',
    version:   this.version,
    questions: plain.questions,   // clean plain objects, no Mongoose internals
  };
};

const Rubric = model("Rubric", RubricSchema);
export default Rubric;