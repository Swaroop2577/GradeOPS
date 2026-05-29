/**
 * export.service.js
 * ------------------
 * Generates downloadable grade exports in CSV and PDF formats.
 * Called by grade.controller.js → exportGrades().
 *
 * Dependencies
 * ------------
 *  csv-stringify  – streaming CSV serialiser
 *  pdfkit         – PDF generation
 */

import { stringify } from "csv-stringify/sync";
import PDFDocument from "pdfkit";

// ---------------------------------------------------------------------------
// CSV export
// ---------------------------------------------------------------------------

/**
 * Build a UTF-8 CSV string from finalized grades.
 *
 * Columns: Student ID, Question ID, AI Score, Max Score, Final Score,
 *          Status, TA Comment, Confidence
 *
 * @param {object}   exam    – Mongoose Exam document (populated with course)
 * @param {object[]} grades  – Array of populated Grade documents
 * @returns {Promise<string>} – CSV string
 */
export async function exportGradesCsv(exam, grades) {
  const rows = grades.map((g) => ({
    "Student ID": g.studentId || g.submission?.studentId || "",
    "Question ID": g.questionId,
    "AI Score": g.aiScore ?? "",
    "Max Score": g.maxScore,
    "Final Score": g.status === "overridden" ? g.taScore : g.aiScore,
    "Status": g.status,
    "TA Comment": g.taComment || "",
    "Confidence": g.confidence != null ? (g.confidence * 100).toFixed(1) + "%" : "",
    "Flagged": g.flaggedForReview ? "Yes" : "No",
    "Plagiarism Flag": g.plagiarismFlagged ? "Yes" : "No",
  }));

  const csv = stringify(rows, { header: true });
  return csv;
}

// ---------------------------------------------------------------------------
// PDF export
// ---------------------------------------------------------------------------

/**
 * Build a PDF Buffer containing a grade report for an exam.
 *
 * @param {object}   exam    – Mongoose Exam document (populated with course)
 * @param {object[]} grades  – Array of populated Grade documents
 * @returns {Promise<Buffer>}
 */
export async function exportGradesPdf(exam, grades) {
  return new Promise((resolve, reject) => {
    const doc = new PDFDocument({ margin: 50, size: "A4" });
    const chunks = [];

    doc.on("data", (chunk) => chunks.push(chunk));
    doc.on("end", () => resolve(Buffer.concat(chunks)));
    doc.on("error", reject);

    // ── Header ────────────────────────────────────────────────────────────
    doc
      .fontSize(20)
      .font("Helvetica-Bold")
      .text("GradeOps — Grade Report", { align: "center" });

    doc.moveDown(0.5);
    doc
      .fontSize(13)
      .font("Helvetica")
      .text(`Course: ${exam.course?.name || ""} (${exam.course?.code || ""})`, { align: "center" });

    doc
      .fontSize(12)
      .text(`Exam: ${exam.title}`, { align: "center" });

    doc
      .fontSize(10)
      .fillColor("grey")
      .text(`Exported: ${new Date().toLocaleString()}`, { align: "center" });

    doc.fillColor("black").moveDown(1);

    // ── Summary stats ─────────────────────────────────────────────────────
    const total = grades.length;
    const approved = grades.filter((g) => g.status === "approved").length;
    const overridden = grades.filter((g) => g.status === "overridden").length;
    const meanScore =
      total > 0
        ? (
            grades.reduce((sum, g) => {
              const s = g.status === "overridden" ? g.taScore : g.aiScore;
              return sum + (s || 0);
            }, 0) / total
          ).toFixed(2)
        : "N/A";

    doc.font("Helvetica-Bold").fontSize(11).text("Summary", { underline: true });
    doc.font("Helvetica").fontSize(10);
    doc.text(`Total Graded Submissions: ${total}`);
    doc.text(`Approved: ${approved}  |  Overridden: ${overridden}`);
    doc.text(`Mean Final Score: ${meanScore}`);
    doc.moveDown(1);

    // ── Grade table ───────────────────────────────────────────────────────
    doc.font("Helvetica-Bold").fontSize(11).text("Grade Details", { underline: true });
    doc.moveDown(0.4);

    // Column widths (points)
    const COL = { studentId: 90, questionId: 70, aiScore: 55, finalScore: 65, status: 70, comment: 135 };
    const startX = doc.page.margins.left;
    let y = doc.y;

    // Table header
    doc.font("Helvetica-Bold").fontSize(9);
    doc.text("Student ID",  startX,                                    y, { width: COL.studentId,  lineBreak: false });
    doc.text("Question",    startX + COL.studentId,                    y, { width: COL.questionId,  lineBreak: false });
    doc.text("AI Score",    startX + COL.studentId + COL.questionId,   y, { width: COL.aiScore,     lineBreak: false });
    doc.text("Final Score", startX + COL.studentId + COL.questionId + COL.aiScore, y, { width: COL.finalScore, lineBreak: false });
    doc.text("Status",      startX + COL.studentId + COL.questionId + COL.aiScore + COL.finalScore, y, { width: COL.status, lineBreak: false });
    doc.text("TA Comment",  startX + COL.studentId + COL.questionId + COL.aiScore + COL.finalScore + COL.status, y, { width: COL.comment, lineBreak: false });

    y += 14;
    doc.moveTo(startX, y).lineTo(startX + 485, y).strokeColor("#aaaaaa").stroke();
    y += 4;

    // Table rows
    doc.font("Helvetica").fontSize(8).fillColor("black");

    for (const g of grades) {
      // Page break if needed
      if (y > doc.page.height - doc.page.margins.bottom - 30) {
        doc.addPage();
        y = doc.page.margins.top;
      }

      const finalScore = g.status === "overridden" ? g.taScore : g.aiScore;
      const studentId = g.studentId || g.submission?.studentId || "—";

      doc.text(studentId,          startX,                                    y, { width: COL.studentId,  lineBreak: false });
      doc.text(g.questionId,       startX + COL.studentId,                    y, { width: COL.questionId,  lineBreak: false });
      doc.text(`${g.aiScore ?? "—"} / ${g.maxScore}`, startX + COL.studentId + COL.questionId, y, { width: COL.aiScore, lineBreak: false });
      doc.text(`${finalScore ?? "—"} / ${g.maxScore}`, startX + COL.studentId + COL.questionId + COL.aiScore, y, { width: COL.finalScore, lineBreak: false });
      doc.text(g.status,           startX + COL.studentId + COL.questionId + COL.aiScore + COL.finalScore, y, { width: COL.status, lineBreak: false });
      doc.text(g.taComment || "",  startX + COL.studentId + COL.questionId + COL.aiScore + COL.finalScore + COL.status, y, { width: COL.comment, lineBreak: false });

      y += 13;
    }

    doc.end();
  });
}

export default { exportGradesCsv, exportGradesPdf };
