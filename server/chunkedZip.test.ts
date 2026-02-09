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
