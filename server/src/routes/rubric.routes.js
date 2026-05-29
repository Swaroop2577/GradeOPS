/**
 * rubric.routes.js
 * -----------------
 * Rubric CRUD endpoints. All routes require authentication.
 *
 *  POST   /api/rubrics                       – create rubric for an exam      [instructor]
 *  GET    /api/rubrics/:examId               – get current rubric
 *  PUT    /api/rubrics/:examId               – replace questions (bumps ver)  [instructor]
 *  PATCH  /api/rubrics/:examId/finalize      – lock rubric                    [instructor]
 *  GET    /api/rubrics/:examId/history       – version history                [instructor]
 */

import { Router } from "express";
import {
  createRubric,
  getRubric,
  updateRubric,
  finalizeRubric,
  getRubricHistory,
} from "../controllers/rubric.controller.js";
import { authenticate } from "../middleware/auth.middleware.js";
import { instructorOnly, taOrInstructor } from "../middleware/rbac.middleware.js";

const router = Router();

router.use(authenticate);

router.post("/", instructorOnly, createRubric);
router.get("/:examId", taOrInstructor, getRubric);
router.put("/:examId", instructorOnly, updateRubric);
router.patch("/:examId/finalize", instructorOnly, finalizeRubric);
router.get("/:examId/history", instructorOnly, getRubricHistory);

export default router;
