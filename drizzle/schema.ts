import { integer, pgEnum, pgTable, text, timestamp, varchar, bigint, serial } from "drizzle-orm/pg-core";

/**
 * PostgreSQL enums
 */
export const userRoleEnum = pgEnum("user_role", ["user", "admin"]);
export const userStatusEnum = pgEnum("user_status", ["pending", "approved", "banned"]);
export const processingStatusEnum = pgEnum("processing_status", ["pending", "processing", "completed", "failed", "discarded"]);
export const batchStatusEnum = pgEnum("batch_status", ["extracting", "processing", "complete", "error"]);
export const chunkStatusEnum = pgEnum("chunk_status", ["active", "finalizing", "complete", "expired"]);

/**
 * Core user table backing auth flow.
 */
export const users = pgTable("users", {
  id: serial("id").primaryKey(),
  openId: varchar("openId", { length: 64 }).notNull().unique(),
  name: text("name"),
  email: varchar("email", { length: 320 }),
  loginMethod: varchar("loginMethod", { length: 64 }),
  role: userRoleEnum("role").default("user").notNull(),
  status: userStatusEnum("status").default("pending").notNull(),
  createdAt: timestamp("createdAt").defaultNow().notNull(),
  updatedAt: timestamp("updatedAt").defaultNow().notNull(),
  lastSignedIn: timestamp("lastSignedIn").defaultNow().notNull(),
});

export type User = typeof users.$inferSelect;
export type InsertUser = typeof users.$inferInsert;

/**
 * Patients table - stores unique patient records
 */
export const patients = pgTable("patients", {
  id: serial("id").primaryKey(),
  civilId: varchar("civilId", { length: 64 }).notNull().unique(),
  name: text("name"),
  dateOfBirth: varchar("dateOfBirth", { length: 20 }),
  nationality: varchar("nationality", { length: 100 }),
  gender: varchar("gender", { length: 20 }),
  passportNo: varchar("passportNo", { length: 50 }),
  createdAt: timestamp("createdAt").defaultNow().notNull(),
  updatedAt: timestamp("updatedAt").defaultNow().notNull(),
});

export type Patient = typeof patients.$inferSelect;
export type InsertPatient = typeof patients.$inferInsert;

/**
 * Virology tests table - stores individual test results
 */
export const virologyTests = pgTable("virologyTests", {
  id: serial("id").primaryKey(),
  patientId: integer("patientId").notNull().references(() => patients.id, { onDelete: "cascade" }),
  documentId: integer("documentId").references(() => documents.id, { onDelete: "set null" }),
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
  updatedAt: timestamp("updatedAt").defaultNow().notNull(),
});

export type VirologyTest = typeof virologyTests.$inferSelect;
export type InsertVirologyTest = typeof virologyTests.$inferInsert;

/**
 * Documents table - stores uploaded report files
 */
export const documents = pgTable("documents", {
  id: serial("id").primaryKey(),
  uploadedBy: integer("uploadedBy").notNull().references(() => users.id, { onDelete: "cascade" }),
  fileName: varchar("fileName", { length: 255 }).notNull(),
  fileKey: varchar("fileKey", { length: 500 }).notNull(),
  fileUrl: text("fileUrl").notNull(),
  mimeType: varchar("mimeType", { length: 100 }),
  fileSize: integer("fileSize"),
  fileHash: varchar("fileHash", { length: 64 }),
  processingStatus: processingStatusEnum("processingStatus").default("pending").notNull(),
  processingError: text("processingError"),
  extractedData: text("extractedData"),
  retryCount: integer("retryCount").default(0).notNull(),
  batchId: varchar("batchId", { length: 64 }),
  /** Which AI provider processed this document: gemini or platform */
  aiProvider: varchar("aiProvider", { length: 20 }),
  createdAt: timestamp("createdAt").defaultNow().notNull(),
  updatedAt: timestamp("updatedAt").defaultNow().notNull(),
});

export type Document = typeof documents.$inferSelect;
export type InsertDocument = typeof documents.$inferInsert;

/**
 * Audit logs table - tracks user management actions
 */
export const auditLogs = pgTable("auditLogs", {
  id: serial("id").primaryKey(),
  action: varchar("action", { length: 100 }).notNull(),
  userId: integer("userId").notNull().references(() => users.id, { onDelete: "cascade" }),
  targetUserId: integer("targetUserId").references(() => users.id, { onDelete: "set null" }),
  reason: text("reason"),
  metadata: text("metadata"),
  createdAt: timestamp("createdAt").defaultNow().notNull(),
});

export type AuditLog = typeof auditLogs.$inferSelect;
export type InsertAuditLog = typeof auditLogs.$inferInsert;

/**
 * Upload tokens table - short-lived tokens for iOS Shortcut / share-to uploads
 */
export const uploadTokens = pgTable("uploadTokens", {
  id: serial("id").primaryKey(),
  token: varchar("token", { length: 64 }).notNull().unique(),
  userId: integer("userId").notNull().references(() => users.id, { onDelete: "cascade" }),
  expiresAt: timestamp("expiresAt").notNull(),
  used: integer("used").default(0).notNull(),
  createdAt: timestamp("createdAt").defaultNow().notNull(),
});

export type UploadToken = typeof uploadTokens.$inferSelect;
export type InsertUploadToken = typeof uploadTokens.$inferInsert;

/**
 * Upload batches table - persists large ZIP job progress to survive page refreshes and server restarts
 */
export const uploadBatches = pgTable("uploadBatches", {
  id: serial("id").primaryKey(),
  jobId: varchar("jobId", { length: 64 }).notNull().unique(),
  userId: integer("userId").notNull().references(() => users.id, { onDelete: "cascade" }),
  fileName: varchar("fileName", { length: 500 }).notNull(),
  status: batchStatusEnum("status").default("extracting").notNull(),
  totalEntries: integer("totalEntries").default(0).notNull(),
  processedEntries: integer("processedEntries").default(0).notNull(),
  uploadedToS3: integer("uploadedToS3").default(0).notNull(),
  skippedDuplicates: integer("skippedDuplicates").default(0).notNull(),
  failed: integer("failed").default(0).notNull(),
  errors: text("errors"),
  /** JSON array of filenames in the ZIP - used for reconciliation */
  manifest: text("manifest"),
  startedAt: bigint("startedAt", { mode: "number" }).notNull(),
  completedAt: bigint("completedAt", { mode: "number" }),
  createdAt: timestamp("createdAt").defaultNow().notNull(),
  updatedAt: timestamp("updatedAt").defaultNow().notNull(),
});

export type UploadBatch = typeof uploadBatches.$inferSelect;
export type InsertUploadBatch = typeof uploadBatches.$inferInsert;


/**
 * Chunked upload sessions - persisted to DB so they work across multiple server instances
 */
export const chunkedUploadSessions = pgTable("chunkedUploadSessions", {
  id: serial("id").primaryKey(),
  uploadId: varchar("uploadId", { length: 64 }).notNull().unique(),
  userId: integer("userId").notNull().references(() => users.id, { onDelete: "cascade" }),
  fileName: varchar("fileName", { length: 500 }).notNull(),
  totalSize: bigint("totalSize", { mode: "number" }).notNull(),
  totalChunks: integer("totalChunks").notNull(),
  receivedChunks: integer("receivedChunks").default(0).notNull(),
  /** Comma-separated list of received chunk indices */
  receivedChunkIndices: text("receivedChunkIndices"),
  status: chunkStatusEnum("status").default("active").notNull(),
  createdAt: timestamp("createdAt").defaultNow().notNull(),
  updatedAt: timestamp("updatedAt").defaultNow().notNull(),
});
export type ChunkedUploadSession = typeof chunkedUploadSessions.$inferSelect;
export type InsertChunkedUploadSession = typeof chunkedUploadSessions.$inferInsert;
