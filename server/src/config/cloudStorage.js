import path from "path";
import fs from "fs";
import { v4 as uuidv4 } from "uuid";
import { fileURLToPath } from "url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));

// Resolves to server/uploads/
const LOCAL_UPLOAD_DIR = path.resolve(__dirname, "../../../uploads");

export async function uploadFile(buffer, mimeType, folder = "uploads", fileName = null) {
  const ext = mimeType.split("/")[1] || "bin";

  let baseName;
  if (fileName) {
    // Strip the extension from the incoming filename so we control it —
    // this prevents double extensions like "exam.pdf.pdf" when the original
    // file already ends in .pdf and we would append .pdf again.
    const existingExt = path.extname(fileName);          // e.g. ".pdf"
    const nameWithoutExt = existingExt
      ? fileName.slice(0, -existingExt.length)            // "exam"
      : fileName;                                         // no ext — keep as-is
    baseName = nameWithoutExt;
  } else {
    baseName = uuidv4();
  }

  const key = `${folder}/${baseName}.${ext}`;

  const destDir = path.join(LOCAL_UPLOAD_DIR, folder);
  fs.mkdirSync(destDir, { recursive: true });
  fs.writeFileSync(path.join(LOCAL_UPLOAD_DIR, key), buffer);

  return { key, url: `/uploads/${key}` };
}

export async function getPresignedUrl(key) {
  // Return a full absolute URL so the ML service can download it via HTTP.
  // SERVER_URL must be set in server/.env, e.g. http://localhost:5000
  const base = process.env.SERVER_URL || "http://localhost:5000";
  return `${base}/uploads/${key}`;
}

export async function deleteFile(key) {
  const filePath = path.join(LOCAL_UPLOAD_DIR, key);
  if (fs.existsSync(filePath)) fs.unlinkSync(filePath);
}

export default { uploadFile, getPresignedUrl, deleteFile };