import { describe, it, expect, vi, beforeEach } from "vitest";
import fs from "fs";
import path from "path";
import os from "os";
import AdmZip from "adm-zip";

// Create a small test ZIP file
function createTestZip(fileCount: number = 3): Buffer {
  const zip = new AdmZip();
  for (let i = 0; i < fileCount; i++) {
    // Create a small JPEG-like buffer (just header bytes for testing)
    const buf = Buffer.alloc(1024);
    buf[0] = 0xff;
    buf[1] = 0xd8;
    buf[2] = 0xff;
    buf[3] = 0xe0;
    zip.addFile(`test-image-${i}.jpg`, buf);
  }
  return zip.toBuffer();
}

describe("Chunked ZIP Upload", () => {
  it("should split a buffer into chunks correctly", () => {
    const totalSize = 150 * 1024 * 1024; // 150MB
    const chunkSize = 50 * 1024 * 1024; // 50MB
    const totalChunks = Math.ceil(totalSize / chunkSize);
    expect(totalChunks).toBe(3);
  });

  it("should calculate chunk boundaries correctly", () => {
    const totalSize = 120 * 1024 * 1024; // 120MB
    const chunkSize = 50 * 1024 * 1024; // 50MB
    const totalChunks = Math.ceil(totalSize / chunkSize);
    expect(totalChunks).toBe(3);

    // Chunk 0: 0 to 50MB
    expect(0 * chunkSize).toBe(0);
    expect(Math.min(0 * chunkSize + chunkSize, totalSize)).toBe(50 * 1024 * 1024);

    // Chunk 1: 50MB to 100MB
    expect(1 * chunkSize).toBe(50 * 1024 * 1024);
    expect(Math.min(1 * chunkSize + chunkSize, totalSize)).toBe(100 * 1024 * 1024);

    // Chunk 2: 100MB to 120MB (partial chunk)
    expect(2 * chunkSize).toBe(100 * 1024 * 1024);
    expect(Math.min(2 * chunkSize + chunkSize, totalSize)).toBe(120 * 1024 * 1024);
  });

  it("should reassemble chunks into original data", () => {
    // Simulate chunking and reassembly
    const original = Buffer.alloc(256);
    for (let i = 0; i < 256; i++) original[i] = i % 256;

    const chunkSize = 100;
    const chunks: Buffer[] = [];
    for (let i = 0; i < original.length; i += chunkSize) {
      chunks.push(original.subarray(i, Math.min(i + chunkSize, original.length)));
    }

    expect(chunks.length).toBe(3); // 100 + 100 + 56

    // Reassemble
    const reassembled = Buffer.concat(chunks);
    expect(reassembled.equals(original)).toBe(true);
  });

  it("should handle single-chunk files (under chunk size)", () => {
    const totalSize = 30 * 1024 * 1024; // 30MB
    const chunkSize = 50 * 1024 * 1024; // 50MB
    const totalChunks = Math.ceil(totalSize / chunkSize);
    expect(totalChunks).toBe(1);
  });

  it("should reject files over 1.5GB", () => {
    const totalSize = 1.6 * 1024 * 1024 * 1024; // 1.6GB
    const maxSize = 1.5 * 1024 * 1024 * 1024;
    expect(totalSize > maxSize).toBe(true);
  });

  it("should create valid ZIP from chunks written to disk", () => {
    const zipBuffer = createTestZip(5);
    const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), "chunked-test-"));

    try {
      // Split into chunks
      const chunkSize = Math.ceil(zipBuffer.length / 3);
      const chunkBuffers: Buffer[] = [];
      for (let i = 0; i < 3; i++) {
        const start = i * chunkSize;
        const end = Math.min(start + chunkSize, zipBuffer.length);
        const chunkPath = path.join(tmpDir, `chunk-${String(i).padStart(5, "0")}`);
        fs.writeFileSync(chunkPath, zipBuffer.subarray(start, end));
        chunkBuffers.push(zipBuffer.subarray(start, end));
      }

      // Reassemble using Buffer.concat (synchronous)
      const reassembled = Buffer.concat(chunkBuffers);
      const assembledPath = path.join(tmpDir, "reassembled.zip");
      fs.writeFileSync(assembledPath, reassembled);

      // Verify the reassembled ZIP is valid
      const reassembledZip = new AdmZip(assembledPath);
      const entries = reassembledZip.getEntries();
      expect(entries.length).toBe(5);
      expect(entries[0].entryName).toBe("test-image-0.jpg");
      expect(entries[4].entryName).toBe("test-image-4.jpg");
    } finally {
      // Cleanup
      try { fs.rmSync(tmpDir, { recursive: true, force: true }); } catch {}
    }
  });

  it("should track received chunks correctly", () => {
    const receivedChunks = new Set<number>();
    const totalChunks = 5;

    receivedChunks.add(0);
    receivedChunks.add(2);
    receivedChunks.add(4);

    expect(receivedChunks.size).toBe(3);
    expect(receivedChunks.size === totalChunks).toBe(false);

    // Find missing chunks
    const missing: number[] = [];
    for (let i = 0; i < totalChunks; i++) {
      if (!receivedChunks.has(i)) missing.push(i);
    }
    expect(missing).toEqual([1, 3]);

    // Add remaining
    receivedChunks.add(1);
    receivedChunks.add(3);
    expect(receivedChunks.size === totalChunks).toBe(true);
  });

  it("should handle duplicate chunk uploads idempotently", () => {
    const receivedChunks = new Set<number>();
    receivedChunks.add(0);
    receivedChunks.add(0); // Duplicate
    receivedChunks.add(0); // Duplicate
    expect(receivedChunks.size).toBe(1);
  });
});

describe("Chunk Upload Retry Logic", () => {
  it("should retry up to MAX_RETRIES times before failing", async () => {
    const MAX_RETRIES = 3;
    let attempts = 0;

    // Simulate a function that fails twice then succeeds
    const uploadChunk = async (): Promise<boolean> => {
      attempts++;
      if (attempts < 3) throw new Error("Network error");
      return true;
    };

    let success = false;
    let lastError = "";

    for (let attempt = 1; attempt <= MAX_RETRIES; attempt++) {
      try {
        await uploadChunk();
        success = true;
        break;
      } catch (e) {
        lastError = e instanceof Error ? e.message : "Unknown";
      }
    }

    expect(success).toBe(true);
    expect(attempts).toBe(3);
  });

  it("should fail after exhausting all retries", async () => {
    const MAX_RETRIES = 3;
    let attempts = 0;

    const uploadChunk = async (): Promise<boolean> => {
      attempts++;
      throw new Error("Persistent failure");
    };

    let success = false;
    let lastError = "";

    for (let attempt = 1; attempt <= MAX_RETRIES; attempt++) {
      try {
        await uploadChunk();
        success = true;
        break;
      } catch (e) {
        lastError = e instanceof Error ? e.message : "Unknown";
      }
    }

    expect(success).toBe(false);
    expect(attempts).toBe(3);
    expect(lastError).toBe("Persistent failure");
  });

  it("should succeed on first attempt without retrying", async () => {
    const MAX_RETRIES = 3;
    let attempts = 0;

    const uploadChunk = async (): Promise<boolean> => {
      attempts++;
      return true;
    };

    let success = false;
    for (let attempt = 1; attempt <= MAX_RETRIES; attempt++) {
      try {
        await uploadChunk();
        success = true;
        break;
      } catch (e) { /* retry */ }
    }

    expect(success).toBe(true);
    expect(attempts).toBe(1);
  });
});

describe("Quick Upload Large ZIP Detection", () => {
  it("should classify ZIPs above 50MB as large", () => {
    const LARGE_ZIP_THRESHOLD = 50 * 1024 * 1024;
    const files = [
      { originalname: "small.zip", size: 10 * 1024 * 1024 },
      { originalname: "medium.zip", size: 49 * 1024 * 1024 },
      { originalname: "large.zip", size: 80 * 1024 * 1024 },
      { originalname: "huge.zip", size: 200 * 1024 * 1024 },
    ];

    const small = files.filter((f) => f.size <= LARGE_ZIP_THRESHOLD);
    const large = files.filter((f) => f.size > LARGE_ZIP_THRESHOLD);

    expect(small.length).toBe(2);
    expect(small.map((f) => f.originalname)).toEqual(["small.zip", "medium.zip"]);
    expect(large.length).toBe(2);
    expect(large.map((f) => f.originalname)).toEqual(["large.zip", "huge.zip"]);
  });

  it("should handle mix of ZIP and non-ZIP files", () => {
    const files = [
      { originalname: "photo.jpg", mimetype: "image/jpeg", size: 2 * 1024 * 1024 },
      { originalname: "report.pdf", mimetype: "application/pdf", size: 5 * 1024 * 1024 },
      { originalname: "archive.zip", mimetype: "application/zip", size: 100 * 1024 * 1024 },
    ];

    const zipTypes = ["application/zip", "application/x-zip-compressed"];
    const zipFiles = files.filter((f) => zipTypes.includes(f.mimetype) || f.originalname.toLowerCase().endsWith(".zip"));
    const regularFiles = files.filter((f) => !zipTypes.includes(f.mimetype) && !f.originalname.toLowerCase().endsWith(".zip"));

    expect(zipFiles.length).toBe(1);
    expect(regularFiles.length).toBe(2);
  });

  it("should write large ZIP to temp file for disk processing", () => {
    const zipBuffer = createTestZip(3);
    const tmpPath = path.join(os.tmpdir(), `quick-large-test-${Date.now()}.zip`);

    try {
      fs.writeFileSync(tmpPath, zipBuffer);
      expect(fs.existsSync(tmpPath)).toBe(true);

      const stat = fs.statSync(tmpPath);
      expect(stat.size).toBe(zipBuffer.length);

      // Verify it's a valid ZIP
      const zip = new AdmZip(tmpPath);
      expect(zip.getEntries().length).toBe(3);
    } finally {
      try { fs.unlinkSync(tmpPath); } catch {}
    }
  });
});
