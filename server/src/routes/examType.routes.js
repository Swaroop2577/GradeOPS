/**
 * examType.routes.js
 *
 *  POST   /api/exam-types              – create exam type       [instructor]
 *  GET    /api/exam-types?courseId=    – list for a course
 *  GET    /api/exam-types/:id          – get single exam type
 *  PATCH  /api/exam-types/:id          – update label           [instructor]
 *  DELETE /api/exam-types/:id          – delete                 [instructor]
 */

import { Router } from "express";
import {
  createExamType,
  listExamTypes,
  getExamType,
  updateExamType,
  deleteExamType,
} from "../controllers/examType.controller.js";
import { authenticate } from "../middleware/auth.middleware.js";
import { instructorOnly } from "../middleware/rbac.middleware.js";

const router = Router();

router.use(authenticate);

router.post("/", instructorOnly, createExamType);
router.get("/", listExamTypes);
router.get("/:id", getExamType);
router.patch("/:id", instructorOnly, updateExamType);
router.delete("/:id", instructorOnly, deleteExamType);

export default router;
