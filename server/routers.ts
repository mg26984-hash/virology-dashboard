import { COOKIE_NAME } from "@shared/const";
import { getSessionCookieOptions } from "./_core/cookies";
import { systemRouter } from "./_core/systemRouter";
import { publicProcedure, protectedProcedure, router } from "./_core/trpc";
import { z } from "zod";
import { TRPCError } from "@trpc/server";
import { storagePut } from "./storage";
import { nanoid } from "nanoid";
import AdmZip from "adm-zip";
import {
  initChunkedUpload,
  addChunk,
  getCompleteFile,
  cleanupUpload,
  getUploadStatus,
} from "./chunkManager";
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
        console.log(`[Documents] Received upload: fileName=${input.fileName}, base64Length=${input.fileData?.length || 0}, reportedSize=${input.fileSize}`);
        const fileBuffer = Buffer.from(input.fileData, 'base64');
        console.log(`[Documents] Decoded buffer size: ${fileBuffer.length} bytes`);
        
        // Generate unique file key
        const fileKey = `virology-reports/${ctx.user!.id}/${nanoid()}-${input.fileName}`;
        
        // Upload to S3
        const { url } = await storagePut(fileKey, fileBuffer, input.mimeType);
        console.log(`[Documents] Uploaded to S3: ${url}`);
        
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

        // Process document asynchronously with immediate execution
        setImmediate(async () => {
          try {
            console.log(`[Documents] Starting processing for document ${document.id}`);
            const result = await processUploadedDocument(document.id, url, input.mimeType);
            console.log(`[Documents] Processed document ${document.id}:`, JSON.stringify(result));
          } catch (error) {
            console.error(`[Documents] Failed to process document ${document.id}:`, error);
          }
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

            // Process asynchronously with immediate execution
            const docId = document.id;
            const docUrl = url;
            const docMimeType = file.mimeType;
            setImmediate(async () => {
              try {
                console.log(`[Documents] Starting processing for document ${docId}`);
                const result = await processUploadedDocument(docId, docUrl, docMimeType);
                console.log(`[Documents] Processed ${docId}:`, JSON.stringify(result));
              } catch (error) {
                console.error(`[Documents] Failed ${docId}:`, error);
              }
            });

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

    uploadZip: approvedProcedure
      .input(z.object({
        fileName: z.string(),
        fileData: z.string(), // Base64 encoded ZIP file
        fileSize: z.number(),
      }))
      .mutation(async ({ ctx, input }) => {
        const results: Array<{
          fileName: string;
          success: boolean;
          documentId?: number;
          error?: string;
        }> = [];
        const allowedTypes = ['image/jpeg', 'image/png', 'application/pdf'];
        const allowedExtensions = ['.jpg', '.jpeg', '.png', '.pdf'];

        try {
          // Decode and extract ZIP file
          const zipBuffer = Buffer.from(input.fileData, 'base64');
          const zip = new AdmZip(zipBuffer);
          const zipEntries = zip.getEntries();

          // Filter valid files (skip directories and hidden files)
          const validEntries = zipEntries.filter(entry => {
            if (entry.isDirectory) return false;
            const fileName = entry.entryName.split('/').pop() || '';
            if (fileName.startsWith('.') || fileName.startsWith('__MACOSX')) return false;
            const ext = fileName.toLowerCase().slice(fileName.lastIndexOf('.'));
            return allowedExtensions.includes(ext);
          });

          if (validEntries.length === 0) {
            throw new TRPCError({
              code: "BAD_REQUEST",
              message: "No valid files found in ZIP. Only JPEG, PNG, and PDF files are supported.",
            });
          }

          // Process each file from the ZIP
          for (const entry of validEntries) {
            try {
              const fileName = entry.entryName.split('/').pop() || entry.entryName;
              const fileBuffer = entry.getData();
              const ext = fileName.toLowerCase().slice(fileName.lastIndexOf('.'));
              
              // Determine MIME type from extension
              let mimeType = 'application/octet-stream';
              if (ext === '.jpg' || ext === '.jpeg') mimeType = 'image/jpeg';
              else if (ext === '.png') mimeType = 'image/png';
              else if (ext === '.pdf') mimeType = 'application/pdf';

              if (!allowedTypes.includes(mimeType)) {
                results.push({
                  fileName,
                  success: false,
                  error: 'Invalid file type',
                });
                continue;
              }

              // Upload to S3
              const fileKey = `virology-reports/${ctx.user!.id}/${nanoid()}-${fileName}`;
              const { url } = await storagePut(fileKey, fileBuffer, mimeType);

              // Create document record
              const document = await createDocument({
                uploadedBy: ctx.user!.id,
                fileName,
                fileKey,
                fileUrl: url,
                mimeType,
                fileSize: fileBuffer.length,
                processingStatus: 'pending',
              });

              // Process asynchronously with immediate execution
              const docId = document.id;
              const docUrl = url;
              const docMimeType = mimeType;
              setImmediate(async () => {
                try {
                  console.log(`[Documents] Starting processing for document ${docId}`);
                  const result = await processUploadedDocument(docId, docUrl, docMimeType);
                  console.log(`[Documents] Processed ${docId}:`, JSON.stringify(result));
                } catch (error) {
                  console.error(`[Documents] Failed ${docId}:`, error);
                }
              });

              results.push({
                fileName,
                success: true,
                documentId: document.id,
              });
            } catch (error) {
              const fileName = entry.entryName.split('/').pop() || entry.entryName;
              results.push({
                fileName,
                success: false,
                error: error instanceof Error ? error.message : 'Processing failed',
              });
            }
          }

          return {
            zipFileName: input.fileName,
            total: validEntries.length,
            successful: results.filter(r => r.success).length,
            failed: results.filter(r => !r.success).length,
            results,
          };
        } catch (error) {
          if (error instanceof TRPCError) throw error;
          throw new TRPCError({
            code: "BAD_REQUEST",
            message: error instanceof Error ? error.message : "Failed to process ZIP file",
          });
        }
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

    // Get processing status for multiple documents (for polling)
    getStatuses: approvedProcedure
      .input(z.object({ documentIds: z.array(z.number()) }))
      .query(async ({ input }) => {
        const statuses = await Promise.all(
          input.documentIds.map(async (id) => {
            const doc = await getDocumentById(id);
            return doc ? {
              id: doc.id,
              status: doc.processingStatus,
              error: doc.processingError,
            } : null;
          })
        );
        return statuses.filter(Boolean);
      }),

    // Initialize chunked upload for large files
    initChunkedUpload: approvedProcedure
      .input(z.object({
        uploadId: z.string(),
        fileName: z.string(),
        totalChunks: z.number(),
        totalSize: z.number(),
      }))
      .mutation(async ({ ctx, input }) => {
        initChunkedUpload(
          input.uploadId,
          input.fileName,
          input.totalChunks,
          input.totalSize,
          ctx.user!.id
        );
        return { success: true, uploadId: input.uploadId };
      }),

    // Upload a single chunk
    uploadChunk: approvedProcedure
      .input(z.object({
        uploadId: z.string(),
        chunkIndex: z.number(),
        chunkData: z.string(), // Base64 encoded chunk
      }))
      .mutation(async ({ input }) => {
        const chunkBuffer = Buffer.from(input.chunkData, 'base64');
        const result = addChunk(input.uploadId, input.chunkIndex, chunkBuffer);
        return result;
      }),

    // Finalize chunked upload and process the ZIP file
    finalizeChunkedUpload: approvedProcedure
      .input(z.object({
        uploadId: z.string(),
      }))
      .mutation(async ({ ctx, input }) => {
        const fileData = getCompleteFile(input.uploadId);
        if (!fileData) {
          throw new TRPCError({
            code: "NOT_FOUND",
            message: "Upload not found or incomplete",
          });
        }

        const results: Array<{
          fileName: string;
          success: boolean;
          documentId?: number;
          error?: string;
        }> = [];
        const allowedTypes = ['image/jpeg', 'image/png', 'application/pdf'];
        const allowedExtensions = ['.jpg', '.jpeg', '.png', '.pdf'];

        try {
          // Extract ZIP file
          const zip = new AdmZip(fileData.buffer);
          const zipEntries = zip.getEntries();

          // Filter valid files
          const validEntries = zipEntries.filter(entry => {
            if (entry.isDirectory) return false;
            const fileName = entry.entryName.split('/').pop() || '';
            if (fileName.startsWith('.') || fileName.startsWith('__MACOSX')) return false;
            const ext = fileName.toLowerCase().slice(fileName.lastIndexOf('.'));
            return allowedExtensions.includes(ext);
          });

          if (validEntries.length === 0) {
            cleanupUpload(input.uploadId);
            throw new TRPCError({
              code: "BAD_REQUEST",
              message: "No valid files found in ZIP. Only JPEG, PNG, and PDF files are supported.",
            });
          }

          console.log(`[ChunkedUpload] Processing ${validEntries.length} files from ${fileData.fileName}`);

          // Process each file from the ZIP
          for (const entry of validEntries) {
            try {
              const fileName = entry.entryName.split('/').pop() || entry.entryName;
              const fileBuffer = entry.getData();
              const ext = fileName.toLowerCase().slice(fileName.lastIndexOf('.'));
              
              let mimeType = 'application/octet-stream';
              if (ext === '.jpg' || ext === '.jpeg') mimeType = 'image/jpeg';
              else if (ext === '.png') mimeType = 'image/png';
              else if (ext === '.pdf') mimeType = 'application/pdf';

              if (!allowedTypes.includes(mimeType)) {
                results.push({ fileName, success: false, error: 'Invalid file type' });
                continue;
              }

              // Upload to S3
              const fileKey = `virology-reports/${ctx.user!.id}/${nanoid()}-${fileName}`;
              const { url } = await storagePut(fileKey, fileBuffer, mimeType);

              // Create document record
              const document = await createDocument({
                uploadedBy: ctx.user!.id,
                fileName,
                fileKey,
                fileUrl: url,
                mimeType,
                fileSize: fileBuffer.length,
                processingStatus: 'pending',
              });

              // Process asynchronously
              const docId = document.id;
              const docUrl = url;
              const docMimeType = mimeType;
              setImmediate(async () => {
                try {
                  console.log(`[Documents] Starting processing for document ${docId}`);
                  const result = await processUploadedDocument(docId, docUrl, docMimeType);
                  console.log(`[Documents] Processed ${docId}:`, JSON.stringify(result));
                } catch (error) {
                  console.error(`[Documents] Failed ${docId}:`, error);
                }
              });

              results.push({ fileName, success: true, documentId: document.id });
            } catch (error) {
              const fileName = entry.entryName.split('/').pop() || entry.entryName;
              results.push({
                fileName,
                success: false,
                error: error instanceof Error ? error.message : 'Processing failed',
              });
            }
          }

          // Clean up the upload
          cleanupUpload(input.uploadId);

          return {
            zipFileName: fileData.fileName,
            total: validEntries.length,
            successful: results.filter(r => r.success).length,
            failed: results.filter(r => !r.success).length,
            results,
          };
        } catch (error) {
          cleanupUpload(input.uploadId);
          if (error instanceof TRPCError) throw error;
          throw new TRPCError({
            code: "BAD_REQUEST",
            message: error instanceof Error ? error.message : "Failed to process ZIP file",
          });
        }
      }),

    // Get chunked upload status
    getChunkedUploadStatus: approvedProcedure
      .input(z.object({ uploadId: z.string() }))
      .query(async ({ input }) => {
        return getUploadStatus(input.uploadId);
      }),

    // Reprocess a document
    reprocess: approvedProcedure
      .input(z.object({ documentId: z.number() }))
      .mutation(async ({ input }) => {
        const doc = await getDocumentById(input.documentId);
        if (!doc) {
          throw new TRPCError({
            code: "NOT_FOUND",
            message: "Document not found",
          });
        }

        // Reset status and start processing
        const { updateDocumentStatus } = await import("./db");
        await updateDocumentStatus(input.documentId, 'processing');

        setImmediate(async () => {
          try {
            console.log(`[Documents] Reprocessing document ${input.documentId}`);
            const result = await processUploadedDocument(input.documentId, doc.fileUrl, doc.mimeType || 'image/jpeg');
            console.log(`[Documents] Reprocessed ${input.documentId}:`, JSON.stringify(result));
          } catch (error) {
            console.error(`[Documents] Failed to reprocess ${input.documentId}:`, error);
          }
        });

        return { success: true, message: 'Document queued for reprocessing' };
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
        accessionDateFrom: z.string().optional(),
        accessionDateTo: z.string().optional(),
        limit: z.number().optional(),
        offset: z.number().optional(),
      }))
      .query(async ({ input }) => {
        return searchPatients({
          ...input,
          accessionDateFrom: input.accessionDateFrom ? new Date(input.accessionDateFrom) : undefined,
          accessionDateTo: input.accessionDateTo ? new Date(input.accessionDateTo) : undefined,
        });
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
