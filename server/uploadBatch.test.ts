import { describe, it, expect, vi, beforeEach } from "vitest";

// Mock the database module
vi.mock("./db", () => ({
  getDb: vi.fn().mockResolvedValue(null),
}));

// Mock the schema
vi.mock("../drizzle/schema", () => ({
  uploadBatches: {
    id: "id",
    jobId: "jobId",
    userId: "userId",
    fileName: "fileName",
    status: "status",
    totalEntries: "totalEntries",
    processedEntries: "processedEntries",
    uploadedToS3: "uploadedToS3",
    skippedDuplicates: "skippedDuplicates",
    failed: "failed",
    errors: "errors",
    startedAt: "startedAt",
    completedAt: "completedAt",
    createdAt: "createdAt",
    updatedAt: "updatedAt",
  },
  users: {
    id: "id",
    name: "name",
    email: "email",
  },
}));

describe("uploadBatchDb", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("createUploadBatch throws when DB is not available", async () => {
    const { createUploadBatch } = await import("./uploadBatchDb");
    await expect(
      createUploadBatch({
        jobId: "test-job-1",
        userId: 1,
        fileName: "test.zip",
        status: "extracting",
        totalEntries: 0,
        processedEntries: 0,
        uploadedToS3: 0,
        skippedDuplicates: 0,
        failed: 0,
        errors: null,
        startedAt: Date.now(),
        completedAt: null,
      })
    ).rejects.toThrow("Database not available");
  });

  it("getUploadBatchByJobId returns null when DB is not available", async () => {
    const { getUploadBatchByJobId } = await import("./uploadBatchDb");
    const result = await getUploadBatchByJobId("nonexistent");
    expect(result).toBeNull();
  });

  it("getRecentUploadBatches returns empty array when DB is not available", async () => {
    const { getRecentUploadBatches } = await import("./uploadBatchDb");
    const result = await getRecentUploadBatches();
    expect(result).toEqual([]);
  });

  it("getActiveUploadBatches returns empty array when DB is not available", async () => {
    const { getActiveUploadBatches } = await import("./uploadBatchDb");
    const result = await getActiveUploadBatches(1);
    expect(result).toEqual([]);
  });

  it("updateUploadBatch does nothing when DB is not available", async () => {
    const { updateUploadBatch } = await import("./uploadBatchDb");
    // Should not throw
    await updateUploadBatch("test-job", { status: "complete" });
  });
});

describe("largeZipProcessor DB persistence", () => {
  it("getLargeZipProgressFromDb returns null for nonexistent job", async () => {
    const { getLargeZipProgressFromDb } = await import("./largeZipProcessor");
    const result = await getLargeZipProgressFromDb("nonexistent-job-id");
    expect(result).toBeNull();
  });

  it("getLargeZipProgress returns null for nonexistent in-memory job", async () => {
    const { getLargeZipProgress } = await import("./largeZipProcessor");
    const result = getLargeZipProgress("nonexistent-job-id");
    expect(result).toBeNull();
  });
});
