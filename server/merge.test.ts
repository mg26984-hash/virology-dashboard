import { describe, it, expect, vi, afterEach } from "vitest";
import { appRouter } from "./routers";
import type { TrpcContext } from "./_core/context";
import { getDb } from "./db";
import { patients, virologyTests, auditLogs } from "../drizzle/schema";
import { eq, desc, sql } from "drizzle-orm";

type AuthenticatedUser = NonNullable<TrpcContext["user"]>;

function createMockUser(overrides: Partial<AuthenticatedUser> = {}): AuthenticatedUser {
  return {
    id: 1,
    openId: "test-user-123",
    email: "admin@hospital.com",
    name: "Dr. Admin",
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

// Helper to create test patients directly in DB
async function createTestPatient(civilId: string, name: string, extra: Record<string, any> = {}) {
  const db = await getDb();
  if (!db) throw new Error("DB not available");
  await db.insert(patients).values({
    civilId,
    name,
    dateOfBirth: extra.dateOfBirth || null,
    nationality: extra.nationality || "Kuwaiti",
    gender: extra.gender || null,
    passportNo: extra.passportNo || null,
  });
  const [patient] = await db.select().from(patients).where(eq(patients.civilId, civilId)).limit(1);
  return patient;
}

// Helper to create a test for a patient
async function createTestResult(patientId: number, testType: string, result: string) {
  const db = await getDb();
  if (!db) throw new Error("DB not available");
  await db.insert(virologyTests).values({
    patientId,
    testType,
    result,
    accessionDate: new Date(),
  });
}

// Generate unique Civil IDs for tests
let testCounter = 900000;
function uniqueCivilId() {
  return `MERGE_TEST_${++testCounter}`;
}

// Cleanup test patients after each test
async function cleanupTestPatients() {
  const db = await getDb();
  if (!db) return;
  await db.delete(patients).where(sql`${patients.civilId} LIKE 'MERGE_TEST_%'`);
  await db.delete(auditLogs).where(eq(auditLogs.action, "patient_merge"));
}

describe("Patient Merge Tool", () => {
  afterEach(async () => {
    await cleanupTestPatients();
  });

  describe("Access Control", () => {
    it("non-admin users cannot access findDuplicates", async () => {
      const regularUser = createMockUser({ role: "user" });
      const ctx = createMockContext(regularUser);
      const caller = appRouter.createCaller(ctx);

      await expect(caller.findDuplicates()).rejects.toThrow("Admin access required");
    });

    it("non-admin users cannot merge patients", async () => {
      const regularUser = createMockUser({ role: "user" });
      const ctx = createMockContext(regularUser);
      const caller = appRouter.createCaller(ctx);

      await expect(
        caller.mergePatients({ targetId: 1, sourceId: 2 })
      ).rejects.toThrow("Admin access required");
    });

    it("non-admin users cannot search for merge", async () => {
      const regularUser = createMockUser({ role: "user" });
      const ctx = createMockContext(regularUser);
      const caller = appRouter.createCaller(ctx);

      await expect(
        caller.searchForMerge({ query: "test" })
      ).rejects.toThrow("Admin access required");
    });
  });

  describe("Find Duplicates", () => {
    it("admin can find duplicate suggestions", async () => {
      const admin = createMockUser({ role: "admin" });
      const ctx = createMockContext(admin);
      const caller = appRouter.createCaller(ctx);

      const result = await caller.findDuplicates();
      expect(Array.isArray(result)).toBe(true);
      // Each item should have the expected shape
      for (const dup of result) {
        expect(dup).toHaveProperty("patient1");
        expect(dup).toHaveProperty("patient2");
        expect(dup).toHaveProperty("matchType");
        expect(dup).toHaveProperty("similarity");
        expect(dup).toHaveProperty("reason");
      }
    });
  });

  describe("Search for Merge", () => {
    it("admin can search patients for merge with test counts", async () => {
      const cid = uniqueCivilId();
      const patient = await createTestPatient(cid, "Merge Search Test");
      await createTestResult(patient.id, "HIV Test", "Negative");
      await createTestResult(patient.id, "HBV Test", "Not Detected");

      const admin = createMockUser({ role: "admin" });
      const ctx = createMockContext(admin);
      const caller = appRouter.createCaller(ctx);

      const results = await caller.searchForMerge({ query: cid });
      expect(results.length).toBeGreaterThanOrEqual(1);
      const found = results.find((p) => p.civilId === cid);
      expect(found).toBeDefined();
      expect(found!.testCount).toBe(2);
    });
  });

  describe("Merge Patients", () => {
    it("admin can merge two patients and tests are transferred", async () => {
      const cid1 = uniqueCivilId();
      const cid2 = uniqueCivilId();
      const target = await createTestPatient(cid1, "Target Patient", {
        nationality: "Kuwaiti",
        dateOfBirth: "1990-01-01",
      });
      const source = await createTestPatient(cid2, "Source Patient", {
        nationality: "Non-Kuwaiti",
        gender: "Male",
        passportNo: "A12345",
      });

      // Add tests to both patients
      await createTestResult(target.id, "HIV Test", "Negative");
      await createTestResult(source.id, "HBV Test", "Not Detected");
      await createTestResult(source.id, "HCV Test", "Reactive");

      const admin = createMockUser({ role: "admin" });
      const ctx = createMockContext(admin);
      const caller = appRouter.createCaller(ctx);

      const result = await caller.mergePatients({
        targetId: target.id,
        sourceId: source.id,
        reason: "Test merge",
      });

      expect(result.testsReassigned).toBe(2);

      // Verify tests were transferred
      const db = await getDb();
      if (!db) throw new Error("DB not available");
      const targetTests = await db
        .select()
        .from(virologyTests)
        .where(eq(virologyTests.patientId, target.id));
      expect(targetTests.length).toBe(3); // 1 original + 2 transferred

      // Verify source patient was deleted
      const sourceCheck = await db
        .select()
        .from(patients)
        .where(eq(patients.id, source.id));
      expect(sourceCheck.length).toBe(0);

      // Verify target patient got missing fields from source
      const [updatedTarget] = await db
        .select()
        .from(patients)
        .where(eq(patients.id, target.id));
      expect(updatedTarget.gender).toBe("Male");
      expect(updatedTarget.passportNo).toBe("A12345");
      // Original fields should be preserved
      expect(updatedTarget.nationality).toBe("Kuwaiti");
      expect(updatedTarget.dateOfBirth).toBe("1990-01-01");
    });

    it("merge creates an audit log entry", async () => {
      const cid1 = uniqueCivilId();
      const cid2 = uniqueCivilId();
      const target = await createTestPatient(cid1, "Audit Target");
      const source = await createTestPatient(cid2, "Audit Source");

      const admin = createMockUser({ role: "admin" });
      const ctx = createMockContext(admin);
      const caller = appRouter.createCaller(ctx);

      await caller.mergePatients({
        targetId: target.id,
        sourceId: source.id,
        reason: "Audit test merge",
      });

      // Check audit log
      const db = await getDb();
      if (!db) throw new Error("DB not available");
      const logs = await db
        .select()
        .from(auditLogs)
        .where(eq(auditLogs.action, "patient_merge"))
        .orderBy(desc(auditLogs.createdAt))
        .limit(1);

      expect(logs.length).toBe(1);
      expect(logs[0].action).toBe("patient_merge");
      expect(logs[0].reason).toBe("Audit test merge");
      const metadata = JSON.parse(logs[0].metadata!);
      expect(metadata.targetPatientId).toBe(target.id);
      expect(metadata.sourcePatientId).toBe(source.id);
      expect(metadata.targetCivilId).toBe(cid1);
      expect(metadata.sourceCivilId).toBe(cid2);
    });

    it("cannot merge a patient with itself", async () => {
      const cid = uniqueCivilId();
      const patient = await createTestPatient(cid, "Self Merge Test");

      const admin = createMockUser({ role: "admin" });
      const ctx = createMockContext(admin);
      const caller = appRouter.createCaller(ctx);

      await expect(
        caller.mergePatients({ targetId: patient.id, sourceId: patient.id })
      ).rejects.toThrow("Cannot merge a patient with itself");
    });

    it("cannot merge non-existent patients", async () => {
      const admin = createMockUser({ role: "admin" });
      const ctx = createMockContext(admin);
      const caller = appRouter.createCaller(ctx);

      await expect(
        caller.mergePatients({ targetId: 999999, sourceId: 999998 })
      ).rejects.toThrow();
    });
  });
});
