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
