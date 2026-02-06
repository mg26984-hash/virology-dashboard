import { describe, it, expect, vi } from "vitest";
import { appRouter } from "./routers";
import type { TrpcContext } from "./_core/context";
import { getDb } from "./db";
import { users, auditLogs } from "../drizzle/schema";
import { eq, desc } from "drizzle-orm";

type AuthenticatedUser = NonNullable<TrpcContext["user"]>;

// The owner openId must match ENV.ownerOpenId
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

describe("Admin Role Assignment", () => {
  it("owner can promote a user to admin", async () => {
    const db = await getDb();
    if (!db) throw new Error("DB not available");

    // Find a non-owner user
    const allUsers = await db.select().from(users);
    const targetUser = allUsers.find(u => u.openId !== OWNER_OPEN_ID);
    if (!targetUser) {
      console.log("No non-owner user found, skipping test");
      return;
    }

    const ownerUser = createMockUser({ id: allUsers.find(u => u.openId === OWNER_OPEN_ID)?.id || 1 });
    const caller = appRouter.createCaller(createMockContext(ownerUser));

    // Promote to admin
    const result = await caller.users.setRole({
      userId: targetUser.id,
      role: "admin",
    });
    expect(result.success).toBe(true);

    // Verify role was updated
    const updated = await db.select().from(users).where(eq(users.id, targetUser.id));
    expect(updated[0].role).toBe("admin");

    // Verify audit log was created
    const logs = await db.select().from(auditLogs).orderBy(desc(auditLogs.id)).limit(1);
    expect(logs[0].action).toBe("user_role_admin");
    expect(logs[0].targetUserId).toBe(targetUser.id);

    // Demote back to user
    const result2 = await caller.users.setRole({
      userId: targetUser.id,
      role: "user",
    });
    expect(result2.success).toBe(true);

    // Verify role was reverted
    const reverted = await db.select().from(users).where(eq(users.id, targetUser.id));
    expect(reverted[0].role).toBe("user");
  });

  it("non-owner admin cannot assign roles", async () => {
    const db = await getDb();
    if (!db) throw new Error("DB not available");

    const allUsers = await db.select().from(users);
    const targetUser = allUsers[0];

    // Create a non-owner admin
    const nonOwnerAdmin = createMockUser({
      id: 999,
      openId: "non-owner-admin-123",
      role: "admin",
    });
    const caller = appRouter.createCaller(createMockContext(nonOwnerAdmin));

    await expect(
      caller.users.setRole({ userId: targetUser.id, role: "admin" })
    ).rejects.toThrow("Only the project owner can assign admin roles");
  });

  it("owner cannot change their own role", async () => {
    const db = await getDb();
    if (!db) throw new Error("DB not available");

    const allUsers = await db.select().from(users);
    const ownerDbUser = allUsers.find(u => u.openId === OWNER_OPEN_ID);
    if (!ownerDbUser) {
      console.log("Owner not found in DB, skipping test");
      return;
    }

    const ownerUser = createMockUser({ id: ownerDbUser.id });
    const caller = appRouter.createCaller(createMockContext(ownerUser));

    await expect(
      caller.users.setRole({ userId: ownerDbUser.id, role: "user" })
    ).rejects.toThrow("You cannot change your own role");
  });
});
