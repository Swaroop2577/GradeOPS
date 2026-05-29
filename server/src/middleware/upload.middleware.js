/**
 * upload.middleware.js
 * ---------------------
 * Multer-based file upload middleware that:
 *  1. Accepts a PDF (or image) via multipart/form-data.
 *  2. Validates mime type and size.
 *  3. Streams the buffer to cloud storage (via cloudStorage.js).
 *  4. Attaches { key, url } to req.uploadedFile for the controller.
 *
 * Usage:
 *   import { uploadExamPdf } from "../middleware/upload.middleware.js";
 *   router.post("/exams", authenticate, uploadExamPdf, createExam);
 */

import multer from "multer";
import { uploadFile } from "../config/cloudStorage.js";

// ---------------------------------------------------------------------------
// Multer — keep files in memory (we stream directly to cloud)
// ---------------------------------------------------------------------------

const MAX_FILE_SIZE_MB = parseInt(process.env.MAX_UPLOAD_MB || "200");

const storage = multer.memoryStorage();

function fileFilter(req, file, cb) {
  const allowed = ["application/pdf", "image/png", "image/jpeg", "image/tiff"];
  if (allowed.includes(file.mimetype)) {
    cb(null, true);
  } else {
    cb(
      new multer.MulterError(
        "LIMIT_UNEXPECTED_FILE",
        `Only PDF and image files are accepted. Received: ${file.mimetype}`
      ),
      false
    );
  }
}

const multerUpload = multer({
  storage,
  fileFilter,
  limits: { fileSize: MAX_FILE_SIZE_MB * 1024 * 1024 },
});

// ---------------------------------------------------------------------------
// Cloud-upload wrapper
// ---------------------------------------------------------------------------

/**
 * Higher-order middleware factory.
 * Runs multer for the given field name, then streams the buffer to cloud storage.
 *
 * @param {string} fieldName   - multipart field name (e.g. "examPdf")
 * @param {string} folder      - cloud storage folder prefix (e.g. "exams")
 * @returns {Function[]}       - array of two Express middlewares
 */
function makeUploadMiddleware(fieldName, folder) {
  return [
    // Step 1: parse multipart and hold buffer in memory
    (req, res, next) => {
      multerUpload.single(fieldName)(req, res, (err) => {
        if (err instanceof multer.MulterError) {
          if (err.code === "LIMIT_FILE_SIZE") {
            return res.status(413).json({
              message: `File too large. Maximum allowed size is ${MAX_FILE_SIZE_MB} MB.`,
            });
          }
          return res.status(400).json({ message: err.message });
        }
        if (err) {
          return res.status(400).json({ message: err.message });
        }
        next();
      });
    },

    // Step 2: stream to cloud storage and attach result to req
    async (req, res, next) => {
      if (!req.file) {
        // File is optional for some routes (e.g. PATCH); skip silently
        return next();
      }

      try {
        const { key, url } = await uploadFile(
          req.file.buffer,
          req.file.mimetype,
          folder,
          // Use original filename (sanitised) as the base name
          req.file.originalname.replace(/[^a-zA-Z0-9._-]/g, "_")
        );

        req.uploadedFile = { key, url, mimetype: req.file.mimetype, size: req.file.size };
        next();
      } catch (err) {
        console.error("[upload.middleware] Cloud upload failed:", err);
        return res.status(500).json({ message: "Failed to upload file to cloud storage." });
      }
    },
  ];
}

// ---------------------------------------------------------------------------
// Pre-built middleware stacks for common upload types
// ---------------------------------------------------------------------------

/** Upload an exam bulk PDF — field name: "examPdf" */
export const uploadExamPdf = makeUploadMiddleware("examPdf", "exams");

/** Upload a single answer image crop (used by OCR preview endpoint) */
export const uploadAnswerImage = makeUploadMiddleware("answerImage", "crops");

export default makeUploadMiddleware;
