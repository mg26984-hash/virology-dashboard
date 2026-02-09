/**
 * Chunked ZIP Upload (Database + S3 backed)
 * 
 * Handles large ZIP files by receiving them in chunks (~10MB each)
 * to bypass proxy body size limits. Sessions are stored in the database
 * and chunks are stored in S3, so this works across multiple server instances.
 * 
 * Flow:
 * 1. Client calls POST /init with file metadata → session created in DB
 * 2. Client sends each chunk via POST /chunk → chunk uploaded to S3
 * 3. Client calls POST /finalize → chunks downloaded from S3, reassembled, processed
 * 
 * This does NOT change any existing ZIP upload logic.
 */

import fs from "fs";
import path from "path";
import os from "os";
import { nanoid } from "nanoid";
import { Router, Request, Response } from "express";
import multer from "multer";
import express from "express";
import { sdk } from "./_core/sdk";
import { processLargeZipFromDisk } from "./largeZipProcessor";
import { storagePut, storageGet, storageDelete } from "./storage";
import { getDb } from "./db";
import { chunkedUploadSessions } from "../drizzle/schema";
import { eq } from "drizzle-orm";

const CHUNKED_TEMP_DIR = path.join(os.tmpdir(), "virology-chunked-zip");

function ensureTempDir() {
  if (!fs.existsSync(CHUNKED_TEMP_DIR)) {
    fs.mkdirSync(CHUNKED_TEMP_DIR, { recursive: true });
  }
}
ensureTempDir();

// S3 key prefix for chunked uploads
const S3_CHUNK_PREFIX = "chunked-uploads";

function chunkS3Key(uploadId: string, chunkIndex: number): string {
  return `${S3_CHUNK_PREFIX}/${uploadId}/chunk-${String(chunkIndex).padStart(5, "0")}`;
}

// Multer for receiving individual chunks (up to 15MB each)
// Use disk storage to avoid memory pressure
const chunkDiskStorage = multer.diskStorage({
  destination: (_req, _file, cb) => {
    ensureTempDir();
    cb(null, CHUNKED_TEMP_DIR);
  },
  filename: (_req, _file, cb) => {
    cb(null, `incoming-chunk-${nanoid()}`);
  },
});
const chunkUpload = multer({
  storage: chunkDiskStorage,
  limits: { fileSize: 15 * 1024 * 1024 }, // 15MB per chunk
});

/**
 * Authenticate a request via session cookie or upload token
 */
async function authenticateRequest(req: Request): Promise<number | null> {
  // Try token auth first
  const token = (req.query.token as string) || (req.headers["x-upload-token"] as string);
  if (token) {
    const { validateUploadToken } = await import("./db");
    const { valid, userId } = await validateUploadToken(token);
    if (valid && userId) return userId;
  }

  // Fall back to session auth
  try {
    const user = await sdk.authenticateRequest(req);
    if (user && user.status === "approved") return user.id;
  } catch (e) { /* ignore */ }

  return null;
}

// ---- Database helpers for chunked sessions ----

async function createSession(data: {
  uploadId: string;
  userId: number;
  fileName: string;
  totalSize: number;
  totalChunks: number;
}) {
  const db = await getDb();
  if (!db) throw new Error("Database not available");
  await db.insert(chunkedUploadSessions).values({
    uploadId: data.uploadId,
    userId: data.userId,
    fileName: data.fileName,
    totalSize: data.totalSize,
    totalChunks: data.totalChunks,
    receivedChunks: 0,
    receivedChunkIndices: "",
    status: "active",
  });
}

async function getSession(uploadId: string) {
  const db = await getDb();
  if (!db) return null;
  const rows = await db
    .select()
    .from(chunkedUploadSessions)
    .where(eq(chunkedUploadSessions.uploadId, uploadId))
    .limit(1);
  return rows[0] || null;
}

async function markChunkReceived(uploadId: string, chunkIndex: number) {
  const session = await getSession(uploadId);
  if (!session) return null;

  // Parse existing indices
  const existing = session.receivedChunkIndices
    ? session.receivedChunkIndices.split(",").filter(Boolean).map(Number)
    : [];

  if (!existing.includes(chunkIndex)) {
    existing.push(chunkIndex);
  }

  const db = await getDb();
  if (!db) return null;
  await db
    .update(chunkedUploadSessions)
    .set({
      receivedChunks: existing.length,
      receivedChunkIndices: existing.join(","),
    })
    .where(eq(chunkedUploadSessions.uploadId, uploadId));

  return { ...session, receivedChunks: existing.length, receivedChunkIndices: existing.join(",") };
}

async function updateSessionStatus(uploadId: string, status: "active" | "finalizing" | "complete" | "expired") {
  const db = await getDb();
  if (!db) return;
  await db
    .update(chunkedUploadSessions)
    .set({ status })
    .where(eq(chunkedUploadSessions.uploadId, uploadId));
}

// ---- Router ----

export const chunkedZipRouter = Router();

// Parse JSON bodies for init and finalize endpoints
chunkedZipRouter.use(express.json({ limit: "1mb" }));

/**
 * POST /api/upload/zip/chunked/init
 * Initialize a chunked ZIP upload session.
 * Body: { fileName, totalSize, totalChunks }
 */
chunkedZipRouter.post("/init", async (req: Request, res: Response) => {
  try {
    const userId = await authenticateRequest(req);
    if (!userId) {
      res.status(403).json({ error: "Unauthorized" });
      return;
    }

    const { fileName, totalSize, totalChunks } = req.body;
    if (!fileName || !totalSize || !totalChunks) {
      res.status(400).json({ error: "Missing required fields: fileName, totalSize, totalChunks" });
      return;
    }

    if (totalSize > 1.5 * 1024 * 1024 * 1024) {
      res.status(400).json({ error: "File too large. Maximum size is 1.5GB." });
      return;
    }

    const uploadId = nanoid();

    await createSession({
      uploadId,
      userId,
      fileName,
      totalSize,
      totalChunks,
    });

    console.log(`[ChunkedZip] Init session ${uploadId}: ${fileName}, ${(totalSize / 1024 / 1024).toFixed(1)}MB, ${totalChunks} chunks (DB+S3 backed)`);

    res.json({
      uploadId,
      message: `Ready to receive ${totalChunks} chunks for ${fileName}`,
    });
  } catch (error) {
    console.error("[ChunkedZip] Init error:", error);
    res.status(500).json({ error: "Failed to initialize chunked upload" });
  }
});

/**
 * POST /api/upload/zip/chunked/chunk
 * Upload a single chunk.
 * Query params: uploadId, chunkIndex
 * Body: multipart with "chunk" field
 */
chunkedZipRouter.post("/chunk", chunkUpload.single("chunk"), async (req: Request, res: Response) => {
  const tempFilePath = req.file?.path;
  try {
    const userId = await authenticateRequest(req);
    if (!userId) {
      if (tempFilePath) try { fs.unlinkSync(tempFilePath); } catch {}
      res.status(403).json({ error: "Unauthorized" });
      return;
    }

    const uploadId = req.query.uploadId as string;
    const chunkIndex = parseInt(req.query.chunkIndex as string, 10);

    if (!uploadId || isNaN(chunkIndex)) {
      if (tempFilePath) try { fs.unlinkSync(tempFilePath); } catch {}
      res.status(400).json({ error: "Missing uploadId or chunkIndex query params" });
      return;
    }

    const session = await getSession(uploadId);
    if (!session || session.status !== "active") {
      if (tempFilePath) try { fs.unlinkSync(tempFilePath); } catch {}
      res.status(404).json({ error: "Upload session not found. It may have expired." });
      return;
    }

    if (session.userId !== userId) {
      if (tempFilePath) try { fs.unlinkSync(tempFilePath); } catch {}
      res.status(403).json({ error: "Unauthorized for this upload session" });
      return;
    }

    if (chunkIndex < 0 || chunkIndex >= session.totalChunks) {
      if (tempFilePath) try { fs.unlinkSync(tempFilePath); } catch {}
      res.status(400).json({ error: `Invalid chunk index. Expected 0-${session.totalChunks - 1}` });
      return;
    }

    const file = req.file;
    if (!file || !tempFilePath) {
      res.status(400).json({ error: "No chunk data provided" });
      return;
    }

    // Read chunk from disk and upload to S3
    const chunkData = fs.readFileSync(tempFilePath);
    const s3Key = chunkS3Key(uploadId, chunkIndex);
    await storagePut(s3Key, chunkData, "application/octet-stream");

    // Clean up temp file
    try { fs.unlinkSync(tempFilePath); } catch {}

    // Mark chunk as received in database
    const updated = await markChunkReceived(uploadId, chunkIndex);
    const received = updated?.receivedChunks || 0;
    const total = session.totalChunks;

    console.log(`[ChunkedZip] Session ${uploadId}: chunk ${chunkIndex + 1}/${total} → S3 (${(chunkData.length / 1024 / 1024).toFixed(1)}MB)`);

    res.json({
      received,
      total,
      complete: received === total,
    });
  } catch (error) {
    // Clean up temp file on error
    if (tempFilePath) try { fs.unlinkSync(tempFilePath); } catch {}
    console.error("[ChunkedZip] Chunk error:", error);
    res.status(500).json({ error: "Failed to receive chunk" });
  }
});

/**
 * POST /api/upload/zip/chunked/finalize
 * Reassemble chunks from S3 into a single ZIP file and start processing.
 * Body: { uploadId }
 */
chunkedZipRouter.post("/finalize", async (req: Request, res: Response) => {
  try {
    const userId = await authenticateRequest(req);
    if (!userId) {
      res.status(403).json({ error: "Unauthorized" });
      return;
    }

    const { uploadId } = req.body;
    if (!uploadId) {
      res.status(400).json({ error: "Missing uploadId" });
      return;
    }

    const session = await getSession(uploadId);
    if (!session) {
      res.status(404).json({ error: "Upload session not found" });
      return;
    }

    if (session.userId !== userId) {
      res.status(403).json({ error: "Unauthorized for this upload session" });
      return;
    }

    // Check all chunks received
    const receivedIndices = session.receivedChunkIndices
      ? session.receivedChunkIndices.split(",").filter(Boolean).map(Number)
      : [];

    if (receivedIndices.length !== session.totalChunks) {
      const receivedSet = new Set(receivedIndices);
      const missing = [];
      for (let i = 0; i < session.totalChunks; i++) {
        if (!receivedSet.has(i)) missing.push(i);
      }
      res.status(400).json({
        error: `Missing ${missing.length} chunks: ${missing.slice(0, 10).join(", ")}${missing.length > 10 ? "..." : ""}`,
        received: receivedIndices.length,
        total: session.totalChunks,
      });
      return;
    }

    // Mark session as finalizing
    await updateSessionStatus(uploadId, "finalizing");

    console.log(`[ChunkedZip] Session ${uploadId}: All ${session.totalChunks} chunks in S3. Downloading and reassembling...`);

    // Download chunks from S3 and reassemble into a local file
    ensureTempDir();
    const assembledPath = path.join(CHUNKED_TEMP_DIR, `${uploadId}-${session.fileName}`);
    const writeStream = fs.createWriteStream(assembledPath);

    for (let i = 0; i < session.totalChunks; i++) {
      const s3Key = chunkS3Key(uploadId, i);
      const { url } = await storageGet(s3Key);
      const response = await fetch(url);
      if (!response.ok) {
        throw new Error(`Failed to download chunk ${i} from S3: ${response.status}`);
      }
      const buffer = Buffer.from(await response.arrayBuffer());
      writeStream.write(buffer);
    }

    await new Promise<void>((resolve, reject) => {
      writeStream.end(() => resolve());
      writeStream.on("error", reject);
    });

    const assembledSize = fs.statSync(assembledPath).size;
    console.log(`[ChunkedZip] Session ${uploadId}: Reassembled ${(assembledSize / 1024 / 1024).toFixed(1)}MB ZIP from S3 chunks`);

    // Clean up S3 chunks in background (don't block the response)
    (async () => {
      for (let i = 0; i < session.totalChunks; i++) {
        try {
          await storageDelete(chunkS3Key(uploadId, i));
        } catch (e) { /* ignore cleanup errors */ }
      }
      console.log(`[ChunkedZip] Session ${uploadId}: S3 chunks cleaned up`);
    })().catch(() => {});

    // Mark session as complete
    await updateSessionStatus(uploadId, "complete");

    // Hand off to the existing large ZIP processor (processes from disk)
    const jobId = await processLargeZipFromDisk(assembledPath, session.fileName, session.userId);

    res.json({
      success: true,
      jobId,
      fileName: session.fileName,
      fileSize: assembledSize,
      fileSizeMB: Math.round(assembledSize / 1024 / 1024),
      message: `ZIP reassembled (${Math.round(assembledSize / 1024 / 1024)}MB). Processing entries from disk.`,
    });
  } catch (error) {
    console.error("[ChunkedZip] Finalize error:", error);
    res.status(500).json({ error: "Failed to finalize chunked upload" });
  }
});

/**
 * GET /api/upload/zip/chunked/status/:uploadId
 * Check the status of a chunked upload session.
 */
chunkedZipRouter.get("/status/:uploadId", async (req: Request, res: Response) => {
  const session = await getSession(req.params.uploadId);
  if (!session) {
    res.status(404).json({ error: "Session not found" });
    return;
  }

  res.json({
    uploadId: session.uploadId,
    fileName: session.fileName,
    totalSize: session.totalSize,
    totalChunks: session.totalChunks,
    receivedChunks: session.receivedChunks,
    status: session.status,
    complete: session.receivedChunks === session.totalChunks,
  });

});
