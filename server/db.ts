import { eq, like, and, or, gte, lte, desc, sql } from "drizzle-orm";
import { drizzle } from "drizzle-orm/mysql2";
import { 
  InsertUser, users, 
  patients, InsertPatient, Patient,
  virologyTests, InsertVirologyTest, VirologyTest,
  documents, InsertDocument, Document,
  auditLogs, InsertAuditLog,
  uploadTokens, InsertUploadToken
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

export async function getUserById(id: number) {
  const db = await getDb();
  if (!db) return undefined;
  const result = await db.select().from(users).where(eq(users.id, id)).limit(1);
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

export async function updateUserRole(userId: number, role: 'user' | 'admin', adminId: number, reason?: string) {
  const db = await getDb();
  if (!db) throw new Error("Database not available");
  
  await db.update(users).set({ role }).where(eq(users.id, userId));
  
  await db.insert(auditLogs).values({
    action: `user_role_${role}`,
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

export async function updatePatientDemographics(
  patientId: number,
  updates: {
    name?: string | null;
    dateOfBirth?: string | null;
    nationality?: string | null;
    gender?: string | null;
    passportNo?: string | null;
  }
): Promise<Patient | undefined> {
  const db = await getDb();
  if (!db) throw new Error("Database not available");

  // Build update set with only provided fields
  const updateSet: Record<string, unknown> = {};
  if (updates.name !== undefined) updateSet.name = updates.name;
  if (updates.dateOfBirth !== undefined) updateSet.dateOfBirth = updates.dateOfBirth;
  if (updates.nationality !== undefined) updateSet.nationality = updates.nationality;
  if (updates.gender !== undefined) updateSet.gender = updates.gender;
  if (updates.passportNo !== undefined) updateSet.passportNo = updates.passportNo;

  if (Object.keys(updateSet).length === 0) {
    return await getPatientById(patientId);
  }

  await db.update(patients).set(updateSet).where(eq(patients.id, patientId));
  return await getPatientById(patientId);
}

export interface SearchPatientsParams {
  query?: string;
  civilId?: string;
  name?: string;
  nationality?: string;
  dateOfBirth?: string;
  accessionDateFrom?: Date;
  accessionDateTo?: Date;
  testResult?: string;
  testType?: string;
  limit?: number;
  offset?: number;
}

/**
 * Lightweight autocomplete search — returns top 10 matches by Civil ID or name.
 * Only returns id, civilId, name, and nationality for fast dropdown rendering.
 */
export async function autocompletePatients(query: string): Promise<{ id: number; civilId: string | null; name: string | null; nationality: string | null }[]> {
  const db = await getDb();
  if (!db || !query || query.trim().length < 2) return [];

  const trimmed = query.trim();
  const results = await db.select({
    id: patients.id,
    civilId: patients.civilId,
    name: patients.name,
    nationality: patients.nationality,
  })
    .from(patients)
    .where(
      or(
        like(patients.civilId, `%${trimmed}%`),
        like(patients.name, `%${trimmed}%`)
      )
    )
    .orderBy(desc(patients.updatedAt))
    .limit(10);

  return results;
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

  // If any test-level filters are provided, join with virologyTests to find matching patient IDs
  const hasTestFilters = params.accessionDateFrom || params.accessionDateTo || params.testResult || params.testType;
  if (hasTestFilters) {
    const testConditions = [];
    if (params.accessionDateFrom) {
      testConditions.push(gte(virologyTests.accessionDate, params.accessionDateFrom));
    }
    if (params.accessionDateTo) {
      testConditions.push(lte(virologyTests.accessionDate, params.accessionDateTo));
    }
    if (params.testResult) {
      testConditions.push(like(virologyTests.result, `%${params.testResult}%`));
    }
    if (params.testType) {
      testConditions.push(like(virologyTests.testType, `%${params.testType}%`));
    }

    const patientsWithTests = await db.selectDistinct({ patientId: virologyTests.patientId })
      .from(virologyTests)
      .where(and(...testConditions));

    const patientIds = patientsWithTests.map(p => p.patientId);

    if (patientIds.length === 0) {
      return { patients: [], total: 0 };
    }

    conditions.push(sql`${patients.id} IN (${sql.join(patientIds.map(id => sql`${id}`), sql`, `)})`);
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

// Check for duplicate test result based on patient, test type, and accession date
export async function checkDuplicateTest(
  patientId: number,
  testType: string,
  accessionDate: Date
): Promise<VirologyTest | null> {
  const db = await getDb();
  if (!db) return null;

  // Check for existing test with same patient, test type, and accession date (within same day)
  const startOfDay = new Date(accessionDate);
  startOfDay.setHours(0, 0, 0, 0);
  const endOfDay = new Date(accessionDate);
  endOfDay.setHours(23, 59, 59, 999);

  const existing = await db.select()
    .from(virologyTests)
    .where(
      and(
        eq(virologyTests.patientId, patientId),
        eq(virologyTests.testType, testType),
        gte(virologyTests.accessionDate, startOfDay),
        lte(virologyTests.accessionDate, endOfDay)
      )
    )
    .limit(1);

  return existing.length > 0 ? existing[0] : null;
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
  
  const docs = await db.select()
    .from(documents)
    .orderBy(desc(documents.createdAt))
    .limit(limit);

  // For each completed doc, find the linked patient via virologyTests
  const docsWithPatient = await Promise.all(
    docs.map(async (doc) => {
      if (doc.processingStatus === 'completed') {
        const test = await db.select({
          patientId: virologyTests.patientId,
          civilId: patients.civilId,
          patientName: patients.name,
        })
          .from(virologyTests)
          .leftJoin(patients, eq(virologyTests.patientId, patients.id))
          .where(eq(virologyTests.documentId, doc.id))
          .limit(1);
        if (test.length > 0) {
          return { ...doc, patientId: test[0].patientId, civilId: test[0].civilId, patientName: test[0].patientName };
        }
      }
      return { ...doc, patientId: null, civilId: null, patientName: null };
    })
  );

  return docsWithPatient;
}

export async function getDocumentsByStatus(
  statuses: Array<'pending' | 'processing' | 'completed' | 'failed' | 'discarded'>,
  limit: number = 100
) {
  const db = await getDb();
  if (!db) return [];
  
  return db.select()
    .from(documents)
    .where(sql`${documents.processingStatus} IN (${sql.join(statuses.map(s => sql`${s}`), sql`, `)})`)
    .orderBy(desc(documents.createdAt))
    .limit(limit);
}

export async function getDocumentStats() {
  const db = await getDb();
  if (!db) return { pending: 0, processing: 0, completed: 0, failed: 0, discarded: 0, total: 0 };
  
  const result = await db.select({
    status: documents.processingStatus,
    count: sql<number>`count(*)`
  })
    .from(documents)
    .groupBy(documents.processingStatus);
  
  const stats: Record<string, number> = { pending: 0, processing: 0, completed: 0, failed: 0, discarded: 0, total: 0 };
  result.forEach(r => {
    if (r.status) {
      stats[r.status] = r.count;
      stats.total += r.count;
    }
  });
  
  return stats;
}

// ============ PROCESSING QUEUE ============

/**
 * Reset documents stuck in "processing" for more than the given threshold back to "pending".
 * This handles zombie processes from server restarts or LLM timeouts.
 */
export async function resetStaleProcessing(thresholdMinutes: number = 10): Promise<number> {
  const db = await getDb();
  if (!db) return 0;

  const cutoff = new Date(Date.now() - thresholdMinutes * 60 * 1000);
  const result = await db.update(documents)
    .set({ processingStatus: 'pending' })
    .where(
      and(
        eq(documents.processingStatus, 'processing'),
        lte(documents.updatedAt, cutoff)
      )
    );

  const resetCount = (result as any)[0]?.affectedRows || 0;
  if (resetCount > 0) {
    console.log(`[StaleRecovery] Reset ${resetCount} stale processing documents back to pending (threshold: ${thresholdMinutes}min)`);
  }
  return resetCount;
}

export async function getProcessingQueue(limit: number = 50) {
  const db = await getDb();
  if (!db) return { items: [], counts: { pending: 0, processing: 0, failed: 0, completed: 0, discarded: 0 }, speed: { docsPerMinute: 0, completedLast5Min: 0, completedLast30Min: 0, completedLast60Min: 0, totalRemaining: 0, estimatedMinutesRemaining: null as number | null }, staleReset: 0 };

  // Auto-recover stale processing documents (stuck > 10 min)
  const staleReset = await resetStaleProcessing(10);

  const [items, countResult] = await Promise.all([
    db.select({
      id: documents.id,
      fileName: documents.fileName,
      fileSize: documents.fileSize,
      mimeType: documents.mimeType,
      processingStatus: documents.processingStatus,
      processingError: documents.processingError,
      createdAt: documents.createdAt,
      updatedAt: documents.updatedAt,
      uploadedByName: users.name,
      uploadedByEmail: users.email,
    })
      .from(documents)
      .leftJoin(users, eq(documents.uploadedBy, users.id))
      .where(
        sql`${documents.processingStatus} IN ('pending', 'processing', 'failed')`
      )
      .orderBy(
        sql`FIELD(${documents.processingStatus}, 'processing', 'pending', 'failed')`,
        desc(documents.createdAt)
      )
      .limit(limit),
    db.select({
      status: documents.processingStatus,
      count: sql<number>`count(*)`
    })
      .from(documents)
      .groupBy(documents.processingStatus),
  ]);

  const counts: Record<string, number> = { pending: 0, processing: 0, failed: 0, completed: 0, discarded: 0 };
  countResult.forEach(r => {
    if (r.status) counts[r.status] = r.count;
  });

  // Calculate processing speed: docs completed in recent time windows
  const now = new Date();
  const fiveMinAgo = new Date(now.getTime() - 5 * 60 * 1000);
  const thirtyMinAgo = new Date(now.getTime() - 30 * 60 * 1000);
  const oneHourAgo = new Date(now.getTime() - 60 * 60 * 1000);

  const [recent5, recent30, recent60] = await Promise.all([
    db.select({ count: sql<number>`count(*)` })
      .from(documents)
      .where(and(
        eq(documents.processingStatus, 'completed'),
        gte(documents.updatedAt, fiveMinAgo)
      )),
    db.select({ count: sql<number>`count(*)` })
      .from(documents)
      .where(and(
        eq(documents.processingStatus, 'completed'),
        gte(documents.updatedAt, thirtyMinAgo)
      )),
    db.select({ count: sql<number>`count(*)` })
      .from(documents)
      .where(and(
        eq(documents.processingStatus, 'completed'),
        gte(documents.updatedAt, oneHourAgo)
      )),
  ]);

  const completedLast5Min = recent5[0]?.count || 0;
  const completedLast30Min = recent30[0]?.count || 0;
  const completedLast60Min = recent60[0]?.count || 0;

  // Calculate docs per minute using the best available window
  let docsPerMinute = 0;
  if (completedLast5Min > 0) {
    docsPerMinute = completedLast5Min / 5;
  } else if (completedLast30Min > 0) {
    docsPerMinute = completedLast30Min / 30;
  } else if (completedLast60Min > 0) {
    docsPerMinute = completedLast60Min / 60;
  }

  const totalRemaining = counts.pending + counts.processing;
  const estimatedMinutesRemaining = docsPerMinute > 0 ? Math.ceil(totalRemaining / docsPerMinute) : null;

  return {
    items,
    counts,
    speed: {
      docsPerMinute: Math.round(docsPerMinute * 10) / 10,
      completedLast5Min,
      completedLast30Min,
      completedLast60Min,
      totalRemaining,
      estimatedMinutesRemaining,
    },
    staleReset,
  };
}

// ============ UPLOAD HISTORY ============

export async function getUploadHistory(limit: number = 50, offset: number = 0) {
  const db = await getDb();
  if (!db) return { batches: [], total: 0 };

  // Get documents grouped by uploader and date, ordered by most recent
  const rows = await db.select({
    uploadedBy: documents.uploadedBy,
    uploaderName: users.name,
    uploaderEmail: users.email,
    uploadDate: sql<string>`DATE(${documents.createdAt})`,
    totalFiles: sql<number>`COUNT(*)`,
    completedFiles: sql<number>`SUM(CASE WHEN ${documents.processingStatus} = 'completed' THEN 1 ELSE 0 END)`,
    failedFiles: sql<number>`SUM(CASE WHEN ${documents.processingStatus} = 'failed' THEN 1 ELSE 0 END)`,
    pendingFiles: sql<number>`SUM(CASE WHEN ${documents.processingStatus} = 'pending' THEN 1 ELSE 0 END)`,
    processingFiles: sql<number>`SUM(CASE WHEN ${documents.processingStatus} = 'processing' THEN 1 ELSE 0 END)`,
    discardedFiles: sql<number>`SUM(CASE WHEN ${documents.processingStatus} = 'discarded' THEN 1 ELSE 0 END)`,
    totalSize: sql<number>`SUM(${documents.fileSize})`,
    firstUpload: sql<Date>`MIN(${documents.createdAt})`,
    lastUpload: sql<Date>`MAX(${documents.createdAt})`,
    lastProcessed: sql<Date>`MAX(${documents.updatedAt})`,
  })
    .from(documents)
    .leftJoin(users, eq(documents.uploadedBy, users.id))
    .groupBy(documents.uploadedBy, users.name, users.email, sql`DATE(${documents.createdAt})`)
    .orderBy(sql`MAX(${documents.createdAt}) DESC`)
    .limit(limit)
    .offset(offset);

  const [countResult] = await db.select({
    total: sql<number>`COUNT(DISTINCT CONCAT(${documents.uploadedBy}, '-', DATE(${documents.createdAt})))`,
  }).from(documents);

  return {
    batches: rows.map(r => {
      const totalFiles = Number(r.totalFiles) || 0;
      const completedFiles = Number(r.completedFiles) || 0;
      const failedFiles = Number(r.failedFiles) || 0;
      const pendingFiles = Number(r.pendingFiles) || 0;
      const processingFiles = Number(r.processingFiles) || 0;
      const discardedFiles = Number(r.discardedFiles) || 0;
      const totalSize = Number(r.totalSize) || 0;
      return {
        uploadedBy: r.uploadedBy,
        uploaderName: r.uploaderName || 'Unknown',
        uploaderEmail: r.uploaderEmail || '',
        uploadDate: r.uploadDate,
        totalFiles,
        completedFiles,
        failedFiles,
        pendingFiles,
        processingFiles,
        discardedFiles,
        totalSize,
        firstUpload: r.firstUpload,
        lastUpload: r.lastUpload,
        lastProcessed: r.lastProcessed,
        successRate: totalFiles ? Math.round((completedFiles / totalFiles) * 100) : 0,
      };
    }),
    total: Number(countResult?.total) || 0,
  };
}

// ============ AUDIT LOG FUNCTIONS ============

export async function getAuditLogs(limit: number = 100, actionFilter?: string) {
  const db = await getDb();
  if (!db) return [];

  const conditions = [];
  if (actionFilter) {
    conditions.push(like(auditLogs.action, `%${actionFilter}%`));
  }

  const whereClause = conditions.length > 0 ? and(...conditions) : undefined;

  return db.select()
    .from(auditLogs)
    .where(whereClause)
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


// ============ PROCESSING TIME STATS ============

export async function getAverageProcessingTime(): Promise<number> {
  const db = await getDb();
  if (!db) return 15000; // Default 15 seconds if no data
  
  // Calculate average processing time from completed documents
  // Processing time = updatedAt - createdAt for completed documents
  const result = await db.select({
    avgTime: sql<number>`AVG(TIMESTAMPDIFF(SECOND, ${documents.createdAt}, ${documents.updatedAt}))`
  })
    .from(documents)
    .where(eq(documents.processingStatus, 'completed'));
  
  const avgSeconds = result[0]?.avgTime || 15;
  return Math.max(avgSeconds * 1000, 5000); // Return in milliseconds, minimum 5 seconds
}

export async function getProcessingStats() {
  const db = await getDb();
  if (!db) return { 
    avgProcessingTime: 15000, 
    pendingCount: 0, 
    processingCount: 0,
    completedLast5Min: 0 
  };
  
  const now = new Date();
  const fiveMinAgo = new Date(now.getTime() - 5 * 60 * 1000);
  
  const [avgResult, pendingResult, processingResult, recentCompletedResult] = await Promise.all([
    // Average processing time
    db.select({
      avgTime: sql<number>`AVG(TIMESTAMPDIFF(SECOND, ${documents.createdAt}, ${documents.updatedAt}))`
    })
      .from(documents)
      .where(eq(documents.processingStatus, 'completed')),
    
    // Pending count
    db.select({ count: sql<number>`count(*)` })
      .from(documents)
      .where(eq(documents.processingStatus, 'pending')),
    
    // Processing count
    db.select({ count: sql<number>`count(*)` })
      .from(documents)
      .where(eq(documents.processingStatus, 'processing')),
    
    // Completed in last 5 minutes
    db.select({ count: sql<number>`count(*)` })
      .from(documents)
      .where(
        and(
          eq(documents.processingStatus, 'completed'),
          gte(documents.updatedAt, fiveMinAgo)
        )
      ),
  ]);
  
  const avgSeconds = avgResult[0]?.avgTime || 15;
  
  return {
    avgProcessingTime: Math.max(avgSeconds * 1000, 5000), // milliseconds, min 5s
    pendingCount: pendingResult[0]?.count || 0,
    processingCount: processingResult[0]?.count || 0,
    completedLast5Min: recentCompletedResult[0]?.count || 0,
  };
}


// ============ PROCESSING HISTORY ============

export async function getDocumentProcessingHistory(days: number = 30) {
  const db = await getDb();
  if (!db) return [];

  const safeDays = Math.max(1, Math.min(90, Math.floor(days)));

  const results = await db.execute(sql`
    SELECT 
      DATE_FORMAT(d.updatedAt, '%Y-%m-%d') AS date,
      SUM(CASE WHEN d.processingStatus = 'completed' THEN 1 ELSE 0 END) AS completed,
      SUM(CASE WHEN d.processingStatus = 'failed' THEN 1 ELSE 0 END) AS failed,
      SUM(CASE WHEN d.processingStatus = 'discarded' THEN 1 ELSE 0 END) AS discarded,
      COUNT(*) AS total
    FROM documents d
    WHERE d.processingStatus IN ('completed', 'failed', 'discarded')
      AND d.updatedAt >= DATE_SUB(NOW(), INTERVAL ${sql.raw(String(safeDays))} DAY)
    GROUP BY DATE_FORMAT(d.updatedAt, '%Y-%m-%d')
    ORDER BY date ASC
  `);

  return ((results as any)[0] ?? []).map((row: any) => ({
    date: String(row.date),
    completed: Number(row.completed) || 0,
    failed: Number(row.failed) || 0,
    discarded: Number(row.discarded) || 0,
    total: Number(row.total) || 0,
  }));
}

// ============ EXPORT FUNCTIONS ============

export interface ExportFilters {
  dateFrom?: Date;
  dateTo?: Date;
  testType?: string;
  nationality?: string;
  civilId?: string;
  patientName?: string;
}

export async function getExportData(filters: ExportFilters) {
  const db = await getDb();
  if (!db) return [];

  const conditions = [];

  if (filters.dateFrom) {
    conditions.push(gte(virologyTests.accessionDate, filters.dateFrom));
  }
  if (filters.dateTo) {
    conditions.push(lte(virologyTests.accessionDate, filters.dateTo));
  }
  if (filters.testType) {
    conditions.push(like(virologyTests.testType, `%${filters.testType}%`));
  }
  if (filters.nationality) {
    conditions.push(like(patients.nationality, `%${filters.nationality}%`));
  }
  if (filters.civilId) {
    conditions.push(like(patients.civilId, `%${filters.civilId}%`));
  }
  if (filters.patientName) {
    conditions.push(like(patients.name, `%${filters.patientName}%`));
  }

  const whereClause = conditions.length > 0 ? and(...conditions) : undefined;

  // Join patients with their virology tests
  const results = await db
    .select({
      // Patient fields
      patientId: patients.id,
      civilId: patients.civilId,
      patientName: patients.name,
      dateOfBirth: patients.dateOfBirth,
      nationality: patients.nationality,
      gender: patients.gender,
      passportNo: patients.passportNo,
      // Test fields
      testId: virologyTests.id,
      testType: virologyTests.testType,
      result: virologyTests.result,
      viralLoad: virologyTests.viralLoad,
      unit: virologyTests.unit,
      sampleNo: virologyTests.sampleNo,
      accessionNo: virologyTests.accessionNo,
      departmentNo: virologyTests.departmentNo,
      accessionDate: virologyTests.accessionDate,
      signedBy: virologyTests.signedBy,
      signedAt: virologyTests.signedAt,
      location: virologyTests.location,
    })
    .from(virologyTests)
    .innerJoin(patients, eq(virologyTests.patientId, patients.id))
    .where(whereClause)
    .orderBy(desc(virologyTests.accessionDate));

  return results;
}

export async function getDistinctTestTypes(): Promise<string[]> {
  const db = await getDb();
  if (!db) return [];

  const results = await db
    .selectDistinct({ testType: virologyTests.testType })
    .from(virologyTests)
    .where(sql`${virologyTests.testType} IS NOT NULL AND ${virologyTests.testType} != ''`)
    .orderBy(virologyTests.testType);

  return results.map((r) => r.testType).filter(Boolean) as string[];
}

export async function getDistinctNationalities(): Promise<string[]> {
  const db = await getDb();
  if (!db) return [];

  const results = await db
    .selectDistinct({ nationality: patients.nationality })
    .from(patients)
    .where(sql`${patients.nationality} IS NOT NULL AND ${patients.nationality} != ''`)
    .orderBy(patients.nationality);

  return results.map((r) => r.nationality).filter(Boolean) as string[];
}

export async function getDistinctTestValues(): Promise<{ testTypes: string[]; testResults: string[] }> {
  const db = await getDb();
  if (!db) return { testTypes: [], testResults: [] };

  const [typeResults, resultResults] = await Promise.all([
    db.selectDistinct({ testType: virologyTests.testType })
      .from(virologyTests)
      .orderBy(virologyTests.testType),
    db.selectDistinct({ result: virologyTests.result })
      .from(virologyTests)
      .orderBy(virologyTests.result),
  ]);

  return {
    testTypes: typeResults.map(r => r.testType).filter(v => v && v.trim()) as string[],
    testResults: resultResults.map(r => r.result).filter(v => v && v.trim()) as string[],
  };
}


// ============ ANALYTICS / CHART DATA ============

/**
 * Test volume by month – returns test counts grouped by month.
 * When no date range is provided, returns all-time data.
 */
export async function getTestVolumeByMonth(from?: string, to?: string): Promise<{ month: string; count: number }[]> {
  const db = await getDb();
  if (!db) return [];

  const conditions = [sql`${virologyTests.accessionDate} IS NOT NULL`];
  if (from) {
    conditions.push(sql`${virologyTests.accessionDate} >= ${from}`);
  }
  if (to) {
    conditions.push(sql`${virologyTests.accessionDate} <= ${to}`);
  }
  if (!from && !to) {
    conditions.push(sql`${virologyTests.accessionDate} >= DATE_SUB(CURDATE(), INTERVAL 12 MONTH)`);
  }

  const whereClause = sql.join(conditions, sql` AND `);

  const results = await db.execute(sql`
    SELECT 
      DATE_FORMAT(${virologyTests.accessionDate}, '%Y-%m') AS month,
      COUNT(*) AS count
    FROM ${virologyTests}
    WHERE ${whereClause}
    GROUP BY month
    ORDER BY month ASC
  `);

  return (results as any)[0]?.map((r: any) => ({
    month: r.month as string,
    count: Number(r.count),
  })) ?? [];
}

/**
 * Result distribution – counts per distinct result value.
 */
export async function getResultDistribution(from?: string, to?: string): Promise<{ result: string; count: number }[]> {
  const db = await getDb();
  if (!db) return [];

  const conditions = [
    sql`${virologyTests.result} IS NOT NULL`,
    sql`${virologyTests.result} != ''`,
  ];
  if (from) {
    conditions.push(sql`${virologyTests.accessionDate} >= ${from}`);
  }
  if (to) {
    conditions.push(sql`${virologyTests.accessionDate} <= ${to}`);
  }

  const whereClause = sql.join(conditions, sql` AND `);

  const results = await db.execute(sql`
    SELECT 
      ${virologyTests.result} AS result,
      COUNT(*) AS count
    FROM ${virologyTests}
    WHERE ${whereClause}
    GROUP BY result
    ORDER BY count DESC
    LIMIT 10
  `);

  return (results as any)[0]?.map((r: any) => ({
    result: r.result as string,
    count: Number(r.count),
  })) ?? [];
}

/**
 * Top test types by volume.
 */
export async function getTopTestTypes(limit = 10, from?: string, to?: string): Promise<{ testType: string; count: number }[]> {
  const db = await getDb();
  if (!db) return [];

  const conditions = [
    sql`${virologyTests.testType} IS NOT NULL`,
    sql`${virologyTests.testType} != ''`,
  ];
  if (from) {
    conditions.push(sql`${virologyTests.accessionDate} >= ${from}`);
  }
  if (to) {
    conditions.push(sql`${virologyTests.accessionDate} <= ${to}`);
  }

  const whereClause = sql.join(conditions, sql` AND `);

  const results = await db.execute(sql`
    SELECT 
      ${virologyTests.testType} AS testType,
      COUNT(*) AS count
    FROM ${virologyTests}
    WHERE ${whereClause}
    GROUP BY testType
    ORDER BY count DESC
    LIMIT ${limit}
  `);

  return (results as any)[0]?.map((r: any) => ({
    testType: r.testType as string,
    count: Number(r.count),
  })) ?? [];
}

/**
 * Tests by nationality – top nationalities by test count.
 */
export async function getTestsByNationality(limit = 10, from?: string, to?: string): Promise<{ nationality: string; count: number }[]> {
  const db = await getDb();
  if (!db) return [];

  const conditions = [
    sql`p.nationality IS NOT NULL`,
    sql`p.nationality != ''`,
  ];
  if (from) {
    conditions.push(sql`vt.accessionDate >= ${from}`);
  }
  if (to) {
    conditions.push(sql`vt.accessionDate <= ${to}`);
  }

  const whereClause = sql.join(conditions, sql` AND `);

  const results = await db.execute(sql`
    SELECT 
      p.nationality AS nationality,
      COUNT(vt.id) AS count
    FROM ${virologyTests} vt
    INNER JOIN ${patients} p ON vt.patientId = p.id
    WHERE ${whereClause}
    GROUP BY p.nationality
    ORDER BY count DESC
    LIMIT ${limit}
  `);

  return (results as any)[0]?.map((r: any) => ({
    nationality: r.nationality as string,
    count: Number(r.count),
  })) ?? [];
}


// ============ PATIENT MERGE FUNCTIONS ============

export interface DuplicateCandidate {
  patient1: Patient;
  patient2: Patient;
  matchType: 'civil_id';
  similarity: number; // 0-100
  reason: string;
}

/**
 * Find potential duplicate patients based on Civil ID similarities.
 * Compares normalized Civil IDs (ignoring spaces, dashes, leading zeros)
 * to detect records that may refer to the same patient.
 */
export async function findDuplicatePatients(): Promise<DuplicateCandidate[]> {
  const db = await getDb();
  if (!db) return [];

  // Get all patients
  const allPatients = await db.select().from(patients).orderBy(patients.civilId);
  const duplicates: DuplicateCandidate[] = [];
  const seen = new Set<string>();

  // Group patients by normalized Civil ID for efficient comparison
  const cidGroups = new Map<string, typeof allPatients>();
  for (const p of allPatients) {
    const normCid = normalizeCivilId(p.civilId);
    if (!normCid) continue;
    const group = cidGroups.get(normCid) || [];
    group.push(p);
    cidGroups.set(normCid, group);
  }

  // Find groups with more than one patient (exact normalized CID match)
  for (const [normCid, group] of Array.from(cidGroups.entries())) {
    if (group.length < 2) continue;
    for (let i = 0; i < group.length; i++) {
      for (let j = i + 1; j < group.length; j++) {
        const p1 = group[i];
        const p2 = group[j];
        const pairKey = `${Math.min(p1.id, p2.id)}-${Math.max(p1.id, p2.id)}`;
        if (seen.has(pairKey)) continue;
        seen.add(pairKey);

        // Only flag if the raw Civil IDs differ (otherwise they're exact duplicates
        // which should have been caught during upload)
        const similarity = p1.civilId === p2.civilId ? 100 : 95;
        const reason = p1.civilId === p2.civilId
          ? `Exact same Civil ID: "${p1.civilId}"`
          : `Civil IDs match after normalization: "${p1.civilId}" ≈ "${p2.civilId}"`;

        duplicates.push({
          patient1: p1,
          patient2: p2,
          matchType: 'civil_id',
          similarity,
          reason,
        });
      }
    }
  }

  // Sort by similarity descending
  duplicates.sort((a, b) => b.similarity - a.similarity);
  return duplicates;
}

function normalizeCivilId(cid: string): string {
  return cid.replace(/[\s\-]/g, '').replace(/^0+/, '');
}

function normalizeName(name: string | null): string {
  if (!name) return '';
  return name.trim().toLowerCase().replace(/\s+/g, ' ').replace(/[.,']/g, '');
}

function levenshteinDistance(a: string, b: string): number {
  const m = a.length;
  const n = b.length;
  const dp: number[][] = Array.from({ length: m + 1 }, () => Array(n + 1).fill(0));
  for (let i = 0; i <= m; i++) dp[i][0] = i;
  for (let j = 0; j <= n; j++) dp[0][j] = j;
  for (let i = 1; i <= m; i++) {
    for (let j = 1; j <= n; j++) {
      dp[i][j] = a[i - 1] === b[j - 1]
        ? dp[i - 1][j - 1]
        : 1 + Math.min(dp[i - 1][j], dp[i][j - 1], dp[i - 1][j - 1]);
    }
  }
  return dp[m][n];
}

/**
 * Merge two patients: move all tests and documents from source to target,
 * update target patient info with any missing fields, then delete source.
 * Returns the number of tests reassigned.
 */
export async function mergePatients(
  targetId: number,
  sourceId: number,
  adminId: number,
  reason?: string
): Promise<{ testsReassigned: number; documentsReassigned: number }> {
  const db = await getDb();
  if (!db) throw new Error("Database not available");

  // Get both patients
  const [target] = await db.select().from(patients).where(eq(patients.id, targetId)).limit(1);
  const [source] = await db.select().from(patients).where(eq(patients.id, sourceId)).limit(1);

  if (!target) throw new Error(`Target patient ${targetId} not found`);
  if (!source) throw new Error(`Source patient ${sourceId} not found`);
  if (targetId === sourceId) throw new Error("Cannot merge a patient with itself");

  // Count tests and documents to reassign
  const [testCountResult] = await db.select({ count: sql<number>`count(*)` })
    .from(virologyTests)
    .where(eq(virologyTests.patientId, sourceId));
  const testsReassigned = testCountResult?.count || 0;

  // Reassign all virology tests from source to target
  await db.update(virologyTests)
    .set({ patientId: targetId })
    .where(eq(virologyTests.patientId, sourceId));

  // Update target patient with any missing info from source
  const updateFields: Partial<InsertPatient> = {};
  if (!target.name && source.name) updateFields.name = source.name;
  if (!target.dateOfBirth && source.dateOfBirth) updateFields.dateOfBirth = source.dateOfBirth;
  if (!target.nationality && source.nationality) updateFields.nationality = source.nationality;
  if (!target.gender && source.gender) updateFields.gender = source.gender;
  if (!target.passportNo && source.passportNo) updateFields.passportNo = source.passportNo;

  if (Object.keys(updateFields).length > 0) {
    await db.update(patients).set(updateFields).where(eq(patients.id, targetId));
  }

  // Delete source patient (cascade will handle if there are any remaining references)
  await db.delete(patients).where(eq(patients.id, sourceId));

  // Create audit log
  await db.insert(auditLogs).values({
    action: 'patient_merge',
    userId: adminId,
    reason: reason || null,
    metadata: JSON.stringify({
      targetPatientId: targetId,
      targetCivilId: target.civilId,
      targetName: target.name,
      sourcePatientId: sourceId,
      sourceCivilId: source.civilId,
      sourceName: source.name,
      testsReassigned,
      fieldsUpdated: Object.keys(updateFields),
    }),
  });

  return { testsReassigned, documentsReassigned: 0 };
}

/**
 * Search patients for merge - returns patients matching a query with test counts
 */
export async function searchPatientsForMerge(query: string): Promise<(Patient & { testCount: number })[]> {
  const db = await getDb();
  if (!db) return [];

  const results = await db
    .select({
      id: patients.id,
      civilId: patients.civilId,
      name: patients.name,
      dateOfBirth: patients.dateOfBirth,
      nationality: patients.nationality,
      gender: patients.gender,
      passportNo: patients.passportNo,
      createdAt: patients.createdAt,
      updatedAt: patients.updatedAt,
      testCount: sql<number>`COUNT(${virologyTests.id})`,
    })
    .from(patients)
    .leftJoin(virologyTests, eq(virologyTests.patientId, patients.id))
    .where(
      or(
        like(patients.civilId, `%${query}%`),
        like(patients.name, `%${query}%`)
      )
    )
    .groupBy(patients.id)
    .orderBy(desc(sql`COUNT(${virologyTests.id})`))
    .limit(20);

  return results as (Patient & { testCount: number })[];
}


// ---- Upload Token Helpers ----

export async function createUploadToken(userId: number, token: string, expiresAt: Date) {
  const db = await getDb();
  if (!db) throw new Error("Database not available");
  await db.insert(uploadTokens).values({ userId, token, expiresAt });
  return { token, expiresAt };
}

export async function validateUploadToken(token: string): Promise<{ valid: boolean; userId?: number }> {
  const db = await getDb();
  if (!db) return { valid: false };
  const results = await db.select().from(uploadTokens)
    .where(eq(uploadTokens.token, token))
    .limit(1);
  if (results.length === 0) return { valid: false };
  const t = results[0];
  // Tokens are permanent — no expiry check needed
  // Increment usage count
  await db.update(uploadTokens).set({ used: (t.used || 0) + 1 }).where(eq(uploadTokens.id, t.id));
  return { valid: true, userId: t.userId };
}

export async function cleanExpiredTokens() {
  const db = await getDb();
  if (!db) return;
  await db.delete(uploadTokens).where(
    sql`${uploadTokens.expiresAt} < NOW()`
  );
}


// ─── Leaderboard Queries ──────────────────────────────────────────────────────

/**
 * Get patients with highest BK PCR viral loads in blood.
 * Matches test types: "Polyomaviruses (BKV & JCV) DNA in Blood", "BK Virus", etc.
 * Only includes results where "BK Virus Detected" is in the result text.
 * Returns the single highest viral load per patient.
 */
export async function getBKPCRLeaderboard(limit = 20) {
  const db = await getDb();
  if (!db) return [];

  const rows = await db.execute(sql`
    SELECT 
      p.id as patientId,
      p.civilId,
      p.name as patientName,
      p.nationality,
      vt.viralLoad,
      vt.unit,
      vt.result,
      vt.accessionDate,
      vt.testType,
      CAST(REPLACE(REPLACE(vt.viralLoad, ',', ''), ' ', '') AS UNSIGNED) as numericLoad
    FROM ${virologyTests} vt
    JOIN ${patients} p ON vt.patientId = p.id
    WHERE (
      vt.testType LIKE '%BKV%DNA%Blood%'
      OR vt.testType LIKE '%BK Virus%'
      OR vt.testType = 'BK Virus'
    )
    AND vt.viralLoad IS NOT NULL 
    AND vt.viralLoad != ''
    AND CAST(REPLACE(REPLACE(vt.viralLoad, ',', ''), ' ', '') AS UNSIGNED) > 0
    AND (vt.result LIKE '%BK%Detected%' OR vt.result LIKE '%Detected%')
    ORDER BY numericLoad DESC
    LIMIT ${limit * 3}
  `);

  // Deduplicate: keep only the highest viral load per patient
  const seen = new Set<number>();
  const results: any[] = [];
  for (const row of (rows as any)[0]) {
    const pid = row.patientId;
    if (!seen.has(pid)) {
      seen.add(pid);
      results.push(row);
      if (results.length >= limit) break;
    }
  }
  return results;
}

/**
 * Get patients with highest CMV PCR viral loads in blood.
 * Matches test types: "Cytomegalovirus (CMV) DNA in Blood", "CMV PCR", "CMV -DNA Quantitative"
 * Returns the single highest viral load per patient.
 */
export async function getCMVPCRLeaderboard(limit = 20) {
  const db = await getDb();
  if (!db) return [];

  const rows = await db.execute(sql`
    SELECT 
      p.id as patientId,
      p.civilId,
      p.name as patientName,
      p.nationality,
      vt.viralLoad,
      vt.unit,
      vt.result,
      vt.accessionDate,
      vt.testType,
      CAST(REPLACE(REPLACE(vt.viralLoad, ',', ''), ' ', '') AS UNSIGNED) as numericLoad
    FROM ${virologyTests} vt
    JOIN ${patients} p ON vt.patientId = p.id
    WHERE (
      vt.testType LIKE '%CMV%DNA%Blood%'
      OR vt.testType = 'CMV PCR'
      OR vt.testType = 'CMV -DNA Quantitative'
    )
    AND vt.viralLoad IS NOT NULL 
    AND vt.viralLoad != ''
    AND CAST(REPLACE(REPLACE(vt.viralLoad, ',', ''), ' ', '') AS UNSIGNED) > 0
    AND vt.result LIKE '%Detected%'
    ORDER BY numericLoad DESC
    LIMIT ${limit * 3}
  `);

  // Deduplicate: keep only the highest viral load per patient
  const seen = new Set<number>();
  const results: any[] = [];
  for (const row of (rows as any)[0]) {
    const pid = row.patientId;
    if (!seen.has(pid)) {
      seen.add(pid);
      results.push(row);
      if (results.length >= limit) break;
    }
  }
  return results;
}
