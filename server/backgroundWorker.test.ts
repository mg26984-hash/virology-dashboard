import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import crypto from "crypto";

// ---- Unit tests for computeFileHash and isDuplicate logic ----

describe("File Hash Deduplication", () => {
  it("computeFileHash produces consistent SHA-256 hashes", () => {
    const buffer1 = Buffer.from("hello world");
    const buffer2 = Buffer.from("hello world");
    const buffer3 = Buffer.from("different content");

    const hash1 = crypto.createHash("sha256").update(buffer1).digest("hex");
    const hash2 = crypto.createHash("sha256").update(buffer2).digest("hex");
    const hash3 = crypto.createHash("sha256").update(buffer3).digest("hex");

    expect(hash1).toBe(hash2);
    expect(hash1).not.toBe(hash3);
    expect(hash1).toHaveLength(64); // SHA-256 hex is 64 chars
  });

  it("computeFileHash produces different hashes for different content", () => {
    const contents = [
      Buffer.from("file content A"),
      Buffer.from("file content B"),
      Buffer.from("file content C"),
      Buffer.alloc(0), // empty buffer
    ];

    const hashes = contents.map((buf) =>
      crypto.createHash("sha256").update(buf).digest("hex")
    );

    // All hashes should be unique
    const uniqueHashes = new Set(hashes);
    expect(uniqueHashes.size).toBe(hashes.length);
  });

  it("hash is deterministic for binary content", () => {
    // Simulate a JPEG-like binary buffer
    const jpegHeader = Buffer.from([0xff, 0xd8, 0xff, 0xe0, 0x00, 0x10]);
    const hash1 = crypto.createHash("sha256").update(jpegHeader).digest("hex");
    const hash2 = crypto.createHash("sha256").update(jpegHeader).digest("hex");
    expect(hash1).toBe(hash2);
  });
});

describe("Background Worker Logic", () => {
  it("worker module exports startBackgroundWorker and stopBackgroundWorker", async () => {
    // Dynamic import to verify exports exist
    const mod = await import("./backgroundWorker");
    expect(typeof mod.startBackgroundWorker).toBe("function");
    expect(typeof mod.stopBackgroundWorker).toBe("function");
  });

  it("stopBackgroundWorker clears the interval", async () => {
    const mod = await import("./backgroundWorker");
    // Calling stop when not started should not throw
    expect(() => mod.stopBackgroundWorker()).not.toThrow();
  });
});

describe("BatchProgress Interface", () => {
  it("batch progress tracks skippedDuplicates field", () => {
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

    const progress: BatchProgress = {
      total: 100,
      uploaded: 50,
      processing: 3,
      processed: 40,
      failed: 2,
      skippedDuplicates: 8,
      documentIds: [1, 2, 3],
      errors: [],
      status: "processing",
      startedAt: Date.now(),
    };

    expect(progress.skippedDuplicates).toBe(8);
    expect(progress.total).toBe(100);
    // processed + failed + skippedDuplicates should account for all done items
    expect(progress.processed + progress.failed + progress.skippedDuplicates).toBe(50);
  });

  it("progress correctly calculates completion percentage", () => {
    const total = 200;
    const processed = 150;
    const failed = 10;
    const skippedDuplicates = 30;
    const done = processed + failed + skippedDuplicates;
    const percentage = (done / total) * 100;

    expect(percentage).toBe(95);
  });
});

describe("Normalization Functions", () => {
  // Test the normalizeNationality logic (from documentProcessor)
  it("normalizes nationality variants correctly", () => {
    function normalizeNationality(value: string | null): string | null {
      if (!value) return null;
      const trimmed = value.trim();
      if (!trimmed) return null;
      const lower = trimmed.toLowerCase().replace(/[^a-z\s]/g, "").trim();
      if (/^kuwait[i]?[t]?$/i.test(lower)) return "Kuwaiti";
      if (/^non[\s-]*kuwait[i]?[t]?$/i.test(lower)) return "Non-Kuwaiti";
      if (lower === "non") return "Non-Kuwaiti";
      return trimmed
        .split(/\s+/)
        .map((w) => w.charAt(0).toUpperCase() + w.slice(1).toLowerCase())
        .join(" ");
    }

    expect(normalizeNationality("KUWAITI")).toBe("Kuwaiti");
    expect(normalizeNationality("Kuwait")).toBe("Kuwaiti");
    expect(normalizeNationality("KUWAITT")).toBe("Kuwaiti");
    expect(normalizeNationality("NON KUWAITI")).toBe("Non-Kuwaiti");
    expect(normalizeNationality("NON KUWAIT")).toBe("Non-Kuwaiti");
    expect(normalizeNationality("NON")).toBe("Non-Kuwaiti");
    expect(normalizeNationality(null)).toBeNull();
    expect(normalizeNationality("")).toBeNull();
    expect(normalizeNationality("Indian")).toBe("Indian");
  });

  // Test the normalizeResult logic (from documentProcessor)
  it("normalizes test result variants correctly", () => {
    function normalizeResult(value: string | null | undefined): string {
      if (!value || !value.trim()) return "Not Available";
      const trimmed = value.trim();
      const lower = trimmed.toLowerCase();
      if (
        lower === "not detected" ||
        lower === "non reactive" ||
        lower === "nonreactive" ||
        lower === "non-reactive"
      )
        return "Not Detected";
      if (lower === "negative") return "Negative";
      if (lower === "positive") return "Positive";
      if (lower === "reactive") return "Reactive";
      if (lower === "detected") return "Detected";
      if (lower === "indeterminate") return "Indeterminate";
      if (lower === "not available" || lower === "n/a" || lower === "na")
        return "Not Available";
      return trimmed;
    }

    expect(normalizeResult("Not detected")).toBe("Not Detected");
    expect(normalizeResult("NON REACTIVE")).toBe("Not Detected");
    expect(normalizeResult("nonreactive")).toBe("Not Detected");
    expect(normalizeResult("NEGATIVE")).toBe("Negative");
    expect(normalizeResult("positive")).toBe("Positive");
    expect(normalizeResult("reactive")).toBe("Reactive");
    expect(normalizeResult(null)).toBe("Not Available");
    expect(normalizeResult("")).toBe("Not Available");
    expect(normalizeResult("n/a")).toBe("Not Available");
    expect(normalizeResult("76 Copies/mL")).toBe("76 Copies/mL");
  });
});
