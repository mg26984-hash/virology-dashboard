import { describe, it, expect } from "vitest";
import { appRouter } from "./routers";

function createMockUser(overrides: any = {}) {
  return {
    id: 1,
    openId: "test-open-id",
    name: "Test User",
    email: "test@example.com",
    role: "admin" as const,
    status: "approved" as const,
    avatarUrl: null,
    createdAt: new Date(),
    ...overrides,
  };
}

function createMockContext(user: any = null) {
  return {
    user,
    res: {
      cookie: () => {},
      clearCookie: () => {},
    } as any,
  };
}

describe("Dashboard analytics with date range", () => {
  it("testVolumeByMonth accepts optional date range", async () => {
    const approvedUser = createMockUser({ status: "approved" });
    const ctx = createMockContext(approvedUser);
    const caller = appRouter.createCaller(ctx);
    const defaultResult = await caller.dashboard.testVolumeByMonth();
    expect(Array.isArray(defaultResult)).toBe(true);
    const rangeResult = await caller.dashboard.testVolumeByMonth({ from: "2024-01-01", to: "2024-12-31" });
    expect(Array.isArray(rangeResult)).toBe(true);
  });

  it("resultDistribution accepts optional date range", async () => {
    const approvedUser = createMockUser({ status: "approved" });
    const ctx = createMockContext(approvedUser);
    const caller = appRouter.createCaller(ctx);
    const defaultResult = await caller.dashboard.resultDistribution();
    expect(Array.isArray(defaultResult)).toBe(true);
    const rangeResult = await caller.dashboard.resultDistribution({ from: "2024-01-01", to: "2024-12-31" });
    expect(Array.isArray(rangeResult)).toBe(true);
  });

  it("topTestTypes accepts optional date range", async () => {
    const approvedUser = createMockUser({ status: "approved" });
    const ctx = createMockContext(approvedUser);
    const caller = appRouter.createCaller(ctx);
    const defaultResult = await caller.dashboard.topTestTypes();
    expect(Array.isArray(defaultResult)).toBe(true);
    const rangeResult = await caller.dashboard.topTestTypes({ from: "2024-01-01", to: "2024-12-31", limit: 5 });
    expect(Array.isArray(rangeResult)).toBe(true);
  });

  it("testsByNationality accepts optional date range", async () => {
    const approvedUser = createMockUser({ status: "approved" });
    const ctx = createMockContext(approvedUser);
    const caller = appRouter.createCaller(ctx);
    const defaultResult = await caller.dashboard.testsByNationality();
    expect(Array.isArray(defaultResult)).toBe(true);
    const rangeResult = await caller.dashboard.testsByNationality({ from: "2024-01-01", to: "2024-12-31", limit: 5 });
    expect(Array.isArray(rangeResult)).toBe(true);
  });

  it("testVolumeByMonth with only from date", async () => {
    const approvedUser = createMockUser({ status: "approved" });
    const ctx = createMockContext(approvedUser);
    const caller = appRouter.createCaller(ctx);
    const result = await caller.dashboard.testVolumeByMonth({ from: "2024-06-01" });
    expect(Array.isArray(result)).toBe(true);
  });

  it("testVolumeByMonth with only to date", async () => {
    const approvedUser = createMockUser({ status: "approved" });
    const ctx = createMockContext(approvedUser);
    const caller = appRouter.createCaller(ctx);
    const result = await caller.dashboard.testVolumeByMonth({ to: "2025-01-01" });
    expect(Array.isArray(result)).toBe(true);
  });
});
