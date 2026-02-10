import { getDb } from "./db";
import { documents } from "../drizzle/schema";
import { eq, asc, sql, and, lt, or } from "drizzle-orm";
import { processUploadedDocument } from "./documentProcessor";
import { notifyOwner } from "./_core/notification";

const MAX_RETRIES = 3;

let isProcessing = false;
let workerInterval: ReturnType<typeof setInterval> | null = null;

/**
 * Reset a failed document back to "pending" for retry, incrementing retryCount.
 * Returns true if the document was reset, false if max retries exceeded.
 */
async function resetFailedForRetry(db: any, docId: number, currentRetryCount: number): Promise<boolean> {
  if (currentRetryCount >= MAX_RETRIES) {
    return false;
  }
  await db
    .update(documents)
    .set({
      processingStatus: "pending",
      retryCount: currentRetryCount + 1,
      processingError: `Auto-retry ${currentRetryCount + 1}/${MAX_RETRIES} scheduled`,
    })
    .where(eq(documents.id, docId));
  return true;
}

/**
 * Background worker that picks up pending documents and processes them.
 * Runs on a configurable interval (default: every 30 seconds).
 * Processes documents in batches of 3 to avoid overwhelming the LLM API.
 * 
 * Also auto-retries failed documents up to MAX_RETRIES times.
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

    // Auto-retry: pick up failed documents that haven't exceeded MAX_RETRIES
    const failedDocs = await db
      .select({
        id: documents.id,
        retryCount: documents.retryCount,
        fileName: documents.fileName,
      })
      .from(documents)
      .where(
        and(
          eq(documents.processingStatus, "failed"),
          lt(documents.retryCount, MAX_RETRIES)
        )
      )
      .orderBy(asc(documents.updatedAt))
      .limit(5);

    for (const doc of failedDocs) {
      const wasReset = await resetFailedForRetry(db, doc.id, doc.retryCount);
      if (wasReset) {
        console.log(
          `[BackgroundWorker] Auto-retry: reset document #${doc.id} (${doc.fileName}) for retry ${doc.retryCount + 1}/${MAX_RETRIES}`
        );
      }
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

        // Send processing status notification to owner
        if (result.status === 'completed') {
          const skipInfo = result.testsSkipped ? `, ${result.testsSkipped} duplicate(s) skipped` : '';
          notifyOwner({
            title: `\u2705 Processed: ${doc.fileName}`,
            content: `${result.testsCreated} test(s) extracted${skipInfo}`,
          }).catch(() => {});
        } else if (result.status === 'discarded') {
          notifyOwner({
            title: `\u26a0\ufe0f Discarded: ${doc.fileName}`,
            content: result.duplicateInfo || result.error || 'No valid test results found',
          }).catch(() => {});
        } else if (result.status === 'failed') {
          // Only notify on final failure (retryCount >= MAX_RETRIES - 1)
          const docRecord = await db.select({ retryCount: documents.retryCount }).from(documents).where(eq(documents.id, doc.id)).limit(1);
          const retries = docRecord[0]?.retryCount ?? 0;
          if (retries >= MAX_RETRIES - 1) {
            notifyOwner({
              title: `\u274c Failed: ${doc.fileName}`,
              content: `Processing failed after ${MAX_RETRIES} attempts. Error: ${result.error || 'Unknown error'}`,
            }).catch(() => {});
          }
        }
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

/**
 * Retry all permanently failed documents (retryCount >= MAX_RETRIES).
 * Resets them to pending with retryCount = 0 for a fresh start.
 * Returns the number of documents reset.
 */
export async function retryAllFailed(): Promise<number> {
  const db = await getDb();
  if (!db) return 0;

  const result = await db
    .update(documents)
    .set({
      processingStatus: "pending",
      retryCount: 0,
      processingError: "Manual retry - all counts reset",
    })
    .where(eq(documents.processingStatus, "failed"));

  const count = (result as any)?.[0]?.affectedRows || 0;
  console.log(`[BackgroundWorker] Manual retry: reset ${count} failed document(s) to pending`);
  return count;
}
