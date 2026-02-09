/**
 * Large ZIP Processor
 * 
 * Handles ZIP files that are too large to fit in memory by:
 * 1. Writing the ZIP to a temp file on disk
 * 2. Using AdmZip to read entries one at a time from the disk file
 * 3. Processing each entry sequentially (upload to S3, create document, OCR)
 * 4. Cleaning up the temp file when done
 * 5. Persisting progress to the database so it survives page refreshes
 * 
 * This avoids holding the entire ZIP + all extracted files in memory simultaneously.
 */

import fs from "fs";
import path from "path";
import os from "os";
import AdmZip from "adm-zip";
import crypto from "crypto";
import { nanoid } from "nanoid";
import { storagePut } from "./storage";
import { createDocument, getDb } from "./db";
import { processUploadedDocument } from "./documentProcessor";
import { documents } from "../drizzle/schema";
import { eq } from "drizzle-orm";
import {
  createUploadBatch,
  updateUploadBatch,
  getUploadBatchByJobId,
} from "./uploadBatchDb";

const ALLOWED_EXTENSIONS = [".jpg", ".jpeg", ".png", ".pdf"];
const TEMP_DIR = path.join(os.tmpdir(), "virology-zip-uploads");

// Ensure temp directory exists
if (!fs.existsSync(TEMP_DIR)) {
  fs.mkdirSync(TEMP_DIR, { recursive: true });
}

// Track active large ZIP processing jobs (in-memory cache, backed by DB)
export interface LargeZipProgress {
  jobId: string;
  fileName: string;
  status: "extracting" | "processing" | "complete" | "error";
  totalEntries: number;
  processedEntries: number;
  uploadedToS3: number;
  skippedDuplicates: number;
  failed: number;
  documentIds: number[];
  errors: string[];
  startedAt: number;
  completedAt?: number;
}

const activeJobs = new Map<string, LargeZipProgress>();

// Clean up old in-memory jobs after 2 hours (DB records persist forever)
setInterval(() => {
  const now = Date.now();
  for (const [jobId, job] of Array.from(activeJobs.entries())) {
    if (now - job.startedAt > 2 * 60 * 60 * 1000) {
      activeJobs.delete(jobId);
    }
  }
}, 10 * 60 * 1000);

// Clean up old temp files on startup and periodically
function cleanupTempFiles() {
  try {
    if (!fs.existsSync(TEMP_DIR)) return;
    const files = fs.readdirSync(TEMP_DIR);
    const now = Date.now();
    for (const file of files) {
      const filePath = path.join(TEMP_DIR, file);
      try {
        const stat = fs.statSync(filePath);
        // Delete temp files older than 1 hour
        if (now - stat.mtimeMs > 60 * 60 * 1000) {
          fs.unlinkSync(filePath);
          console.log(`[LargeZip] Cleaned up old temp file: ${file}`);
        }
      } catch (e) {
        // Ignore errors on individual files
      }
    }
  } catch (e) {
    console.error("[LargeZip] Error cleaning temp files:", e);
  }
}

// Clean up on startup
cleanupTempFiles();
// Clean up every 30 minutes
setInterval(cleanupTempFiles, 30 * 60 * 1000);

/**
 * Compute SHA-256 hash of file content for deduplication
 */
function computeFileHash(buffer: Buffer): string {
  return crypto.createHash("sha256").update(buffer).digest("hex");
}

/**
 * Check if a file with the same hash already exists in the database
 */
async function isDuplicate(fileHash: string): Promise<boolean> {
  const db = await getDb();
  if (!db) return false;
  const existing = await db
    .select({ id: documents.id })
    .from(documents)
    .where(eq(documents.fileHash, fileHash))
    .limit(1);
  return existing.length > 0;
}

/**
 * Get the progress of a large ZIP processing job.
 * First checks in-memory cache, then falls back to database.
 */
export function getLargeZipProgress(jobId: string): LargeZipProgress | null {
  return activeJobs.get(jobId) || null;
}

/**
 * Get the progress of a large ZIP processing job from the database.
 * Used when the in-memory cache has been cleared (e.g., after page refresh).
 */
export async function getLargeZipProgressFromDb(
  jobId: string
): Promise<LargeZipProgress | null> {
  // Check in-memory first (most up-to-date during active processing)
  const inMemory = activeJobs.get(jobId);
  if (inMemory) return inMemory;

  // Fall back to database
  const dbRecord = await getUploadBatchByJobId(jobId);
  if (!dbRecord) return null;

  return {
    jobId: dbRecord.jobId,
    fileName: dbRecord.fileName,
    status: dbRecord.status as LargeZipProgress["status"],
    totalEntries: dbRecord.totalEntries,
    processedEntries: dbRecord.processedEntries,
    uploadedToS3: dbRecord.uploadedToS3,
    skippedDuplicates: dbRecord.skippedDuplicates,
    failed: dbRecord.failed,
    documentIds: [],
    errors: dbRecord.errors ? JSON.parse(dbRecord.errors) : [],
    startedAt: dbRecord.startedAt,
    completedAt: dbRecord.completedAt ?? undefined,
  };
}

/**
 * Write a buffer to a temp file on disk
 */
function writeTempFile(buffer: Buffer, fileName: string): string {
  const tempFileName = `${nanoid()}-${fileName}`;
  const tempFilePath = path.join(TEMP_DIR, tempFileName);
  fs.writeFileSync(tempFilePath, buffer);
  console.log(
    `[LargeZip] Written ${buffer.length} bytes to temp file: ${tempFilePath}`
  );
  return tempFilePath;
}

/**
 * Persist current progress to the database.
 * Called periodically during processing and on completion/error.
 */
async function persistProgress(progress: LargeZipProgress): Promise<void> {
  try {
    await updateUploadBatch(progress.jobId, {
      status: progress.status,
      totalEntries: progress.totalEntries,
      processedEntries: progress.processedEntries,
      uploadedToS3: progress.uploadedToS3,
      skippedDuplicates: progress.skippedDuplicates,
      failed: progress.failed,
      errors: progress.errors.length > 0 ? JSON.stringify(progress.errors) : null,
      completedAt: progress.completedAt ?? null,
    });
  } catch (err) {
    console.error(
      `[LargeZip] Failed to persist progress for job ${progress.jobId}:`,
      err
    );
  }
}

/**
 * Process a large ZIP file from disk.
 * 
 * Strategy:
 * - Open the ZIP from disk (AdmZip can read from file path, which is more memory-efficient)
 * - Get the list of valid entries
 * - Process each entry one at a time: extract -> hash -> dedup check -> upload to S3 -> create document
 * - The background worker will pick up the pending documents for OCR
 * - Progress is persisted to the database every 10 entries and on completion
 * 
 * @param zipBuffer - The ZIP file buffer (will be written to disk immediately)
 * @param fileName - Original file name
 * @param userId - The user who uploaded the file
 * @returns jobId for tracking progress
 */
export async function processLargeZip(
  zipBuffer: Buffer,
  fileName: string,
  userId: number
): Promise<string> {
  const jobId = nanoid();

  // Initialize progress
  const progress: LargeZipProgress = {
    jobId,
    fileName,
    status: "extracting",
    totalEntries: 0,
    processedEntries: 0,
    uploadedToS3: 0,
    skippedDuplicates: 0,
    failed: 0,
    documentIds: [],
    errors: [],
    startedAt: Date.now(),
  };
  activeJobs.set(jobId, progress);

  // Persist initial record to database
  try {
    await createUploadBatch({
      jobId,
      userId,
      fileName,
      status: "extracting",
      totalEntries: 0,
      processedEntries: 0,
      uploadedToS3: 0,
      skippedDuplicates: 0,
      failed: 0,
      errors: null,
      startedAt: Date.now(),
      completedAt: null,
    });
  } catch (err) {
    console.error(`[LargeZip] Failed to create DB record for job ${jobId}:`, err);
    // Continue anyway - in-memory tracking still works
  }

  // Write ZIP to disk immediately to free memory
  let tempFilePath: string;
  try {
    tempFilePath = writeTempFile(zipBuffer, fileName);
  } catch (err) {
    progress.status = "error";
    progress.errors.push(
      `Failed to write temp file: ${err instanceof Error ? err.message : "Unknown error"}`
    );
    await persistProgress(progress);
    return jobId;
  }

  // Start processing in background
  processZipFromDisk(jobId, tempFilePath, userId).catch((err) => {
    console.error(`[LargeZip] Job ${jobId} failed:`, err);
    progress.status = "error";
    progress.errors.push(
      err instanceof Error ? err.message : "Processing failed"
    );
    persistProgress(progress);
  });

  return jobId;
}

/**
 * Process a ZIP file from a disk path.
 * Opens the ZIP, iterates entries one at a time, and processes each.
 */
async function processZipFromDisk(
  jobId: string,
  tempFilePath: string,
  userId: number
): Promise<void> {
  const progress = activeJobs.get(jobId)!;

  try {
    // Open ZIP from disk (more memory-efficient than from buffer)
    console.log(`[LargeZip] Opening ZIP from disk: ${tempFilePath}`);
    const zip = new AdmZip(tempFilePath);
    const allEntries = zip.getEntries();

    // Filter valid entries
    const validEntries = allEntries.filter((entry) => {
      if (entry.isDirectory) return false;
      const entryFileName = entry.entryName.split("/").pop() || "";
      if (
        entryFileName.startsWith(".") ||
        entry.entryName.includes("__MACOSX")
      )
        return false;
      const ext = entryFileName
        .toLowerCase()
        .slice(entryFileName.lastIndexOf("."));
      return ALLOWED_EXTENSIONS.includes(ext);
    });

    progress.totalEntries = validEntries.length;
    progress.status = "processing";
    console.log(
      `[LargeZip] Job ${jobId}: Found ${validEntries.length} valid entries out of ${allEntries.length} total`
    );

    // Persist the entry count
    await persistProgress(progress);

    if (validEntries.length === 0) {
      progress.status = "complete";
      progress.completedAt = Date.now();
      await persistProgress(progress);
      // Clean up temp file
      try {
        fs.unlinkSync(tempFilePath);
      } catch (e) {
        /* ignore */
      }
      return;
    }

    // Process entries one at a time to minimize memory usage
    for (let i = 0; i < validEntries.length; i++) {
      const entry = validEntries[i];
      const entryFileName =
        entry.entryName.split("/").pop() || entry.entryName;

      try {
        // Extract single entry data
        const fileBuffer = entry.getData();

        // Compute hash for deduplication
        const fileHash = computeFileHash(fileBuffer);
        const duplicate = await isDuplicate(fileHash);

        if (duplicate) {
          console.log(
            `[LargeZip] Job ${jobId}: Skipping duplicate: ${entryFileName}`
          );
          progress.skippedDuplicates++;
          progress.processedEntries++;
          continue;
        }

        // Determine MIME type
        const ext = entryFileName
          .toLowerCase()
          .slice(entryFileName.lastIndexOf("."));
        let mimeType = "application/octet-stream";
        if (ext === ".jpg" || ext === ".jpeg") mimeType = "image/jpeg";
        else if (ext === ".png") mimeType = "image/png";
        else if (ext === ".pdf") mimeType = "application/pdf";

        // Upload to S3
        const fileKey = `virology-reports/${userId}/${nanoid()}-${entryFileName}`;
        const { url } = await storagePut(fileKey, fileBuffer, mimeType);
        progress.uploadedToS3++;

        // Create document record (status: pending - background worker will process OCR)
        const document = await createDocument({
          uploadedBy: userId,
          fileName: entryFileName,
          fileKey,
          fileUrl: url,
          mimeType,
          fileSize: fileBuffer.length,
          fileHash,
          processingStatus: "pending",
        });

        progress.documentIds.push(document.id);
        progress.processedEntries++;

        // Persist to DB every 10 entries to avoid too many writes
        if ((i + 1) % 10 === 0) {
          await persistProgress(progress);
        }

        // Log progress every 50 entries
        if ((i + 1) % 50 === 0 || i === validEntries.length - 1) {
          console.log(
            `[LargeZip] Job ${jobId}: ${progress.processedEntries}/${progress.totalEntries} processed ` +
              `(${progress.uploadedToS3} uploaded, ${progress.skippedDuplicates} duplicates, ${progress.failed} failed)`
          );
        }
      } catch (err) {
        progress.failed++;
        progress.processedEntries++;
        const errorMsg = `${entryFileName}: ${err instanceof Error ? err.message : "Failed"}`;
        progress.errors.push(errorMsg);
        console.error(
          `[LargeZip] Job ${jobId}: Error processing ${entryFileName}:`,
          err
        );
      }
    }

    progress.status = "complete";
    progress.completedAt = Date.now();
    await persistProgress(progress);

    const duration = (
      (progress.completedAt - progress.startedAt) /
      1000
    ).toFixed(1);
    console.log(
      `[LargeZip] Job ${jobId} complete in ${duration}s: ` +
        `${progress.uploadedToS3} uploaded, ${progress.skippedDuplicates} duplicates, ${progress.failed} failed`
    );
  } catch (err) {
    progress.status = "error";
    progress.errors.push(
      err instanceof Error ? err.message : "ZIP processing failed"
    );
    await persistProgress(progress);
    console.error(`[LargeZip] Job ${jobId} error:`, err);
  } finally {
    // Clean up temp file
    try {
      if (fs.existsSync(tempFilePath)) {
        fs.unlinkSync(tempFilePath);
        console.log(`[LargeZip] Cleaned up temp file: ${tempFilePath}`);
      }
    } catch (e) {
      console.error(`[LargeZip] Failed to clean up temp file:`, e);
    }
  }
}

/**
 * Process a large ZIP that was uploaded as a file to disk via multer diskStorage.
 * This avoids the buffer entirely - multer writes directly to disk.
 * 
 * @param diskPath - Path where multer saved the file
 * @param originalName - Original file name
 * @param userId - The user who uploaded the file
 * @returns jobId for tracking progress
 */
export async function processLargeZipFromDisk(
  diskPath: string,
  originalName: string,
  userId: number
): Promise<string> {
  const jobId = nanoid();

  // Initialize progress
  const progress: LargeZipProgress = {
    jobId,
    fileName: originalName,
    status: "extracting",
    totalEntries: 0,
    processedEntries: 0,
    uploadedToS3: 0,
    skippedDuplicates: 0,
    failed: 0,
    documentIds: [],
    errors: [],
    startedAt: Date.now(),
  };
  activeJobs.set(jobId, progress);

  // Persist initial record to database
  try {
    await createUploadBatch({
      jobId,
      userId,
      fileName: originalName,
      status: "extracting",
      totalEntries: 0,
      processedEntries: 0,
      uploadedToS3: 0,
      skippedDuplicates: 0,
      failed: 0,
      errors: null,
      startedAt: Date.now(),
      completedAt: null,
    });
  } catch (err) {
    console.error(`[LargeZip] Failed to create DB record for job ${jobId}:`, err);
  }

  // Start processing in background
  processZipFromDisk(jobId, diskPath, userId).catch((err) => {
    console.error(`[LargeZip] Job ${jobId} failed:`, err);
    progress.status = "error";
    progress.errors.push(
      err instanceof Error ? err.message : "Processing failed"
    );
    persistProgress(progress);
  });

  return jobId;
}
