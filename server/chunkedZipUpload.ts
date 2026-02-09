/**
 * Chunked ZIP Upload
 * 
 * Handles large ZIP files by receiving them in chunks (~50MB each)
 * to bypass proxy body size limits. Chunks are written to disk
 * and reassembled into the full ZIP file, then handed off to
 * the existing largeZipProcessor for sequential entry processing.
 * 
 * Flow:
 * 1. Client calls POST /api/upload/zip/chunked/init with file metadata
 * 2. Client sends each chunk via POST /api/upload/zip/chunked/chunk
 * 3. Client calls POST /api/upload/zip/chunked/finalize to trigger processing
 * 4. Server reassembles chunks and delegates to processLargeZipFromDisk
 * 
 * This does NOT change any existing ZIP upload logic.
 */

import fs from "fs";
import path from "path";
import os from "os";
import { nanoid } from "nanoid";
import { Router, Request, Response } from "express";
import multer from "multer";
import { sdk } from "./_core/sdk";
import { processLargeZipFromDisk } from "./largeZipProcessor";

const CHUNKED_TEMP_DIR = path.join(os.tmpdir(), "virology-chunked-zip");
if (!fs.existsSync(CHUNKED_TEMP_DIR)) {
  fs.mkdirSync(CHUNKED_TEMP_DIR, { recursive: true });
}

// Track active chunked uploads in memory
interface ChunkedUploadSession {
  uploadId: string;
  userId: number;
  fileName: string;
  totalSize: number;
  totalChunks: number;
  receivedChunks: Set<number>;
  sessionDir: string;
  createdAt: number;
}

const activeSessions = new Map<string, ChunkedUploadSession>();

// Clean up stale sessions after 2 hours
setInterval(() => {
  const now = Date.now();
  for (const [id, session] of Array.from(activeSessions.entries())) {
    if (now - session.createdAt > 2 * 60 * 60 * 1000) {
      try {
        if (fs.existsSync(session.sessionDir)) {
          fs.rmSync(session.sessionDir, { recursive: true, force: true });
        }
      } catch (e) { /* ignore */ }
      activeSessions.delete(id);
      console.log(`[ChunkedZip] Cleaned up stale session: ${id}`);
    }
  }
}, 30 * 60 * 1000);

// Multer for receiving individual chunks (up to 55MB each)
const chunkStorage = multer.memoryStorage();
const chunkUpload = multer({
  storage: chunkStorage,
  limits: { fileSize: 55 * 1024 * 1024 }, // 55MB per chunk
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

export const chunkedZipRouter = Router();

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
    const sessionDir = path.join(CHUNKED_TEMP_DIR, uploadId);
    fs.mkdirSync(sessionDir, { recursive: true });

    const session: ChunkedUploadSession = {
      uploadId,
      userId,
      fileName,
      totalSize,
      totalChunks,
      receivedChunks: new Set(),
      sessionDir,
      createdAt: Date.now(),
    };
    activeSessions.set(uploadId, session);

    console.log(`[ChunkedZip] Init session ${uploadId}: ${fileName}, ${(totalSize / 1024 / 1024).toFixed(1)}MB, ${totalChunks} chunks`);

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
  try {
    const userId = await authenticateRequest(req);
    if (!userId) {
      res.status(403).json({ error: "Unauthorized" });
      return;
    }

    const uploadId = req.query.uploadId as string;
    const chunkIndex = parseInt(req.query.chunkIndex as string, 10);

    if (!uploadId || isNaN(chunkIndex)) {
      res.status(400).json({ error: "Missing uploadId or chunkIndex query params" });
      return;
    }

    const session = activeSessions.get(uploadId);
    if (!session) {
      res.status(404).json({ error: "Upload session not found. It may have expired." });
      return;
    }

    if (session.userId !== userId) {
      res.status(403).json({ error: "Unauthorized for this upload session" });
      return;
    }

    if (chunkIndex < 0 || chunkIndex >= session.totalChunks) {
      res.status(400).json({ error: `Invalid chunk index. Expected 0-${session.totalChunks - 1}` });
      return;
    }

    const file = req.file;
    if (!file) {
      res.status(400).json({ error: "No chunk data provided" });
      return;
    }

    // Write chunk to disk
    const chunkPath = path.join(session.sessionDir, `chunk-${String(chunkIndex).padStart(5, "0")}`);
    fs.writeFileSync(chunkPath, file.buffer);
    session.receivedChunks.add(chunkIndex);

    const received = session.receivedChunks.size;
    const total = session.totalChunks;

    console.log(`[ChunkedZip] Session ${uploadId}: chunk ${chunkIndex + 1}/${total} received (${(file.buffer.length / 1024 / 1024).toFixed(1)}MB)`);

    res.json({
      received,
      total,
      complete: received === total,
    });
  } catch (error) {
    console.error("[ChunkedZip] Chunk error:", error);
    res.status(500).json({ error: "Failed to receive chunk" });
  }
});

/**
 * POST /api/upload/zip/chunked/finalize
 * Reassemble chunks into a single ZIP file and start processing.
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

    const session = activeSessions.get(uploadId);
    if (!session) {
      res.status(404).json({ error: "Upload session not found" });
      return;
    }

    if (session.userId !== userId) {
      res.status(403).json({ error: "Unauthorized for this upload session" });
      return;
    }

    // Check all chunks received
    if (session.receivedChunks.size !== session.totalChunks) {
      const missing = [];
      for (let i = 0; i < session.totalChunks; i++) {
        if (!session.receivedChunks.has(i)) missing.push(i);
      }
      res.status(400).json({
        error: `Missing ${missing.length} chunks: ${missing.slice(0, 10).join(", ")}${missing.length > 10 ? "..." : ""}`,
        received: session.receivedChunks.size,
        total: session.totalChunks,
      });
      return;
    }

    console.log(`[ChunkedZip] Session ${uploadId}: All ${session.totalChunks} chunks received. Reassembling...`);

    // Reassemble chunks into a single file
    const assembledPath = path.join(CHUNKED_TEMP_DIR, `${uploadId}-${session.fileName}`);
    const writeStream = fs.createWriteStream(assembledPath);

    for (let i = 0; i < session.totalChunks; i++) {
      const chunkPath = path.join(session.sessionDir, `chunk-${String(i).padStart(5, "0")}`);
      const chunkData = fs.readFileSync(chunkPath);
      writeStream.write(chunkData);
    }

    await new Promise<void>((resolve, reject) => {
      writeStream.end(() => resolve());
      writeStream.on("error", reject);
    });

    const assembledSize = fs.statSync(assembledPath).size;
    console.log(`[ChunkedZip] Session ${uploadId}: Reassembled ${(assembledSize / 1024 / 1024).toFixed(1)}MB ZIP`);

    // Clean up chunk directory
    try {
      fs.rmSync(session.sessionDir, { recursive: true, force: true });
    } catch (e) { /* ignore */ }

    // Remove session from memory
    activeSessions.delete(uploadId);

    // Hand off to the existing large ZIP processor (processes from disk)
    const jobId = await processLargeZipFromDisk(assembledPath, session.fileName, userId);

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
  const session = activeSessions.get(req.params.uploadId);
  if (!session) {
    res.status(404).json({ error: "Session not found" });
    return;
  }

  res.json({
    uploadId: session.uploadId,
    fileName: session.fileName,
    totalSize: session.totalSize,
    totalChunks: session.totalChunks,
    receivedChunks: session.receivedChunks.size,
    complete: session.receivedChunks.size === session.totalChunks,
  });
});
