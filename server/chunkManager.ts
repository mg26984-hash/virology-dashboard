/**
 * Chunk Manager - Handles chunked file uploads for large files
 * Stores chunks in memory and reassembles them when complete
 */

interface ChunkUpload {
  uploadId: string;
  fileName: string;
  totalChunks: number;
  totalSize: number;
  chunks: Map<number, Buffer>;
  createdAt: number;
  userId: number;
}

// In-memory store for active uploads
const activeUploads = new Map<string, ChunkUpload>();

// Clean up stale uploads after 30 minutes
const UPLOAD_TIMEOUT_MS = 30 * 60 * 1000;

// Run cleanup every 5 minutes
setInterval(() => {
  const now = Date.now();
  for (const [uploadId, upload] of Array.from(activeUploads.entries())) {
    if (now - upload.createdAt > UPLOAD_TIMEOUT_MS) {
      console.log(`[ChunkManager] Cleaning up stale upload: ${uploadId}`);
      activeUploads.delete(uploadId);
    }
  }
}, 5 * 60 * 1000);

/**
 * Initialize a new chunked upload
 */
export function initChunkedUpload(
  uploadId: string,
  fileName: string,
  totalChunks: number,
  totalSize: number,
  userId: number
): void {
  activeUploads.set(uploadId, {
    uploadId,
    fileName,
    totalChunks,
    totalSize,
    chunks: new Map(),
    createdAt: Date.now(),
    userId,
  });
  console.log(`[ChunkManager] Initialized upload ${uploadId}: ${fileName}, ${totalChunks} chunks, ${totalSize} bytes`);
}

/**
 * Add a chunk to an existing upload
 * Returns true if all chunks have been received
 */
export function addChunk(
  uploadId: string,
  chunkIndex: number,
  chunkData: Buffer
): { complete: boolean; receivedChunks: number; totalChunks: number } {
  const upload = activeUploads.get(uploadId);
  if (!upload) {
    throw new Error(`Upload ${uploadId} not found`);
  }

  upload.chunks.set(chunkIndex, chunkData);
  const receivedChunks = upload.chunks.size;
  const complete = receivedChunks === upload.totalChunks;

  console.log(`[ChunkManager] Received chunk ${chunkIndex + 1}/${upload.totalChunks} for ${uploadId}`);

  return { complete, receivedChunks, totalChunks: upload.totalChunks };
}

/**
 * Get the complete file buffer by reassembling all chunks
 */
export function getCompleteFile(uploadId: string): {
  buffer: Buffer;
  fileName: string;
  userId: number;
} | null {
  const upload = activeUploads.get(uploadId);
  if (!upload) {
    return null;
  }

  if (upload.chunks.size !== upload.totalChunks) {
    throw new Error(`Upload ${uploadId} is incomplete: ${upload.chunks.size}/${upload.totalChunks} chunks`);
  }

  // Reassemble chunks in order
  const sortedChunks: Buffer[] = [];
  for (let i = 0; i < upload.totalChunks; i++) {
    const chunk = upload.chunks.get(i);
    if (!chunk) {
      throw new Error(`Missing chunk ${i} for upload ${uploadId}`);
    }
    sortedChunks.push(chunk);
  }

  const buffer = Buffer.concat(sortedChunks);
  console.log(`[ChunkManager] Reassembled ${uploadId}: ${buffer.length} bytes`);

  return {
    buffer,
    fileName: upload.fileName,
    userId: upload.userId,
  };
}

/**
 * Clean up an upload after processing
 */
export function cleanupUpload(uploadId: string): void {
  activeUploads.delete(uploadId);
  console.log(`[ChunkManager] Cleaned up upload ${uploadId}`);
}

/**
 * Get upload status
 */
export function getUploadStatus(uploadId: string): {
  exists: boolean;
  receivedChunks: number;
  totalChunks: number;
  fileName?: string;
} {
  const upload = activeUploads.get(uploadId);
  if (!upload) {
    return { exists: false, receivedChunks: 0, totalChunks: 0 };
  }
  return {
    exists: true,
    receivedChunks: upload.chunks.size,
    totalChunks: upload.totalChunks,
    fileName: upload.fileName,
  };
}
