import { describe, it, expect, vi } from "vitest";
import { appRouter } from "./routers";
import type { TrpcContext } from "./_core/context";

type AuthenticatedUser = NonNullable<TrpcContext["user"]>;

const OWNER_OPEN_ID = process.env.OWNER_OPEN_ID || "nPtvS3FjrgpNRuGEU3ERv5";

function createMockUser(overrides: Partial<AuthenticatedUser> = {}): AuthenticatedUser {
  return {
    id: 1,
    openId: OWNER_OPEN_ID,
    email: "owner@hospital.com",
    name: "Owner",
    loginMethod: "manus",
    role: "admin",
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

describe("Leaderboard (Admin Only)", () => {
  it("admin can fetch BK PCR leaderboard", async () => {
    const adminUser = createMockUser({ role: "admin" });
    const caller = appRouter.createCaller(createMockContext(adminUser));

    const result = await caller.leaderboard.bkPCR({ limit: 10 });
    expect(Array.isArray(result)).toBe(true);
    // Each entry should have the expected shape
    for (const entry of result) {
      expect(entry).toHaveProperty("patientId");
      expect(entry).toHaveProperty("civilId");
      expect(entry).toHaveProperty("viralLoad");
      expect(entry).toHaveProperty("numericLoad");
    }
  });

  it("admin can fetch CMV PCR leaderboard", async () => {
    const adminUser = createMockUser({ role: "admin" });
    const caller = appRouter.createCaller(createMockContext(adminUser));

    const result = await caller.leaderboard.cmvPCR({ limit: 10 });
    expect(Array.isArray(result)).toBe(true);
    for (const entry of result) {
      expect(entry).toHaveProperty("patientId");
      expect(entry).toHaveProperty("civilId");
      expect(entry).toHaveProperty("viralLoad");
      expect(entry).toHaveProperty("numericLoad");
    }
  });

  it("non-admin user cannot access BK PCR leaderboard", async () => {
    const regularUser = createMockUser({
      id: 999,
      openId: "regular-user-123",
      role: "user",
      status: "approved",
    });
    const caller = appRouter.createCaller(createMockContext(regularUser));

    await expect(
      caller.leaderboard.bkPCR({ limit: 10 })
    ).rejects.toThrow("Admin access required");
  });

  it("non-admin user cannot access CMV PCR leaderboard", async () => {
    const regularUser = createMockUser({
      id: 999,
      openId: "regular-user-123",
      role: "user",
      status: "approved",
    });
    const caller = appRouter.createCaller(createMockContext(regularUser));

    await expect(
      caller.leaderboard.cmvPCR({ limit: 10 })
    ).rejects.toThrow("Admin access required");
  });

  it("unauthenticated user cannot access leaderboard", async () => {
    const caller = appRouter.createCaller(createMockContext(null));

    await expect(
      caller.leaderboard.bkPCR({ limit: 10 })
    ).rejects.toThrow();

    await expect(
      caller.leaderboard.cmvPCR({ limit: 10 })
    ).rejects.toThrow();
  });

  it("BK PCR leaderboard results are sorted by numericLoad descending", async () => {
    const adminUser = createMockUser({ role: "admin" });
    const caller = appRouter.createCaller(createMockContext(adminUser));

    const result = await caller.leaderboard.bkPCR({ limit: 20 });
    if (result.length >= 2) {
      for (let i = 1; i < result.length; i++) {
        expect(Number(result[i - 1].numericLoad)).toBeGreaterThanOrEqual(
          Number(result[i].numericLoad)
        );
      }
    }
  });

  it("CMV PCR leaderboard results are sorted by numericLoad descending", async () => {
    const adminUser = createMockUser({ role: "admin" });
    const caller = appRouter.createCaller(createMockContext(adminUser));

    const result = await caller.leaderboard.cmvPCR({ limit: 20 });
    if (result.length >= 2) {
      for (let i = 1; i < result.length; i++) {
        expect(Number(result[i - 1].numericLoad)).toBeGreaterThanOrEqual(
          Number(result[i].numericLoad)
        );
      }
    }
  });

  it("leaderboard respects limit parameter", async () => {
    const adminUser = createMockUser({ role: "admin" });
    const caller = appRouter.createCaller(createMockContext(adminUser));

    const result = await caller.leaderboard.bkPCR({ limit: 3 });
    expect(result.length).toBeLessThanOrEqual(3);
  });
});
