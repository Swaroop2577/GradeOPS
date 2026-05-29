/**
 * Submission.model.js
 * --------------------
 * One Submission document = one student's answer to one question on one exam.
 *
 * After PDF segmentation, each cropped answer region becomes a Submission.
 * The OCR transcript and cloud image URL are stored here; the Grade document
 * (created by the ML pipeline) references this document.
 */

import mongoose from "mongoose";

const { Schema, model } = mongoose;

const SubmissionSchema = new Schema(
  {
    exam: {
      type: Schema.Types.ObjectId,
      ref: "Exam",
      required: true,
    },

    // Identifies the student — may be an enrolment number extracted from the
    // cover page via OCR, or manually assigned during bulk upload.
    studentId: {
      type: String,
      required: true,
      trim: true,
    },

    // Which question this submission answers (matches rubric question_id)
    questionId: {
      type: String,
      required: true,
      trim: true,
    },

    // ---------------------------------------------------------------------------
    // Cropped image (from page_segmenter.py)
    // ---------------------------------------------------------------------------

    cropImageKey: {
      type: String, // Cloud storage object key
      default: "",
    },

    cropImageUrl: {
      type: String, // Public / presigned URL shown in TA dashboard
      default: "",
    },

    // Page number (0-indexed) within the original PDF
    pageNumber: {
      type: Number,
      default: 0,
    },

    // ---------------------------------------------------------------------------
    // OCR output (from nougat + qwen_vl processors)
    // ---------------------------------------------------------------------------

    rawNougatText: {
      type: String,
      default: "",
    },

    rawQwenText: {
      type: String,
      default: "",
    },

    // Best transcript (selected by the pipeline)
    finalTranscript: {
      type: String,
      default: "",
    },

    ocrStatus: {
      type: String,
      enum: ["pending", "complete", "error"],
      default: "pending",
    },

    ocrError: {
      type: String,
      default: null,
    },

    // ---------------------------------------------------------------------------
    // Plagiarism
    // ---------------------------------------------------------------------------

    plagiarismFlagged: {
      type: Boolean,
      default: false,
    },

    similarSubmissions: [
      {
        submissionId: { type: Schema.Types.ObjectId, ref: "Submission" },
        similarityScore: Number,
      },
    ],
  },
  {
    timestamps: true,
  }
);

// ---------------------------------------------------------------------------
// Indexes
// ---------------------------------------------------------------------------

SubmissionSchema.index({ exam: 1, studentId: 1, questionId: 1 }, { unique: true });
SubmissionSchema.index({ exam: 1, questionId: 1 });
SubmissionSchema.index({ exam: 1, ocrStatus: 1 });

const Submission = model("Submission", SubmissionSchema);
export default Submission;
