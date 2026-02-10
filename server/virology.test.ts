import { describe, expect, it, vi, beforeEach } from "vitest";
import { appRouter } from "./routers";
import type { TrpcContext } from "./_core/context";

type AuthenticatedUser = NonNullable<TrpcContext["user"]>;

// Mock user factory
function createMockUser(overrides: Partial<AuthenticatedUser> = {}): AuthenticatedUser {
  return {
    id: 1,
    openId: "test-user-123",
    email: "doctor@hospital.com",
    name: "Dr. Test User",
    loginMethod: "manus",
    role: "user",
    status: "approved",
    createdAt: new Date(),
    updatedAt: new Date(),
    lastSignedIn: new Date(),
    ...overrides,
  };
}

// Mock context factory
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

describe("User Access Control", () => {
  it("pending users cannot access dashboard stats", async () => {
    const pendingUser = createMockUser({ status: "pending" });
    const ctx = createMockContext(pendingUser);
    const caller = appRouter.createCaller(ctx);

    await expect(caller.dashboard.stats()).rejects.toThrow();
  });

  it("banned users cannot access dashboard stats", async () => {
    const bannedUser = createMockUser({ status: "banned" });
    const ctx = createMockContext(bannedUser);
    const caller = appRouter.createCaller(ctx);

    await expect(caller.dashboard.stats()).rejects.toThrow();
  });

  it("approved users can access dashboard stats", async () => {
    const approvedUser = createMockUser({ status: "approved" });
    const ctx = createMockContext(approvedUser);
    const caller = appRouter.createCaller(ctx);

    const result = await caller.dashboard.stats();
    expect(result).toHaveProperty("totalPatients");
    expect(result).toHaveProperty("totalTests");
    expect(result).toHaveProperty("totalDocuments");
    expect(result).toHaveProperty("pendingDocuments");
  });
});

describe("Patient Search", () => {
  it("approved users can search patients", async () => {
    const approvedUser = createMockUser({ status: "approved" });
    const ctx = createMockContext(approvedUser);
    const caller = appRouter.createCaller(ctx);

    const result = await caller.patients.search({ limit: 10 });
    expect(result).toHaveProperty("patients");
    expect(result).toHaveProperty("total");
    expect(Array.isArray(result.patients)).toBe(true);
  });

  it("search accepts query parameter", async () => {
    const approvedUser = createMockUser({ status: "approved" });
    const ctx = createMockContext(approvedUser);
    const caller = appRouter.createCaller(ctx);

    const result = await caller.patients.search({ 
      query: "267110800212",
      limit: 10 
    });
    expect(result).toHaveProperty("patients");
    expect(result).toHaveProperty("total");
  });

  it("search accepts filter parameters", async () => {
    const approvedUser = createMockUser({ status: "approved" });
    const ctx = createMockContext(approvedUser);
    const caller = appRouter.createCaller(ctx);

    const result = await caller.patients.search({ 
      civilId: "267110800212",
      nationality: "KUWAITI",
      limit: 10 
    });
    expect(result).toHaveProperty("patients");
    expect(result).toHaveProperty("total");
  });

  it("pending users cannot search patients", async () => {
    const pendingUser = createMockUser({ status: "pending" });
    const ctx = createMockContext(pendingUser);
    const caller = appRouter.createCaller(ctx);

    await expect(caller.patients.search({ limit: 10 })).rejects.toThrow();
  });
});

describe("User Management (Admin)", () => {
  it("admin can list all users", async () => {
    const adminUser = createMockUser({ role: "admin", status: "approved" });
    const ctx = createMockContext(adminUser);
    const caller = appRouter.createCaller(ctx);

    const result = await caller.users.list();
    expect(Array.isArray(result)).toBe(true);
  });

  it("non-admin cannot list users", async () => {
    const regularUser = createMockUser({ role: "user", status: "approved" });
    const ctx = createMockContext(regularUser);
    const caller = appRouter.createCaller(ctx);

    await expect(caller.users.list()).rejects.toThrow();
  });

  it("admin can view audit logs", async () => {
    const adminUser = createMockUser({ role: "admin", status: "approved" });
    const ctx = createMockContext(adminUser);
    const caller = appRouter.createCaller(ctx);

    const result = await caller.users.auditLogs();
    expect(Array.isArray(result)).toBe(true);
  });

  it("non-admin cannot view audit logs", async () => {
    const regularUser = createMockUser({ role: "user", status: "approved" });
    const ctx = createMockContext(regularUser);
    const caller = appRouter.createCaller(ctx);

    await expect(caller.users.auditLogs()).rejects.toThrow();
  });
});

describe("Document Upload", () => {
  it("approved users can upload documents", async () => {
    const approvedUser = createMockUser({ status: "approved" });
    const ctx = createMockContext(approvedUser);
    const caller = appRouter.createCaller(ctx);

    // Test with minimal valid base64 image data
    const result = await caller.documents.upload({
      fileName: "test-report.jpg",
      fileData: "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNk+M9QDwADhgGAWjR9awAAAABJRU5ErkJggg==",
      mimeType: "image/jpeg",
      fileSize: 100,
    });

    expect(result).toHaveProperty("documentId");
    expect(result).toHaveProperty("status");
  });

  it("pending users cannot upload documents", async () => {
    const pendingUser = createMockUser({ status: "pending" });
    const ctx = createMockContext(pendingUser);
    const caller = appRouter.createCaller(ctx);

    await expect(caller.documents.upload({
      fileName: "test-report.jpg",
      fileData: "base64data",
      mimeType: "image/jpeg",
      fileSize: 100,
    })).rejects.toThrow();
  });
});

describe("Recent Documents", () => {
  it("approved users can view recent documents", async () => {
    const approvedUser = createMockUser({ status: "approved" });
    const ctx = createMockContext(approvedUser);
    const caller = appRouter.createCaller(ctx);

    const result = await caller.documents.recent({ limit: 5 });
    expect(Array.isArray(result)).toBe(true);
  });

  it("pending users cannot view recent documents", async () => {
    const pendingUser = createMockUser({ status: "pending" });
    const ctx = createMockContext(pendingUser);
    const caller = appRouter.createCaller(ctx);

    await expect(caller.documents.recent({ limit: 5 })).rejects.toThrow();
  });
});

describe("ZIP Upload", () => {
  it("approved users can upload ZIP files", async () => {
    const approvedUser = createMockUser({ status: "approved" });
    const ctx = createMockContext(approvedUser);
    const caller = appRouter.createCaller(ctx);

    // Create a minimal valid ZIP file in base64 (empty ZIP)
    // This is a valid ZIP file with no entries
    const emptyZipBase64 = "UEsFBgAAAAAAAAAAAAAAAAAAAAAAAA==";

    // The uploadZip should handle empty ZIPs gracefully
    await expect(caller.documents.uploadZip({
      fileName: "test-reports.zip",
      fileData: emptyZipBase64,
      fileSize: 22,
    })).rejects.toThrow(); // Should throw because no valid files in ZIP
  });

  it("pending users cannot upload ZIP files", async () => {
    const pendingUser = createMockUser({ status: "pending" });
    const ctx = createMockContext(pendingUser);
    const caller = appRouter.createCaller(ctx);

    await expect(caller.documents.uploadZip({
      fileName: "test-reports.zip",
      fileData: "UEsFBgAAAAAAAAAAAAAAAAAAAAAAAA==",
      fileSize: 22,
    })).rejects.toThrow();
  });
});

describe("Date Range Filters", () => {
  it("search accepts date range parameters", async () => {
    const approvedUser = createMockUser({ status: "approved" });
    const ctx = createMockContext(approvedUser);
    const caller = appRouter.createCaller(ctx);

    const result = await caller.patients.search({ 
      accessionDateFrom: "2026-01-01",
      accessionDateTo: "2026-12-31",
      limit: 10 
    });
    expect(result).toHaveProperty("patients");
    expect(result).toHaveProperty("total");
    expect(Array.isArray(result.patients)).toBe(true);
  });

  it("search with only from date works", async () => {
    const approvedUser = createMockUser({ status: "approved" });
    const ctx = createMockContext(approvedUser);
    const caller = appRouter.createCaller(ctx);

    const result = await caller.patients.search({ 
      accessionDateFrom: "2026-01-01",
      limit: 10 
    });
    expect(result).toHaveProperty("patients");
    expect(result).toHaveProperty("total");
  });

  it("search with only to date works", async () => {
    const approvedUser = createMockUser({ status: "approved" });
    const ctx = createMockContext(approvedUser);
    const caller = appRouter.createCaller(ctx);

    const result = await caller.patients.search({ 
      accessionDateTo: "2026-12-31",
      limit: 10 
    });
    expect(result).toHaveProperty("patients");
    expect(result).toHaveProperty("total");
  });
});

describe("Document Status Polling", () => {
  it("approved users can get document statuses", async () => {
    const approvedUser = createMockUser({ status: "approved" });
    const ctx = createMockContext(approvedUser);
    const caller = appRouter.createCaller(ctx);

    const result = await caller.documents.getStatuses({ documentIds: [1, 2, 3] });
    expect(Array.isArray(result)).toBe(true);
  });

  it("pending users cannot get document statuses", async () => {
    const pendingUser = createMockUser({ status: "pending" });
    const ctx = createMockContext(pendingUser);
    const caller = appRouter.createCaller(ctx);

    await expect(caller.documents.getStatuses({ documentIds: [1] })).rejects.toThrow();
  });

  it("empty document IDs returns empty array", async () => {
    const approvedUser = createMockUser({ status: "approved" });
    const ctx = createMockContext(approvedUser);
    const caller = appRouter.createCaller(ctx);

    const result = await caller.documents.getStatuses({ documentIds: [] });
    expect(result).toEqual([]);
  });
});

describe("Chunked Upload", () => {
  it("approved users can initialize chunked upload", async () => {
    const approvedUser = createMockUser({ status: "approved" });
    const ctx = createMockContext(approvedUser);
    const caller = appRouter.createCaller(ctx);

    const result = await caller.documents.initChunkedUpload({
      uploadId: "test-upload-123",
      fileName: "test-large-file.zip",
      totalChunks: 10,
      totalSize: 50000000,
    });
    expect(result).toHaveProperty("success", true);
    expect(result).toHaveProperty("uploadId", "test-upload-123");
  });

  it("pending users cannot initialize chunked upload", async () => {
    const pendingUser = createMockUser({ status: "pending" });
    const ctx = createMockContext(pendingUser);
    const caller = appRouter.createCaller(ctx);

    await expect(caller.documents.initChunkedUpload({
      uploadId: "test-upload-456",
      fileName: "test-large-file.zip",
      totalChunks: 10,
      totalSize: 50000000,
    })).rejects.toThrow();
  });

  it("approved users can upload chunks", async () => {
    const approvedUser = createMockUser({ status: "approved" });
    const ctx = createMockContext(approvedUser);
    const caller = appRouter.createCaller(ctx);

    // First initialize the upload
    await caller.documents.initChunkedUpload({
      uploadId: "test-chunk-upload",
      fileName: "test-file.zip",
      totalChunks: 2,
      totalSize: 1000,
    });

    // Upload first chunk
    const result = await caller.documents.uploadChunk({
      uploadId: "test-chunk-upload",
      chunkIndex: 0,
      chunkData: "dGVzdCBjaHVuayBkYXRh", // "test chunk data" in base64
    });
    expect(result).toHaveProperty("complete", false);
    expect(result).toHaveProperty("receivedChunks", 1);
    expect(result).toHaveProperty("totalChunks", 2);
  });

  it("get chunked upload status works", async () => {
    const approvedUser = createMockUser({ status: "approved" });
    const ctx = createMockContext(approvedUser);
    const caller = appRouter.createCaller(ctx);

    // Initialize upload
    await caller.documents.initChunkedUpload({
      uploadId: "test-status-upload",
      fileName: "test-file.zip",
      totalChunks: 3,
      totalSize: 3000,
    });

    const status = await caller.documents.getChunkedUploadStatus({
      uploadId: "test-status-upload",
    });
    expect(status).toHaveProperty("exists", true);
    expect(status).toHaveProperty("receivedChunks", 0);
    expect(status).toHaveProperty("totalChunks", 3);
  });

  it("non-existent upload returns exists: false", async () => {
    const approvedUser = createMockUser({ status: "approved" });
    const ctx = createMockContext(approvedUser);
    const caller = appRouter.createCaller(ctx);

    const status = await caller.documents.getChunkedUploadStatus({
      uploadId: "non-existent-upload",
    });
    expect(status).toHaveProperty("exists", false);
  });
});

describe("Auth Flow", () => {
  it("auth.me returns user info for authenticated users", async () => {
    const user = createMockUser();
    const ctx = createMockContext(user);
    const caller = appRouter.createCaller(ctx);

    const result = await caller.auth.me();
    expect(result).toEqual({ ...user, isOwner: false });
  });

  it("auth.me returns null for unauthenticated users", async () => {
    const ctx = createMockContext(null);
    const caller = appRouter.createCaller(ctx);

    const result = await caller.auth.me();
    expect(result).toBeNull();
  });

  it("auth.logout clears session cookie", async () => {
    const user = createMockUser();
    const ctx = createMockContext(user);
    const caller = appRouter.createCaller(ctx);

    const result = await caller.auth.logout();
    expect(result).toEqual({ success: true });
    expect(ctx.res.clearCookie).toHaveBeenCalled();
  });
});


describe("Processing Stats (ETA)", () => {
  it("approved users can get processing stats", async () => {
    const approvedUser = createMockUser({ status: "approved" });
    const ctx = createMockContext(approvedUser);
    const caller = appRouter.createCaller(ctx);

    const result = await caller.dashboard.processingStats();
    expect(result).toHaveProperty("avgProcessingTime");
    expect(result).toHaveProperty("pendingCount");
    expect(result).toHaveProperty("processingCount");
    expect(result).toHaveProperty("completedLast5Min");
    expect(typeof result.avgProcessingTime).toBe("number");
    expect(result.avgProcessingTime).toBeGreaterThanOrEqual(5000); // Minimum 5 seconds
  });

  it("pending users cannot get processing stats", async () => {
    const pendingUser = createMockUser({ status: "pending" });
    const ctx = createMockContext(pendingUser);
    const caller = appRouter.createCaller(ctx);

    await expect(caller.dashboard.processingStats()).rejects.toThrow();
  });

  it("banned users cannot get processing stats", async () => {
    const bannedUser = createMockUser({ status: "banned" });
    const ctx = createMockContext(bannedUser);
    const caller = appRouter.createCaller(ctx);

    await expect(caller.dashboard.processingStats()).rejects.toThrow();
  });
});

describe("Export Feature (Admin Only)", () => {
  it("admin can get filter options", async () => {
    const adminUser = createMockUser({ role: "admin", status: "approved" });
    const ctx = createMockContext(adminUser);
    const caller = appRouter.createCaller(ctx);

    const result = await caller.export.filterOptions();
    expect(result).toHaveProperty("testTypes");
    expect(result).toHaveProperty("nationalities");
    expect(Array.isArray(result.testTypes)).toBe(true);
    expect(Array.isArray(result.nationalities)).toBe(true);
  });

  it("non-admin cannot get filter options", async () => {
    const regularUser = createMockUser({ role: "user", status: "approved" });
    const ctx = createMockContext(regularUser);
    const caller = appRouter.createCaller(ctx);

    await expect(caller.export.filterOptions()).rejects.toThrow();
  });

  it("admin can preview export row count with no filters", async () => {
    const adminUser = createMockUser({ role: "admin", status: "approved" });
    const ctx = createMockContext(adminUser);
    const caller = appRouter.createCaller(ctx);

    const result = await caller.export.preview({});
    expect(result).toHaveProperty("rowCount");
    expect(typeof result.rowCount).toBe("number");
    expect(result.rowCount).toBeGreaterThanOrEqual(0);
  });

  it("admin can preview export with date filters", async () => {
    const adminUser = createMockUser({ role: "admin", status: "approved" });
    const ctx = createMockContext(adminUser);
    const caller = appRouter.createCaller(ctx);

    const result = await caller.export.preview({
      dateFrom: "2025-01-01",
      dateTo: "2026-12-31",
    });
    expect(result).toHaveProperty("rowCount");
    expect(typeof result.rowCount).toBe("number");
  });

  it("admin can preview export with test type filter", async () => {
    const adminUser = createMockUser({ role: "admin", status: "approved" });
    const ctx = createMockContext(adminUser);
    const caller = appRouter.createCaller(ctx);

    const result = await caller.export.preview({
      testType: "HBV",
    });
    expect(result).toHaveProperty("rowCount");
    expect(typeof result.rowCount).toBe("number");
  });

  it("admin can preview export with nationality filter", async () => {
    const adminUser = createMockUser({ role: "admin", status: "approved" });
    const ctx = createMockContext(adminUser);
    const caller = appRouter.createCaller(ctx);

    const result = await caller.export.preview({
      nationality: "KUWAITI",
    });
    expect(result).toHaveProperty("rowCount");
    expect(typeof result.rowCount).toBe("number");
  });

  it("admin can preview export with civil ID filter", async () => {
    const adminUser = createMockUser({ role: "admin", status: "approved" });
    const ctx = createMockContext(adminUser);
    const caller = appRouter.createCaller(ctx);

    const result = await caller.export.preview({
      civilId: "267",
    });
    expect(result).toHaveProperty("rowCount");
    expect(typeof result.rowCount).toBe("number");
  });

  it("admin can preview export with patient name filter", async () => {
    const adminUser = createMockUser({ role: "admin", status: "approved" });
    const ctx = createMockContext(adminUser);
    const caller = appRouter.createCaller(ctx);

    const result = await caller.export.preview({
      patientName: "test",
    });
    expect(result).toHaveProperty("rowCount");
    expect(typeof result.rowCount).toBe("number");
  });

  it("non-admin cannot preview export", async () => {
    const regularUser = createMockUser({ role: "user", status: "approved" });
    const ctx = createMockContext(regularUser);
    const caller = appRouter.createCaller(ctx);

    await expect(caller.export.preview({})).rejects.toThrow();
  });

  it("admin can generate Excel export", async () => {
    const adminUser = createMockUser({ role: "admin", status: "approved" });
    const ctx = createMockContext(adminUser);
    const caller = appRouter.createCaller(ctx);

    // First check if there's data to export
    const preview = await caller.export.preview({});
    
    if (preview.rowCount > 0) {
      const result = await caller.export.generate({});
      expect(result).toHaveProperty("base64");
      expect(result).toHaveProperty("fileName");
      expect(result).toHaveProperty("rowCount");
      expect(result).toHaveProperty("uniquePatients");
      expect(result.fileName).toMatch(/virology-export-.*\.xlsx$/);
      expect(result.base64.length).toBeGreaterThan(0);
      expect(result.rowCount).toBeGreaterThan(0);
      expect(result.uniquePatients).toBeGreaterThan(0);
    } else {
      // No data - should throw NOT_FOUND
      await expect(caller.export.generate({})).rejects.toThrow();
    }
  });

  it("admin can generate filtered Excel export", async () => {
    const adminUser = createMockUser({ role: "admin", status: "approved" });
    const ctx = createMockContext(adminUser);
    const caller = appRouter.createCaller(ctx);

    const preview = await caller.export.preview({
      dateFrom: "2025-01-01",
      dateTo: "2026-12-31",
    });

    if (preview.rowCount > 0) {
      const result = await caller.export.generate({
        dateFrom: "2025-01-01",
        dateTo: "2026-12-31",
      });
      expect(result.rowCount).toBeGreaterThan(0);
      expect(result.base64.length).toBeGreaterThan(0);
    }
  });

  it("non-admin cannot generate Excel export", async () => {
    const regularUser = createMockUser({ role: "user", status: "approved" });
    const ctx = createMockContext(regularUser);
    const caller = appRouter.createCaller(ctx);

    await expect(caller.export.generate({})).rejects.toThrow();
  });

  it("pending user cannot access export features", async () => {
    const pendingUser = createMockUser({ status: "pending" });
    const ctx = createMockContext(pendingUser);
    const caller = appRouter.createCaller(ctx);

    await expect(caller.export.filterOptions()).rejects.toThrow();
    await expect(caller.export.preview({})).rejects.toThrow();
    await expect(caller.export.generate({})).rejects.toThrow();
  });
});

describe("Patient PDF Report Generation", () => {
  it("approved user can generate PDF for an existing patient", async () => {
    const approvedUser = createMockUser({ status: "approved" });
    const ctx = createMockContext(approvedUser);
    const caller = appRouter.createCaller(ctx);

    // Get a patient from the database first
    const searchResult = await caller.patients.search({ limit: 1 });
    
    if (searchResult.patients.length > 0) {
      const patient = searchResult.patients[0];
      const result = await caller.patients.generatePDF({ patientId: patient.id });
      
      expect(result).toHaveProperty("base64");
      expect(result).toHaveProperty("fileName");
      expect(result).toHaveProperty("testCount");
      expect(result.base64.length).toBeGreaterThan(0);
      expect(result.fileName).toMatch(/virology-report-.*\.pdf$/);
      expect(typeof result.testCount).toBe("number");
      
      // Verify it's valid base64 by decoding
      const buffer = Buffer.from(result.base64, "base64");
      expect(buffer.length).toBeGreaterThan(0);
      // PDF files start with %PDF
      const header = buffer.subarray(0, 4).toString("ascii");
      expect(header).toBe("%PDF");
    }
  });

  it("returns NOT_FOUND for non-existent patient", async () => {
    const approvedUser = createMockUser({ status: "approved" });
    const ctx = createMockContext(approvedUser);
    const caller = appRouter.createCaller(ctx);

    await expect(
      caller.patients.generatePDF({ patientId: 999999 })
    ).rejects.toThrow();
  });

  it("pending users cannot generate PDF", async () => {
    const pendingUser = createMockUser({ status: "pending" });
    const ctx = createMockContext(pendingUser);
    const caller = appRouter.createCaller(ctx);

    await expect(
      caller.patients.generatePDF({ patientId: 1 })
    ).rejects.toThrow();
  });

  it("banned users cannot generate PDF", async () => {
    const bannedUser = createMockUser({ status: "banned" });
    const ctx = createMockContext(bannedUser);
    const caller = appRouter.createCaller(ctx);

    await expect(
      caller.patients.generatePDF({ patientId: 1 })
    ).rejects.toThrow();

  });
});

describe("Cancel Document Processing", () => {
  it("approved user can cancel a pending/processing document", async () => {
    const approvedUser = createMockUser({ status: "approved" });
    const ctx = createMockContext(approvedUser);
    const caller = appRouter.createCaller(ctx);

    // Upload a document first to get a document ID
    const uploadResult = await caller.documents.upload({
      fileName: "cancel-test.jpg",
      fileData: "/9j/4AAQSkZJRg==",
      mimeType: "image/jpeg",
      fileSize: 1024,
    });

    expect(uploadResult.documentId).toBeDefined();

    // Try to cancel it (it may already be processing or pending)
    try {
      const result = await caller.documents.cancelProcessing({
        documentId: uploadResult.documentId!,
      });
      expect(result.success).toBe(true);
      expect(result.message).toBe("Document processing cancelled");
    } catch (err: any) {
      // If it already completed/failed/discarded before we could cancel, that's OK
      expect(err.message).toMatch(/Cannot cancel/);
    }
  });

  it("returns NOT_FOUND for non-existent document", async () => {
    const approvedUser = createMockUser({ status: "approved" });
    const ctx = createMockContext(approvedUser);
    const caller = appRouter.createCaller(ctx);

    await expect(
      caller.documents.cancelProcessing({ documentId: 999999 })
    ).rejects.toThrow();
  });

  it("pending users cannot cancel processing", async () => {
    const pendingUser = createMockUser({ status: "pending" });
    const ctx = createMockContext(pendingUser);
    const caller = appRouter.createCaller(ctx);

    await expect(
      caller.documents.cancelProcessing({ documentId: 1 })
    ).rejects.toThrow();
  });

  it("approved user can batch cancel documents", async () => {
    const approvedUser = createMockUser({ status: "approved" });
    const ctx = createMockContext(approvedUser);
    const caller = appRouter.createCaller(ctx);

    // Batch cancel with non-existent IDs should return skipped
    const result = await caller.documents.cancelBatch({
      documentIds: [999998, 999999],
    });

    expect(result).toHaveProperty("success", true);
    expect(result).toHaveProperty("cancelled");
    expect(result).toHaveProperty("skipped");
    expect(typeof result.cancelled).toBe("number");
    expect(typeof result.skipped).toBe("number");
  });

  it("pending users cannot batch cancel", async () => {
    const pendingUser = createMockUser({ status: "pending" });
    const ctx = createMockContext(pendingUser);
    const caller = appRouter.createCaller(ctx);

    await expect(
      caller.documents.cancelBatch({ documentIds: [1] })
    ).rejects.toThrow();
  });
});

describe("Result-Level Filtering", () => {
  it("approved user can search patients with testResult filter", async () => {
    const approvedUser = createMockUser({ status: "approved" });
    const ctx = createMockContext(approvedUser);
    const caller = appRouter.createCaller(ctx);

    const result = await caller.patients.search({
      testResult: "Detected",
      limit: 10,
    });

    expect(result).toHaveProperty("patients");
    expect(result).toHaveProperty("total");
    expect(Array.isArray(result.patients)).toBe(true);
  });

  it("approved user can search patients with testType filter", async () => {
    const approvedUser = createMockUser({ status: "approved" });
    const ctx = createMockContext(approvedUser);
    const caller = appRouter.createCaller(ctx);

    const result = await caller.patients.search({
      testType: "HCV",
      limit: 10,
    });

    expect(result).toHaveProperty("patients");
    expect(result).toHaveProperty("total");
    expect(Array.isArray(result.patients)).toBe(true);
  });

  it("approved user can combine testResult and testType filters", async () => {
    const approvedUser = createMockUser({ status: "approved" });
    const ctx = createMockContext(approvedUser);
    const caller = appRouter.createCaller(ctx);

    const result = await caller.patients.search({
      testResult: "Not Detected",
      testType: "HBV",
      limit: 10,
    });

    expect(result).toHaveProperty("patients");
    expect(result).toHaveProperty("total");
    expect(Array.isArray(result.patients)).toBe(true);
  });

  it("approved user can get filter options", async () => {
    const approvedUser = createMockUser({ status: "approved" });
    const ctx = createMockContext(approvedUser);
    const caller = appRouter.createCaller(ctx);

    const result = await caller.patients.filterOptions();

    expect(result).toHaveProperty("testTypes");
    expect(result).toHaveProperty("testResults");
    expect(Array.isArray(result.testTypes)).toBe(true);
    expect(Array.isArray(result.testResults)).toBe(true);
  });

  it("pending user cannot get filter options", async () => {
    const pendingUser = createMockUser({ status: "pending" });
    const ctx = createMockContext(pendingUser);
    const caller = appRouter.createCaller(ctx);

    await expect(caller.patients.filterOptions()).rejects.toThrow();
  });
});

describe("Audit Logging", () => {
  it("admin can view audit logs", async () => {
    const adminUser = createMockUser({ status: "approved", role: "admin" });
    const ctx = createMockContext(adminUser);
    const caller = appRouter.createCaller(ctx);

    const result = await caller.users.auditLogs({ limit: 50 });

    expect(Array.isArray(result)).toBe(true);
  });

  it("admin can filter audit logs by action", async () => {
    const adminUser = createMockUser({ status: "approved", role: "admin" });
    const ctx = createMockContext(adminUser);
    const caller = appRouter.createCaller(ctx);

    const result = await caller.users.auditLogs({
      limit: 50,
      actionFilter: "cancel",
    });

    expect(Array.isArray(result)).toBe(true);
  });

  it("non-admin cannot view audit logs", async () => {
    const regularUser = createMockUser({ status: "approved", role: "user" });
    const ctx = createMockContext(regularUser);
    const caller = appRouter.createCaller(ctx);

    await expect(caller.users.auditLogs({ limit: 50 })).rejects.toThrow();
  });
});

// ============ DASHBOARD ANALYTICS TESTS ============

describe("Dashboard Analytics Endpoints", () => {
  it("testVolumeByMonth returns yearly data by default", async () => {
    const user = createMockUser({ status: "approved" });
    const ctx = createMockContext(user);
    const caller = appRouter.createCaller(ctx);

    const result = await caller.dashboard.testVolumeByMonth();

    expect(Array.isArray(result)).toBe(true);
    if (result.length > 0) {
      expect(result[0]).toHaveProperty("month");
      expect(result[0]).toHaveProperty("count");
      expect(typeof result[0].month).toBe("string");
      expect(typeof result[0].count).toBe("number");
      // Default groupBy='year' should return YYYY format
      expect(result[0].month).toMatch(/^\d{4}$/);
    }
  });

  it("testVolumeByMonth supports monthly drill-down with groupBy=month", async () => {
    const user = createMockUser({ status: "approved" });
    const ctx = createMockContext(user);
    const caller = appRouter.createCaller(ctx);

    const result = await caller.dashboard.testVolumeByMonth({
      from: "2024-01-01",
      to: "2024-12-31",
      groupBy: "month",
    });

    expect(Array.isArray(result)).toBe(true);
    if (result.length > 0) {
      expect(result[0]).toHaveProperty("month");
      expect(result[0]).toHaveProperty("count");
      // Monthly groupBy should return YYYY-MM format
      expect(result[0].month).toMatch(/^\d{4}-\d{2}$/);
    }
  });

  it("resultDistribution returns array of result/count objects", async () => {
    const user = createMockUser({ status: "approved" });
    const ctx = createMockContext(user);
    const caller = appRouter.createCaller(ctx);

    const result = await caller.dashboard.resultDistribution();

    expect(Array.isArray(result)).toBe(true);
    if (result.length > 0) {
      expect(result[0]).toHaveProperty("result");
      expect(result[0]).toHaveProperty("count");
      expect(typeof result[0].result).toBe("string");
      expect(typeof result[0].count).toBe("number");
    }
  });

  it("topTestTypes returns array of testType/count objects", async () => {
    const user = createMockUser({ status: "approved" });
    const ctx = createMockContext(user);
    const caller = appRouter.createCaller(ctx);

    const result = await caller.dashboard.topTestTypes();

    expect(Array.isArray(result)).toBe(true);
    if (result.length > 0) {
      expect(result[0]).toHaveProperty("testType");
      expect(result[0]).toHaveProperty("count");
      expect(typeof result[0].testType).toBe("string");
      expect(typeof result[0].count).toBe("number");
    }
  });

  it("topTestTypes respects limit parameter", async () => {
    const user = createMockUser({ status: "approved" });
    const ctx = createMockContext(user);
    const caller = appRouter.createCaller(ctx);

    const result = await caller.dashboard.topTestTypes({ limit: 3 });

    expect(Array.isArray(result)).toBe(true);
    expect(result.length).toBeLessThanOrEqual(3);
  });

  it("testsByNationality returns array of nationality/count objects", async () => {
    const user = createMockUser({ status: "approved" });
    const ctx = createMockContext(user);
    const caller = appRouter.createCaller(ctx);

    const result = await caller.dashboard.testsByNationality();

    expect(Array.isArray(result)).toBe(true);
    if (result.length > 0) {
      expect(result[0]).toHaveProperty("nationality");
      expect(result[0]).toHaveProperty("count");
      expect(typeof result[0].nationality).toBe("string");
      expect(typeof result[0].count).toBe("number");
    }
  });

  it("testsByNationality respects limit parameter", async () => {
    const user = createMockUser({ status: "approved" });
    const ctx = createMockContext(user);
    const caller = appRouter.createCaller(ctx);

    const result = await caller.dashboard.testsByNationality({ limit: 5 });

    expect(Array.isArray(result)).toBe(true);
    expect(result.length).toBeLessThanOrEqual(5);
  });

  it("unapproved user cannot access analytics", async () => {
    const pendingUser = createMockUser({ status: "pending" });
    const ctx = createMockContext(pendingUser);
    const caller = appRouter.createCaller(ctx);

    await expect(caller.dashboard.testVolumeByMonth()).rejects.toThrow();
    await expect(caller.dashboard.resultDistribution()).rejects.toThrow();
    await expect(caller.dashboard.topTestTypes()).rejects.toThrow();
    await expect(caller.dashboard.testsByNationality()).rejects.toThrow();
  });
});

describe("Bulk PDF Export", () => {
  it("approved user can generate bulk PDF for multiple patients", async () => {
    const approvedUser = createMockUser({ status: "approved" });
    const ctx = createMockContext(approvedUser);
    const caller = appRouter.createCaller(ctx);

    // Get some patients
    const searchResult = await caller.patients.search({ limit: 3 });
    if (searchResult.patients.length >= 2) {
      const ids = searchResult.patients.slice(0, 2).map(p => p.id);
      const result = await caller.patients.bulkPDF({ patientIds: ids });
      expect(result.base64).toBeDefined();
      expect(result.base64.length).toBeGreaterThan(0);
      expect(result.fileName).toContain("bulk-report");
      expect(result.patientCount).toBe(2);
      expect(result.totalTests).toBeGreaterThanOrEqual(0);
    }
  });

  it("approved user can generate bulk PDF for a single patient", async () => {
    const approvedUser = createMockUser({ status: "approved" });
    const ctx = createMockContext(approvedUser);
    const caller = appRouter.createCaller(ctx);

    const searchResult = await caller.patients.search({ limit: 1 });
    if (searchResult.patients.length >= 1) {
      const result = await caller.patients.bulkPDF({ patientIds: [searchResult.patients[0].id] });
      expect(result.base64).toBeDefined();
      expect(result.patientCount).toBe(1);
      expect(result.fileName).toContain("virology-report");
    }
  });

  it("throws error for empty patient IDs array", async () => {
    const approvedUser = createMockUser({ status: "approved" });
    const ctx = createMockContext(approvedUser);
    const caller = appRouter.createCaller(ctx);

    await expect(caller.patients.bulkPDF({ patientIds: [] })).rejects.toThrow();
  });

  it("throws error for invalid patient IDs", async () => {
    const approvedUser = createMockUser({ status: "approved" });
    const ctx = createMockContext(approvedUser);
    const caller = appRouter.createCaller(ctx);

    await expect(caller.patients.bulkPDF({ patientIds: [999999, 999998] })).rejects.toThrow();
  });
});
