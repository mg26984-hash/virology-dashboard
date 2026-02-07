import { getDb } from "./db";
import { documents } from "../drizzle/schema";
import { eq, asc, sql } from "drizzle-orm";
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

/**
 * Manually trigger processing of ALL pending documents immediately.
 * Processes in continuous batches of 3 until no pending documents remain.
 * Returns a summary of what was processed.
 * 
 * This is the admin "Process All Pending" action — it does not wait for
 * the 30-second worker interval but runs a tight loop instead.
 */
export async function triggerProcessAllPending(): Promise<{
  totalProcessed: number;
  completed: number;
  failed: number;
  discarded: number;
  duplicate: number;
}> {
  if (isProcessing) {
    // Wait briefly for current cycle to finish, then proceed
    console.log("[BackgroundWorker] Waiting for current cycle to finish before manual trigger...");
    await new Promise<void>((resolve) => {
      const check = setInterval(() => {
        if (!isProcessing) {
          clearInterval(check);
          resolve();
        }
      }, 500);
      // Safety timeout: don't wait more than 60 seconds
      setTimeout(() => { clearInterval(check); resolve(); }, 60000);
    });
  }

  isProcessing = true;
  const summary = { totalProcessed: 0, completed: 0, failed: 0, discarded: 0, duplicate: 0 };

  try {
    const db = await getDb();
    if (!db) {
      console.log("[BackgroundWorker] Database not available for manual trigger");
      return summary;
    }

    // Get total pending count for logging
    const [countResult] = await db
      .select({ count: sql<number>`COUNT(*)` })
      .from(documents)
      .where(eq(documents.processingStatus, "pending"));
    const totalPending = Number(countResult?.count) || 0;

    if (totalPending === 0) {
      console.log("[BackgroundWorker] Manual trigger: no pending documents found");
      return summary;
    }

    console.log(`[BackgroundWorker] Manual trigger: processing ${totalPending} pending document(s)...`);

    // Process in continuous batches of 3 until none remain
    const BATCH_SIZE = 3;
    let hasMore = true;

    while (hasMore) {
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
        .limit(BATCH_SIZE);

      if (pendingDocs.length === 0) {
        hasMore = false;
        break;
      }

      for (const doc of pendingDocs) {
        try {
          console.log(
            `[BackgroundWorker] Manual: Processing #${doc.id}: ${doc.fileName}`
          );
          const result = await processUploadedDocument(
            doc.id,
            doc.fileUrl,
            doc.mimeType || "image/jpeg"
          );
          summary.totalProcessed++;

          if (result.status === "completed") summary.completed++;
          else if (result.status === "failed") summary.failed++;
          else if (result.status === "discarded") summary.discarded++;
          else if (result.status === "duplicate") summary.duplicate++;

          console.log(
            `[BackgroundWorker] Manual: #${doc.id} → ${result.status} (${summary.totalProcessed}/${totalPending})`
          );
        } catch (err) {
          summary.totalProcessed++;
          summary.failed++;
          console.error(`[BackgroundWorker] Manual: Error on #${doc.id}:`, err);
        }
      }
    }

    console.log(
      `[BackgroundWorker] Manual trigger complete: ${summary.totalProcessed} processed ` +
      `(${summary.completed} completed, ${summary.failed} failed, ${summary.discarded} discarded, ${summary.duplicate} duplicate)`
    );
  } catch (error) {
    console.error("[BackgroundWorker] Error in manual trigger:", error);
  } finally {
    isProcessing = false;
  }

  return summary;
}
