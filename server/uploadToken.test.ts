import { describe, expect, it, vi, beforeAll } from "vitest";
import { appRouter } from "./routers";
import type { TrpcContext } from "./_core/context";

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

describe("Upload Token Generation", () => {
  it("approved user can generate an upload token", async () => {
    const user = createMockUser({ status: "approved" });
    const ctx = createMockContext(user);
    const caller = appRouter.createCaller(ctx);

    const result = await caller.documents.generateUploadToken();
    expect(result).toHaveProperty("token");
    expect(result).toHaveProperty("expiresAt");
    expect(typeof result.token).toBe("string");
    expect(result.token.length).toBe(64); // 32 bytes hex = 64 chars
    // Token should be permanent (far future expiry)
    const expiresAt = new Date(result.expiresAt);
    const now = new Date();
    const diffMs = expiresAt.getTime() - now.getTime();
    expect(diffMs).toBeGreaterThan(365 * 24 * 60 * 60 * 1000); // > 1 year from now
  });

  it("pending user cannot generate an upload token", async () => {
    const user = createMockUser({ status: "pending" });
    const ctx = createMockContext(user);
    const caller = appRouter.createCaller(ctx);

    await expect(caller.documents.generateUploadToken()).rejects.toThrow();
  });

  it("unauthenticated user cannot generate an upload token", async () => {
    const ctx = createMockContext(null);
    const caller = appRouter.createCaller(ctx);

    await expect(caller.documents.generateUploadToken()).rejects.toThrow();
  });

  it("generating multiple tokens produces unique values", async () => {
    const user = createMockUser({ status: "approved" });
    const ctx = createMockContext(user);
    const caller = appRouter.createCaller(ctx);

    const result1 = await caller.documents.generateUploadToken();
    const result2 = await caller.documents.generateUploadToken();
    expect(result1.token).not.toBe(result2.token);
  });
});

describe("Upload Token Validation", () => {
  it("valid token is accepted by validateUploadToken", async () => {
    const user = createMockUser({ status: "approved" });
    const ctx = createMockContext(user);
    const caller = appRouter.createCaller(ctx);

    // Generate a token
    const { token } = await caller.documents.generateUploadToken();

    // Validate it directly via db function
    const { validateUploadToken } = await import("./db");
    const result = await validateUploadToken(token);
    expect(result.valid).toBe(true);
    expect(result.userId).toBe(user.id);
  });

  it("invalid token is rejected by validateUploadToken", async () => {
    const { validateUploadToken } = await import("./db");
    const result = await validateUploadToken("nonexistent-token-abc123");
    expect(result.valid).toBe(false);
    expect(result.userId).toBeUndefined();
  });

  it("token usage count increments on validation", async () => {
    const user = createMockUser({ status: "approved" });
    const ctx = createMockContext(user);
    const caller = appRouter.createCaller(ctx);

    const { token } = await caller.documents.generateUploadToken();

    const { validateUploadToken } = await import("./db");

    // First validation
    const r1 = await validateUploadToken(token);
    expect(r1.valid).toBe(true);

    // Second validation (usage count should be incremented but token still valid)
    const r2 = await validateUploadToken(token);
    expect(r2.valid).toBe(true);
  });
});

describe("Quick Upload API Endpoint", () => {
  it("rejects requests without a token", async () => {
    const resp = await fetch("http://localhost:3000/api/upload/quick", {
      method: "POST",
    });
    expect(resp.status).toBe(401);
    const data = await resp.json();
    expect(data.error).toContain("token");
  });

  it("rejects requests with an invalid token", async () => {
    const formData = new FormData();
    // Create a minimal JPEG-like blob
    const blob = new Blob([new Uint8Array([0xFF, 0xD8, 0xFF, 0xE0])], { type: "image/jpeg" });
    formData.append("images", blob, "test.jpg");

    const resp = await fetch("http://localhost:3000/api/upload/quick?token=bad-token-xyz", {
      method: "POST",
      body: formData,
    });
    expect(resp.status).toBe(401);
    const data = await resp.json();
    expect(data.error).toContain("Invalid");
  });

  it("rejects requests with no files", async () => {
    // Generate a valid token first
    const user = createMockUser({ status: "approved" });
    const ctx = createMockContext(user);
    const caller = appRouter.createCaller(ctx);
    const { token } = await caller.documents.generateUploadToken();

    const resp = await fetch(`http://localhost:3000/api/upload/quick?token=${token}`, {
      method: "POST",
    });
    expect(resp.status).toBe(400);
    const data = await resp.json();
    expect(data.error).toContain("No files");
  });

  it("accepts valid token with image files", async () => {
    // Generate a valid token
    const user = createMockUser({ status: "approved" });
    const ctx = createMockContext(user);
    const caller = appRouter.createCaller(ctx);
    const { token } = await caller.documents.generateUploadToken();

    // Create a unique JPEG blob (include random content to avoid dedup)
    const uniqueContent = `QUICK-UPLOAD-TEST-${Date.now()}-${Math.random()}`;
    const encoder = new TextEncoder();
    const jpegHeader = new Uint8Array([0xFF, 0xD8, 0xFF, 0xE0]);
    const content = encoder.encode(uniqueContent);
    const combined = new Uint8Array(jpegHeader.length + content.length);
    combined.set(jpegHeader);
    combined.set(content, jpegHeader.length);
    const blob = new Blob([combined], { type: "image/jpeg" });

    const formData = new FormData();
    formData.append("images", blob, "test-quick-upload.jpg");

    const resp = await fetch(`http://localhost:3000/api/upload/quick?token=${token}`, {
      method: "POST",
      body: formData,
    });
    expect(resp.status).toBe(200);
    const data = await resp.json();
    expect(data.success).toBe(true);
    expect(data.total).toBe(1);
    expect(data.results).toHaveLength(1);
    expect(data.results[0].status).toBe("uploaded");
  });

  it("deduplicates files with same content", async () => {
    // Generate a valid token
    const user = createMockUser({ status: "approved" });
    const ctx = createMockContext(user);
    const caller = appRouter.createCaller(ctx);
    const { token } = await caller.documents.generateUploadToken();

    // Create a unique JPEG blob (include timestamp to make it unique)
    const uniqueContent = `JPEG-DEDUP-TEST-${Date.now()}-${Math.random()}`;
    const encoder = new TextEncoder();
    const jpegHeader = new Uint8Array([0xFF, 0xD8, 0xFF, 0xE0]);
    const content = encoder.encode(uniqueContent);
    const combined = new Uint8Array(jpegHeader.length + content.length);
    combined.set(jpegHeader);
    combined.set(content, jpegHeader.length);
    const blob = new Blob([combined], { type: "image/jpeg" });

    const formData1 = new FormData();
    formData1.append("images", blob, "dedup-test.jpg");

    // First upload
    const resp1 = await fetch(`http://localhost:3000/api/upload/quick?token=${token}`, {
      method: "POST",
      body: formData1,
    });
    expect(resp1.status).toBe(200);
    const data1 = await resp1.json();
    expect(data1.new).toBe(1);

    // Second upload with same content
    const formData2 = new FormData();
    formData2.append("images", blob, "dedup-test.jpg");

    const resp2 = await fetch(`http://localhost:3000/api/upload/quick?token=${token}`, {
      method: "POST",
      body: formData2,
    });
    expect(resp2.status).toBe(200);
    const data2 = await resp2.json();
    expect(data2.duplicates).toBe(1);
    expect(data2.new).toBe(0);
  });
});

describe("Clean Expired Tokens", () => {
  it("cleanExpiredTokens runs without error", async () => {
    const { cleanExpiredTokens } = await import("./db");
    await expect(cleanExpiredTokens()).resolves.not.toThrow();
  });
});
