/**
 * exam.routes.js
 *
 *  POST   /api/exams                         – create exam + upload PDF      [instructor]
 *  GET    /api/exams                         – list exams
 *  GET    /api/exams/:id                     – get exam detail
 *  GET    /api/exams/:id/status              – lightweight status poll
 *  GET    /api/exams/:id/submissions-detail  – per-student grades (View btn)
 *  POST   /api/exams/:id/trigger-grading     – kick off ML pipeline          [instructor]
 *  DELETE /api/exams/:id                     – delete exam                   [instructor]
 */

import { Router } from "express";
import {
  createExam,
  listExams,
  getExam,
  getExamStatus,
  getExamSubmissionsDetail,
  triggerGrading,
  deleteExam,
} from "../controllers/exam.controller.js";
import { authenticate } from "../middleware/auth.middleware.js";
import { instructorOnly } from "../middleware/rbac.middleware.js";
import { uploadExamPdf } from "../middleware/upload.middleware.js";

const router = Router();

router.use(authenticate);

router.post("/", instructorOnly, ...uploadExamPdf, createExam);
router.get("/", listExams);
router.get("/:id", getExam);
router.get("/:id/status", getExamStatus);
router.get("/:id/submissions-detail", getExamSubmissionsDetail);
router.post("/:id/trigger-grading", instructorOnly, triggerGrading);
router.delete("/:id", instructorOnly, deleteExam);

export default router;
