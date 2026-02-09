/**
 * Upload Batch database helpers
 * Persists large ZIP job progress to survive page refreshes and server restarts
 */
import { eq, and, desc, inArray } from "drizzle-orm";
import { uploadBatches, InsertUploadBatch, users } from "../drizzle/schema";
import { getDb } from "./db";

export async function createUploadBatch(batch: InsertUploadBatch) {
  const db = await getDb();
  if (!db) throw new Error("Database not available");
  await db.insert(uploadBatches).values(batch);
}

export async function updateUploadBatch(
  jobId: string,
  updates: Partial<{
    status: "extracting" | "processing" | "complete" | "error";
    totalEntries: number;
    processedEntries: number;
    uploadedToS3: number;
    skippedDuplicates: number;
    failed: number;
    errors: string | null;
    manifest: string | null;
    completedAt: number | null;
  }>
) {
  const db = await getDb();
  if (!db) return;
  await db
    .update(uploadBatches)
    .set(updates)
    .where(eq(uploadBatches.jobId, jobId));
}

export async function getUploadBatchByJobId(jobId: string) {
  const db = await getDb();
  if (!db) return null;
  const rows = await db
    .select()
    .from(uploadBatches)
    .where(eq(uploadBatches.jobId, jobId))
    .limit(1);
  return rows[0] || null;
}

export async function getRecentUploadBatches(
  userId?: number,
  limit: number = 20
) {
  const db = await getDb();
  if (!db) return [];

  const conditions = [];
  if (userId) {
    conditions.push(eq(uploadBatches.userId, userId));
  }
  const whereClause =
    conditions.length > 0 ? and(...conditions) : undefined;

  return db
    .select({
      id: uploadBatches.id,
      jobId: uploadBatches.jobId,
      userId: uploadBatches.userId,
      userName: users.name,
      userEmail: users.email,
      fileName: uploadBatches.fileName,
      status: uploadBatches.status,
      totalEntries: uploadBatches.totalEntries,
      processedEntries: uploadBatches.processedEntries,
      uploadedToS3: uploadBatches.uploadedToS3,
      skippedDuplicates: uploadBatches.skippedDuplicates,
      failed: uploadBatches.failed,
      errors: uploadBatches.errors,
      startedAt: uploadBatches.startedAt,
      completedAt: uploadBatches.completedAt,
      createdAt: uploadBatches.createdAt,
    })
    .from(uploadBatches)
    .leftJoin(users, eq(uploadBatches.userId, users.id))
    .where(whereClause)
    .orderBy(desc(uploadBatches.createdAt))
    .limit(limit);
}

export async function getActiveUploadBatches(userId: number) {
  const db = await getDb();
  if (!db) return [];

  return db
    .select()
    .from(uploadBatches)
    .where(
      and(
        eq(uploadBatches.userId, userId),
        inArray(uploadBatches.status, ["extracting", "processing"])
      )
    )
    .orderBy(desc(uploadBatches.createdAt));
}
