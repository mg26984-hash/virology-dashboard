import fs from "fs";
import path from "path";
import os from "os";

// Temp directories and file patterns created by the upload system
const TEMP_PATTERNS = {
  // Directories created by chunked ZIP upload (chunkedZipUpload.ts)
  chunkedZipDir: path.join(os.tmpdir(), "virology-chunked-zip"),
  // Directory created by large ZIP disk processor (largeZipProcessor.ts)
  largeZipDir: path.join(os.tmpdir(), "virology-zip-uploads"),
  // Directory created by multer disk storage for large ZIPs (uploadRoutes.ts)
  largeZipUploadsDir: path.join(os.tmpdir(), "virology-large-zip-uploads"),
};

// File prefixes for individual temp files created in os.tmpdir()
const TEMP_FILE_PREFIXES = [
  "quick-large-",  // Quick Upload large ZIP temp files (uploadRoutes.ts)
];

const MAX_AGE_MS = 24 * 60 * 60 * 1000; // 24 hours

interface CleanupResult {
  filesRemoved: number;
  dirsRemoved: number;
  bytesFreed: number;
  errors: string[];
}

/**
 * Remove files and subdirectories older than maxAgeMs from a directory.
 * Does not remove the directory itself.
 */
function cleanDirectory(dirPath: string, maxAgeMs: number, result: CleanupResult): void {
  if (!fs.existsSync(dirPath)) return;

  try {
    const entries = fs.readdirSync(dirPath, { withFileTypes: true });
    const cutoff = Date.now() - maxAgeMs;

    for (const entry of entries) {
      const fullPath = path.join(dirPath, entry.name);
      try {
        const stat = fs.statSync(fullPath);
        if (stat.mtimeMs > cutoff) continue; // Not old enough

        if (entry.isDirectory()) {
          // Recursively get size before removing
          const dirSize = getDirSize(fullPath);
          fs.rmSync(fullPath, { recursive: true, force: true });
          result.dirsRemoved++;
          result.bytesFreed += dirSize;
        } else {
          result.bytesFreed += stat.size;
          fs.unlinkSync(fullPath);
          result.filesRemoved++;
        }
      } catch (e) {
        result.errors.push(`Failed to clean ${fullPath}: ${e instanceof Error ? e.message : String(e)}`);
      }
    }
  } catch (e) {
    result.errors.push(`Failed to read directory ${dirPath}: ${e instanceof Error ? e.message : String(e)}`);
  }
}

/**
 * Get total size of a directory recursively.
 */
function getDirSize(dirPath: string): number {
  let total = 0;
  try {
    const entries = fs.readdirSync(dirPath, { withFileTypes: true });
    for (const entry of entries) {
      const fullPath = path.join(dirPath, entry.name);
      try {
        if (entry.isDirectory()) {
          total += getDirSize(fullPath);
        } else {
          total += fs.statSync(fullPath).size;
        }
      } catch { /* skip inaccessible */ }
    }
  } catch { /* skip inaccessible */ }
  return total;
}

/**
 * Clean orphaned temp files matching known prefixes from os.tmpdir().
 */
function cleanTempFiles(maxAgeMs: number, result: CleanupResult): void {
  const tmpDir = os.tmpdir();
  try {
    const entries = fs.readdirSync(tmpDir, { withFileTypes: true });
    const cutoff = Date.now() - maxAgeMs;

    for (const entry of entries) {
      // Only process files/dirs that match our known prefixes
      const matchesPrefix = TEMP_FILE_PREFIXES.some((p) => entry.name.startsWith(p));
      if (!matchesPrefix) continue;

      const fullPath = path.join(tmpDir, entry.name);
      try {
        const stat = fs.statSync(fullPath);
        if (stat.mtimeMs > cutoff) continue;

        if (entry.isDirectory()) {
          const dirSize = getDirSize(fullPath);
          fs.rmSync(fullPath, { recursive: true, force: true });
          result.dirsRemoved++;
          result.bytesFreed += dirSize;
        } else {
          result.bytesFreed += stat.size;
          fs.unlinkSync(fullPath);
          result.filesRemoved++;
        }
      } catch (e) {
        result.errors.push(`Failed to clean temp file ${fullPath}: ${e instanceof Error ? e.message : String(e)}`);
      }
    }
  } catch (e) {
    result.errors.push(`Failed to read tmpdir: ${e instanceof Error ? e.message : String(e)}`);
  }
}

/**
 * Run a full cleanup of all known temp directories and files.
 */
export function runTempCleanup(maxAgeMs: number = MAX_AGE_MS): CleanupResult {
  const result: CleanupResult = {
    filesRemoved: 0,
    dirsRemoved: 0,
    bytesFreed: 0,
    errors: [],
  };

  // Clean known temp directories
  for (const [name, dirPath] of Object.entries(TEMP_PATTERNS)) {
    cleanDirectory(dirPath, maxAgeMs, result);
  }

  // Clean individual temp files in os.tmpdir()
  cleanTempFiles(maxAgeMs, result);

  return result;
}

/**
 * Format bytes to human-readable string.
 */
function formatBytes(bytes: number): string {
  if (bytes < 1024) return `${bytes}B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)}KB`;
  if (bytes < 1024 * 1024 * 1024) return `${(bytes / (1024 * 1024)).toFixed(1)}MB`;
  return `${(bytes / (1024 * 1024 * 1024)).toFixed(2)}GB`;
}

// Interval handle for stopping the scheduler
let cleanupInterval: ReturnType<typeof setInterval> | null = null;

/**
 * Start the periodic temp file cleanup scheduler.
 * Runs immediately on start, then every intervalMs (default: 6 hours).
 */
export function startTempCleanupScheduler(intervalMs: number = 6 * 60 * 60 * 1000): void {
  // Run immediately
  const initial = runTempCleanup();
  const totalCleaned = initial.filesRemoved + initial.dirsRemoved;
  if (totalCleaned > 0) {
    console.log(
      `[TempCleanup] Initial cleanup: removed ${initial.filesRemoved} files, ${initial.dirsRemoved} dirs, freed ${formatBytes(initial.bytesFreed)}`
    );
  } else {
    console.log("[TempCleanup] Initial cleanup: no orphaned temp files found");
  }
  if (initial.errors.length > 0) {
    console.warn("[TempCleanup] Errors:", initial.errors.join("; "));
  }

  // Schedule periodic cleanup
  cleanupInterval = setInterval(() => {
    const result = runTempCleanup();
    const cleaned = result.filesRemoved + result.dirsRemoved;
    if (cleaned > 0) {
      console.log(
        `[TempCleanup] Periodic cleanup: removed ${result.filesRemoved} files, ${result.dirsRemoved} dirs, freed ${formatBytes(result.bytesFreed)}`
      );
    }
    if (result.errors.length > 0) {
      console.warn("[TempCleanup] Errors:", result.errors.join("; "));
    }
  }, intervalMs);

  console.log(`[TempCleanup] Scheduler started (interval: ${(intervalMs / 3600000).toFixed(1)}h)`);
}

/**
 * Stop the periodic cleanup scheduler.
 */
export function stopTempCleanupScheduler(): void {
  if (cleanupInterval) {
    clearInterval(cleanupInterval);
    cleanupInterval = null;
    console.log("[TempCleanup] Scheduler stopped");
  }
}
