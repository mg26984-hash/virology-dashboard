import { Router, Request, Response } from "express";
import multer from "multer";
import AdmZip from "adm-zip";
import sharp from "sharp";
import { nanoid } from "nanoid";
import crypto from "crypto";
import path from "path";
import os from "os";
import fs from "fs";
import { sdk } from "./_core/sdk";
import { storagePut } from "./storage";
import { createDocument, getDocumentById, getDb } from "./db";
import { processUploadedDocument } from "./documentProcessor";
import { documents } from "../drizzle/schema";
import { eq } from "drizzle-orm";
import { processLargeZipFromDisk, getLargeZipProgress, getLargeZipProgressFromDb } from "./largeZipProcessor";
import { chunkedZipRouter } from "./chunkedZipUpload";

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

// ── Multer configurations ──

// In-memory storage for regular uploads (images/PDFs up to 250MB)
const memoryStorage = multer.memoryStorage();
const upload = multer({
  storage: memoryStorage,
  limits: { fileSize: 250 * 1024 * 1024 }, // 250MB
});

// Disk storage for large ZIP files (up to 1.5GB)
const LARGE_ZIP_TEMP_DIR = path.join(os.tmpdir(), "virology-large-zip-uploads");
if (!fs.existsSync(LARGE_ZIP_TEMP_DIR)) {
  fs.mkdirSync(LARGE_ZIP_TEMP_DIR, { recursive: true });
}

const diskStorage = multer.diskStorage({
  destination: (_req, _file, cb) => {
    // Ensure directory exists on every upload (may have been cleaned up)
    if (!fs.existsSync(LARGE_ZIP_TEMP_DIR)) {
      fs.mkdirSync(LARGE_ZIP_TEMP_DIR, { recursive: true });
    }
    cb(null, LARGE_ZIP_TEMP_DIR);
  },
  filename: (_req, file, cb) => {
    const uniqueName = `${nanoid()}-${file.originalname}`;
    cb(null, uniqueName);
  },
});

const uploadLargeZip = multer({
  storage: diskStorage,
  limits: { fileSize: 1.5 * 1024 * 1024 * 1024 }, // 1.5GB
  fileFilter: (_req, file, cb) => {
    // Only accept ZIP files
    const isZip = file.mimetype === "application/zip" ||
      file.mimetype === "application/x-zip-compressed" ||
      file.originalname.toLowerCase().endsWith(".zip");
    if (!isZip) {
      cb(new Error("Only ZIP files are accepted on this endpoint"));
      return;
    }
    cb(null, true);
  },
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
    const heicTypes = ["image/heic", "image/heif", "image/heic-sequence", "image/heif-sequence"];

    // Convert HEIC files to JPEG before processing
    const heicFiles = files.filter((f) => heicTypes.includes(f.mimetype) || /\.hei[cf]$/i.test(f.originalname));
    for (const heicFile of heicFiles) {
      try {
        const converted = await convertHeicToJpeg(heicFile.buffer, heicFile.originalname);
        heicFile.buffer = converted.buffer;
        heicFile.originalname = converted.originalname;
        heicFile.mimetype = converted.mimetype;
        heicFile.size = converted.size;
        console.log(`[Upload] Converted HEIC: ${heicFile.originalname} (${converted.size} bytes)`);
      } catch (e) {
        console.error("[Upload] HEIC conversion failed:", heicFile.originalname, e);
      }
    }

    // Filter valid files (including now-converted HEIC files)
    const validFiles = files.filter((f) => allowedTypes.includes(f.mimetype));
    if (validFiles.length === 0) {
      res.status(400).json({ error: "No valid files. Supported: JPEG, PNG, HEIC, and PDF." });
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
 * POST /api/upload/zip/large
 * Large ZIP file upload endpoint.
 * Uses disk storage (multer writes directly to temp file) to handle ZIPs up to 1.5GB.
 * Processes entries sequentially from disk without loading the entire ZIP into memory.
 * Returns a jobId for polling progress via /api/upload/zip/large/progress/:jobId
 */
router.post("/zip/large", uploadLargeZip.single("file"), async (req: Request, res: Response) => {
  try {
    // Authenticate: support both session (cookie) and token (query param)
    let userId: number | undefined;

    // Try token auth first (for Quick Upload / iOS Shortcut)
    const token = (req.query.token as string) || req.headers["x-upload-token"] as string;
    if (token) {
      const { validateUploadToken } = await import("./db");
      const { valid, userId: tokenUserId } = await validateUploadToken(token);
      if (valid && tokenUserId) {
        userId = tokenUserId;
      }
    }

    // Fall back to session auth
    if (!userId) {
      try {
        const user = await sdk.authenticateRequest(req);
        if (user && user.status === "approved") {
          userId = user.id;
        }
      } catch (authErr) {
        // Ignore auth errors if token was also invalid
      }
    }

    if (!userId) {
      // Clean up the uploaded temp file
      if (req.file?.path) {
        try { fs.unlinkSync(req.file.path); } catch (e) { /* ignore */ }
      }
      res.status(403).json({ error: "Unauthorized - please log in or provide a valid upload token" });
      return;
    }

    const file = req.file;
    if (!file) {
      res.status(400).json({ error: "No file provided. Send a ZIP file in the 'file' field." });
      return;
    }

    console.log(`[Upload] Large ZIP received: ${file.originalname}, size: ${(file.size / 1024 / 1024).toFixed(1)}MB, path: ${file.path}`);

    // Start processing from disk (background)
    const jobId = await processLargeZipFromDisk(file.path, file.originalname, userId);

    res.json({
      success: true,
      jobId,
      fileName: file.originalname,
      fileSize: file.size,
      fileSizeMB: Math.round(file.size / 1024 / 1024),
      message: `Large ZIP received (${Math.round(file.size / 1024 / 1024)}MB). Processing entries from disk. Poll /api/upload/zip/large/progress/${jobId} for status.`,
    });
  } catch (error) {
    // Clean up temp file on error
    if (req.file?.path) {
      try { fs.unlinkSync(req.file.path); } catch (e) { /* ignore */ }
    }
    console.error("[Upload] Large ZIP error:", error);
    res.status(500).json({ error: error instanceof Error ? error.message : "Large ZIP upload failed" });
  }
});

/**
 * GET /api/upload/zip/large/progress/:jobId
 * Poll the progress of a large ZIP processing job.
 */
router.get("/zip/large/progress/:jobId", async (req: Request, res: Response) => {
  try {
    // Try in-memory first (most up-to-date during active processing), then fall back to DB
    const progress = await getLargeZipProgressFromDb(req.params.jobId);
    if (!progress) {
      res.status(404).json({ error: "Job not found" });
      return;
    }
    res.json(progress);
  } catch (error) {
    res.status(500).json({ error: "Failed to get progress" });
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
// Helper: convert HEIC/HEIF to JPEG using sharp
async function convertHeicToJpeg(buffer: Buffer, originalName: string): Promise<{ buffer: Buffer; originalname: string; mimetype: string; size: number }> {
  const jpegBuffer = await sharp(buffer).jpeg({ quality: 90 }).toBuffer();
  const newName = originalName.replace(/\.hei[cf]$/i, ".jpg");
  return { buffer: jpegBuffer, originalname: newName, mimetype: "image/jpeg", size: jpegBuffer.length };
}

router.post("/quick", upload.any(), async (req: Request, res: Response) => {
  try {
    // Get token from query param, header, or form field
    const token = (req.query.token as string) || req.headers["x-upload-token"] as string || (req.body && req.body.token);
    console.log("[Quick Upload] Request received. Token present:", !!token, "Content-Type:", req.headers["content-type"]);

    if (!token) {
      console.log("[Quick Upload] No token found in query, header, or body");
      res.status(401).json({ error: "Upload token required. Generate one from the dashboard." });
      return;
    }

    // Validate token
    const { validateUploadToken } = await import("./db");
    const { valid, userId } = await validateUploadToken(token);
    if (!valid || !userId) {
      console.log("[Quick Upload] Invalid token:", token.substring(0, 8) + "...");
      res.status(401).json({ error: "Invalid or expired upload token. Please generate a new one." });
      return;
    }

    const files = req.files as Express.Multer.File[];
    console.log("[Quick Upload] Files received:", files?.length || 0, "Field names:", files?.map(f => f.fieldname).join(", ") || "none");
    if (files?.length) {
      files.forEach((f, i) => console.log(`[Quick Upload] File ${i}: name=${f.originalname}, mime=${f.mimetype}, size=${f.size}, field=${f.fieldname}`));
    }

    if (!files || files.length === 0) {
      console.log("[Quick Upload] No files in request. Body keys:", Object.keys(req.body || {}));
      res.status(400).json({ error: "No files provided. Make sure the form field type is set to File." });
      return;
    }

    const allowedTypes = ["image/jpeg", "image/png", "application/pdf"];
    const heicTypes = ["image/heic", "image/heif", "image/heic-sequence", "image/heif-sequence"];
    const zipTypes = ["application/zip", "application/x-zip-compressed"];
    const allowedExtensions = [".jpg", ".jpeg", ".png", ".pdf"];

    // Separate files by type
    const regularFiles = files.filter((f) => allowedTypes.includes(f.mimetype));
    const heicFiles = files.filter((f) => heicTypes.includes(f.mimetype) || /\.hei[cf]$/i.test(f.originalname));
    const zipFiles = files.filter((f) => zipTypes.includes(f.mimetype) || f.originalname.toLowerCase().endsWith(".zip"));
    // Accept files with unknown MIME but image-like extensions (iOS sometimes sends application/octet-stream)
    const unknownButImage = files.filter((f) => 
      !allowedTypes.includes(f.mimetype) && !heicTypes.includes(f.mimetype) && !zipTypes.includes(f.mimetype) &&
      /\.(jpg|jpeg|png|pdf)$/i.test(f.originalname)
    );

    console.log(`[Quick Upload] Regular: ${regularFiles.length}, HEIC: ${heicFiles.length}, ZIP: ${zipFiles.length}, Unknown-but-image: ${unknownButImage.length}`);

    // Extract files from ZIPs — large ZIPs go to disk-based processing
    const LARGE_ZIP_THRESHOLD = 50 * 1024 * 1024; // 50MB
    const smallZipFiles = zipFiles.filter((f) => f.size <= LARGE_ZIP_THRESHOLD);
    const largeZipFiles = zipFiles.filter((f) => f.size > LARGE_ZIP_THRESHOLD);
    const largeZipJobs: { fileName: string; jobId: string }[] = [];

    // Route large ZIPs through disk-based processing
    for (const zipFile of largeZipFiles) {
      try {
        const tmpPath = path.join(os.tmpdir(), `quick-large-${nanoid()}-${zipFile.originalname}`);
        fs.writeFileSync(tmpPath, zipFile.buffer);
        console.log(`[Quick Upload] Large ZIP detected: ${zipFile.originalname} (${(zipFile.size / 1024 / 1024).toFixed(1)}MB) → disk processing`);
        const jobId = await processLargeZipFromDisk(tmpPath, zipFile.originalname, userId);
        largeZipJobs.push({ fileName: zipFile.originalname, jobId });
      } catch (e) {
        console.error("[Quick Upload] Failed to process large ZIP:", zipFile.originalname, e);
      }
    }

    // Extract small ZIPs in-memory (existing logic)
    const extractedFiles: { buffer: Buffer; originalname: string; mimetype: string; size: number }[] = [];
    for (const zipFile of smallZipFiles) {
      try {
        const zip = new AdmZip(zipFile.buffer);
        const entries = zip.getEntries();
        for (const entry of entries) {
          if (entry.isDirectory) continue;
          const fileName = entry.entryName.split("/").pop() || "";
          if (fileName.startsWith(".") || entry.entryName.includes("__MACOSX")) continue;
          const ext = fileName.toLowerCase().slice(fileName.lastIndexOf("."));
          if (!allowedExtensions.includes(ext)) continue;
          const buffer = entry.getData();
          let mime = "application/octet-stream";
          if (ext === ".jpg" || ext === ".jpeg") mime = "image/jpeg";
          else if (ext === ".png") mime = "image/png";
          else if (ext === ".pdf") mime = "application/pdf";
          extractedFiles.push({ buffer, originalname: fileName, mimetype: mime, size: buffer.length });
        }
      } catch (e) {
        console.error("[Quick Upload] Failed to extract ZIP:", zipFile.originalname, e);
      }
    }

    // Convert HEIC files to JPEG
    const convertedHeic: { buffer: Buffer; originalname: string; mimetype: string; size: number }[] = [];
    for (const heicFile of heicFiles) {
      try {
        const converted = await convertHeicToJpeg(heicFile.buffer, heicFile.originalname);
        console.log(`[Quick Upload] Converted HEIC: ${heicFile.originalname} -> ${converted.originalname} (${converted.size} bytes)`);
        convertedHeic.push(converted);
      } catch (e) {
        console.error("[Quick Upload] HEIC conversion failed:", heicFile.originalname, e);
      }
    }

    // Map unknown-but-image files with corrected MIME types
    const correctedUnknown = unknownButImage.map((f) => {
      const ext = f.originalname.toLowerCase().slice(f.originalname.lastIndexOf("."));
      let mime = f.mimetype;
      if (ext === ".jpg" || ext === ".jpeg") mime = "image/jpeg";
      else if (ext === ".png") mime = "image/png";
      else if (ext === ".pdf") mime = "application/pdf";
      return { buffer: f.buffer, originalname: f.originalname, mimetype: mime, size: f.size };
    });

    const allFiles = [
      ...regularFiles.map((f) => ({ buffer: f.buffer, originalname: f.originalname, mimetype: f.mimetype, size: f.size })),
      ...convertedHeic,
      ...correctedUnknown,
      ...extractedFiles,
    ];
    console.log(`[Quick Upload] Total processable files: ${allFiles.length}`);
    if (allFiles.length === 0) {
      res.status(400).json({ error: "No valid files. Supported: JPEG, PNG, HEIC, PDF, and ZIP archives." });
      return;
    }

    const results: { fileName: string; status: string; documentId?: number }[] = [];
    let newCount = 0;
    let dupCount = 0;

    for (const file of allFiles) {
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

    // Include large ZIP jobs in the response
    for (const job of largeZipJobs) {
      results.push({ fileName: job.fileName, status: "large-zip-processing", documentId: undefined });
    }

    const largeZipMsg = largeZipJobs.length > 0 ? ` ${largeZipJobs.length} large ZIP(s) sent to background processing.` : "";
    console.log(`[Quick Upload] Done. New: ${newCount}, Duplicates: ${dupCount}, Large ZIPs: ${largeZipJobs.length}, Total: ${allFiles.length}`);
    res.json({
      success: true,
      message: `${newCount} new file(s) uploaded, ${dupCount} duplicate(s) skipped.${largeZipMsg} Processing will begin automatically.`,
      total: allFiles.length + largeZipJobs.length,
      new: newCount,
      duplicates: dupCount,
      largeZipJobs: largeZipJobs.length > 0 ? largeZipJobs : undefined,
      results,
    });
  } catch (error) {
    console.error("[Quick Upload] Error:", error);
    res.status(500).json({ error: error instanceof Error ? error.message : "Upload failed" });
  }
});

/**
 * POST /api/upload/quick-upload-redirect
 * Fallback: if someone POSTs to /quick-upload (the frontend page URL) instead of /api/upload/quick,
 * we handle it here by forwarding to the quick upload handler.
 * This is mounted at /api/upload, so the path is /quick-upload-redirect,
 * but we also add a top-level route in index.ts.
 */

// Mount chunked ZIP upload sub-router
router.use("/zip/chunked", chunkedZipRouter);

export default router;
