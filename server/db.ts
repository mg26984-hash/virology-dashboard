import { eq, like, and, or, gte, lte, desc, sql } from "drizzle-orm";
import { drizzle } from "drizzle-orm/mysql2";
import { 
  InsertUser, users, 
  patients, InsertPatient, Patient,
  virologyTests, InsertVirologyTest, VirologyTest,
  documents, InsertDocument, Document,
  auditLogs, InsertAuditLog
} from "../drizzle/schema";
import { ENV } from './_core/env';

let _db: ReturnType<typeof drizzle> | null = null;

export async function getDb() {
  if (!_db && process.env.DATABASE_URL) {
    try {
      _db = drizzle(process.env.DATABASE_URL);
    } catch (error) {
      console.warn("[Database] Failed to connect:", error);
      _db = null;
    }
  }
  return _db;
}

// ============ USER FUNCTIONS ============

export async function upsertUser(user: InsertUser): Promise<void> {
  if (!user.openId) {
    throw new Error("User openId is required for upsert");
  }

  const db = await getDb();
  if (!db) {
    console.warn("[Database] Cannot upsert user: database not available");
    return;
  }

  try {
    const values: InsertUser = {
      openId: user.openId,
    };
    const updateSet: Record<string, unknown> = {};

    const textFields = ["name", "email", "loginMethod"] as const;
    type TextField = (typeof textFields)[number];

    const assignNullable = (field: TextField) => {
      const value = user[field];
      if (value === undefined) return;
      const normalized = value ?? null;
      values[field] = normalized;
      updateSet[field] = normalized;
    };

    textFields.forEach(assignNullable);

    if (user.lastSignedIn !== undefined) {
      values.lastSignedIn = user.lastSignedIn;
      updateSet.lastSignedIn = user.lastSignedIn;
    }
    if (user.role !== undefined) {
      values.role = user.role;
      updateSet.role = user.role;
    } else if (user.openId === ENV.ownerOpenId) {
      values.role = 'admin';
      updateSet.role = 'admin';
    }
    
    // Auto-approve owner, others start as pending
    if (user.openId === ENV.ownerOpenId) {
      values.status = 'approved';
      updateSet.status = 'approved';
    }

    if (!values.lastSignedIn) {
      values.lastSignedIn = new Date();
    }

    if (Object.keys(updateSet).length === 0) {
      updateSet.lastSignedIn = new Date();
    }

    await db.insert(users).values(values).onDuplicateKeyUpdate({
      set: updateSet,
    });
  } catch (error) {
    console.error("[Database] Failed to upsert user:", error);
    throw error;
  }
}

export async function getUserByOpenId(openId: string) {
  const db = await getDb();
  if (!db) {
    console.warn("[Database] Cannot get user: database not available");
    return undefined;
  }

  const result = await db.select().from(users).where(eq(users.openId, openId)).limit(1);
  return result.length > 0 ? result[0] : undefined;
}

export async function getAllUsers() {
  const db = await getDb();
  if (!db) return [];
  return db.select().from(users).orderBy(desc(users.createdAt));
}

export async function updateUserStatus(userId: number, status: 'pending' | 'approved' | 'banned', adminId: number, reason?: string) {
  const db = await getDb();
  if (!db) throw new Error("Database not available");
  
  await db.update(users).set({ status }).where(eq(users.id, userId));
  
  await db.insert(auditLogs).values({
    action: `user_${status}`,
    userId: adminId,
    targetUserId: userId,
    reason: reason || null,
  });
}

// ============ PATIENT FUNCTIONS ============

export async function upsertPatient(patient: InsertPatient): Promise<Patient> {
  const db = await getDb();
  if (!db) throw new Error("Database not available");

  const existing = await db.select().from(patients).where(eq(patients.civilId, patient.civilId)).limit(1);
  
  if (existing.length > 0) {
    await db.update(patients).set({
      name: patient.name || existing[0].name,
      dateOfBirth: patient.dateOfBirth || existing[0].dateOfBirth,
      nationality: patient.nationality || existing[0].nationality,
      gender: patient.gender || existing[0].gender,
      passportNo: patient.passportNo || existing[0].passportNo,
    }).where(eq(patients.civilId, patient.civilId));
    
    const updated = await db.select().from(patients).where(eq(patients.civilId, patient.civilId)).limit(1);
    return updated[0];
  } else {
    await db.insert(patients).values(patient);
    const inserted = await db.select().from(patients).where(eq(patients.civilId, patient.civilId)).limit(1);
    return inserted[0];
  }
}

export async function getPatientByCivilId(civilId: string) {
  const db = await getDb();
  if (!db) return undefined;
  
  const result = await db.select().from(patients).where(eq(patients.civilId, civilId)).limit(1);
  return result.length > 0 ? result[0] : undefined;
}

export async function getPatientById(id: number) {
  const db = await getDb();
  if (!db) return undefined;
  
  const result = await db.select().from(patients).where(eq(patients.id, id)).limit(1);
  return result.length > 0 ? result[0] : undefined;
}

export interface SearchPatientsParams {
  query?: string;
  civilId?: string;
  name?: string;
  nationality?: string;
  dateOfBirth?: string;
  limit?: number;
  offset?: number;
}

export async function searchPatients(params: SearchPatientsParams) {
  const db = await getDb();
  if (!db) return { patients: [], total: 0 };

  const conditions = [];
  
  if (params.query) {
    conditions.push(
      or(
        like(patients.civilId, `%${params.query}%`),
        like(patients.name, `%${params.query}%`)
      )
    );
  }
  
  if (params.civilId) {
    conditions.push(like(patients.civilId, `%${params.civilId}%`));
  }
  
  if (params.name) {
    conditions.push(like(patients.name, `%${params.name}%`));
  }
  
  if (params.nationality) {
    conditions.push(like(patients.nationality, `%${params.nationality}%`));
  }
  
  if (params.dateOfBirth) {
    conditions.push(eq(patients.dateOfBirth, params.dateOfBirth));
  }

  const whereClause = conditions.length > 0 ? and(...conditions) : undefined;
  
  const [results, countResult] = await Promise.all([
    db.select()
      .from(patients)
      .where(whereClause)
      .orderBy(desc(patients.updatedAt))
      .limit(params.limit || 50)
      .offset(params.offset || 0),
    db.select({ count: sql<number>`count(*)` })
      .from(patients)
      .where(whereClause)
  ]);

  return {
    patients: results,
    total: countResult[0]?.count || 0
  };
}

// ============ VIROLOGY TEST FUNCTIONS ============

export async function createVirologyTest(test: InsertVirologyTest): Promise<VirologyTest> {
  const db = await getDb();
  if (!db) throw new Error("Database not available");

  await db.insert(virologyTests).values(test);
  const inserted = await db.select().from(virologyTests).orderBy(desc(virologyTests.id)).limit(1);
  return inserted[0];
}

export async function getTestsByPatientId(patientId: number) {
  const db = await getDb();
  if (!db) return [];
  
  return db.select()
    .from(virologyTests)
    .where(eq(virologyTests.patientId, patientId))
    .orderBy(desc(virologyTests.accessionDate));
}

export interface SearchTestsParams {
  patientId?: number;
  testType?: string;
  startDate?: Date;
  endDate?: Date;
  limit?: number;
  offset?: number;
}

export async function searchTests(params: SearchTestsParams) {
  const db = await getDb();
  if (!db) return { tests: [], total: 0 };

  const conditions = [];
  
  if (params.patientId) {
    conditions.push(eq(virologyTests.patientId, params.patientId));
  }
  
  if (params.testType) {
    conditions.push(like(virologyTests.testType, `%${params.testType}%`));
  }
  
  if (params.startDate) {
    conditions.push(gte(virologyTests.accessionDate, params.startDate));
  }
  
  if (params.endDate) {
    conditions.push(lte(virologyTests.accessionDate, params.endDate));
  }

  const whereClause = conditions.length > 0 ? and(...conditions) : undefined;
  
  const [results, countResult] = await Promise.all([
    db.select()
      .from(virologyTests)
      .where(whereClause)
      .orderBy(desc(virologyTests.accessionDate))
      .limit(params.limit || 50)
      .offset(params.offset || 0),
    db.select({ count: sql<number>`count(*)` })
      .from(virologyTests)
      .where(whereClause)
  ]);

  return {
    tests: results,
    total: countResult[0]?.count || 0
  };
}

// ============ DOCUMENT FUNCTIONS ============

export async function createDocument(doc: InsertDocument): Promise<Document> {
  const db = await getDb();
  if (!db) throw new Error("Database not available");

  await db.insert(documents).values(doc);
  const inserted = await db.select().from(documents).orderBy(desc(documents.id)).limit(1);
  return inserted[0];
}

export async function updateDocumentStatus(
  id: number, 
  status: 'pending' | 'processing' | 'completed' | 'failed' | 'discarded',
  error?: string,
  extractedData?: string
) {
  const db = await getDb();
  if (!db) throw new Error("Database not available");

  await db.update(documents).set({
    processingStatus: status,
    processingError: error || null,
    extractedData: extractedData || null,
  }).where(eq(documents.id, id));
}

export async function getDocumentById(id: number) {
  const db = await getDb();
  if (!db) return undefined;
  
  const result = await db.select().from(documents).where(eq(documents.id, id)).limit(1);
  return result.length > 0 ? result[0] : undefined;
}

export async function getDocumentsByUser(userId: number) {
  const db = await getDb();
  if (!db) return [];
  
  return db.select()
    .from(documents)
    .where(eq(documents.uploadedBy, userId))
    .orderBy(desc(documents.createdAt));
}

export async function getRecentDocuments(limit: number = 20) {
  const db = await getDb();
  if (!db) return [];
  
  return db.select()
    .from(documents)
    .orderBy(desc(documents.createdAt))
    .limit(limit);
}

// ============ AUDIT LOG FUNCTIONS ============

export async function getAuditLogs(limit: number = 100) {
  const db = await getDb();
  if (!db) return [];
  
  return db.select()
    .from(auditLogs)
    .orderBy(desc(auditLogs.createdAt))
    .limit(limit);
}

export async function createAuditLog(log: InsertAuditLog) {
  const db = await getDb();
  if (!db) throw new Error("Database not available");
  
  await db.insert(auditLogs).values(log);
}

// ============ DASHBOARD STATS ============

export async function getDashboardStats() {
  const db = await getDb();
  if (!db) return { totalPatients: 0, totalTests: 0, totalDocuments: 0, pendingDocuments: 0 };

  const [patientCount, testCount, docCount, pendingCount] = await Promise.all([
    db.select({ count: sql<number>`count(*)` }).from(patients),
    db.select({ count: sql<number>`count(*)` }).from(virologyTests),
    db.select({ count: sql<number>`count(*)` }).from(documents),
    db.select({ count: sql<number>`count(*)` }).from(documents).where(eq(documents.processingStatus, 'pending')),
  ]);

  return {
    totalPatients: patientCount[0]?.count || 0,
    totalTests: testCount[0]?.count || 0,
    totalDocuments: docCount[0]?.count || 0,
    pendingDocuments: pendingCount[0]?.count || 0,
  };
}
