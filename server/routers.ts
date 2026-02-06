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
  getDocumentsByStatus,
  getDocumentStats,
  updateDocumentStatus,
  getProcessingStats,
  getExportData,
  getDistinctTestTypes,
  getDistinctNationalities,
  getDistinctTestValues,
  createAuditLog,
} from "./db";
import ExcelJS from "exceljs";
import { processUploadedDocument } from "./documentProcessor";
import { generatePatientPDF } from "./pdfReport";

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
    
    auditLogs: adminProcedure
      .input(z.object({
        limit: z.number().optional(),
        actionFilter: z.string().optional(),
      }).optional())
      .query(async ({ input }) => {
        return getAuditLogs(input?.limit || 200, input?.actionFilter);
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

    // Cancel processing of a document (set to discarded)
    cancelProcessing: approvedProcedure
      .input(z.object({ documentId: z.number() }))
      .mutation(async ({ input, ctx }) => {
        const doc = await getDocumentById(input.documentId);
        if (!doc) {
          throw new TRPCError({
            code: "NOT_FOUND",
            message: "Document not found",
          });
        }

        // Only allow cancelling pending or processing documents
        if (doc.processingStatus !== 'pending' && doc.processingStatus !== 'processing') {
          throw new TRPCError({
            code: "BAD_REQUEST",
            message: `Cannot cancel a document that is already ${doc.processingStatus}`,
          });
        }

        await updateDocumentStatus(input.documentId, 'discarded', 'Cancelled by user');

        // Audit log
        if (ctx.user) {
          await createAuditLog({
            action: 'document_cancel',
            userId: ctx.user.id,
            metadata: JSON.stringify({ documentId: input.documentId, fileName: doc.fileName }),
          });
        }

        return { success: true, message: 'Document processing cancelled' };
      }),

    // Cancel multiple documents at once
    cancelBatch: approvedProcedure
      .input(z.object({ documentIds: z.array(z.number()) }))
      .mutation(async ({ input, ctx }) => {
        let cancelled = 0;
        let skipped = 0;

        for (const docId of input.documentIds) {
          const doc = await getDocumentById(docId);
          if (!doc) { skipped++; continue; }
          if (doc.processingStatus !== 'pending' && doc.processingStatus !== 'processing') {
            skipped++;
            continue;
          }
          await updateDocumentStatus(docId, 'discarded', 'Cancelled by user');
          cancelled++;
        }

        // Audit log
        if (ctx.user && cancelled > 0) {
          await createAuditLog({
            action: 'document_cancel_batch',
            userId: ctx.user.id,
            metadata: JSON.stringify({ documentIds: input.documentIds, cancelled, skipped }),
          });
        }

        return {
          success: true,
          cancelled,
          skipped,
          message: `Cancelled ${cancelled} document(s), skipped ${skipped}`,
        };
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

    // Get document statistics (admin only)
    stats: adminProcedure.query(async () => {
      return getDocumentStats();
    }),

    // Get documents by status (admin only)
    getByStatus: adminProcedure
      .input(z.object({
        statuses: z.array(z.enum(['pending', 'processing', 'completed', 'failed', 'discarded'])),
        limit: z.number().optional(),
      }))
      .query(async ({ input }) => {
        return getDocumentsByStatus(input.statuses, input.limit || 100);
      }),

    // Batch reprocess documents (admin only)
    batchReprocess: adminProcedure
      .input(z.object({
        statuses: z.array(z.enum(['failed', 'discarded'])),
        limit: z.number().optional(),
      }))
      .mutation(async ({ input }) => {
        const docs = await getDocumentsByStatus(input.statuses, input.limit || 50);
        
        if (docs.length === 0) {
          return {
            success: true,
            message: 'No documents found to reprocess',
            queued: 0,
          };
        }

        // Queue all documents for reprocessing
        let queued = 0;
        for (const doc of docs) {
          await updateDocumentStatus(doc.id, 'processing');
          
          const docId = doc.id;
          const docUrl = doc.fileUrl;
          const docMimeType = doc.mimeType || 'image/jpeg';
          
          setImmediate(async () => {
            try {
              console.log(`[BatchReprocess] Processing document ${docId}`);
              const result = await processUploadedDocument(docId, docUrl, docMimeType);
              console.log(`[BatchReprocess] Completed ${docId}:`, JSON.stringify(result));
            } catch (error) {
              console.error(`[BatchReprocess] Failed ${docId}:`, error);
            }
          });
          
          queued++;
        }

        return {
          success: true,
          message: `Queued ${queued} documents for reprocessing`,
          queued,
        };
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
        testResult: z.string().optional(),
        testType: z.string().optional(),
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

    // Get distinct test types and result values for filter dropdowns
    filterOptions: approvedProcedure.query(async () => {
      return getDistinctTestValues();
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

    generatePDF: approvedProcedure
      .input(z.object({ patientId: z.number() }))
      .mutation(async ({ input, ctx }) => {
        const patient = await getPatientById(input.patientId);
        if (!patient) {
          throw new TRPCError({
            code: "NOT_FOUND",
            message: "Patient not found",
          });
        }

        const tests = await getTestsByPatientId(input.patientId);
        const pdfBuffer = await generatePatientPDF(patient, tests);
        const base64 = pdfBuffer.toString("base64");

        const safeName = (patient.name || patient.civilId)
          .replace(/[^a-zA-Z0-9-_ ]/g, "")
          .replace(/\s+/g, "_");
        const dateStr = new Date().toISOString().slice(0, 10);
        const fileName = `virology-report-${safeName}-${dateStr}.pdf`;

        // Audit log
        if (ctx.user) {
          await createAuditLog({
            action: 'pdf_export',
            userId: ctx.user.id,
            metadata: JSON.stringify({ patientId: input.patientId, patientName: patient.name, civilId: patient.civilId, testCount: tests.length }),
          });
        }

        return {
          base64,
          fileName,
          testCount: tests.length,
        };
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
    
    // Processing stats for ETA calculation
    processingStats: approvedProcedure.query(async () => {
      return getProcessingStats();
    }),
  }),

  // Export (admin only)
  export: router({
    // Get filter options for the export UI
    filterOptions: adminProcedure.query(async () => {
      const [testTypes, nationalities] = await Promise.all([
        getDistinctTestTypes(),
        getDistinctNationalities(),
      ]);
      return { testTypes, nationalities };
    }),

    // Preview export row count with current filters
    preview: adminProcedure
      .input(z.object({
        dateFrom: z.string().optional(),
        dateTo: z.string().optional(),
        testType: z.string().optional(),
        nationality: z.string().optional(),
        civilId: z.string().optional(),
        patientName: z.string().optional(),
      }))
      .query(async ({ input }) => {
        const data = await getExportData({
          dateFrom: input.dateFrom ? new Date(input.dateFrom) : undefined,
          dateTo: input.dateTo ? new Date(input.dateTo) : undefined,
          testType: input.testType || undefined,
          nationality: input.nationality || undefined,
          civilId: input.civilId || undefined,
          patientName: input.patientName || undefined,
        });
        return { rowCount: data.length };
      }),

    // Generate and return Excel file as base64
    generate: adminProcedure
      .input(z.object({
        dateFrom: z.string().optional(),
        dateTo: z.string().optional(),
        testType: z.string().optional(),
        nationality: z.string().optional(),
        civilId: z.string().optional(),
        patientName: z.string().optional(),
      }))
      .mutation(async ({ input, ctx }) => {
        const data = await getExportData({
          dateFrom: input.dateFrom ? new Date(input.dateFrom) : undefined,
          dateTo: input.dateTo ? new Date(input.dateTo) : undefined,
          testType: input.testType || undefined,
          nationality: input.nationality || undefined,
          civilId: input.civilId || undefined,
          patientName: input.patientName || undefined,
        });

        if (data.length === 0) {
          throw new TRPCError({
            code: "NOT_FOUND",
            message: "No data matches the selected filters.",
          });
        }

        // Build Excel workbook
        const workbook = new ExcelJS.Workbook();
        workbook.creator = 'Virology Dashboard';
        workbook.created = new Date();

        // ── Sheet 1: All Test Results ──
        const ws = workbook.addWorksheet('Test Results', {
          views: [{ state: 'frozen', ySplit: 1 }],
        });

        ws.columns = [
          { header: 'Civil ID', key: 'civilId', width: 16 },
          { header: 'Patient Name', key: 'patientName', width: 28 },
          { header: 'Date of Birth', key: 'dateOfBirth', width: 14 },
          { header: 'Nationality', key: 'nationality', width: 16 },
          { header: 'Gender', key: 'gender', width: 10 },
          { header: 'Passport No', key: 'passportNo', width: 16 },
          { header: 'Test Type', key: 'testType', width: 30 },
          { header: 'Result', key: 'result', width: 20 },
          { header: 'Viral Load', key: 'viralLoad', width: 18 },
          { header: 'Unit', key: 'unit', width: 14 },
          { header: 'Sample No', key: 'sampleNo', width: 14 },
          { header: 'Accession No', key: 'accessionNo', width: 14 },
          { header: 'Department No', key: 'departmentNo', width: 14 },
          { header: 'Accession Date', key: 'accessionDate', width: 18 },
          { header: 'Signed By', key: 'signedBy', width: 22 },
          { header: 'Signed At', key: 'signedAt', width: 18 },
          { header: 'Location', key: 'location', width: 16 },
        ];

        // Style header row
        const headerRow = ws.getRow(1);
        headerRow.font = { bold: true, color: { argb: 'FFFFFFFF' } };
        headerRow.fill = {
          type: 'pattern',
          pattern: 'solid',
          fgColor: { argb: 'FF1F4E79' },
        };
        headerRow.alignment = { vertical: 'middle', horizontal: 'center' };
        headerRow.height = 24;

        // Add data rows
        for (const row of data) {
          ws.addRow({
            civilId: row.civilId,
            patientName: row.patientName || '',
            dateOfBirth: row.dateOfBirth || '',
            nationality: row.nationality || '',
            gender: row.gender || '',
            passportNo: row.passportNo || '',
            testType: row.testType,
            result: row.result,
            viralLoad: row.viralLoad || '',
            unit: row.unit || '',
            sampleNo: row.sampleNo || '',
            accessionNo: row.accessionNo || '',
            departmentNo: row.departmentNo || '',
            accessionDate: row.accessionDate
              ? new Date(row.accessionDate).toLocaleDateString('en-GB')
              : '',
            signedBy: row.signedBy || '',
            signedAt: row.signedAt
              ? new Date(row.signedAt).toLocaleDateString('en-GB')
              : '',
            location: row.location || '',
          });
        }

        // Apply alternating row colors for readability
        for (let i = 2; i <= ws.rowCount; i++) {
          const row = ws.getRow(i);
          if (i % 2 === 0) {
            row.fill = {
              type: 'pattern',
              pattern: 'solid',
              fgColor: { argb: 'FFF2F7FB' },
            };
          }
          row.alignment = { vertical: 'middle' };
        }

        // Add auto-filter
        ws.autoFilter = {
          from: { row: 1, column: 1 },
          to: { row: ws.rowCount, column: ws.columnCount },
        };

        // ── Sheet 2: Summary Statistics ──
        const summaryWs = workbook.addWorksheet('Summary');

        // Count unique patients
        const uniquePatients = new Set(data.map((d) => d.civilId));
        // Count by test type
        const testTypeCounts = new Map<string, number>();
        for (const row of data) {
          testTypeCounts.set(row.testType, (testTypeCounts.get(row.testType) || 0) + 1);
        }
        // Count by nationality
        const nationalityCounts = new Map<string, number>();
        for (const row of data) {
          const nat = row.nationality || 'Unknown';
          nationalityCounts.set(nat, (nationalityCounts.get(nat) || 0) + 1);
        }

        summaryWs.columns = [
          { header: 'Metric', key: 'metric', width: 30 },
          { header: 'Value', key: 'value', width: 20 },
        ];

        const summaryHeader = summaryWs.getRow(1);
        summaryHeader.font = { bold: true, color: { argb: 'FFFFFFFF' } };
        summaryHeader.fill = {
          type: 'pattern',
          pattern: 'solid',
          fgColor: { argb: 'FF1F4E79' },
        };
        summaryHeader.alignment = { vertical: 'middle', horizontal: 'center' };

        summaryWs.addRow({ metric: 'Total Test Records', value: data.length });
        summaryWs.addRow({ metric: 'Unique Patients', value: uniquePatients.size });
        summaryWs.addRow({ metric: '', value: '' });
        summaryWs.addRow({ metric: '--- Tests by Type ---', value: '' });
        for (const [type, count] of Array.from(testTypeCounts.entries()).sort((a, b) => b[1] - a[1])) {
          summaryWs.addRow({ metric: type, value: count });
        }
        summaryWs.addRow({ metric: '', value: '' });
        summaryWs.addRow({ metric: '--- Tests by Nationality ---', value: '' });
        for (const [nat, count] of Array.from(nationalityCounts.entries()).sort((a, b) => b[1] - a[1])) {
          summaryWs.addRow({ metric: nat, value: count });
        }

        // Applied filters info
        summaryWs.addRow({ metric: '', value: '' });
        summaryWs.addRow({ metric: '--- Applied Filters ---', value: '' });
        if (input.dateFrom) summaryWs.addRow({ metric: 'Date From', value: input.dateFrom });
        if (input.dateTo) summaryWs.addRow({ metric: 'Date To', value: input.dateTo });
        if (input.testType) summaryWs.addRow({ metric: 'Test Type', value: input.testType });
        if (input.nationality) summaryWs.addRow({ metric: 'Nationality', value: input.nationality });
        if (input.civilId) summaryWs.addRow({ metric: 'Civil ID', value: input.civilId });
        if (input.patientName) summaryWs.addRow({ metric: 'Patient Name', value: input.patientName });
        summaryWs.addRow({ metric: 'Export Date', value: new Date().toISOString() });

        // Generate buffer
        const buffer = await workbook.xlsx.writeBuffer();
        const base64 = Buffer.from(buffer).toString('base64');

        // Generate filename
        const dateStr = new Date().toISOString().slice(0, 10);
        const fileName = `virology-export-${dateStr}.xlsx`;

        // Audit log
        if (ctx.user) {
          await createAuditLog({
            action: 'excel_export',
            userId: ctx.user.id,
            metadata: JSON.stringify({
              filters: input,
              rowCount: data.length,
              uniquePatients: uniquePatients.size,
              fileName,
            }),
          });
        }

        return {
          base64,
          fileName,
          rowCount: data.length,
          uniquePatients: uniquePatients.size,
        };
      }),
  }),
});

export type AppRouter = typeof appRouter;
