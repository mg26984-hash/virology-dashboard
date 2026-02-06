import { useAuth } from "@/_core/hooks/useAuth";
import { trpc } from "@/lib/trpc";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Progress } from "@/components/ui/progress";
import { 
  Upload as UploadIcon, 
  FileText, 
  X, 
  CheckCircle2, 
  AlertCircle,
  Loader2,
  Image,
  FileType,
  FileArchive,
  Copy,
  RefreshCw,
  Clock,
  Timer
} from "lucide-react";
import { useState, useCallback, useRef, useEffect, useMemo } from "react";
import { toast } from "sonner";

interface FileWithPreview {
  file: File;
  preview?: string;
  status: 'pending' | 'uploading' | 'extracting' | 'processing' | 'completed' | 'failed' | 'discarded' | 'duplicate';
  error?: string;
  documentId?: number;
  isZip?: boolean;
  extractedCount?: number;
  processingStatus?: string;
  uploadProgress?: number; // 0-100 for upload progress
  chunksUploaded?: number;
  totalChunks?: number;
  processingStartTime?: number; // Timestamp when processing started
}

// Helper function to format time remaining
function formatTimeRemaining(ms: number): string {
  if (ms <= 0) return 'Almost done...';
  
  const seconds = Math.ceil(ms / 1000);
  if (seconds < 60) {
    return `~${seconds} second${seconds !== 1 ? 's' : ''} remaining`;
  }
  
  const minutes = Math.floor(seconds / 60);
  const remainingSeconds = seconds % 60;
  
  if (minutes < 60) {
    if (remainingSeconds === 0) {
      return `~${minutes} minute${minutes !== 1 ? 's' : ''} remaining`;
    }
    return `~${minutes}m ${remainingSeconds}s remaining`;
  }
  
  const hours = Math.floor(minutes / 60);
  const remainingMinutes = minutes % 60;
  return `~${hours}h ${remainingMinutes}m remaining`;
}

export default function Upload() {
  const { user } = useAuth();
  const [files, setFiles] = useState<FileWithPreview[]>([]);
  const [isDragging, setIsDragging] = useState(false);
  const [isUploading, setIsUploading] = useState(false);
  const [isPolling, setIsPolling] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const pollingIntervalRef = useRef<NodeJS.Timeout | null>(null);
  const [currentTime, setCurrentTime] = useState(Date.now());

  const uploadMutation = trpc.documents.upload.useMutation();
  const bulkUploadMutation = trpc.documents.bulkUpload.useMutation();
  const zipUploadMutation = trpc.documents.uploadZip.useMutation();
  const reprocessMutation = trpc.documents.reprocess.useMutation();
  
  // Chunked upload mutations for large files
  const initChunkedUploadMutation = trpc.documents.initChunkedUpload.useMutation();
  const uploadChunkMutation = trpc.documents.uploadChunk.useMutation();
  const finalizeChunkedUploadMutation = trpc.documents.finalizeChunkedUpload.useMutation();

  const utils = trpc.useUtils();

  // Get processing stats for ETA calculation
  const { data: processingStats } = trpc.dashboard.processingStats.useQuery(undefined, {
    enabled: isPolling,
    refetchInterval: isPolling ? 5000 : false,
  });

  // Update current time every second for ETA countdown
  useEffect(() => {
    if (!isPolling) return;
    
    const interval = setInterval(() => {
      setCurrentTime(Date.now());
    }, 1000);
    
    return () => clearInterval(interval);
  }, [isPolling]);

  // Get document IDs that need status polling - include any file with a documentId that hasn't reached a final state
  const processingDocIds = files
    .filter(f => f.documentId && 
      f.processingStatus !== 'completed' && 
      f.processingStatus !== 'failed' && 
      f.processingStatus !== 'discarded'
    )
    .map(f => f.documentId!)
    .filter(Boolean);

  // Query for document statuses
  const { data: statusData, refetch: refetchStatuses } = trpc.documents.getStatuses.useQuery(
    { documentIds: processingDocIds },
    { 
      enabled: processingDocIds.length > 0,
      refetchInterval: isPolling ? 3000 : false, // Poll every 3 seconds when active
    }
  );

  // Calculate ETA for processing files
  const calculateETA = useCallback((file: FileWithPreview): string | null => {
    if (!file.processingStartTime || !processingStats) return null;
    
    const avgTime = processingStats.avgProcessingTime || 15000; // Default 15 seconds
    const elapsed = currentTime - file.processingStartTime;
    const remaining = avgTime - elapsed;
    
    // If it's a ZIP file with extracted count, multiply by file count
    if (file.isZip && file.extractedCount) {
      const totalEstimate = avgTime * file.extractedCount;
      const remainingForZip = totalEstimate - elapsed;
      return formatTimeRemaining(remainingForZip);
    }
    
    return formatTimeRemaining(remaining);
  }, [processingStats, currentTime]);

  // Update file statuses based on polling results
  useEffect(() => {
    if (statusData && statusData.length > 0) {
      let hasProcessing = false;
      let newlyCompleted = 0;
      let newlyFailed = 0;

      setFiles(prev => prev.map(f => {
        if (!f.documentId) return f;
        
        const status = statusData.find(s => s?.id === f.documentId);
        if (!status) return f;

        // Check if status changed
        const prevProcessingStatus = f.processingStatus;
        
        if (status.status === 'pending' || status.status === 'processing') {
          hasProcessing = true;
          // Set processing start time if not already set
          const processingStartTime = f.processingStartTime || Date.now();
          return { ...f, status: 'processing', processingStatus: status.status, processingStartTime };
        } else if (status.status === 'completed') {
          if (prevProcessingStatus !== 'completed') {
            newlyCompleted++;
          }
          return { ...f, status: 'completed', processingStatus: status.status };
        } else if (status.status === 'failed') {
          if (prevProcessingStatus !== 'failed') {
            newlyFailed++;
          }
          return { ...f, status: 'failed', error: status.error || 'Processing failed', processingStatus: status.status };
        } else if (status.status === 'discarded') {
          return { ...f, status: 'discarded', error: status.error || 'No test results found', processingStatus: status.status };
        }
        
        return f;
      }));

      // Show notifications for newly completed/failed
      if (newlyCompleted > 0) {
        toast.success(`${newlyCompleted} document${newlyCompleted > 1 ? 's' : ''} processed successfully!`);
        utils.dashboard.stats.invalidate();
        utils.patients.search.invalidate();
      }
      if (newlyFailed > 0) {
        toast.error(`${newlyFailed} document${newlyFailed > 1 ? 's' : ''} failed to process`);
      }

      // Stop polling if no more processing documents
      if (!hasProcessing && isPolling) {
        setIsPolling(false);
      }
    }
  }, [statusData, utils, isPolling]);

  // Start polling when we have processing documents
  useEffect(() => {
    const hasProcessingDocs = files.some(f => 
      f.documentId && 
      f.processingStatus !== 'completed' && 
      f.processingStatus !== 'failed' && 
      f.processingStatus !== 'discarded'
    );
    
    if (hasProcessingDocs && !isPolling) {
      console.log('[Upload] Starting polling for', processingDocIds.length, 'documents');
      setIsPolling(true);
    } else if (!hasProcessingDocs && isPolling) {
      console.log('[Upload] Stopping polling - all documents processed');
      setIsPolling(false);
    }
  }, [files, isPolling, processingDocIds.length]);

  // Cleanup polling on unmount
  useEffect(() => {
    return () => {
      if (pollingIntervalRef.current) {
        clearInterval(pollingIntervalRef.current);
      }
    };
  }, []);

  const handleFiles = useCallback((newFiles: FileList | File[]) => {
    const validFiles: FileWithPreview[] = [];
    const allowedTypes = ['image/jpeg', 'image/png', 'application/pdf', 'application/zip', 'application/x-zip-compressed'];

    Array.from(newFiles).forEach(file => {
      const isZip = file.type === 'application/zip' || 
                    file.type === 'application/x-zip-compressed' || 
                    file.name.toLowerCase().endsWith('.zip');
      
      if (!allowedTypes.includes(file.type) && !isZip) {
        toast.error(`${file.name}: Invalid file type. Only JPEG, PNG, PDF, and ZIP are allowed.`);
        return;
      }

      // File size limits: 200MB for ZIP, 20MB for individual files
      const maxSize = isZip ? 200 * 1024 * 1024 : 20 * 1024 * 1024;
      const maxSizeLabel = isZip ? '200MB' : '20MB';
      if (file.size > maxSize) {
        toast.error(`${file.name}: File too large (${(file.size / 1024 / 1024).toFixed(1)}MB). Maximum size is ${maxSizeLabel}.`);
        return;
      }

      const preview = file.type.startsWith('image/') 
        ? URL.createObjectURL(file) 
        : undefined;

      validFiles.push({
        file,
        preview,
        status: 'pending',
        isZip,
      });
    });

    setFiles(prev => [...prev, ...validFiles]);
  }, []);

  const handleDrop = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    setIsDragging(false);
    handleFiles(e.dataTransfer.files);
  }, [handleFiles]);

  const handleDragOver = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    setIsDragging(true);
  }, []);

  const handleDragLeave = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    setIsDragging(false);
  }, []);

  const removeFile = (index: number) => {
    setFiles(prev => {
      const newFiles = [...prev];
      if (newFiles[index].preview) {
        URL.revokeObjectURL(newFiles[index].preview!);
      }
      newFiles.splice(index, 1);
      return newFiles;
    });
  };

  const fileToBase64 = (file: File): Promise<string> => {
    return new Promise((resolve, reject) => {
      const reader = new FileReader();
      reader.readAsDataURL(file);
      reader.onload = () => {
        const result = reader.result as string;
        const base64 = result.split(',')[1];
        console.log(`[Upload] File: ${file.name}, Size: ${file.size} bytes, Base64 length: ${base64?.length || 0}`);
        if (!base64 || base64.length === 0) {
          reject(new Error('Failed to convert file to base64'));
          return;
        }
        resolve(base64);
      };
      reader.onerror = (error) => {
        console.error(`[Upload] FileReader error for ${file.name}:`, error);
        reject(error);
      };
    });
  };

  const uploadFiles = async () => {
    const pendingFiles = files.filter(f => f.status === 'pending');
    if (pendingFiles.length === 0) {
      toast.error('No files to upload');
      return;
    }

    setIsUploading(true);

    try {
      // Separate ZIP files from regular files
      const zipFiles = pendingFiles.filter(f => f.isZip);
      const regularFiles = pendingFiles.filter(f => !f.isZip);

      // Process ZIP files using chunked upload for large files
      for (const zipFile of zipFiles) {
        try {
          setFiles(prev => prev.map(f => 
            f === zipFile ? { ...f, status: 'extracting' } : f
          ));

          // Use chunked upload for files > 50MB, regular upload for smaller files
          const CHUNK_SIZE = 5 * 1024 * 1024; // 5MB chunks
          const USE_CHUNKED_THRESHOLD = 50 * 1024 * 1024; // 50MB

          if (zipFile.file.size > USE_CHUNKED_THRESHOLD) {
            // Chunked upload for large files
            const uploadId = `${Date.now()}-${Math.random().toString(36).substr(2, 9)}`;
            const totalChunks = Math.ceil(zipFile.file.size / CHUNK_SIZE);

            console.log(`[Upload] Starting chunked upload: ${zipFile.file.name}, ${totalChunks} chunks, ${zipFile.file.size} bytes`);
            
            // Set initial progress state
            setFiles(prev => prev.map(f => 
              f === zipFile 
                ? { ...f, status: 'uploading', uploadProgress: 0, chunksUploaded: 0, totalChunks } 
                : f
            ));

            // Initialize chunked upload
            console.log('[Upload] Calling initChunkedUpload...');
            await initChunkedUploadMutation.mutateAsync({
              uploadId,
              fileName: zipFile.file.name,
              totalChunks,
              totalSize: zipFile.file.size,
            });
            console.log('[Upload] initChunkedUpload successful');

            // Upload chunks sequentially
            for (let i = 0; i < totalChunks; i++) {
              const start = i * CHUNK_SIZE;
              const end = Math.min(start + CHUNK_SIZE, zipFile.file.size);
              const chunk = zipFile.file.slice(start, end);
              
              // Convert chunk to base64
              const chunkBase64 = await new Promise<string>((resolve, reject) => {
                const reader = new FileReader();
                reader.readAsDataURL(chunk);
                reader.onload = () => {
                  const result = reader.result as string;
                  resolve(result.split(',')[1]);
                };
                reader.onerror = reject;
              });

              await uploadChunkMutation.mutateAsync({
                uploadId,
                chunkIndex: i,
                chunkData: chunkBase64,
              });

              // Update progress state
              const progress = Math.round(((i + 1) / totalChunks) * 100);
              console.log(`[Upload] Chunk ${i + 1}/${totalChunks} uploaded (${progress}%)`);
              
              // Update file progress in state
              setFiles(prev => prev.map(f => 
                f === zipFile 
                  ? { ...f, uploadProgress: progress, chunksUploaded: i + 1 } 
                  : f
              ));
            }

            // Finalize and process
            setFiles(prev => prev.map(f => 
              f === zipFile ? { ...f, status: 'processing', processingStartTime: Date.now() } : f
            ));

            const result = await finalizeChunkedUploadMutation.mutateAsync({ uploadId });

            setFiles(prev => prev.map(f => 
              f === zipFile 
                ? { 
                    ...f, 
                    status: result.successful > 0 ? 'processing' : 'failed',
                    extractedCount: result.total,
                    error: result.failed > 0 ? `${result.failed} files failed` : undefined,
                    processingStatus: 'pending',
                    processingStartTime: Date.now()
                  }
                : f
            ));

            toast.success(`ZIP processed: ${result.successful} of ${result.total} files uploaded and queued for processing`);
            if (result.failed > 0) {
              toast.error(`${result.failed} files from ZIP failed to upload`);
            }
          } else {
            // Regular upload for smaller ZIP files
            const fileData = await fileToBase64(zipFile.file);
            const result = await zipUploadMutation.mutateAsync({
              fileName: zipFile.file.name,
              fileData,
              fileSize: zipFile.file.size,
            });

            setFiles(prev => prev.map(f => 
              f === zipFile 
                ? { 
                    ...f, 
                    status: result.successful > 0 ? 'processing' : 'failed',
                    extractedCount: result.total,
                    error: result.failed > 0 ? `${result.failed} files failed` : undefined,
                    processingStatus: 'pending',
                    processingStartTime: Date.now()
                  }
                : f
            ));

            toast.success(`ZIP processed: ${result.successful} of ${result.total} files uploaded and queued for processing`);
            if (result.failed > 0) {
              toast.error(`${result.failed} files from ZIP failed to upload`);
            }
          }
        } catch (error) {
          const errorMessage = error instanceof Error ? error.message : 'Failed to process ZIP file';
          console.error('[Upload] ZIP upload error:', error);
          setFiles(prev => prev.map(f => 
            f === zipFile 
              ? { ...f, status: 'failed', error: errorMessage }
              : f
          ));
          toast.error(`Failed to process ${zipFile.file.name}: ${errorMessage}`);
        }
      }

      // Process regular files
      if (regularFiles.length > 0) {
        if (regularFiles.length === 1) {
          // Single file upload
          const fileData = await fileToBase64(regularFiles[0].file);
          setFiles(prev => prev.map(f => 
            f === regularFiles[0] ? { ...f, status: 'uploading' } : f
          ));

          console.log(`[Upload] Sending to server: fileName=${regularFiles[0].file.name}, fileSize=${regularFiles[0].file.size}, base64Length=${fileData.length}`);
          const result = await uploadMutation.mutateAsync({
            fileName: regularFiles[0].file.name,
            fileData,
            mimeType: regularFiles[0].file.type,
            fileSize: regularFiles[0].file.size,
          });

          setFiles(prev => prev.map(f => 
            f === regularFiles[0] 
              ? { ...f, status: 'processing', documentId: result.documentId, processingStatus: 'pending', processingStartTime: Date.now() }
              : f
          ));

          toast.success('File uploaded and queued for processing');
        } else {
          // Bulk upload
          setFiles(prev => prev.map(f => 
            regularFiles.includes(f) ? { ...f, status: 'uploading' } : f
          ));

          const filesData = await Promise.all(
            regularFiles.map(async (f) => ({
              fileName: f.file.name,
              fileData: await fileToBase64(f.file),
              mimeType: f.file.type,
              fileSize: f.file.size,
            }))
          );

          const result = await bulkUploadMutation.mutateAsync({ files: filesData });

          setFiles(prev => prev.map(f => {
            const resultItem = result.results.find(r => r.fileName === f.file.name);
            if (resultItem) {
              return {
                ...f,
                status: resultItem.success ? 'processing' : 'failed',
                documentId: resultItem.documentId,
                error: resultItem.error,
                processingStatus: resultItem.success ? 'pending' : undefined,
                processingStartTime: resultItem.success ? Date.now() : undefined,
              };
            }
            return f;
          }));

          toast.success(`Uploaded ${result.successful} of ${result.total} files - processing started`);
          if (result.failed > 0) {
            toast.error(`${result.failed} files failed to upload`);
          }
        }
      }

      // Start polling for status updates
      setIsPolling(true);

      // Invalidate queries to refresh data
      utils.dashboard.stats.invalidate();
      utils.documents.recent.invalidate();
    } catch (error) {
      setFiles(prev => prev.map(f => 
        f.status === 'uploading' || f.status === 'extracting'
          ? { ...f, status: 'failed', error: 'Upload failed' }
          : f
      ));
      toast.error('Upload failed. Please try again.');
    } finally {
      setIsUploading(false);
    }
  };

  const clearCompleted = () => {
    setFiles(prev => {
      prev.forEach(f => {
        if (f.preview && f.status !== 'pending') {
          URL.revokeObjectURL(f.preview);
        }
      });
      return prev.filter(f => f.status === 'pending');
    });
  };

  const refreshStatuses = () => {
    refetchStatuses();
    toast.info('Refreshing processing status...');
  };

  const getFileIcon = (file: FileWithPreview) => {
    if (file.isZip) {
      return <FileArchive className="h-8 w-8 text-yellow-400" />;
    }
    if (file.file.type === 'application/pdf') {
      return <FileType className="h-8 w-8 text-red-400" />;
    }
    return <Image className="h-8 w-8 text-blue-400" />;
  };

  const getStatusBadge = (file: FileWithPreview) => {
    switch (file.status) {
      case 'pending':
        return <Badge variant="outline">Pending</Badge>;
      case 'uploading':
        return (
          <Badge variant="secondary">
            <Loader2 className="mr-1 h-3 w-3 animate-spin" />
            Uploading
          </Badge>
        );
      case 'extracting':
        return (
          <Badge variant="secondary">
            <Loader2 className="mr-1 h-3 w-3 animate-spin" />
            Extracting ZIP
          </Badge>
        );
      case 'processing':
        return (
          <Badge variant="secondary" className="bg-blue-600/20 text-blue-400 border-blue-600/30">
            <Clock className="mr-1 h-3 w-3 animate-pulse" />
            Processing
          </Badge>
        );
      case 'completed':
        if (file.processingStatus === 'completed') {
          return (
            <Badge className="bg-green-600">
              <CheckCircle2 className="mr-1 h-3 w-3" />
              Completed
            </Badge>
          );
        }
        return (
          <Badge variant="secondary" className="bg-blue-600/20 text-blue-400 border-blue-600/30">
            <Clock className="mr-1 h-3 w-3 animate-pulse" />
            Processing
          </Badge>
        );
      case 'failed':
        return (
          <Badge variant="destructive">
            <AlertCircle className="mr-1 h-3 w-3" />
            Failed
          </Badge>
        );
      case 'discarded':
        return (
          <Badge variant="secondary" className="border-orange-500/30 text-orange-400">
            <AlertCircle className="mr-1 h-3 w-3" />
            Discarded
          </Badge>
        );
      case 'duplicate':
        return (
          <Badge variant="outline" className="border-yellow-500 text-yellow-500">
            <Copy className="mr-1 h-3 w-3" />
            Duplicate
          </Badge>
        );
      default:
        return null;
    }
  };

  const completedCount = files.filter(f => f.status === 'completed' && f.processingStatus === 'completed').length;
  const failedCount = files.filter(f => f.status === 'failed').length;
  const pendingCount = files.filter(f => f.status === 'pending').length;
  const processingCount = files.filter(f => 
    f.status === 'uploading' || 
    f.status === 'extracting' || 
    f.status === 'processing' ||
    (f.status === 'completed' && f.processingStatus !== 'completed')
  ).length;
  const discardedCount = files.filter(f => f.status === 'discarded').length;
  const duplicateCount = files.filter(f => f.status === 'duplicate').length;

  // Calculate total ETA for all processing files
  const totalETA = useMemo(() => {
    if (!processingStats || processingCount === 0) return null;
    
    const processingFiles = files.filter(f => 
      f.status === 'processing' || 
      (f.status === 'completed' && f.processingStatus !== 'completed')
    );
    
    if (processingFiles.length === 0) return null;
    
    const avgTime = processingStats.avgProcessingTime || 15000;
    let totalRemaining = 0;
    
    for (const file of processingFiles) {
      if (file.processingStartTime) {
        const elapsed = currentTime - file.processingStartTime;
        const fileCount = file.isZip && file.extractedCount ? file.extractedCount : 1;
        const remaining = Math.max(0, (avgTime * fileCount) - elapsed);
        totalRemaining += remaining;
      } else {
        const fileCount = file.isZip && file.extractedCount ? file.extractedCount : 1;
        totalRemaining += avgTime * fileCount;
      }
    }
    
    return formatTimeRemaining(totalRemaining);
  }, [files, processingStats, processingCount, currentTime]);

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold tracking-tight">Upload Reports</h1>
        <p className="text-muted-foreground">
          Upload virology laboratory reports for automatic processing and data extraction
        </p>
      </div>

      {/* Upload Zone */}
      <Card>
        <CardHeader>
          <CardTitle>Upload Files</CardTitle>
          <CardDescription>
            Drag and drop files or click to browse. Supports JPEG, PNG, PDF, and ZIP files containing multiple reports.
          </CardDescription>
        </CardHeader>
        <CardContent>
          <div
            onDrop={handleDrop}
            onDragOver={handleDragOver}
            onDragLeave={handleDragLeave}
            onClick={() => fileInputRef.current?.click()}
            className={`
              relative border-2 border-dashed rounded-xl p-12 text-center cursor-pointer
              transition-all duration-200
              ${isDragging 
                ? 'border-primary bg-primary/10' 
                : 'border-muted-foreground/25 hover:border-primary/50 hover:bg-muted/50'
              }
            `}
          >
            <input
              ref={fileInputRef}
              type="file"
              multiple
              accept="image/jpeg,image/png,application/pdf,.zip"
              onChange={(e) => e.target.files && handleFiles(e.target.files)}
              className="hidden"
            />
            
            <UploadIcon className={`
              h-12 w-12 mx-auto mb-4 transition-colors
              ${isDragging ? 'text-primary' : 'text-muted-foreground'}
            `} />
            
            <p className="text-lg font-medium mb-1">
              {isDragging ? 'Drop files here' : 'Drag & drop files here'}
            </p>
            <p className="text-sm text-muted-foreground">
              or click to browse your computer
            </p>
            <p className="text-xs text-muted-foreground mt-2">
              Supported formats: JPEG, PNG, PDF, ZIP (containing images/PDFs)
            </p>
            <p className="text-xs text-muted-foreground mt-1">
              Max file size: 20MB per file, 200MB for ZIP archives
            </p>
          </div>
        </CardContent>
      </Card>

      {/* File List */}
      {files.length > 0 && (
        <Card>
          <CardHeader className="flex flex-row items-center justify-between">
            <div>
              <CardTitle>Selected Files ({files.length})</CardTitle>
              <CardDescription>
                {pendingCount > 0 && `${pendingCount} pending`}
                {processingCount > 0 && ` • ${processingCount} processing`}
                {completedCount > 0 && ` • ${completedCount} completed`}
                {failedCount > 0 && ` • ${failedCount} failed`}
                {discardedCount > 0 && ` • ${discardedCount} discarded`}
                {duplicateCount > 0 && ` • ${duplicateCount} duplicates`}
              </CardDescription>
            </div>
            <div className="flex gap-2">
              {processingCount > 0 && (
                <Button variant="outline" size="sm" onClick={refreshStatuses}>
                  <RefreshCw className={`mr-2 h-4 w-4 ${isPolling ? 'animate-spin' : ''}`} />
                  {isPolling ? 'Auto-refreshing' : 'Refresh Status'}
                </Button>
              )}
              {(completedCount > 0 || failedCount > 0 || discardedCount > 0 || duplicateCount > 0) && (
                <Button variant="outline" size="sm" onClick={clearCompleted}>
                  Clear Completed
                </Button>
              )}
              <Button 
                onClick={uploadFiles} 
                disabled={isUploading || pendingCount === 0}
              >
                {isUploading ? (
                  <>
                    <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                    Uploading...
                  </>
                ) : (
                  <>
                    <UploadIcon className="mr-2 h-4 w-4" />
                    Upload {pendingCount > 0 ? `(${pendingCount})` : ''}
                  </>
                )}
              </Button>
            </div>
          </CardHeader>
          <CardContent>
            <div className="space-y-3">
              {files.map((fileItem, index) => (
                <div 
                  key={`${fileItem.file.name}-${index}`}
                  className="flex items-center gap-4 p-3 rounded-lg bg-muted/50"
                >
                  {/* Preview or Icon */}
                  <div className="shrink-0 w-16 h-16 rounded-lg overflow-hidden bg-background flex items-center justify-center">
                    {fileItem.preview ? (
                      <img 
                        src={fileItem.preview} 
                        alt={fileItem.file.name}
                        className="w-full h-full object-cover"
                      />
                    ) : (
                      getFileIcon(fileItem)
                    )}
                  </div>

                  {/* File Info */}
                  <div className="flex-1 min-w-0">
                    <p className="font-medium truncate">{fileItem.file.name}</p>
                    <p className="text-sm text-muted-foreground">
                      {(fileItem.file.size / 1024 / 1024).toFixed(2)} MB
                      {fileItem.isZip && fileItem.extractedCount && ` • ${fileItem.extractedCount} files extracted`}
                    </p>
                    
                    {/* Upload Progress Bar */}
                    {fileItem.status === 'uploading' && fileItem.uploadProgress !== undefined && (
                      <div className="mt-2 space-y-1">
                        <div className="flex justify-between text-xs text-muted-foreground">
                          <span>Uploading{fileItem.totalChunks ? ` (${fileItem.chunksUploaded || 0}/${fileItem.totalChunks} chunks)` : ''}...</span>
                          <span>{fileItem.uploadProgress}%</span>
                        </div>
                        <Progress value={fileItem.uploadProgress} className="h-2" />
                      </div>
                    )}
                    
                    {/* Processing Progress with ETA */}
                    {fileItem.status === 'processing' && (
                      <div className="mt-2 space-y-1">
                        <div className="flex justify-between text-xs text-muted-foreground">
                          <span className="flex items-center gap-1">
                            <Timer className="h-3 w-3" />
                            Processing document...
                          </span>
                          <span className="text-blue-400 font-medium">
                            {calculateETA(fileItem) || 'Calculating...'}
                          </span>
                        </div>
                        <Progress value={undefined} className="h-2 animate-pulse" />
                      </div>
                    )}
                    
                    {/* Extracting Progress (for ZIP files) */}
                    {fileItem.status === 'extracting' && (
                      <div className="mt-2 space-y-1">
                        <div className="flex justify-between text-xs text-muted-foreground">
                          <span>Extracting ZIP contents...</span>
                          <Loader2 className="h-3 w-3 animate-spin" />
                        </div>
                        <Progress value={undefined} className="h-2 animate-pulse" />
                      </div>
                    )}
                    
                    {fileItem.error && (
                      <p className="text-sm text-destructive mt-1">{fileItem.error}</p>
                    )}
                  </div>

                  {/* Status */}
                  <div className="shrink-0 flex items-center gap-2">
                    {getStatusBadge(fileItem)}

                    {(fileItem.status === 'failed' || fileItem.status === 'discarded') && fileItem.documentId && (
                      <Button 
                        variant="outline" 
                        size="sm"
                        onClick={(e) => {
                          e.stopPropagation();
                          reprocessMutation.mutate(
                            { documentId: fileItem.documentId! },
                            {
                              onSuccess: () => {
                                setFiles(prev => prev.map((f, i) => 
                                  i === index ? { ...f, status: 'processing', error: undefined, processingStartTime: Date.now() } : f
                                ));
                                toast.success('Document queued for reprocessing');
                              },
                              onError: (err) => {
                                toast.error(`Failed to reprocess: ${err.message}`);
                              }
                            }
                          );
                        }}
                        disabled={reprocessMutation.isPending}
                      >
                        <RefreshCw className="h-3 w-3 mr-1" />
                        Retry
                      </Button>
                    )}

                    {fileItem.status === 'pending' && (
                      <Button 
                        variant="ghost" 
                        size="icon"
                        onClick={(e) => {
                          e.stopPropagation();
                          removeFile(index);
                        }}
                      >
                        <X className="h-4 w-4" />
                      </Button>
                    )}
                  </div>
                </div>
              ))}
            </div>
          </CardContent>
        </Card>
      )}

      {/* Processing Status Indicator with Total ETA */}
      {isPolling && processingCount > 0 && (
        <Card className="border-blue-600/30 bg-blue-600/5">
          <CardContent className="py-4">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-3">
                <div className="relative">
                  <Loader2 className="h-5 w-5 text-blue-400 animate-spin" />
                </div>
                <div>
                  <p className="font-medium text-blue-400">Processing Documents</p>
                  <p className="text-sm text-muted-foreground">
                    {processingCount} document{processingCount > 1 ? 's' : ''} being processed. 
                    Status updates automatically every 3 seconds.
                  </p>
                </div>
              </div>
              {totalETA && (
                <div className="text-right">
                  <p className="text-sm text-muted-foreground">Estimated time remaining</p>
                  <p className="text-lg font-semibold text-blue-400 flex items-center gap-2">
                    <Timer className="h-4 w-4" />
                    {totalETA}
                  </p>
                </div>
              )}
            </div>
          </CardContent>
        </Card>
      )}

      {/* Instructions */}
      <Card>
        <CardHeader>
          <CardTitle>Processing Information</CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="grid gap-4 md:grid-cols-3">
            <div className="p-4 rounded-lg bg-muted/50">
              <h4 className="font-medium mb-2">Supported Formats</h4>
              <ul className="text-sm text-muted-foreground space-y-1">
                <li>• JPEG images (.jpg, .jpeg)</li>
                <li>• PNG images (.png)</li>
                <li>• PDF documents (.pdf)</li>
                <li>• ZIP archives (.zip) containing images/PDFs</li>
              </ul>
            </div>
            <div className="p-4 rounded-lg bg-muted/50">
              <h4 className="font-medium mb-2">Extracted Data</h4>
              <ul className="text-sm text-muted-foreground space-y-1">
                <li>• Patient Civil ID & Name</li>
                <li>• Date of Birth & Nationality</li>
                <li>• Test Type & Results</li>
                <li>• Viral Load & Accession Date</li>
              </ul>
            </div>
            <div className="p-4 rounded-lg bg-muted/50">
              <h4 className="font-medium mb-2">Processing Notes</h4>
              <ul className="text-sm text-muted-foreground space-y-1">
                <li>• Documents without test results are automatically discarded</li>
                <li>• Duplicate test results are automatically detected and skipped</li>
                <li>• Status updates automatically while processing</li>
                <li>• Processing typically takes 10-30 seconds per file</li>
              </ul>
            </div>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
