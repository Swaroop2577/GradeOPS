/**
 * rbac.middleware.js
 * -------------------
 * Role-Based Access Control middleware.
 *
 * Usage (in route files):
 *   import { requireRole } from "../middleware/rbac.middleware.js";
 *
 *   router.post("/exams", authenticate, requireRole("instructor"), createExam);
 *   router.patch("/grades/:id/approve", authenticate, requireRole("ta", "instructor"), approveGrade);
 *
 * Must be used AFTER authenticate (requires req.user to be set).
 */

/**
 * Factory that returns an Express middleware allowing only users whose
 * role matches one of the provided allowed roles.
 *
 * @param {...string} roles - One or more allowed roles ("instructor", "ta").
 * @returns {Function} Express middleware
 */
export function requireRole(...roles) {
  return (req, res, next) => {
    if (!req.user) {
      // Shouldn't happen if routes are wired correctly (authenticate first)
      return res.status(401).json({ message: "Authentication required." });
    }

    if (!roles.includes(req.user.role)) {
      return res.status(403).json({
        message: `Access denied. Required role: ${roles.join(" or ")}. Your role: ${req.user.role}.`,
      });
    }

    next();
  };
}

/**
 * Convenience shorthand middlewares.
 */
export const instructorOnly = requireRole("instructor");
export const taOnly = requireRole("ta");
export const taOrInstructor = requireRole("ta", "instructor");

export default requireRole;
