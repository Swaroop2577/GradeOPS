/**
 * auth.routes.js
 * ---------------
 * Public + protected authentication endpoints.
 *
 *  POST   /api/auth/register   – create account
 *  POST   /api/auth/login      – login, returns JWT
 *  POST   /api/auth/logout     – clears cookie
 *  GET    /api/auth/me         – get current user profile  [protected]
 *  PATCH  /api/auth/me         – update name / password    [protected]
 */

import { Router } from "express";
import {
  register,
  login,
  logout,
  getMe,
  updateMe,
} from "../controllers/auth.controller.js";
import { authenticate } from "../middleware/auth.middleware.js";

const router = Router();

router.post("/register", register);
router.post("/login", login);
router.post("/logout", logout);

router.get("/me", authenticate, getMe);
router.patch("/me", authenticate, updateMe);

export default router;
