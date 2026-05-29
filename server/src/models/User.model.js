/**
 * User.model.js
 * --------------
 * Mongoose schema for GradeOps users.
 *
 * Roles
 * -----
 *  "instructor" – can create courses, upload exams, define rubrics,
 *                 view plagiarism reports, export grades.
 *  "ta"         – can review and approve/override AI-proposed grades
 *                 for exams they are assigned to.
 */

import mongoose from "mongoose";
import bcrypt from "bcryptjs";

const { Schema, model } = mongoose;

const UserSchema = new Schema(
  {
    name: {
      type: String,
      required: [true, "Name is required."],
      trim: true,
      maxlength: 120,
    },

    email: {
      type: String,
      required: [true, "Email is required."],
      unique: true,
      lowercase: true,
      trim: true,
      match: [/^\S+@\S+\.\S+$/, "Invalid email address."],
    },

    passwordHash: {
      type: String,
      required: true,
      select: false, // never returned in queries by default
    },

    role: {
      type: String,
      enum: ["instructor", "ta"],
      required: true,
      default: "ta",
    },

    // Courses this user is associated with (instructors own; TAs are assigned)
    courses: [
      {
        type: Schema.Types.ObjectId,
        ref: "Course",
      },
    ],

    isActive: {
      type: Boolean,
      default: true,
    },

    lastLogin: {
      type: Date,
      default: null,
    },

    // Password-reset support
    resetPasswordToken: { type: String, select: false },
    resetPasswordExpires: { type: Date, select: false },
  },
  {
    timestamps: true, // createdAt, updatedAt
  }
);

// ---------------------------------------------------------------------------
// Virtuals
// ---------------------------------------------------------------------------

UserSchema.virtual("isInstructor").get(function () {
  return this.role === "instructor";
});

// ---------------------------------------------------------------------------
// Pre-save hook: hash password before storing
// ---------------------------------------------------------------------------

UserSchema.pre("save", async function (next) {
  if (!this.isModified("passwordHash")) return next();
  const salt = await bcrypt.genSalt(12);
  this.passwordHash = await bcrypt.hash(this.passwordHash, salt);
  next();
});

// ---------------------------------------------------------------------------
// Instance methods
// ---------------------------------------------------------------------------

/**
 * Compare a plain-text password against the stored hash.
 * @param {string} plainText
 * @returns {Promise<boolean>}
 */
UserSchema.methods.comparePassword = async function (plainText) {
  return bcrypt.compare(plainText, this.passwordHash);
};

// ---------------------------------------------------------------------------
// Static helpers
// ---------------------------------------------------------------------------

/**
 * Find an active user by email and include the passwordHash field
 * (needed for login — normally excluded by `select: false`).
 */
UserSchema.statics.findByEmailWithPassword = function (email) {
  return this.findOne({ email, isActive: true }).select("+passwordHash");
};

const User = model("User", UserSchema);
export default User;
