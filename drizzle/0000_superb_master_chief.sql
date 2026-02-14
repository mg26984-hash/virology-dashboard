CREATE TYPE "public"."batch_status" AS ENUM('extracting', 'processing', 'complete', 'error');--> statement-breakpoint
CREATE TYPE "public"."chunk_status" AS ENUM('active', 'finalizing', 'complete', 'expired');--> statement-breakpoint
CREATE TYPE "public"."processing_status" AS ENUM('pending', 'processing', 'completed', 'failed', 'discarded');--> statement-breakpoint
CREATE TYPE "public"."user_role" AS ENUM('user', 'admin');--> statement-breakpoint
CREATE TYPE "public"."user_status" AS ENUM('pending', 'approved', 'banned');--> statement-breakpoint
CREATE TABLE "auditLogs" (
	"id" serial PRIMARY KEY NOT NULL,
	"action" varchar(100) NOT NULL,
	"userId" integer NOT NULL,
	"targetUserId" integer,
	"reason" text,
	"metadata" text,
	"createdAt" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "chunkedUploadSessions" (
	"id" serial PRIMARY KEY NOT NULL,
	"uploadId" varchar(64) NOT NULL,
	"userId" integer NOT NULL,
	"fileName" varchar(500) NOT NULL,
	"totalSize" bigint NOT NULL,
	"totalChunks" integer NOT NULL,
	"receivedChunks" integer DEFAULT 0 NOT NULL,
	"receivedChunkIndices" text,
	"status" "chunk_status" DEFAULT 'active' NOT NULL,
	"createdAt" timestamp DEFAULT now() NOT NULL,
	"updatedAt" timestamp DEFAULT now() NOT NULL,
	CONSTRAINT "chunkedUploadSessions_uploadId_unique" UNIQUE("uploadId")
);
--> statement-breakpoint
CREATE TABLE "documents" (
	"id" serial PRIMARY KEY NOT NULL,
	"uploadedBy" integer NOT NULL,
	"fileName" varchar(255) NOT NULL,
	"fileKey" varchar(500) NOT NULL,
	"fileUrl" text NOT NULL,
	"mimeType" varchar(100),
	"fileSize" integer,
	"fileHash" varchar(64),
	"processingStatus" "processing_status" DEFAULT 'pending' NOT NULL,
	"processingError" text,
	"extractedData" text,
	"retryCount" integer DEFAULT 0 NOT NULL,
	"batchId" varchar(64),
	"aiProvider" varchar(20),
	"createdAt" timestamp DEFAULT now() NOT NULL,
	"updatedAt" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "patients" (
	"id" serial PRIMARY KEY NOT NULL,
	"civilId" varchar(64) NOT NULL,
	"name" text,
	"dateOfBirth" varchar(20),
	"nationality" varchar(100),
	"gender" varchar(20),
	"passportNo" varchar(50),
	"createdAt" timestamp DEFAULT now() NOT NULL,
	"updatedAt" timestamp DEFAULT now() NOT NULL,
	CONSTRAINT "patients_civilId_unique" UNIQUE("civilId")
);
--> statement-breakpoint
CREATE TABLE "uploadBatches" (
	"id" serial PRIMARY KEY NOT NULL,
	"jobId" varchar(64) NOT NULL,
	"userId" integer NOT NULL,
	"fileName" varchar(500) NOT NULL,
	"status" "batch_status" DEFAULT 'extracting' NOT NULL,
	"totalEntries" integer DEFAULT 0 NOT NULL,
	"processedEntries" integer DEFAULT 0 NOT NULL,
	"uploadedToS3" integer DEFAULT 0 NOT NULL,
	"skippedDuplicates" integer DEFAULT 0 NOT NULL,
	"failed" integer DEFAULT 0 NOT NULL,
	"errors" text,
	"manifest" text,
	"startedAt" bigint NOT NULL,
	"completedAt" bigint,
	"createdAt" timestamp DEFAULT now() NOT NULL,
	"updatedAt" timestamp DEFAULT now() NOT NULL,
	CONSTRAINT "uploadBatches_jobId_unique" UNIQUE("jobId")
);
--> statement-breakpoint
CREATE TABLE "uploadTokens" (
	"id" serial PRIMARY KEY NOT NULL,
	"token" varchar(64) NOT NULL,
	"userId" integer NOT NULL,
	"expiresAt" timestamp NOT NULL,
	"used" integer DEFAULT 0 NOT NULL,
	"createdAt" timestamp DEFAULT now() NOT NULL,
	CONSTRAINT "uploadTokens_token_unique" UNIQUE("token")
);
--> statement-breakpoint
CREATE TABLE "users" (
	"id" serial PRIMARY KEY NOT NULL,
	"openId" varchar(64) NOT NULL,
	"name" text,
	"email" varchar(320),
	"loginMethod" varchar(64),
	"role" "user_role" DEFAULT 'user' NOT NULL,
	"status" "user_status" DEFAULT 'pending' NOT NULL,
	"createdAt" timestamp DEFAULT now() NOT NULL,
	"updatedAt" timestamp DEFAULT now() NOT NULL,
	"lastSignedIn" timestamp DEFAULT now() NOT NULL,
	CONSTRAINT "users_openId_unique" UNIQUE("openId")
);
--> statement-breakpoint
CREATE TABLE "virologyTests" (
	"id" serial PRIMARY KEY NOT NULL,
	"patientId" integer NOT NULL,
	"documentId" integer,
	"testType" varchar(255) NOT NULL,
	"result" text NOT NULL,
	"viralLoad" varchar(100),
	"unit" varchar(50) DEFAULT 'Copies/mL',
	"sampleNo" varchar(50),
	"accessionNo" varchar(50),
	"departmentNo" varchar(50),
	"accessionDate" timestamp,
	"signedBy" varchar(255),
	"signedAt" timestamp,
	"location" varchar(100),
	"createdAt" timestamp DEFAULT now() NOT NULL,
	"updatedAt" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "auditLogs" ADD CONSTRAINT "auditLogs_userId_users_id_fk" FOREIGN KEY ("userId") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "auditLogs" ADD CONSTRAINT "auditLogs_targetUserId_users_id_fk" FOREIGN KEY ("targetUserId") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "chunkedUploadSessions" ADD CONSTRAINT "chunkedUploadSessions_userId_users_id_fk" FOREIGN KEY ("userId") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "documents" ADD CONSTRAINT "documents_uploadedBy_users_id_fk" FOREIGN KEY ("uploadedBy") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "uploadBatches" ADD CONSTRAINT "uploadBatches_userId_users_id_fk" FOREIGN KEY ("userId") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "uploadTokens" ADD CONSTRAINT "uploadTokens_userId_users_id_fk" FOREIGN KEY ("userId") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "virologyTests" ADD CONSTRAINT "virologyTests_patientId_patients_id_fk" FOREIGN KEY ("patientId") REFERENCES "public"."patients"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "virologyTests" ADD CONSTRAINT "virologyTests_documentId_documents_id_fk" FOREIGN KEY ("documentId") REFERENCES "public"."documents"("id") ON DELETE set null ON UPDATE no action;