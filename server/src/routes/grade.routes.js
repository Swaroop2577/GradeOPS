/**
 * grade.routes.js
 *
 * NOTE: POST /api/internal/grade-result (ML webhook) is registered
 * directly in app.js — NOT here — to avoid the double /internal path bug.
 */

import { Router } from "express";
import {
  listGrades,
  getGradesByQuestion,
  approveGrade,
  overrideGrade,
  exportGrades,
} from "../controllers/grade.controller.js";
import { authenticate } from "../middleware/auth.middleware.js";
import { taOrInstructor, instructorOnly } from "../middleware/rbac.middleware.js";

const router = Router();

router.get("/:examId", authenticate, taOrInstructor, listGrades);
router.get("/:examId/question/:qId", authenticate, taOrInstructor, getGradesByQuestion);
router.get("/:examId/export", authenticate, instructorOnly, exportGrades);
router.patch("/:gradeId/approve", authenticate, taOrInstructor, approveGrade);
router.patch("/:gradeId/override", authenticate, taOrInstructor, overrideGrade);

export default router;