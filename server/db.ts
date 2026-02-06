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
  accessionDateFrom?: Date;
  accessionDateTo?: Date;
  testResult?: string;
  testType?: string;
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
  
  return db.select()
    .from(documents)
    .orderBy(desc(documents.createdAt))
    .limit(limit);
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
