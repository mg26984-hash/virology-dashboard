import { useState, useRef, useCallback, useEffect } from "react";
import {
  Upload, CheckCircle2, AlertCircle, Loader2, Image, X, Plus, Share2, FileText, FileArchive,
} from "lucide-react";

/**
 * QuickUpload – standalone page for iOS Shortcuts & Android share-target.
 * Renders outside DashboardLayout so it works with token auth (no cookie).
 * URL: /quick-upload?token=xxx
 * Also picks up files from the service worker share-cache (Android PWA).
 */

interface UploadResult {
  fileName: string;
  status: "uploaded" | "duplicate" | "error";
  error?: string;
}

export default function QuickUpload() {
  const [token, setToken] = useState<string>(() => {
    const params = new URLSearchParams(window.location.search);
    return params.get("token") || "";
  });
  const [files, setFiles] = useState<File[]>([]);
  const [previews, setPreviews] = useState<string[]>([]);
  const [uploading, setUploading] = useState(false);
  const [results, setResults] = useState<UploadResult[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  // Pick up files from service worker share-cache (Android PWA)
  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    if (params.get("shared") === "true") {
      pickUpShareCache();
    }
  }, []);

  async function pickUpShareCache() {
    try {
      const cache = await caches.open("virology-share-v1");
      const keys = await cache.keys();
      const sharedFiles: File[] = [];
      for (const req of keys) {
        if (req.url.includes("/share-cache/")) {
          const resp = await cache.match(req);
          if (resp) {
            const blob = await resp.blob();
            const name = resp.headers.get("X-File-Name") || "shared-image.jpg";
            sharedFiles.push(new File([blob], name, { type: blob.type }));
            await cache.delete(req);
          }
        }
      }
      if (sharedFiles.length > 0) {
        addFiles(sharedFiles);
      }
    } catch (e) {
      console.error("[QuickUpload] Failed to read share cache:", e);
    }
  }

  const addFiles = useCallback((newFiles: File[]) => {
    const allowed = ["image/jpeg", "image/png", "application/pdf", "application/zip", "application/x-zip-compressed"];
    const valid = newFiles.filter((f) => allowed.includes(f.type) || f.name.toLowerCase().endsWith(".zip"));
    if (valid.length === 0) return;
    setFiles((prev) => [...prev, ...valid]);
    setPreviews((prev) => [
      ...prev,
      ...valid.map((f) => (f.type.startsWith("image/") ? URL.createObjectURL(f) : "")),
    ]);
  }, []);

  const removeFile = useCallback((index: number) => {
    setFiles((prev) => prev.filter((_, i) => i !== index));
    setPreviews((prev) => {
      const p = prev[index];
      if (p) URL.revokeObjectURL(p);
      return prev.filter((_, i) => i !== index);
    });
  }, []);

  const handleFileChange = useCallback(
    (e: React.ChangeEvent<HTMLInputElement>) => {
      if (e.target.files) addFiles(Array.from(e.target.files));
      e.target.value = "";
    },
    [addFiles]
  );

  const upload = useCallback(async () => {
    if (!token.trim()) {
      setError("Upload token is required. Generate one from the Upload page.");
      return;
    }
    if (files.length === 0) {
      setError("No files selected.");
      return;
    }
    setUploading(true);
    setError(null);
    setResults(null);

    try {
      const formData = new FormData();
      for (const f of files) {
        formData.append("images", f);
      }

      const resp = await fetch(`/api/upload/quick?token=${encodeURIComponent(token.trim())}`, {
        method: "POST",
        body: formData,
      });

      const data = await resp.json();
      if (!resp.ok) {
        setError(data.error || "Upload failed");
        setUploading(false);
        return;
      }

      setResults(data.results || []);
      setFiles([]);
      setPreviews([]);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Network error");
    } finally {
      setUploading(false);
    }
  }, [token, files]);

  const newCount = results?.filter((r) => r.status === "uploaded").length ?? 0;
  const dupCount = results?.filter((r) => r.status === "duplicate").length ?? 0;
  const errCount = results?.filter((r) => r.status === "error").length ?? 0;

  return (
    <div className="min-h-screen bg-[#0a0a0a] text-white flex flex-col">
      {/* Header */}
      <header className="border-b border-white/10 px-4 py-3 flex items-center gap-3">
        <div className="h-8 w-8 rounded-full bg-emerald-600 flex items-center justify-center">
          <Share2 className="h-4 w-4 text-white" />
        </div>
        <div>
          <h1 className="text-lg font-semibold">Quick Upload</h1>
          <p className="text-xs text-white/50">Virology Dashboard</p>
        </div>
      </header>

      <main className="flex-1 p-4 max-w-lg mx-auto w-full space-y-4">
        {/* Token input */}
        {!new URLSearchParams(window.location.search).get("token") && (
          <div className="space-y-1.5">
            <label className="text-sm font-medium text-white/70">Upload Token</label>
            <input
              type="text"
              value={token}
              onChange={(e) => setToken(e.target.value)}
              placeholder="Paste your upload token here"
              className="w-full rounded-lg border border-white/20 bg-white/5 px-3 py-2 text-sm placeholder:text-white/30 focus:outline-none focus:ring-2 focus:ring-emerald-500/50"
            />
            <p className="text-xs text-white/40">Generate a token from the Upload page on the dashboard.</p>
          </div>
        )}

        {/* File picker area */}
        {!results && (
          <>
            <div
              className="border-2 border-dashed border-white/20 rounded-xl p-6 text-center cursor-pointer hover:border-emerald-500/50 transition-colors"
              onClick={() => fileInputRef.current?.click()}
            >
              <input
                ref={fileInputRef}
                type="file"
                accept="image/jpeg,image/png,application/pdf,.zip,application/zip"
                multiple
                className="hidden"
                onChange={handleFileChange}
              />
              <Upload className="h-8 w-8 mx-auto text-white/30 mb-2" />
              <p className="text-sm text-white/60">Tap to select photos, PDFs, or ZIPs</p>
              <p className="text-xs text-white/30 mt-1">JPEG, PNG, PDF, or ZIP (max 500 MB for ZIP)</p>
            </div>

            {/* File previews */}
            {files.length > 0 && (
              <div className="space-y-2">
                <div className="flex items-center justify-between">
                  <span className="text-sm font-medium">{files.length} file{files.length !== 1 ? "s" : ""} selected</span>
                  <button
                    className="text-xs text-white/50 hover:text-white/80 flex items-center gap-1"
                    onClick={() => fileInputRef.current?.click()}
                  >
                    <Plus className="h-3 w-3" /> Add more
                  </button>
                </div>
                <div className="grid grid-cols-4 gap-2">
                  {files.map((f, i) => (
                    <div key={i} className="relative group">
                      {previews[i] ? (
                        <img
                          src={previews[i]}
                          alt={f.name}
                          className="w-full aspect-square object-cover rounded-lg"
                        />
                      ) : f.type === "application/pdf" ? (
                        <div className="w-full aspect-square rounded-lg bg-red-900/20 border border-red-500/20 flex flex-col items-center justify-center gap-1">
                          <FileText className="h-5 w-5 text-red-400" />
                          <span className="text-[9px] text-red-300 font-medium">PDF</span>
                        </div>
                      ) : (f.type.includes("zip") || f.name.endsWith(".zip")) ? (
                        <div className="w-full aspect-square rounded-lg bg-amber-900/20 border border-amber-500/20 flex flex-col items-center justify-center gap-1">
                          <FileArchive className="h-5 w-5 text-amber-400" />
                          <span className="text-[9px] text-amber-300 font-medium">ZIP</span>
                        </div>
                      ) : (
                        <div className="w-full aspect-square rounded-lg bg-white/10 flex items-center justify-center">
                          <Image className="h-5 w-5 text-white/30" />
                        </div>
                      )}
                      <button
                        onClick={() => removeFile(i)}
                        className="absolute -top-1 -right-1 h-5 w-5 rounded-full bg-red-600 flex items-center justify-center opacity-0 group-hover:opacity-100 transition-opacity"
                      >
                        <X className="h-3 w-3" />
                      </button>
                    </div>
                  ))}
                </div>
              </div>
            )}

            {/* Upload button */}
            <button
              onClick={upload}
              disabled={uploading || files.length === 0}
              className="w-full rounded-lg bg-emerald-600 hover:bg-emerald-700 disabled:opacity-50 disabled:cursor-not-allowed py-3 text-sm font-medium transition-colors flex items-center justify-center gap-2"
            >
              {uploading ? (
                <>
                  <Loader2 className="h-4 w-4 animate-spin" />
                  Uploading...
                </>
              ) : (
                <>
                  <Upload className="h-4 w-4" />
                  Upload {files.length > 0 ? `${files.length} File${files.length !== 1 ? "s" : ""}` : "Files"}
                </>
              )}
            </button>
          </>
        )}

        {/* Error */}
        {error && (
          <div className="rounded-lg bg-red-900/30 border border-red-500/30 p-3 flex items-start gap-2">
            <AlertCircle className="h-4 w-4 text-red-400 mt-0.5 shrink-0" />
            <div>
              <p className="text-sm text-red-300">{error}</p>
              {error.includes("token") && (
                <a href="/upload" className="text-xs text-emerald-400 hover:underline mt-1 inline-block">
                  Go to Upload page to generate a token →
                </a>
              )}
            </div>
          </div>
        )}

        {/* Results */}
        {results && (
          <div className="space-y-3">
            <div className="rounded-lg bg-emerald-900/20 border border-emerald-500/30 p-4 text-center">
              <CheckCircle2 className="h-8 w-8 text-emerald-400 mx-auto mb-2" />
              <p className="text-lg font-semibold">Upload Complete</p>
              <p className="text-sm text-white/60 mt-1">
                {newCount > 0 && <span className="text-emerald-400">{newCount} new</span>}
                {newCount > 0 && dupCount > 0 && " · "}
                {dupCount > 0 && <span className="text-yellow-400">{dupCount} duplicate{dupCount !== 1 ? "s" : ""}</span>}
                {errCount > 0 && " · "}
                {errCount > 0 && <span className="text-red-400">{errCount} error{errCount !== 1 ? "s" : ""}</span>}
              </p>
              <p className="text-xs text-white/40 mt-2">Processing will begin automatically on the server.</p>
            </div>

            {/* Individual file results */}
            <div className="space-y-1">
              {results.map((r, i) => (
                <div key={i} className="flex items-center gap-2 text-xs py-1.5 px-2 rounded bg-white/5">
                  {r.status === "uploaded" && <CheckCircle2 className="h-3.5 w-3.5 text-emerald-400 shrink-0" />}
                  {r.status === "duplicate" && <AlertCircle className="h-3.5 w-3.5 text-yellow-400 shrink-0" />}
                  {r.status === "error" && <AlertCircle className="h-3.5 w-3.5 text-red-400 shrink-0" />}
                  <span className="truncate flex-1">{r.fileName}</span>
                  <span className="text-white/40 shrink-0">
                    {r.status === "uploaded" ? "New" : r.status === "duplicate" ? "Duplicate" : "Error"}
                  </span>
                </div>
              ))}
            </div>

            {/* Upload more button */}
            <button
              onClick={() => {
                setResults(null);
                setError(null);
              }}
              className="w-full rounded-lg border border-white/20 py-2.5 text-sm font-medium hover:bg-white/5 transition-colors"
            >
              Upload More Files
            </button>
          </div>
        )}
      </main>

      {/* Footer */}
      <footer className="border-t border-white/10 px-4 py-3 text-center">
        <p className="text-xs text-white/30">
          Photos, PDFs, and ZIPs are deduplicated and processed automatically.{" "}
          <a href="/upload" className="text-emerald-400 hover:underline">
            Open full dashboard
          </a>
        </p>
      </footer>
    </div>
  );
}
