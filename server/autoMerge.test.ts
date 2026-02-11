import { describe, it, expect, vi, afterEach } from "vitest";
import { appRouter } from "./routers";
import type { TrpcContext } from "./_core/context";
import { getDb, normalizePatientName, chooseBestName, upsertPatient } from "./db";
import { patients, virologyTests, auditLogs } from "../drizzle/schema";
import { eq, sql } from "drizzle-orm";

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

// Generate unique Civil IDs for tests
let testCounter = 800000;
function uniqueCivilId() {
  return `AUTOMERGE_${++testCounter}`;
}

// Cleanup test patients after each test
async function cleanupTestPatients() {
  const db = await getDb();
  if (!db) return;
  await db.delete(patients).where(sql`${patients.civilId} LIKE 'AUTOMERGE_%'`);
  await db.delete(auditLogs).where(eq(auditLogs.action, "auto_normalize_names"));
}

describe("Auto-Merge: Name Normalization", () => {
  describe("normalizePatientName", () => {
    it("converts ALL CAPS to Title Case", () => {
      expect(normalizePatientName("YAQOUB MANDI KHALIFA")).toBe("Yaqoub Mandi Khalifa");
    });

    it("converts all lowercase to Title Case", () => {
      expect(normalizePatientName("fatmah dawoud abdullah")).toBe("Fatmah Dawoud Abdullah");
    });

    it("handles mixed case", () => {
      expect(normalizePatientName("Hassan Abdullah Khalefa")).toBe("Hassan Abdullah Khalefa");
    });

    it("preserves Arabic particle 'al' in lowercase (not first word)", () => {
      expect(normalizePatientName("DEEMAH HUMAIDI MO ALAZMI")).toBe("Deemah Humaidi Mo Alazmi");
      expect(normalizePatientName("MOHAMMED AL RASHIDI")).toBe("Mohammed al Rashidi");
    });

    it("handles hyphenated names", () => {
      expect(normalizePatientName("AL-AZMI MOHAMMED")).toBe("Al-Azmi Mohammed");
    });

    it("trims extra whitespace", () => {
      expect(normalizePatientName("  JOHN   DOE  ")).toBe("John Doe");
    });

    it("returns null for null/empty/whitespace input", () => {
      expect(normalizePatientName(null)).toBeNull();
      expect(normalizePatientName(undefined)).toBeNull();
      expect(normalizePatientName("")).toBeNull();
      expect(normalizePatientName("   ")).toBeNull();
    });
  });

  describe("chooseBestName", () => {
    it("picks the name with more parts (more complete)", () => {
      expect(chooseBestName("MAITHAH MESHAL", "MAITHAH MESHAL ALAZMI"))
        .toBe("Maithah Meshal Alazmi");
    });

    it("picks the longer name when same number of parts", () => {
      expect(chooseBestName("HANAN MOHD AL", "HANAN MOHAMMAD ALAZMI"))
        .toBe("Hanan Mohammad Alazmi");
    });

    it("keeps existing when new is shorter", () => {
      expect(chooseBestName("ABDULMOHSEN KHALED MOHAMMAD ALFARES", "ABDULMOHSEN KHALED"))
        .toBe("Abdulmohsen Khaled Mohammad Alfares");
    });

    it("returns the non-null name when one is null", () => {
      expect(chooseBestName(null, "JOHN DOE")).toBe("John Doe");
      expect(chooseBestName("JOHN DOE", null)).toBe("John Doe");
    });

    it("returns null when both are null", () => {
      expect(chooseBestName(null, null)).toBeNull();
    });

    it("keeps existing when names are identical after normalization", () => {
      expect(chooseBestName("John Doe", "JOHN DOE")).toBe("John Doe");
    });
  });
});

describe("Auto-Merge: Smart Upsert", () => {
  afterEach(async () => {
    await cleanupTestPatients();
  });

  it("creates new patient with normalized name", async () => {
    const cid = uniqueCivilId();
    const patient = await upsertPatient({
      civilId: cid,
      name: "MOHAMMED AHMED HASSAN",
      nationality: "Kuwaiti",
    });
    expect(patient.name).toBe("Mohammed Ahmed Hassan");
    expect(patient.civilId).toBe(cid);
  });

  it("upgrades to a more complete name on second upsert", async () => {
    const cid = uniqueCivilId();
    
    // First upload: short name
    const p1 = await upsertPatient({
      civilId: cid,
      name: "SARAH AHMED",
      nationality: "Kuwaiti",
    });
    expect(p1.name).toBe("Sarah Ahmed");

    // Second upload: longer, more complete name
    const p2 = await upsertPatient({
      civilId: cid,
      name: "SARAH AHMED MOHAMMED ALAZMI",
      nationality: "Kuwaiti",
    });
    expect(p2.name).toBe("Sarah Ahmed Mohammed Alazmi");
    expect(p2.id).toBe(p1.id); // Same patient record
  });

  it("keeps existing longer name when new name is shorter", async () => {
    const cid = uniqueCivilId();
    
    // First upload: full name
    const p1 = await upsertPatient({
      civilId: cid,
      name: "ABDULMOHSEN KHALED MOHAMMAD ALFARES",
      nationality: "Kuwaiti",
    });
    expect(p1.name).toBe("Abdulmohsen Khaled Mohammad Alfares");

    // Second upload: truncated name
    const p2 = await upsertPatient({
      civilId: cid,
      name: "ABDULMOHSEN KHALED",
    });
    expect(p2.name).toBe("Abdulmohsen Khaled Mohammad Alfares");
    expect(p2.id).toBe(p1.id);
  });

  it("fills in missing demographics on subsequent upserts", async () => {
    const cid = uniqueCivilId();
    
    // First upload: name + nationality
    const p1 = await upsertPatient({
      civilId: cid,
      name: "JOHN DOE",
      nationality: "Kuwaiti",
    });
    expect(p1.gender).toBeNull();

    // Second upload: adds gender
    const p2 = await upsertPatient({
      civilId: cid,
      name: "JOHN DOE",
      gender: "Male",
    });
    expect(p2.gender).toBe("Male");
    expect(p2.nationality).toBe("Kuwaiti"); // Preserved from first
    expect(p2.id).toBe(p1.id);
  });
});

describe("Auto-Merge: Admin Normalize Endpoint", () => {
  afterEach(async () => {
    await cleanupTestPatients();
  }, 15000);

  it("admin can run auto-normalize on all patients", { timeout: 30000 }, async () => {
    const db = await getDb();
    if (!db) throw new Error("DB not available");

    // Create test patients with ALL CAPS names directly in DB
    const cid1 = uniqueCivilId();
    const cid2 = uniqueCivilId();
    const cid3 = uniqueCivilId();
    await db.insert(patients).values([
      { civilId: cid1, name: "YAQOUB MANDI KHALIFA", nationality: "Kuwaiti" },
      { civilId: cid2, name: "fatmah dawoud ABDULLAH", nationality: "Kuwaiti" },
      { civilId: cid3, name: "John Doe", nationality: "Kuwaiti" }, // Already correct
    ]);

    const admin = createMockUser({ role: "admin" });
    const ctx = createMockContext(admin);
    const caller = appRouter.createCaller(ctx);

    const result = await caller.autoNormalizeNames();
    expect(result.totalPatients).toBeGreaterThanOrEqual(3);
    
    // Check that the ALL CAPS names were normalized
    const changes = result.changes;
    const change1 = changes.find(c => c.civilId === cid1);
    const change2 = changes.find(c => c.civilId === cid2);
    const change3 = changes.find(c => c.civilId === cid3);
    
    expect(change1).toBeDefined();
    expect(change1!.oldName).toBe("YAQOUB MANDI KHALIFA");
    expect(change1!.newName).toBe("Yaqoub Mandi Khalifa");

    expect(change2).toBeDefined();
    expect(change2!.oldName).toBe("fatmah dawoud ABDULLAH");
    expect(change2!.newName).toBe("Fatmah Dawoud Abdullah");

    // "John Doe" should NOT appear in changes (already correct)
    expect(change3).toBeUndefined();

    // Verify DB was actually updated
    const [p1] = await db.select().from(patients).where(eq(patients.civilId, cid1));
    expect(p1.name).toBe("Yaqoub Mandi Khalifa");
  });

  it("non-admin cannot run auto-normalize", async () => {
    const regularUser = createMockUser({ role: "user" });
    const ctx = createMockContext(regularUser);
    const caller = appRouter.createCaller(ctx);

    await expect(caller.autoNormalizeNames()).rejects.toThrow("Admin access required");
  });

  it("creates audit log entry for normalization", { timeout: 30000 }, async () => {
    const db = await getDb();
    if (!db) throw new Error("DB not available");

    const cid = uniqueCivilId();
    await db.insert(patients).values({ civilId: cid, name: "TEST ALL CAPS", nationality: "Kuwaiti" });

    const admin = createMockUser({ role: "admin" });
    const ctx = createMockContext(admin);
    const caller = appRouter.createCaller(ctx);

    await caller.autoNormalizeNames();

    // Check audit log
    const logs = await db
      .select()
      .from(auditLogs)
      .where(eq(auditLogs.action, "auto_normalize_names"))
      .limit(1);

    expect(logs.length).toBe(1);
    const metadata = JSON.parse(logs[0].metadata!);
    expect(metadata.totalPatients).toBeGreaterThanOrEqual(1);
    expect(metadata.namesNormalized).toBeGreaterThanOrEqual(1);
  });
});
