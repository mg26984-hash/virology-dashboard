import { COOKIE_NAME } from "@shared/const";
import { getSessionCookieOptions } from "./_core/cookies";
import { systemRouter } from "./_core/systemRouter";
import { publicProcedure, protectedProcedure, router } from "./_core/trpc";
import { z } from "zod";
import { TRPCError } from "@trpc/server";
import { storagePut } from "./storage";
import { nanoid } from "nanoid";
import {
  getAllUsers,
  updateUserStatus,
  getAuditLogs,
  searchPatients,
  getPatientById,
  getTestsByPatientId,
  searchTests,
  createDocument,
  getDocumentById,
  getRecentDocuments,
  getDashboardStats,
} from "./db";
import { processUploadedDocument } from "./documentProcessor";

// Middleware to check if user is approved
const approvedProcedure = protectedProcedure.use(async ({ ctx, next }) => {
  if (ctx.user?.status !== 'approved') {
    throw new TRPCError({
      code: "FORBIDDEN",
      message: "Your account is pending approval. Please wait for an administrator to approve your access.",
    });
  }
  return next({ ctx });
});

// Middleware to check if user is admin
const adminProcedure = protectedProcedure.use(async ({ ctx, next }) => {
  if (ctx.user?.role !== 'admin') {
    throw new TRPCError({
      code: "FORBIDDEN",
      message: "Admin access required",
    });
  }
  return next({ ctx });
});

export const appRouter = router({
  system: systemRouter,
  
  auth: router({
    me: publicProcedure.query(opts => opts.ctx.user),
    logout: publicProcedure.mutation(({ ctx }) => {
      const cookieOptions = getSessionCookieOptions(ctx.req);
      ctx.res.clearCookie(COOKIE_NAME, { ...cookieOptions, maxAge: -1 });
      return { success: true } as const;
    }),
  }),

  // User management (admin only)
  users: router({
    list: adminProcedure.query(async () => {
      return getAllUsers();
    }),
    
    updateStatus: adminProcedure
      .input(z.object({
        userId: z.number(),
        status: z.enum(['pending', 'approved', 'banned']),
        reason: z.string().optional(),
      }))
      .mutation(async ({ ctx, input }) => {
        await updateUserStatus(input.userId, input.status, ctx.user!.id, input.reason);
        return { success: true };
      }),
    
    auditLogs: adminProcedure.query(async () => {
      return getAuditLogs();
    }),
  }),

  // Document upload and processing
  documents: router({
    upload: approvedProcedure
      .input(z.object({
        fileName: z.string(),
        fileData: z.string(), // Base64 encoded
        mimeType: z.string(),
        fileSize: z.number(),
      }))
      .mutation(async ({ ctx, input }) => {
        // Validate file type
        const allowedTypes = ['image/jpeg', 'image/png', 'application/pdf'];
        if (!allowedTypes.includes(input.mimeType)) {
          throw new TRPCError({
            code: "BAD_REQUEST",
            message: "Invalid file type. Only JPEG, PNG, and PDF files are allowed.",
          });
        }

        // Convert base64 to buffer
        const fileBuffer = Buffer.from(input.fileData, 'base64');
        
        // Generate unique file key
        const fileKey = `virology-reports/${ctx.user!.id}/${nanoid()}-${input.fileName}`;
        
        // Upload to S3
        const { url } = await storagePut(fileKey, fileBuffer, input.mimeType);
        
        // Create document record
        const document = await createDocument({
          uploadedBy: ctx.user!.id,
          fileName: input.fileName,
          fileKey,
          fileUrl: url,
          mimeType: input.mimeType,
          fileSize: input.fileSize,
          processingStatus: 'pending',
        });

        // Process document asynchronously
        processUploadedDocument(document.id, url, input.mimeType)
          .then(result => {
            console.log(`[Documents] Processed document ${document.id}:`, result);
          })
          .catch(error => {
            console.error(`[Documents] Failed to process document ${document.id}:`, error);
          });

        return {
          documentId: document.id,
          status: 'processing',
          message: 'Document uploaded and queued for processing',
        };
      }),

    bulkUpload: approvedProcedure
      .input(z.object({
        files: z.array(z.object({
          fileName: z.string(),
          fileData: z.string(),
          mimeType: z.string(),
          fileSize: z.number(),
        })),
      }))
      .mutation(async ({ ctx, input }) => {
        const results = [];
        const allowedTypes = ['image/jpeg', 'image/png', 'application/pdf'];

        for (const file of input.files) {
          try {
            if (!allowedTypes.includes(file.mimeType)) {
              results.push({
                fileName: file.fileName,
                success: false,
                error: 'Invalid file type',
              });
              continue;
            }

            const fileBuffer = Buffer.from(file.fileData, 'base64');
            const fileKey = `virology-reports/${ctx.user!.id}/${nanoid()}-${file.fileName}`;
            const { url } = await storagePut(fileKey, fileBuffer, file.mimeType);

            const document = await createDocument({
              uploadedBy: ctx.user!.id,
              fileName: file.fileName,
              fileKey,
              fileUrl: url,
              mimeType: file.mimeType,
              fileSize: file.fileSize,
              processingStatus: 'pending',
            });

            // Process asynchronously
            processUploadedDocument(document.id, url, file.mimeType)
              .then(result => console.log(`[Documents] Processed ${document.id}:`, result))
              .catch(error => console.error(`[Documents] Failed ${document.id}:`, error));

            results.push({
              fileName: file.fileName,
              success: true,
              documentId: document.id,
            });
          } catch (error) {
            results.push({
              fileName: file.fileName,
              success: false,
              error: error instanceof Error ? error.message : 'Upload failed',
            });
          }
        }

        return {
          total: input.files.length,
          successful: results.filter(r => r.success).length,
          failed: results.filter(r => !r.success).length,
          results,
        };
      }),

    getById: approvedProcedure
      .input(z.object({ id: z.number() }))
      .query(async ({ input }) => {
        return getDocumentById(input.id);
      }),

    recent: approvedProcedure
      .input(z.object({ limit: z.number().optional() }))
      .query(async ({ input }) => {
        return getRecentDocuments(input.limit || 20);
      }),
  }),

  // Patient search and management
  patients: router({
    search: approvedProcedure
      .input(z.object({
        query: z.string().optional(),
        civilId: z.string().optional(),
        name: z.string().optional(),
        nationality: z.string().optional(),
        dateOfBirth: z.string().optional(),
        limit: z.number().optional(),
        offset: z.number().optional(),
      }))
      .query(async ({ input }) => {
        return searchPatients(input);
      }),

    getById: approvedProcedure
      .input(z.object({ id: z.number() }))
      .query(async ({ input }) => {
        return getPatientById(input.id);
      }),

    getTests: approvedProcedure
      .input(z.object({ patientId: z.number() }))
      .query(async ({ input }) => {
        return getTestsByPatientId(input.patientId);
      }),
  }),

  // Test search
  tests: router({
    search: approvedProcedure
      .input(z.object({
        patientId: z.number().optional(),
        testType: z.string().optional(),
        startDate: z.string().optional(),
        endDate: z.string().optional(),
        limit: z.number().optional(),
        offset: z.number().optional(),
      }))
      .query(async ({ input }) => {
        return searchTests({
          ...input,
          startDate: input.startDate ? new Date(input.startDate) : undefined,
          endDate: input.endDate ? new Date(input.endDate) : undefined,
        });
      }),
  }),

  // Dashboard stats
  dashboard: router({
    stats: approvedProcedure.query(async () => {
      return getDashboardStats();
    }),
  }),
});

export type AppRouter = typeof appRouter;
