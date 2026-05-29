/**
 * queue.service.js
 */

import { Queue, Worker, QueueEvents } from "bullmq";
import { triggerGrading, pollGradingResult } from "./mlPipeline.service.js";
import Exam from "../models/Exam.model.js";
import Grade from "../models/Grade.model.js";
import Submission from "../models/Submission.model.js";

const redisConnection = {
  host: process.env.REDIS_HOST || "127.0.0.1",
  port: parseInt(process.env.REDIS_PORT || "6379"),
  password: process.env.REDIS_PASSWORD || undefined,
  tls: process.env.REDIS_HOST?.includes("upstash.io") ? {} : undefined,
};

const QUEUE_NAME = "grading";
let gradingQueue = null;

function getQueue() {
  if (!gradingQueue) {
    gradingQueue = new Queue(QUEUE_NAME, {
      connection: redisConnection,
      defaultJobOptions: {
        attempts: 3,
        backoff: { type: "exponential", delay: 15_000 },
        removeOnComplete: { count: 100 },
        removeOnFail: { count: 200 },
      },
    });
  }
  return gradingQueue;
}

export async function enqueueGradingJob({ examId, pdfUrl, rubric }) {
  const queue = getQueue();
  const job = await queue.add(
    "grade-exam",
    { examId, pdfUrl, rubric },
    { jobId: `exam-${examId}-${Date.now()}` }
  );
  console.log(`[queue] Enqueued grading job ${job.id} for exam ${examId}`);
  return job.id;
}

async function saveGradeResult(examId, finalOutput) {
  console.log(`[queue:save] Starting save for exam ${examId}`);
  const {
    submission_id,
    student_id,
    question_grades = [],
    plagiarism_flags = [],
    status: pipelineStatus,
  } = finalOutput;

  console.log(`[queue:save] question_grades count: ${question_grades.length}, pipelineStatus: ${pipelineStatus}`);

  if (question_grades.length === 0) {
    console.error(`[queue:save] No question grades in result — pipeline may have errored`);
    console.error(`[queue:save] Full result:`, JSON.stringify(finalOutput, null, 2));
    await Exam.findByIdAndUpdate(examId, {
      status: "uploaded",
      pipelineError: finalOutput.error_message || "Pipeline returned 0 grades",
    });
    return;
  }

  const effectiveStudentId = student_id || submission_id || "unknown";

  for (const qg of question_grades) {
    console.log(`[queue:save] Saving grade for question ${qg.question_id}: ${qg.total_score}/${qg.max_score}`);
    try {
      const submission = await Submission.findOneAndUpdate(
        { exam: examId, studentId: effectiveStudentId, questionId: qg.question_id },
        {
          $set: { ocrStatus: "complete", finalTranscript: qg.overall_justification || "" },
          $setOnInsert: {
            exam: examId,
            studentId: effectiveStudentId,
            questionId: qg.question_id,
          },
        },
        { upsert: true, new: true }
      );
      console.log(`[queue:save] Submission upserted: ${submission._id}`);

      const plagiarismFlag = plagiarism_flags.find((f) => f.question_id === qg.question_id);

      const grade = await Grade.findOneAndUpdate(
        { submission: submission._id },
        {
          $set: {
            exam: examId,
            questionId: qg.question_id,
            studentId: effectiveStudentId,
            aiScore: qg.total_score,
            maxScore: qg.max_score,
            aiJustification: qg.overall_justification || "",
            studentFeedback: qg.student_feedback || "",
            criterionScores: qg.criterion_scores || [],
            confidence: qg.confidence ?? 1.0,
            flaggedForReview: qg.flag_for_review || false,
            plagiarismFlagged: plagiarismFlag?.flagged || false,
            status: qg.flag_for_review || plagiarismFlag?.flagged ? "pending_review" : "ai_graded",
          },
        },
        { upsert: true, new: true }
      );
      console.log(`[queue:save] Grade upserted: ${grade._id}`);
    } catch (qErr) {
      console.error(`[queue:save] ERROR saving question ${qg.question_id}:`, qErr.message);
    }
  }

  const totalGraded = await Grade.countDocuments({ exam: examId });
  await Exam.findByIdAndUpdate(examId, {
    status: pipelineStatus === "error" ? "uploaded" : "graded",
    gradedSubmissions: totalGraded,
    // FIX: set totalSubmissions so progressPercent is correct
    totalSubmissions: Math.max(question_grades.length, totalGraded),
    pipelineCompletedAt: new Date(),
    plagiarismFlagCount: plagiarism_flags.filter((f) => f.flagged).length,
    ...(pipelineStatus === "error" && { pipelineError: finalOutput.error_message }),
  });

  console.log(`[queue:save] Done — exam ${examId} status=graded, ${question_grades.length} grade(s) saved`);
}

let gradingWorker = null;

export function startGradingWorker() {
  if (gradingWorker) return;

  const concurrency = parseInt(process.env.GRADING_CONCURRENCY || "2");

  gradingWorker = new Worker(
    QUEUE_NAME,
    async (job) => {
      const { examId, pdfUrl, rubric } = job.data;
      console.log(`[queue] Processing job ${job.id} — exam ${examId}`);
      console.log(`[queue] PDF URL: ${pdfUrl}`);
      console.log(`[queue] Rubric questions: ${rubric?.questions?.length ?? 0}`);

      try {
        console.log(`[queue] Calling ML service POST /grade`);
        await triggerGrading({
          examId,
          submissionId: examId,
          studentId: "batch",
          pdfUrl,
          rubric,
        });
        console.log(`[queue] ML service accepted job for exam ${examId}`);

        await Exam.findByIdAndUpdate(examId, { status: "grading" });
        console.log(`[queue] Exam status → grading`);

        // FIX: Reduced poll interval from 10s to 5s and increased max polls
        // to handle long-running pipelines (36s+) without missing the result
        const MAX_POLLS = 240;    // 240 × 5s = 20 min max
        const POLL_INTERVAL_MS = 5_000;
        let polls = 0;

        while (polls < MAX_POLLS) {
          await new Promise((r) => setTimeout(r, POLL_INTERVAL_MS));
          polls++;

          let result;
          try {
            result = await pollGradingResult(examId);
          } catch (pollErr) {
            // FIX: If uvicorn reloaded (--reload flag) the in-memory _job_results
            // is wiped and poll returns 404. Log it and keep trying for a bit.
            console.warn(`[queue] Poll attempt ${polls} failed: ${pollErr.message}`);
            if (polls > 10) throw pollErr; // give up after 50s of 404s
            continue;
          }

          console.log(`[queue] Poll ${polls}: status=${result.status}`);

          if (result.status === "complete" || result.status === "error") {
            if (result.status === "error") {
              const errMsg = result.error || result.result?.error_message || "Unknown ML error";
              console.error(`[queue] ML pipeline error for exam ${examId}: ${errMsg}`);
              throw new Error(errMsg);
            }

            console.log(`[queue] Pipeline complete — saving grades`);
            console.log(`[queue] Result preview:`, JSON.stringify(result.result).slice(0, 200));
            await saveGradeResult(examId, result.result);
            console.log(`[queue] Job ${job.id} completed for exam ${examId}`);
            return result;
          }

          await job.updateProgress(Math.round((polls / MAX_POLLS) * 100));
        }

        throw new Error(`Grading timed out after ${(MAX_POLLS * POLL_INTERVAL_MS) / 1000}s`);
      } catch (err) {
        console.error(`[queue] Job failed for exam ${examId}:`, err.message);
        await Exam.findByIdAndUpdate(examId, {
          status: "uploaded",
          pipelineError: err.message,
        });
        throw err;
      }
    },
    { connection: redisConnection, concurrency }
  );

  gradingWorker.on("completed", (job) => console.log(`[queue] ✓ Job ${job.id} completed.`));
  gradingWorker.on("failed", (job, err) => console.error(`[queue] ✗ Job ${job?.id} failed: ${err.message}`));

  console.log(`[queue] Grading worker started (concurrency=${concurrency}).`);
}

let queueEvents = null;

export function attachQueueEvents() {
  if (queueEvents) return;
  queueEvents = new QueueEvents(QUEUE_NAME, { connection: redisConnection });
  queueEvents.on("waiting", ({ jobId }) => console.log(`[queue] Job ${jobId} waiting.`));
  queueEvents.on("active", ({ jobId }) => console.log(`[queue] Job ${jobId} active.`));
  queueEvents.on("stalled", ({ jobId }) => console.warn(`[queue] Job ${jobId} stalled.`));
}

export async function closeQueue() {
  await gradingWorker?.close();
  await gradingQueue?.close();
  console.log("[queue] Queue and worker closed.");
}

export default { enqueueGradingJob, startGradingWorker, attachQueueEvents, closeQueue };