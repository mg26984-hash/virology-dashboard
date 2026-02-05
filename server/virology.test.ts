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

describe("Auth Flow", () => {
  it("auth.me returns user info for authenticated users", async () => {
    const user = createMockUser();
    const ctx = createMockContext(user);
    const caller = appRouter.createCaller(ctx);

    const result = await caller.auth.me();
    expect(result).toEqual(user);
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
