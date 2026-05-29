/**
 * course.routes.js
 *  GET    /api/courses
 *  POST   /api/courses
 *  GET    /api/courses/:id
 *  PATCH  /api/courses/:id
 *  DELETE /api/courses/:id
 *  POST   /api/courses/:id/tas
 *  DELETE /api/courses/:id/tas/:taId
 */
import { Router } from "express";
import { createCourse, listCourses, getCourse, updateCourse, deleteCourse, assignTa, removeTa } from "../controllers/course.controller.js";
import { authenticate } from "../middleware/auth.middleware.js";
import { instructorOnly } from "../middleware/rbac.middleware.js";

const router = Router();
router.use(authenticate);

router.post("/",                  instructorOnly, createCourse);
router.get("/",                   listCourses);
router.get("/:id",                getCourse);
router.patch("/:id",              instructorOnly, updateCourse);
router.delete("/:id",             instructorOnly, deleteCourse);
router.post("/:id/tas",           instructorOnly, assignTa);
router.delete("/:id/tas/:taId",   instructorOnly, removeTa);

export default router;
