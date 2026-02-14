// Use getters so values are read from process.env on every access,
// not cached at import time.

const FALLBACK_OWNER_NAME = "Mohammed Megahed";

export const ENV = {
  get cookieSecret() { return process.env.JWT_SECRET ?? ""; },
  get databaseUrl() { return process.env.DATABASE_URL ?? ""; },
  get googleClientId() { return process.env.GOOGLE_CLIENT_ID ?? ""; },
  get googleClientSecret() { return process.env.GOOGLE_CLIENT_SECRET ?? ""; },
  get ownerEmail() { return process.env.OWNER_EMAIL ?? ""; },
  get ownerName() { return process.env.OWNER_NAME || FALLBACK_OWNER_NAME; },
  get isProduction() { return process.env.NODE_ENV === "production"; },
  get geminiApiKey() { return process.env.GEMINI_API_KEY ?? ""; },
  get blobToken() { return process.env.BLOB_READ_WRITE_TOKEN ?? ""; },
};

// ── Startup validation ──

const ENV_CHECKS: Array<{ key: string; label: string; critical: boolean }> = [
  { key: "DATABASE_URL",            label: "Database connection",               critical: true },
  { key: "JWT_SECRET",              label: "Session cookie signing",            critical: true },
  { key: "GOOGLE_CLIENT_ID",        label: "Google OAuth client ID",            critical: true },
  { key: "GOOGLE_CLIENT_SECRET",    label: "Google OAuth client secret",        critical: true },
  { key: "GEMINI_API_KEY",          label: "Gemini API key (document processing)", critical: false },
  { key: "BLOB_READ_WRITE_TOKEN",   label: "Vercel Blob storage token",        critical: false },
  { key: "OWNER_EMAIL",             label: "Owner email (auto-approve)",        critical: false },
  { key: "OWNER_NAME",              label: "Owner name (using fallback)",       critical: false },
];

const missing: string[] = [];
const warnings: string[] = [];

for (const check of ENV_CHECKS) {
  const value = process.env[check.key];
  if (!value || value.trim() === "") {
    if (check.critical) {
      missing.push(`  ✗ ${check.key} — ${check.label}`);
    } else {
      warnings.push(`  ⚠ ${check.key} — ${check.label}`);
    }
  }
}

if (missing.length > 0) {
  console.error(
    `[ENV] CRITICAL — The following required env vars are missing:\n${missing.join("\n")}\n` +
    `  The application may not function correctly.`
  );
}

if (warnings.length > 0) {
  console.warn(
    `[ENV] WARNING — The following env vars are not set (features may be degraded):\n${warnings.join("\n")}`
  );
}

if (missing.length === 0 && warnings.length === 0) {
  console.log("[ENV] All environment variables are set.");
} else if (missing.length === 0) {
  console.log(`[ENV] Core env vars OK. ${warnings.length} non-critical warning(s) above.`);
}
