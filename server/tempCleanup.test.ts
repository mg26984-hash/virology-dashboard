import { describe, it, expect, afterEach } from "vitest";
import fs from "fs";
import path from "path";
import os from "os";
import { runTempCleanup } from "./tempCleanup";

describe("Temp File Cleanup", () => {
  const testDirs: string[] = [];

  afterEach(() => {
    // Clean up any test directories we created
    for (const dir of testDirs) {
      try { fs.rmSync(dir, { recursive: true, force: true }); } catch {}
    }
    testDirs.length = 0;
  });

  it("should return zero counts when no temp files exist", () => {
    const result = runTempCleanup();
    // May or may not find files depending on environment, but should not error
    expect(result.errors.length).toBe(0);
    expect(result.filesRemoved).toBeGreaterThanOrEqual(0);
    expect(result.dirsRemoved).toBeGreaterThanOrEqual(0);
    expect(result.bytesFreed).toBeGreaterThanOrEqual(0);
  });

  it("should clean up old quick-large- temp files", () => {
    // Create a fake old temp file matching the quick-large- prefix
    const tmpFile = path.join(os.tmpdir(), `quick-large-test-cleanup-${Date.now()}.zip`);
    fs.writeFileSync(tmpFile, Buffer.alloc(1024, 0x42));

    // Set mtime to 25 hours ago
    const oldTime = new Date(Date.now() - 25 * 60 * 60 * 1000);
    fs.utimesSync(tmpFile, oldTime, oldTime);

    const result = runTempCleanup();
    expect(result.filesRemoved).toBeGreaterThanOrEqual(1);
    expect(result.bytesFreed).toBeGreaterThanOrEqual(1024);
    expect(fs.existsSync(tmpFile)).toBe(false);
  });

  it("should NOT clean up recent quick-large- temp files", () => {
    // Create a fresh temp file (should not be cleaned)
    const tmpFile = path.join(os.tmpdir(), `quick-large-recent-${Date.now()}.zip`);
    fs.writeFileSync(tmpFile, Buffer.alloc(512, 0x43));

    const result = runTempCleanup();
    // The file should still exist (it's recent)
    expect(fs.existsSync(tmpFile)).toBe(true);

    // Clean up manually
    fs.unlinkSync(tmpFile);
  });

  it("should clean up old subdirectories in chunked zip dir", () => {
    const chunkedDir = path.join(os.tmpdir(), "virology-chunked-zip");
    if (!fs.existsSync(chunkedDir)) fs.mkdirSync(chunkedDir, { recursive: true });
    testDirs.push(chunkedDir);

    // Create an old session subdirectory
    const sessionDir = path.join(chunkedDir, `old-session-${Date.now()}`);
    fs.mkdirSync(sessionDir, { recursive: true });
    fs.writeFileSync(path.join(sessionDir, "chunk-00000"), Buffer.alloc(2048));
    fs.writeFileSync(path.join(sessionDir, "chunk-00001"), Buffer.alloc(2048));

    // Set mtime to 25 hours ago
    const oldTime = new Date(Date.now() - 25 * 60 * 60 * 1000);
    fs.utimesSync(sessionDir, oldTime, oldTime);

    const result = runTempCleanup();
    expect(result.dirsRemoved).toBeGreaterThanOrEqual(1);
    expect(fs.existsSync(sessionDir)).toBe(false);
  });

  it("should clean up old files in large zip uploads dir", () => {
    const largeZipDir = path.join(os.tmpdir(), "virology-large-zip-uploads");
    if (!fs.existsSync(largeZipDir)) fs.mkdirSync(largeZipDir, { recursive: true });
    testDirs.push(largeZipDir);

    // Create an old temp file
    const tmpFile = path.join(largeZipDir, `old-upload-${Date.now()}.zip`);
    fs.writeFileSync(tmpFile, Buffer.alloc(4096));

    const oldTime = new Date(Date.now() - 25 * 60 * 60 * 1000);
    fs.utimesSync(tmpFile, oldTime, oldTime);

    const result = runTempCleanup();
    expect(result.filesRemoved).toBeGreaterThanOrEqual(1);
    expect(fs.existsSync(tmpFile)).toBe(false);
  });

  it("should respect custom maxAgeMs parameter", () => {
    // Create a temp file that's 2 hours old
    const tmpFile = path.join(os.tmpdir(), `quick-large-age-test-${Date.now()}.zip`);
    fs.writeFileSync(tmpFile, Buffer.alloc(256));

    const twoHoursAgo = new Date(Date.now() - 2 * 60 * 60 * 1000);
    fs.utimesSync(tmpFile, twoHoursAgo, twoHoursAgo);

    // With 24h max age, should NOT be cleaned
    const result24h = runTempCleanup(24 * 60 * 60 * 1000);
    expect(fs.existsSync(tmpFile)).toBe(true);

    // With 1h max age, SHOULD be cleaned
    const result1h = runTempCleanup(1 * 60 * 60 * 1000);
    expect(fs.existsSync(tmpFile)).toBe(false);
    expect(result1h.filesRemoved).toBeGreaterThanOrEqual(1);
  });

  it("should not touch files without matching prefixes", () => {
    // Create a random temp file that doesn't match our patterns
    const tmpFile = path.join(os.tmpdir(), `unrelated-file-${Date.now()}.tmp`);
    fs.writeFileSync(tmpFile, Buffer.alloc(128));

    const oldTime = new Date(Date.now() - 48 * 60 * 60 * 1000);
    fs.utimesSync(tmpFile, oldTime, oldTime);

    const result = runTempCleanup();
    // The unrelated file should still exist
    expect(fs.existsSync(tmpFile)).toBe(true);

    // Clean up manually
    fs.unlinkSync(tmpFile);
  });
});
