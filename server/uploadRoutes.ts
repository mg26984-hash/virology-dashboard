import { Router, Request, Response } from "express";
import multer from "multer";
import AdmZip from "adm-zip";
import { nanoid } from "nanoid";
import crypto from "crypto";
import { sdk } from "./_core/sdk";
import { storagePut } from "./storage";
import { createDocument, getDocumentById, getDb } from "./db";
import { processUploadedDocument } from "./documentProcessor";
import { documents } from "../drizzle/schema";
import { eq } from "drizzle-orm";

// Compute SHA-256 hash of file content for deduplication
function computeFileHash(buffer: Buffer): string {
  return crypto.createHash("sha256").update(buffer).digest("hex");
}

// Check if a file with the same hash already exists in the database
async function isDuplicate(fileHash: string): Promise<{ duplicate: boolean; existingDocId?: number }> {
  const db = await getDb();
  if (!db) return { duplicate: false };
  const existing = await db.select({ id: documents.id, processingStatus: documents.processingStatus })
    .from(documents)
    .where(eq(documents.fileHash, fileHash))
    .limit(1);
  if (existing.length > 0) {
    return { duplicate: true, existingDocId: existing[0].id };
  }
  return { duplicate: false };
}

// In-memory storage for multer — files up to 250MB
const storage = multer.memoryStorage();
const upload = multer({
  storage,
  limits: { fileSize: 250 * 1024 * 1024 }, // 250MB
});

// Track batch processing progress in memory
interface BatchProgress {
  total: number;
  uploaded: number;
  processing: number;
  processed: number;
  failed: number;
  skippedDuplicates: number;
  documentIds: number[];
  errors: string[];
  status: "uploading" | "processing" | "complete" | "error";
  startedAt: number;
}

const batchProgress = new Map<string, BatchProgress>();

// Clean up old batch progress entries after 1 hour
setInterval(() => {
  const now = Date.now();
  const keys = Array.from(batchProgress.keys());
  for (const key of keys) {
    const val = batchProgress.get(key);
    if (val && now - val.startedAt > 3600000) {
      batchProgress.delete(key);
    }
  }
}, 300000);

const router = Router();

/**
 * POST /api/upload/files
 * Multipart upload for images/PDFs (up to 500 files at once)
 * Includes SHA-256 deduplication: files already in the database are skipped.
 */
router.post("/files", upload.array("files", 500), async (req: Request, res: Response) => {
  try {
    let user;
    try {
      user = await sdk.authenticateRequest(req);
    } catch (authErr) {
      res.status(403).json({ error: "Unauthorized - please log in" });
      return;
    }
    if (!user || user.status !== "approved") {
      res.status(403).json({ error: "Unauthorized or not approved" });
      return;
    }

    const files = req.files as Express.Multer.File[];
    if (!files || files.length === 0) {
      res.status(400).json({ error: "No files provided" });
      return;
    }

    const batchId = nanoid();
    const allowedTypes = ["image/jpeg", "image/png", "application/pdf"];

    // Filter valid files
    const validFiles = files.filter((f) => allowedTypes.includes(f.mimetype));
    if (validFiles.length === 0) {
      res.status(400).json({ error: "No valid files. Only JPEG, PNG, and PDF are supported." });
      return;
    }

    // Initialize progress
    batchProgress.set(batchId, {
      total: validFiles.length,
      uploaded: 0,
      processing: 0,
      processed: 0,
      failed: 0,
      skippedDuplicates: 0,
      documentIds: [],
      errors: [],
      status: "uploading",
      startedAt: Date.now(),
    });

    // Return immediately with batchId — processing happens in background
    res.json({
      batchId,
      total: validFiles.length,
      skipped: files.length - validFiles.length,
      message: "Upload started. Poll /api/upload/progress/:batchId for status.",
    });

    // Process files in background
    processFileBatch(batchId, validFiles, user.id).catch((err) => {
      console.error(`[Upload] Batch ${batchId} failed:`, err);
      const progress = batchProgress.get(batchId);
      if (progress) {
        progress.status = "error";
        progress.errors.push(err.message || "Batch processing failed");
      }
    });
  } catch (error) {
    console.error("[Upload] Error:", error);
    res.status(500).json({ error: error instanceof Error ? error.message : "Upload failed" });
  }
});

/**
 * POST /api/upload/zip
 * Single ZIP file upload, extracted and processed server-side
 */
router.post("/zip", upload.single("file"), async (req: Request, res: Response) => {
  try {
    let user;
    try {
      user = await sdk.authenticateRequest(req);
    } catch (authErr) {
      res.status(403).json({ error: "Unauthorized - please log in" });
      return;
    }
    if (!user || user.status !== "approved") {
      res.status(403).json({ error: "Unauthorized or not approved" });
      return;
    }

    const file = req.file;
    if (!file) {
      res.status(400).json({ error: "No file provided" });
      return;
    }

    const batchId = nanoid();
    const allowedExtensions = [".jpg", ".jpeg", ".png", ".pdf"];

    // Extract ZIP
    let zip: AdmZip;
    try {
      zip = new AdmZip(file.buffer);
    } catch (e) {
      res.status(400).json({ error: "Invalid ZIP file" });
      return;
    }

    const zipEntries = zip.getEntries();

    // Filter valid entries
    const validEntries = zipEntries.filter((entry) => {
      if (entry.isDirectory) return false;
      const fileName = entry.entryName.split("/").pop() || "";
      if (fileName.startsWith(".") || entry.entryName.includes("__MACOSX")) return false;
      const ext = fileName.toLowerCase().slice(fileName.lastIndexOf("."));
      return allowedExtensions.includes(ext);
    });

    if (validEntries.length === 0) {
      res.status(400).json({ error: "No valid files found in ZIP. Only JPEG, PNG, and PDF files are supported." });
      return;
    }

    // Initialize progress
    batchProgress.set(batchId, {
      total: validEntries.length,
      uploaded: 0,
      processing: 0,
      processed: 0,
      failed: 0,
      skippedDuplicates: 0,
      documentIds: [],
      errors: [],
      status: "uploading",
      startedAt: Date.now(),
    });

    // Return immediately
    res.json({
      batchId,
      total: validEntries.length,
      zipFileName: file.originalname,
      message: "ZIP uploaded. Extracting and processing files. Poll /api/upload/progress/:batchId for status.",
    });

    // Process ZIP entries in background
    processZipBatch(batchId, validEntries, user.id).catch((err) => {
      console.error(`[Upload] ZIP batch ${batchId} failed:`, err);
      const progress = batchProgress.get(batchId);
      if (progress) {
        progress.status = "error";
        progress.errors.push(err.message || "ZIP processing failed");
      }
    });
  } catch (error) {
    console.error("[Upload] ZIP error:", error);
    res.status(500).json({ error: error instanceof Error ? error.message : "ZIP upload failed" });
  }
});

/**
 * GET /api/upload/progress/:batchId
 * Poll processing progress
 */
router.get("/progress/:batchId", async (req: Request, res: Response) => {
  try {
    let user;
    try {
      user = await sdk.authenticateRequest(req);
    } catch (authErr) {
      res.status(403).json({ error: "Unauthorized - please log in" });
      return;
    }
    if (!user) {
      res.status(403).json({ error: "Unauthorized" });
      return;
    }

    const progress = batchProgress.get(req.params.batchId);
    if (!progress) {
      res.status(404).json({ error: "Batch not found" });
      return;
    }

    res.json(progress);
  } catch (error) {
    res.status(500).json({ error: "Failed to get progress" });
  }
});

// ---- Background processing functions ----

async function processFileBatch(batchId: string, files: Express.Multer.File[], userId: number) {
  const progress = batchProgress.get(batchId)!;
  progress.status = "processing";

  // Process files sequentially in batches of 3 to avoid overwhelming the server
  const BATCH_SIZE = 3;
  for (let i = 0; i < files.length; i += BATCH_SIZE) {
    const batch = files.slice(i, i + BATCH_SIZE);
    await Promise.all(
      batch.map(async (file) => {
        try {
          // Compute file hash for deduplication
          const fileHash = computeFileHash(file.buffer);
          const { duplicate } = await isDuplicate(fileHash);
          
          if (duplicate) {
            console.log(`[Upload] Skipping duplicate file: ${file.originalname} (hash: ${fileHash.substring(0, 12)}...)`);
            progress.skippedDuplicates++;
            progress.uploaded++;
            progress.processed++;
            return;
          }

          progress.processing++;
          const fileKey = `virology-reports/${userId}/${nanoid()}-${file.originalname}`;
          const { url } = await storagePut(fileKey, file.buffer, file.mimetype);
          progress.uploaded++;

          const document = await createDocument({
            uploadedBy: userId,
            fileName: file.originalname,
            fileKey,
            fileUrl: url,
            mimeType: file.mimetype,
            fileSize: file.size,
            fileHash,
            processingStatus: "pending",
          });

          progress.documentIds.push(document.id);

          // Process OCR inline (not setImmediate) so we can track progress
          try {
            await processUploadedDocument(document.id, url, file.mimetype);
            progress.processed++;
          } catch (err) {
            progress.failed++;
            progress.errors.push(`${file.originalname}: OCR failed`);
          }
        } catch (err) {
          progress.failed++;
          progress.errors.push(`${file.originalname}: ${err instanceof Error ? err.message : "Failed"}`);
        }
      })
    );
  }

  progress.status = "complete";
}

async function processZipBatch(batchId: string, entries: AdmZip.IZipEntry[], userId: number) {
  const progress = batchProgress.get(batchId)!;
  progress.status = "processing";

  const BATCH_SIZE = 3;
  for (let i = 0; i < entries.length; i += BATCH_SIZE) {
    const batch = entries.slice(i, i + BATCH_SIZE);
    await Promise.all(
      batch.map(async (entry) => {
        const fileName = entry.entryName.split("/").pop() || entry.entryName;
        try {
          const fileBuffer = entry.getData();
          
          // Compute file hash for deduplication
          const fileHash = computeFileHash(fileBuffer);
          const { duplicate } = await isDuplicate(fileHash);
          
          if (duplicate) {
            console.log(`[Upload] Skipping duplicate file from ZIP: ${fileName} (hash: ${fileHash.substring(0, 12)}...)`);
            progress.skippedDuplicates++;
            progress.uploaded++;
            progress.processed++;
            return;
          }

          progress.processing++;
          const ext = fileName.toLowerCase().slice(fileName.lastIndexOf("."));

          let mimeType = "application/octet-stream";
          if (ext === ".jpg" || ext === ".jpeg") mimeType = "image/jpeg";
          else if (ext === ".png") mimeType = "image/png";
          else if (ext === ".pdf") mimeType = "application/pdf";

          const fileKey = `virology-reports/${userId}/${nanoid()}-${fileName}`;
          const { url } = await storagePut(fileKey, fileBuffer, mimeType);
          progress.uploaded++;

          const document = await createDocument({
            uploadedBy: userId,
            fileName,
            fileKey,
            fileUrl: url,
            mimeType,
            fileSize: fileBuffer.length,
            fileHash,
            processingStatus: "pending",
          });

          progress.documentIds.push(document.id);

          // Process OCR inline
          try {
            await processUploadedDocument(document.id, url, mimeType);
            progress.processed++;
          } catch (err) {
            progress.failed++;
            progress.errors.push(`${fileName}: OCR failed`);
          }
        } catch (err) {
          progress.failed++;
          progress.errors.push(`${fileName}: ${err instanceof Error ? err.message : "Failed"}`);
        }
      })
    );
  }

  progress.status = "complete";
}

/**
 * POST /api/upload/quick
 * Token-based upload endpoint for iOS Shortcuts and share-to flows.
 * Accepts multipart files with an upload token (no cookie needed).
 * Token is passed as a query param or Authorization header.
 */
router.post("/quick", upload.array("images", 50), async (req: Request, res: Response) => {
  try {
    // Get token from query param, header, or form field
    const token = (req.query.token as string) || req.headers["x-upload-token"] as string || (req.body && req.body.token);
    if (!token) {
      res.status(401).json({ error: "Upload token required. Generate one from the dashboard." });
      return;
    }

    // Validate token
    const { validateUploadToken } = await import("./db");
    const { valid, userId } = await validateUploadToken(token);
    if (!valid || !userId) {
      res.status(401).json({ error: "Invalid or expired upload token. Please generate a new one." });
      return;
    }

    const files = req.files as Express.Multer.File[];
    if (!files || files.length === 0) {
      res.status(400).json({ error: "No files provided" });
      return;
    }

    const allowedTypes = ["image/jpeg", "image/png", "application/pdf"];
    const validFiles = files.filter((f) => allowedTypes.includes(f.mimetype));
    if (validFiles.length === 0) {
      res.status(400).json({ error: "No valid image files. Only JPEG, PNG, and PDF are supported." });
      return;
    }

    const results: { fileName: string; status: string; documentId?: number }[] = [];
    let newCount = 0;
    let dupCount = 0;

    for (const file of validFiles) {
      const fileHash = computeFileHash(file.buffer);
      const { duplicate } = await isDuplicate(fileHash);

      if (duplicate) {
        dupCount++;
        results.push({ fileName: file.originalname, status: "duplicate" });
        continue;
      }

      const fileKey = `virology-reports/${userId}/${nanoid()}-${file.originalname}`;
      const { url } = await storagePut(fileKey, file.buffer, file.mimetype);

      const document = await createDocument({
        uploadedBy: userId,
        fileName: file.originalname,
        fileKey,
        fileUrl: url,
        mimeType: file.mimetype,
        fileSize: file.size,
        fileHash,
        processingStatus: "pending",
      });

      newCount++;
      results.push({ fileName: file.originalname, status: "uploaded", documentId: document.id });
    }

    res.json({
      success: true,
      message: `${newCount} new file(s) uploaded, ${dupCount} duplicate(s) skipped. Processing will begin automatically.`,
      total: validFiles.length,
      new: newCount,
      duplicates: dupCount,
      results,
    });
  } catch (error) {
    console.error("[Quick Upload] Error:", error);
    res.status(500).json({ error: error instanceof Error ? error.message : "Upload failed" });
  }
});

export default router;
