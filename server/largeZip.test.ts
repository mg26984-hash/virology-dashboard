import { describe, expect, it, vi, beforeAll } from "vitest";
import { appRouter } from "./routers";
import type { TrpcContext } from "./_core/context";
import AdmZip from "adm-zip";

type AuthenticatedUser = NonNullable<TrpcContext["user"]>;

function createMockUser(overrides: Partial<AuthenticatedUser> = {}): AuthenticatedUser {
  return {
    id: 1,
    openId: "test-user-123",
    email: "doctor@hospital.com",
    name: "Dr. Test User",
    loginMethod: "google",
    role: "user",
    status: "approved",
    createdAt: new Date(),
    updatedAt: new Date(),
    lastSignedIn: new Date(),
    ...overrides,
  };
}

function createMockContext(user: AuthenticatedUser | null = null): TrpcContext {
  return {
    user,
    req: {
      protocol: "https",
      headers: {},
    } as TrpcContext["req"],
    res: {
      clearCookie: vi.fn(),
    } as unknown as TrpcContext["res"],
  };
}

/**
 * Create a small test ZIP file containing JPEG-like files
 */
function createTestZip(fileCount: number = 3): Buffer {
  const zip = new AdmZip();
  for (let i = 0; i < fileCount; i++) {
    const uniqueContent = `JPEG-TEST-${Date.now()}-${Math.random()}-${i}`;
    const encoder = new TextEncoder();
    const jpegHeader = new Uint8Array([0xFF, 0xD8, 0xFF, 0xE0]);
    const content = encoder.encode(uniqueContent);
    const combined = new Uint8Array(jpegHeader.length + content.length);
    combined.set(jpegHeader);
    combined.set(content, jpegHeader.length);
    zip.addFile(`test-image-${i}.jpg`, Buffer.from(combined));
  }
  return zip.toBuffer();
}

describe("Large ZIP Processor Module", () => {
  it("getLargeZipProgress returns null for non-existent job", async () => {
    const { getLargeZipProgress } = await import("./largeZipProcessor");
    const result = getLargeZipProgress("non-existent-job-id");
    expect(result).toBeNull();
  });

  it("processLargeZip creates a job and returns a jobId", async () => {
    const { processLargeZip, getLargeZipProgress } = await import("./largeZipProcessor");
    
    const zipBuffer = createTestZip(2);
    const jobId = await processLargeZip(zipBuffer, "test-small.zip", 1);
    
    expect(typeof jobId).toBe("string");
    expect(jobId.length).toBeGreaterThan(0);
    
    // Job should exist in progress tracking
    const progress = getLargeZipProgress(jobId);
    expect(progress).not.toBeNull();
    expect(progress!.fileName).toBe("test-small.zip");
    expect(progress!.jobId).toBe(jobId);
  });

  it("processLargeZip processes entries and reaches complete status", { timeout: 120000 }, async () => {
    const { processLargeZip, getLargeZipProgress } = await import("./largeZipProcessor");
    
    const zipBuffer = createTestZip(3);
    const jobId = await processLargeZip(zipBuffer, "test-complete.zip", 1);
    
    // Wait for processing to complete (poll every 500ms, max 60s)
    let progress = getLargeZipProgress(jobId);
    const maxWait = 60000;
    const start = Date.now();
    while (progress && progress.status !== "complete" && progress.status !== "error" && Date.now() - start < maxWait) {
      await new Promise((r) => setTimeout(r, 500));
      progress = getLargeZipProgress(jobId);
    }
    
    expect(progress).not.toBeNull();
    expect(progress!.status).toBe("complete");
    expect(progress!.totalEntries).toBe(3);
    expect(progress!.processedEntries).toBe(3);
    // All files should be uploaded (no duplicates since content is unique)
    expect(progress!.uploadedToS3).toBe(3);
    expect(progress!.completedAt).toBeDefined();
  });

  it("processLargeZip handles ZIP with no valid files", { timeout: 30000 }, async () => {
    const { processLargeZip, getLargeZipProgress } = await import("./largeZipProcessor");
    
    // Create a ZIP with only unsupported file types
    const zip = new AdmZip();
    zip.addFile("readme.txt", Buffer.from("Hello world"));
    zip.addFile("data.csv", Buffer.from("a,b,c\n1,2,3"));
    const zipBuffer = zip.toBuffer();
    
    const jobId = await processLargeZip(zipBuffer, "no-valid-files.zip", 1);
    
    // Wait for completion
    let progress = getLargeZipProgress(jobId);
    const maxWait = 10000;
    const start = Date.now();
    while (progress && progress.status !== "complete" && progress.status !== "error" && Date.now() - start < maxWait) {
      await new Promise((r) => setTimeout(r, 500));
      progress = getLargeZipProgress(jobId);
    }
    
    expect(progress).not.toBeNull();
    expect(progress!.status).toBe("complete");
    expect(progress!.totalEntries).toBe(0);
    expect(progress!.uploadedToS3).toBe(0);
  });

  it("processLargeZip skips __MACOSX and hidden files", { timeout: 60000 }, async () => {
    const { processLargeZip, getLargeZipProgress } = await import("./largeZipProcessor");
    
    const zip = new AdmZip();
    // Valid file
    const jpegHeader = new Uint8Array([0xFF, 0xD8, 0xFF, 0xE0]);
    const uniqueContent = new TextEncoder().encode(`MACOSX-TEST-${Date.now()}-${Math.random()}`);
    const combined = new Uint8Array(jpegHeader.length + uniqueContent.length);
    combined.set(jpegHeader);
    combined.set(uniqueContent, jpegHeader.length);
    zip.addFile("valid-image.jpg", Buffer.from(combined));
    // __MACOSX junk
    zip.addFile("__MACOSX/._valid-image.jpg", Buffer.from("junk"));
    // Hidden file
    zip.addFile(".hidden-file.jpg", Buffer.from("junk"));
    const zipBuffer = zip.toBuffer();
    
    const jobId = await processLargeZip(zipBuffer, "macosx-test.zip", 1);
    
    // Wait for completion
    let progress = getLargeZipProgress(jobId);
    const maxWait = 15000;
    const start = Date.now();
    while (progress && progress.status !== "complete" && progress.status !== "error" && Date.now() - start < maxWait) {
      await new Promise((r) => setTimeout(r, 500));
      progress = getLargeZipProgress(jobId);
    }
    
    expect(progress).not.toBeNull();
    expect(progress!.status).toBe("complete");
    expect(progress!.totalEntries).toBe(1); // Only the valid image
    expect(progress!.uploadedToS3).toBe(1);
  });

  it("processLargeZip handles deduplication", { timeout: 60000 }, async () => {
    const { processLargeZip, getLargeZipProgress } = await import("./largeZipProcessor");
    
    // Create a ZIP with duplicate content
    const jpegHeader = new Uint8Array([0xFF, 0xD8, 0xFF, 0xE0]);
    const sharedContent = new TextEncoder().encode(`DEDUP-LARGE-ZIP-${Date.now()}`);
    const combined = new Uint8Array(jpegHeader.length + sharedContent.length);
    combined.set(jpegHeader);
    combined.set(sharedContent, jpegHeader.length);
    
    const zip = new AdmZip();
    zip.addFile("image-a.jpg", Buffer.from(combined));
    zip.addFile("image-b.jpg", Buffer.from(combined)); // Same content, different name
    const zipBuffer = zip.toBuffer();
    
    const jobId = await processLargeZip(zipBuffer, "dedup-test.zip", 1);
    
    // Wait for completion
    let progress = getLargeZipProgress(jobId);
    const maxWait = 15000;
    const start = Date.now();
    while (progress && progress.status !== "complete" && progress.status !== "error" && Date.now() - start < maxWait) {
      await new Promise((r) => setTimeout(r, 500));
      progress = getLargeZipProgress(jobId);
    }
    
    expect(progress).not.toBeNull();
    expect(progress!.status).toBe("complete");
    expect(progress!.totalEntries).toBe(2);
    expect(progress!.processedEntries).toBe(2);
    // First file uploaded, second should be a duplicate
    expect(progress!.uploadedToS3).toBe(1);
    expect(progress!.skippedDuplicates).toBe(1);
  });
});

describe("Large ZIP Upload API Endpoint", () => {
  it("rejects unauthenticated requests", async () => {
    const resp = await fetch("http://localhost:3000/api/upload/zip/large", {
      method: "POST",
    });
    expect(resp.status).toBe(403);
    const data = await resp.json();
    expect(data.error).toContain("Unauthorized");
  });

  it("rejects requests with no file", async () => {
    // Generate a valid token
    const user = createMockUser({ status: "approved" });
    const ctx = createMockContext(user);
    const caller = appRouter.createCaller(ctx);
    const { token } = await caller.documents.generateUploadToken();

    const resp = await fetch(`http://localhost:3000/api/upload/zip/large?token=${token}`, {
      method: "POST",
    });
    expect(resp.status).toBe(400);
    const data = await resp.json();
    expect(data.error).toContain("No file");
  });

  it("accepts a valid ZIP file with token auth", async () => {
    // Generate a valid token
    const user = createMockUser({ status: "approved" });
    const ctx = createMockContext(user);
    const caller = appRouter.createCaller(ctx);
    const { token } = await caller.documents.generateUploadToken();

    // Create a small test ZIP
    const zipBuffer = createTestZip(2);
    const blob = new Blob([zipBuffer], { type: "application/zip" });

    const formData = new FormData();
    formData.append("file", blob, "test-upload.zip");

    const resp = await fetch(`http://localhost:3000/api/upload/zip/large?token=${token}`, {
      method: "POST",
      body: formData,
    });
    expect(resp.status).toBe(200);
    const data = await resp.json();
    expect(data.success).toBe(true);
    expect(data.jobId).toBeDefined();
    expect(typeof data.jobId).toBe("string");
    expect(data.fileName).toBe("test-upload.zip");
  });

  it("progress endpoint returns job status", async () => {
    // Generate a valid token
    const user = createMockUser({ status: "approved" });
    const ctx = createMockContext(user);
    const caller = appRouter.createCaller(ctx);
    const { token } = await caller.documents.generateUploadToken();

    // Upload a ZIP
    const zipBuffer = createTestZip(2);
    const blob = new Blob([zipBuffer], { type: "application/zip" });
    const formData = new FormData();
    formData.append("file", blob, "progress-test.zip");

    const uploadResp = await fetch(`http://localhost:3000/api/upload/zip/large?token=${token}`, {
      method: "POST",
      body: formData,
    });
    const uploadData = await uploadResp.json();
    const jobId = uploadData.jobId;

    // Poll progress
    const progressResp = await fetch(`http://localhost:3000/api/upload/zip/large/progress/${jobId}`);
    expect(progressResp.status).toBe(200);
    const progressData = await progressResp.json();
    expect(progressData.jobId).toBe(jobId);
    expect(progressData.fileName).toBe("progress-test.zip");
    expect(["extracting", "processing", "complete"]).toContain(progressData.status);
  });

  it("progress endpoint returns 404 for non-existent job", async () => {
    const resp = await fetch("http://localhost:3000/api/upload/zip/large/progress/non-existent-job");
    expect(resp.status).toBe(404);
  });
});
