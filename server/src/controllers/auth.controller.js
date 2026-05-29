/**
 * auth.controller.js
 * -------------------
 * Handles user registration, login, token refresh, and "me" endpoint.
 * Uses JWT for stateless auth; tokens are sent as HTTP-only cookies +
 * returned in the response body for the React client.
 */

import jwt from "jsonwebtoken";
import User from "../models/User.model.js";

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

const TOKEN_EXPIRY = process.env.JWT_EXPIRY || "7d";

function signToken(userId) {
  return jwt.sign({ sub: userId }, process.env.JWT_SECRET, {
    expiresIn: TOKEN_EXPIRY,
  });
}

function sendTokenCookie(res, token) {
  res.cookie("gradeops_token", token, {
    httpOnly: true,
    secure: process.env.NODE_ENV === "production",
    sameSite: "strict",
    maxAge: 7 * 24 * 60 * 60 * 1000, // 7 days in ms
  });
}

// ---------------------------------------------------------------------------
// POST /api/auth/register
// ---------------------------------------------------------------------------

/**
 * Register a new instructor or TA.
 * Body: { name, email, password, role }
 */
export async function register(req, res) {
  try {
    const { name, email, password, role } = req.body;

    if (!name || !email || !password || !role) {
      return res.status(400).json({ message: "name, email, password, and role are required." });
    }

    const existing = await User.findOne({ email });
    if (existing) {
      return res.status(409).json({ message: "An account with this email already exists." });
    }

    // passwordHash field is hashed by the pre-save hook in User.model.js
    const user = await User.create({
      name,
      email,
      passwordHash: password,
      role,
    });

    const token = signToken(user._id);
    sendTokenCookie(res, token);

    return res.status(201).json({
      message: "Account created successfully.",
      token,
      user: {
        id: user._id,
        name: user.name,
        email: user.email,
        role: user.role,
      },
    });
  } catch (err) {
    console.error("[auth.register]", err);
    return res.status(500).json({ message: "Server error during registration." });
  }
}

// ---------------------------------------------------------------------------
// POST /api/auth/login
// ---------------------------------------------------------------------------

/**
 * Login with email + password.
 * Body: { email, password }
 */
export async function login(req, res) {
  try {
    const { email, password } = req.body;

    if (!email || !password) {
      return res.status(400).json({ message: "Email and password are required." });
    }

    const user = await User.findByEmailWithPassword(email);
    if (!user) {
      return res.status(401).json({ message: "Invalid email or password." });
    }

    const isMatch = await user.comparePassword(password);
    if (!isMatch) {
      return res.status(401).json({ message: "Invalid email or password." });
    }

    user.lastLogin = new Date();
    await user.save();

    const token = signToken(user._id);
    sendTokenCookie(res, token);

    return res.status(200).json({
      message: "Login successful.",
      token,
      user: {
        id: user._id,
        name: user.name,
        email: user.email,
        role: user.role,
      },
    });
  } catch (err) {
    console.error("[auth.login]", err);
    return res.status(500).json({ message: "Server error during login." });
  }
}

// ---------------------------------------------------------------------------
// POST /api/auth/logout
// ---------------------------------------------------------------------------

export function logout(req, res) {
  res.clearCookie("gradeops_token");
  return res.status(200).json({ message: "Logged out." });
}

// ---------------------------------------------------------------------------
// GET /api/auth/me
// ---------------------------------------------------------------------------

/**
 * Return the currently authenticated user's profile.
 * Requires auth.middleware to have set req.user.
 */
export async function getMe(req, res) {
  try {
    const user = await User.findById(req.user._id).populate("courses", "name code semester");
    if (!user) {
      return res.status(404).json({ message: "User not found." });
    }

    return res.status(200).json({
      id: user._id,
      name: user.name,
      email: user.email,
      role: user.role,
      courses: user.courses,
      lastLogin: user.lastLogin,
    });
  } catch (err) {
    console.error("[auth.getMe]", err);
    return res.status(500).json({ message: "Server error." });
  }
}

// ---------------------------------------------------------------------------
// PATCH /api/auth/me — update name or password
// ---------------------------------------------------------------------------

export async function updateMe(req, res) {
  try {
    const { name, currentPassword, newPassword } = req.body;

    const user = await User.findById(req.user._id).select("+passwordHash");
    if (!user) return res.status(404).json({ message: "User not found." });

    if (name) user.name = name;

    if (newPassword) {
      if (!currentPassword) {
        return res.status(400).json({ message: "currentPassword is required to set a new password." });
      }
      const isMatch = await user.comparePassword(currentPassword);
      if (!isMatch) {
        return res.status(401).json({ message: "Current password is incorrect." });
      }
      user.passwordHash = newPassword; // pre-save hook re-hashes
    }

    await user.save();
    return res.status(200).json({ message: "Profile updated." });
  } catch (err) {
    console.error("[auth.updateMe]", err);
    return res.status(500).json({ message: "Server error." });
  }
}
