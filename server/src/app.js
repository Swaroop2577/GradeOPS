import express from "express";
import cors from "cors";
import helmet from "helmet";
import cookieParser from "cookie-parser";
import morgan from "morgan";
import rateLimit from "express-rate-limit";

import authRoutes from "./routes/auth.routes.js";
import examRoutes from "./routes/exam.routes.js";
import examTypeRoutes from "./routes/examType.routes.js";
import rubricRoutes from "./routes/rubric.routes.js";
import gradeRoutes from "./routes/grade.routes.js";
import courseRoutes from "./routes/course.routes.js";
import { receiveGradeResult } from "./controllers/grade.controller.js";

const app = express();

import { fileURLToPath } from "url";
import path from "path";
const __dirname = path.dirname(fileURLToPath(import.meta.url));
app.use("/uploads", express.static(path.resolve(__dirname, "../../uploads")));

app.use(helmet());

const allowedOrigins = (process.env.CORS_ORIGINS || "http://localhost:5173")
  .split(",")
  .map((o) => o.trim());

app.use(
  cors({
    origin: (origin, cb) => {
      if (!origin || allowedOrigins.includes(origin)) return cb(null, true);
      cb(new Error(`CORS policy: origin '${origin}' not allowed.`));
    },
    credentials: true,
    methods: ["GET", "POST", "PUT", "PATCH", "DELETE", "OPTIONS"],
    allowedHeaders: ["Content-Type", "Authorization", "X-GradeOps-Key"],
  })
);

app.use(express.json({ limit: "5mb" }));
app.use(express.urlencoded({ extended: true, limit: "5mb" }));
app.use(cookieParser());

if (process.env.NODE_ENV !== "test") {
  app.use(morgan(process.env.NODE_ENV === "production" ? "combined" : "dev"));
}

const authLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 20,
  message: { message: "Too many requests. Please try again later." },
  standardHeaders: true,
  legacyHeaders: false,
});

const apiLimiter = rateLimit({
  windowMs: 60 * 1000,
  max: 200,
  message: { message: "Rate limit exceeded. Please slow down." },
  standardHeaders: true,
  legacyHeaders: false,
});

app.get("/health", (req, res) => {
  res.status(200).json({ status: "ok", service: "gradeops-server", uptime: process.uptime() });
});

app.use("/api/auth", authLimiter, authRoutes);
app.use("/api/courses", apiLimiter, courseRoutes);
app.use("/api/exam-types", apiLimiter, examTypeRoutes);
app.use("/api/exams", apiLimiter, examRoutes);
app.use("/api/rubrics", apiLimiter, rubricRoutes);
app.use("/api/grades", apiLimiter, gradeRoutes);

// FIX: registered directly here — NOT via gradeRoutes — to avoid the
// double /internal path bug (/api/internal/internal/grade-result → 404).
app.post("/api/internal/grade-result", receiveGradeResult);

app.use((req, res) => {
  res.status(404).json({ message: `Route not found: ${req.method} ${req.originalUrl}` });
});

app.use((err, req, res, next) => {
  console.error("[app] Unhandled error:", err);
  if (err.message?.startsWith("CORS policy")) return res.status(403).json({ message: err.message });
  if (err.name === "ValidationError") {
    return res.status(422).json({ message: "Validation failed.", errors: Object.values(err.errors).map(e => e.message) });
  }
  if (err.code === 11000) {
    const field = Object.keys(err.keyValue || {})[0] || "field";
    return res.status(409).json({ message: `Duplicate value for ${field}.` });
  }
  if (err.name === "JsonWebTokenError" || err.name === "TokenExpiredError") {
    return res.status(401).json({ message: "Invalid or expired token." });
  }
  const status = err.status || err.statusCode || 500;
  res.status(status).json({
    message: err.message || "An unexpected server error occurred.",
    ...(process.env.NODE_ENV !== "production" && { stack: err.stack }),
  });
});

export default app;