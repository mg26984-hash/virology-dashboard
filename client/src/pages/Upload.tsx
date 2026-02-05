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
  Clock
} from "lucide-react";
import { useState, useCallback, useRef, useEffect } from "react";
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
}

export default function Upload() {
  const { user } = useAuth();
  const [files, setFiles] = useState<FileWithPreview[]>([]);
  const [isDragging, setIsDragging] = useState(false);
  const [isUploading, setIsUploading] = useState(false);
  const [isPolling, setIsPolling] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const pollingIntervalRef = useRef<NodeJS.Timeout | null>(null);

  const uploadMutation = trpc.documents.upload.useMutation();
  const bulkUploadMutation = trpc.documents.bulkUpload.useMutation();
  const zipUploadMutation = trpc.documents.uploadZip.useMutation();
  const reprocessMutation = trpc.documents.reprocess.useMutation();

  const utils = trpc.useUtils();

  // Get document IDs that need status polling
  const processingDocIds = files
    .filter(f => f.documentId && (f.status === 'completed' || f.status === 'processing'))
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
          return { ...f, status: 'processing', processingStatus: status.status };
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
      f.documentId && (f.status === 'completed' || f.status === 'processing') && 
      f.processingStatus !== 'completed' && f.processingStatus !== 'failed' && f.processingStatus !== 'discarded'
    );
    
    if (hasProcessingDocs && !isPolling) {
      setIsPolling(true);
    }
  }, [files, isPolling]);

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

      // Process ZIP files first
      for (const zipFile of zipFiles) {
        try {
          setFiles(prev => prev.map(f => 
            f === zipFile ? { ...f, status: 'extracting' } : f
          ));

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
                  processingStatus: 'pending'
                }
              : f
          ));

          toast.success(`ZIP processed: ${result.successful} of ${result.total} files uploaded and queued for processing`);
          if (result.failed > 0) {
            toast.error(`${result.failed} files from ZIP failed to upload`);
          }
        } catch (error) {
          setFiles(prev => prev.map(f => 
            f === zipFile 
              ? { ...f, status: 'failed', error: 'Failed to process ZIP file' }
              : f
          ));
          toast.error(`Failed to process ${zipFile.file.name}`);
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
              ? { ...f, status: 'processing', documentId: result.documentId, processingStatus: 'pending' }
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
                      {(fileItem.file.size / 1024).toFixed(1)} KB
                      {fileItem.isZip && fileItem.extractedCount && ` • ${fileItem.extractedCount} files extracted`}
                    </p>
                    {fileItem.error && (
                      <p className="text-sm text-destructive">{fileItem.error}</p>
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
                                  i === index ? { ...f, status: 'processing', error: undefined } : f
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

      {/* Processing Status Indicator */}
      {isPolling && processingCount > 0 && (
        <Card className="border-blue-600/30 bg-blue-600/5">
          <CardContent className="py-4">
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
