/**
 * index.js — server entry point
 */

import "dotenv/config";
import http from "http";
import app from "./src/app.js";
import { connectDB } from "./src/config/db.js";
import { startGradingWorker, attachQueueEvents } from "./src/services/queue.service.js";
import { registerDiagnosticRoutes } from "./src/pipeline.diagnostic.js";

const PORT = parseInt(process.env.PORT || "5000");

async function main() {
  await connectDB();

  // Register diagnostic routes BEFORE starting the server
  // Visit /diagnostic/pipeline/:examId to see full pipeline state
  // Visit /diagnostic/env to verify environment variables
  registerDiagnosticRoutes(app);

  startGradingWorker();
  attachQueueEvents();

  const server = http.createServer(app);

  server.listen(PORT, () => {
    console.log(`[server] GradeOps API running on port ${PORT} (${process.env.NODE_ENV})`);
    if (process.env.NODE_ENV !== "production") {
      console.log(`[server] Diagnostics available at http://localhost:${PORT}/diagnostic/env`);
    }
  });

  process.on("SIGTERM", async () => {
    console.log("[server] SIGTERM received — shutting down");
    server.close();
    process.exit(0);
  });
}

main().catch((err) => {
  console.error("[server] Fatal startup error:", err);
  process.exit(1);
});