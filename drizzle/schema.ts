import { int, mysqlEnum, mysqlTable, text, timestamp, varchar, bigint, decimal } from "drizzle-orm/mysql-core";

/**
 * Core user table backing auth flow.
 */
export const users = mysqlTable("users", {
  id: int("id").autoincrement().primaryKey(),
  openId: varchar("openId", { length: 64 }).notNull().unique(),
  name: text("name"),
  email: varchar("email", { length: 320 }),
  loginMethod: varchar("loginMethod", { length: 64 }),
  role: mysqlEnum("role", ["user", "admin"]).default("user").notNull(),
  status: mysqlEnum("status", ["pending", "approved", "banned"]).default("pending").notNull(),
  createdAt: timestamp("createdAt").defaultNow().notNull(),
  updatedAt: timestamp("updatedAt").defaultNow().onUpdateNow().notNull(),
  lastSignedIn: timestamp("lastSignedIn").defaultNow().notNull(),
});

export type User = typeof users.$inferSelect;
export type InsertUser = typeof users.$inferInsert;

/**
 * Patients table - stores unique patient records
 */
export const patients = mysqlTable("patients", {
  id: int("id").autoincrement().primaryKey(),
  civilId: varchar("civilId", { length: 64 }).notNull().unique(),
  name: text("name"),
  dateOfBirth: varchar("dateOfBirth", { length: 20 }),
  nationality: varchar("nationality", { length: 100 }),
  gender: varchar("gender", { length: 20 }),
  passportNo: varchar("passportNo", { length: 50 }),
  createdAt: timestamp("createdAt").defaultNow().notNull(),
  updatedAt: timestamp("updatedAt").defaultNow().onUpdateNow().notNull(),
});

export type Patient = typeof patients.$inferSelect;
export type InsertPatient = typeof patients.$inferInsert;

/**
 * Virology tests table - stores individual test results
 */
export const virologyTests = mysqlTable("virologyTests", {
  id: int("id").autoincrement().primaryKey(),
  patientId: int("patientId").notNull().references(() => patients.id, { onDelete: "cascade" }),
  documentId: int("documentId").references(() => documents.id, { onDelete: "set null" }),
  testType: varchar("testType", { length: 255 }).notNull(),
  result: text("result").notNull(),
  viralLoad: varchar("viralLoad", { length: 100 }),
  unit: varchar("unit", { length: 50 }).default("Copies/mL"),
  sampleNo: varchar("sampleNo", { length: 50 }),
  accessionNo: varchar("accessionNo", { length: 50 }),
  departmentNo: varchar("departmentNo", { length: 50 }),
  accessionDate: timestamp("accessionDate"),
  signedBy: varchar("signedBy", { length: 255 }),
  signedAt: timestamp("signedAt"),
  location: varchar("location", { length: 100 }),
  createdAt: timestamp("createdAt").defaultNow().notNull(),
  updatedAt: timestamp("updatedAt").defaultNow().onUpdateNow().notNull(),
});

export type VirologyTest = typeof virologyTests.$inferSelect;
export type InsertVirologyTest = typeof virologyTests.$inferInsert;

/**
 * Documents table - stores uploaded report files
 */
export const documents = mysqlTable("documents", {
  id: int("id").autoincrement().primaryKey(),
  uploadedBy: int("uploadedBy").notNull().references(() => users.id, { onDelete: "cascade" }),
  fileName: varchar("fileName", { length: 255 }).notNull(),
  fileKey: varchar("fileKey", { length: 500 }).notNull(),
  fileUrl: text("fileUrl").notNull(),
  mimeType: varchar("mimeType", { length: 100 }),
  fileSize: int("fileSize"),
  fileHash: varchar("fileHash", { length: 64 }),
  processingStatus: mysqlEnum("processingStatus", ["pending", "processing", "completed", "failed", "discarded"]).default("pending").notNull(),
  processingError: text("processingError"),
  extractedData: text("extractedData"),
  retryCount: int("retryCount").default(0).notNull(),
  batchId: varchar("batchId", { length: 64 }),
  /** Which AI provider processed this document: gemini or platform */
  aiProvider: varchar("aiProvider", { length: 20 }),
  createdAt: timestamp("createdAt").defaultNow().notNull(),
  updatedAt: timestamp("updatedAt").defaultNow().onUpdateNow().notNull(),
});

export type Document = typeof documents.$inferSelect;
export type InsertDocument = typeof documents.$inferInsert;

/**
 * Audit logs table - tracks user management actions
 */
export const auditLogs = mysqlTable("auditLogs", {
  id: int("id").autoincrement().primaryKey(),
  action: varchar("action", { length: 100 }).notNull(),
  userId: int("userId").notNull().references(() => users.id, { onDelete: "cascade" }),
  targetUserId: int("targetUserId").references(() => users.id, { onDelete: "set null" }),
  reason: text("reason"),
  metadata: text("metadata"),
  createdAt: timestamp("createdAt").defaultNow().notNull(),
});

export type AuditLog = typeof auditLogs.$inferSelect;
export type InsertAuditLog = typeof auditLogs.$inferInsert;

/**
 * Upload tokens table - short-lived tokens for iOS Shortcut / share-to uploads
 */
export const uploadTokens = mysqlTable("uploadTokens", {
  id: int("id").autoincrement().primaryKey(),
  token: varchar("token", { length: 64 }).notNull().unique(),
  userId: int("userId").notNull().references(() => users.id, { onDelete: "cascade" }),
  expiresAt: timestamp("expiresAt").notNull(),
  used: int("used").default(0).notNull(),
  createdAt: timestamp("createdAt").defaultNow().notNull(),
});

export type UploadToken = typeof uploadTokens.$inferSelect;
export type InsertUploadToken = typeof uploadTokens.$inferInsert;

/**
 * Upload batches table - persists large ZIP job progress to survive page refreshes and server restarts
 */
export const uploadBatches = mysqlTable("uploadBatches", {
  id: int("id").autoincrement().primaryKey(),
  jobId: varchar("jobId", { length: 64 }).notNull().unique(),
  userId: int("userId").notNull().references(() => users.id, { onDelete: "cascade" }),
  fileName: varchar("fileName", { length: 500 }).notNull(),
  status: mysqlEnum("status", ["extracting", "processing", "complete", "error"]).default("extracting").notNull(),
  totalEntries: int("totalEntries").default(0).notNull(),
  processedEntries: int("processedEntries").default(0).notNull(),
  uploadedToS3: int("uploadedToS3").default(0).notNull(),
  skippedDuplicates: int("skippedDuplicates").default(0).notNull(),
  failed: int("failed").default(0).notNull(),
  errors: text("errors"),
  /** JSON array of filenames in the ZIP - used for reconciliation */
  manifest: text("manifest"),
  startedAt: bigint("startedAt", { mode: "number" }).notNull(),
  completedAt: bigint("completedAt", { mode: "number" }),
  createdAt: timestamp("createdAt").defaultNow().notNull(),
  updatedAt: timestamp("updatedAt").defaultNow().onUpdateNow().notNull(),
});

export type UploadBatch = typeof uploadBatches.$inferSelect;
export type InsertUploadBatch = typeof uploadBatches.$inferInsert;


/**
 * Chunked upload sessions - persisted to DB so they work across multiple server instances
 */
export const chunkedUploadSessions = mysqlTable("chunkedUploadSessions", {
  id: int("id").autoincrement().primaryKey(),
  uploadId: varchar("uploadId", { length: 64 }).notNull().unique(),
  userId: int("userId").notNull().references(() => users.id, { onDelete: "cascade" }),
  fileName: varchar("fileName", { length: 500 }).notNull(),
  totalSize: bigint("totalSize", { mode: "number" }).notNull(),
  totalChunks: int("totalChunks").notNull(),
  receivedChunks: int("receivedChunks").default(0).notNull(),
  /** Comma-separated list of received chunk indices */
  receivedChunkIndices: text("receivedChunkIndices"),
  status: mysqlEnum("status", ["active", "finalizing", "complete", "expired"]).default("active").notNull(),
  createdAt: timestamp("createdAt").defaultNow().notNull(),
  updatedAt: timestamp("updatedAt").defaultNow().onUpdateNow().notNull(),
});
export type ChunkedUploadSession = typeof chunkedUploadSessions.$inferSelect;
export type InsertChunkedUploadSession = typeof chunkedUploadSessions.$inferInsert;
