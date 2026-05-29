/**
 * auth.middleware.js
 * -------------------
 * Verifies the JWT on every protected route.
 *
 * Token lookup order:
 *  1. HTTP-only cookie  "gradeops_token"
 *  2. Authorization header  "Bearer <token>"
 *
 * On success: sets req.user = { _id, name, email, role }
 * On failure: responds 401.
 */

import jwt from "jsonwebtoken";
import User from "../models/User.model.js";

export async function authenticate(req, res, next) {
  try {
    // 1. Extract token
    let token =
      req.cookies?.gradeops_token ||
      (req.headers.authorization?.startsWith("Bearer ")
        ? req.headers.authorization.slice(7)
        : null);

    if (!token) {
      return res.status(401).json({ message: "Authentication required. No token provided." });
    }

    // 2. Verify signature + expiry
    let payload;
    try {
      payload = jwt.verify(token, process.env.JWT_SECRET);
    } catch (err) {
      const msg =
        err.name === "TokenExpiredError"
          ? "Session expired. Please log in again."
          : "Invalid token.";
      return res.status(401).json({ message: msg });
    }

    // 3. Load user (ensures account still exists and is active)
    const user = await User.findById(payload.sub).select("_id name email role isActive");
    if (!user || !user.isActive) {
      return res.status(401).json({ message: "User account not found or deactivated." });
    }

    req.user = user;
    next();
  } catch (err) {
    console.error("[auth.middleware]", err);
    return res.status(500).json({ message: "Server error during authentication." });
  }
}

export default authenticate;
