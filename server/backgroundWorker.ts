import { getDb } from "./db";
import { documents } from "../drizzle/schema";
import { eq, asc } from "drizzle-orm";
import { processUploadedDocument } from "./documentProcessor";

let isProcessing = false;
let workerInterval: ReturnType<typeof setInterval> | null = null;

/**
 * Background worker that picks up pending documents and processes them.
 * Runs on a configurable interval (default: every 30 seconds).
 * Processes documents in batches of 3 to avoid overwhelming the LLM API.
 */
async function processPendingDocuments() {
  if (isProcessing) {
    console.log("[BackgroundWorker] Already processing, skipping this cycle");
    return;
  }

  isProcessing = true;

  try {
    const db = await getDb();
    if (!db) {
      console.log("[BackgroundWorker] Database not available, skipping");
      return;
    }

    // Fetch up to 3 pending documents (oldest first)
    const pendingDocs = await db
      .select({
        id: documents.id,
        fileUrl: documents.fileUrl,
        mimeType: documents.mimeType,
        fileName: documents.fileName,
      })
      .from(documents)
      .where(eq(documents.processingStatus, "pending"))
      .orderBy(asc(documents.createdAt))
      .limit(3);

    if (pendingDocs.length === 0) {
      return; // Nothing to process
    }

    console.log(
      `[BackgroundWorker] Found ${pendingDocs.length} pending document(s), processing...`
    );

    // Process documents sequentially to avoid overwhelming the LLM
    for (const doc of pendingDocs) {
      try {
        console.log(
          `[BackgroundWorker] Processing document #${doc.id}: ${doc.fileName}`
        );
        const result = await processUploadedDocument(
          doc.id,
          doc.fileUrl,
          doc.mimeType || "image/jpeg"
        );
        console.log(
          `[BackgroundWorker] Document #${doc.id} → ${result.status}${
            result.testsCreated ? ` (${result.testsCreated} tests created)` : ""
          }`
        );
      } catch (err) {
        console.error(
          `[BackgroundWorker] Error processing document #${doc.id}:`,
          err
        );
      }
    }
  } catch (error) {
    console.error("[BackgroundWorker] Error in processing cycle:", error);
  } finally {
    isProcessing = false;
  }
}

/**
 * Start the background worker.
 * @param intervalMs - How often to check for pending documents (default: 30 seconds)
 */
export function startBackgroundWorker(intervalMs: number = 30000) {
  if (workerInterval) {
    console.log("[BackgroundWorker] Worker already running");
    return;
  }

  console.log(
    `[BackgroundWorker] Starting background worker (interval: ${intervalMs / 1000}s)`
  );

  // Run immediately on startup
  processPendingDocuments();

  // Then run on interval
  workerInterval = setInterval(processPendingDocuments, intervalMs);
}

/**
 * Stop the background worker.
 */
export function stopBackgroundWorker() {
  if (workerInterval) {
    clearInterval(workerInterval);
    workerInterval = null;
    console.log("[BackgroundWorker] Worker stopped");
  }
}
