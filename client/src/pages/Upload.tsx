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
  Copy
} from "lucide-react";
import { useState, useCallback, useRef } from "react";
import { toast } from "sonner";

interface FileWithPreview {
  file: File;
  preview?: string;
  status: 'pending' | 'uploading' | 'extracting' | 'completed' | 'failed' | 'discarded' | 'duplicate';
  error?: string;
  documentId?: number;
  isZip?: boolean;
  extractedCount?: number;
}

export default function Upload() {
  const { user } = useAuth();
  const [files, setFiles] = useState<FileWithPreview[]>([]);
  const [isDragging, setIsDragging] = useState(false);
  const [isUploading, setIsUploading] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const uploadMutation = trpc.documents.upload.useMutation();
  const bulkUploadMutation = trpc.documents.bulkUpload.useMutation();
  const zipUploadMutation = trpc.documents.uploadZip.useMutation();

  const utils = trpc.useUtils();

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
        resolve(base64);
      };
      reader.onerror = reject;
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
                  status: result.successful > 0 ? 'completed' : 'failed',
                  extractedCount: result.total,
                  error: result.failed > 0 ? `${result.failed} files failed` : undefined
                }
              : f
          ));

          toast.success(`ZIP processed: ${result.successful} of ${result.total} files uploaded`);
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

          const result = await uploadMutation.mutateAsync({
            fileName: regularFiles[0].file.name,
            fileData,
            mimeType: regularFiles[0].file.type,
            fileSize: regularFiles[0].file.size,
          });

          setFiles(prev => prev.map(f => 
            f === regularFiles[0] 
              ? { ...f, status: 'completed', documentId: result.documentId }
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
                status: resultItem.success ? 'completed' : 'failed',
                documentId: resultItem.documentId,
                error: resultItem.error,
              };
            }
            return f;
          }));

          toast.success(`Uploaded ${result.successful} of ${result.total} files`);
          if (result.failed > 0) {
            toast.error(`${result.failed} files failed to upload`);
          }
        }
      }

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

  const getFileIcon = (file: FileWithPreview) => {
    if (file.isZip) {
      return <FileArchive className="h-8 w-8 text-yellow-400" />;
    }
    if (file.file.type === 'application/pdf') {
      return <FileType className="h-8 w-8 text-red-400" />;
    }
    return <Image className="h-8 w-8 text-blue-400" />;
  };

  const completedCount = files.filter(f => f.status === 'completed').length;
  const failedCount = files.filter(f => f.status === 'failed').length;
  const pendingCount = files.filter(f => f.status === 'pending').length;
  const uploadingCount = files.filter(f => f.status === 'uploading' || f.status === 'extracting').length;
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
                {uploadingCount > 0 && ` • ${uploadingCount} processing`}
                {completedCount > 0 && ` • ${completedCount} completed`}
                {failedCount > 0 && ` • ${failedCount} failed`}
                {duplicateCount > 0 && ` • ${duplicateCount} duplicates`}
              </CardDescription>
            </div>
            <div className="flex gap-2">
              {(completedCount > 0 || failedCount > 0 || duplicateCount > 0) && (
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
                    Processing...
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
                    {fileItem.status === 'pending' && (
                      <Badge variant="outline">Pending</Badge>
                    )}
                    {fileItem.status === 'uploading' && (
                      <Badge variant="secondary">
                        <Loader2 className="mr-1 h-3 w-3 animate-spin" />
                        Uploading
                      </Badge>
                    )}
                    {fileItem.status === 'extracting' && (
                      <Badge variant="secondary">
                        <Loader2 className="mr-1 h-3 w-3 animate-spin" />
                        Extracting ZIP
                      </Badge>
                    )}
                    {fileItem.status === 'completed' && (
                      <Badge className="bg-green-600">
                        <CheckCircle2 className="mr-1 h-3 w-3" />
                        Uploaded
                      </Badge>
                    )}
                    {fileItem.status === 'failed' && (
                      <Badge variant="destructive">
                        <AlertCircle className="mr-1 h-3 w-3" />
                        Failed
                      </Badge>
                    )}
                    {fileItem.status === 'discarded' && (
                      <Badge variant="secondary">Discarded</Badge>
                    )}
                    {fileItem.status === 'duplicate' && (
                      <Badge variant="outline" className="border-yellow-500 text-yellow-500">
                        <Copy className="mr-1 h-3 w-3" />
                        Duplicate
                      </Badge>
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
                <li>• ZIP files are extracted and each file processed individually</li>
                <li>• Processing typically takes 10-30 seconds per file</li>
              </ul>
            </div>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
