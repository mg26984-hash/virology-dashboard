// Use getters so values are read from process.env on every access,
// not cached at import time. This is critical for ownerOpenId which
// can change at runtime (e.g., ownership transfer).

// ── Hardcoded fallbacks for values that may not be injected in production ──
const FALLBACK_OWNER_OPEN_ID = "nPtvS3FjrgpNRuGEU3ERv5";
const FALLBACK_OWNER_NAME = "Mohammed Megahed";
const FALLBACK_GEMINI_API_KEY = "AIzaSyDPncKYmdOj84ui5toyaRjGPMLdftxxB6o";

export const ENV = {
  get appId() { return process.env.VITE_APP_ID ?? ""; },
  get cookieSecret() { return process.env.JWT_SECRET ?? ""; },
  get databaseUrl() { return process.env.DATABASE_URL ?? ""; },
  get oAuthServerUrl() { return process.env.OAUTH_SERVER_URL ?? ""; },
  get ownerOpenId() { return process.env.OWNER_OPEN_ID || FALLBACK_OWNER_OPEN_ID; },
  get ownerName() { return process.env.OWNER_NAME || FALLBACK_OWNER_NAME; },
  get isProduction() { return process.env.NODE_ENV === "production"; },
  get forgeApiUrl() { return process.env.BUILT_IN_FORGE_API_URL ?? ""; },
  get forgeApiKey() { return process.env.BUILT_IN_FORGE_API_KEY ?? ""; },
  get geminiApiKey() { return process.env.GEMINI_API_KEY || FALLBACK_GEMINI_API_KEY; },
};

// ── Startup validation ──
// Runs once when the module is first imported. Logs warnings for any
// critical env vars that are missing so issues are visible in server logs
// instead of silently breaking features at runtime.

const ENV_CHECKS: Array<{ key: string; label: string; critical: boolean }> = [
  { key: "DATABASE_URL",              label: "Database connection",        critical: true },
  { key: "JWT_SECRET",                label: "Session cookie signing",     critical: true },
  { key: "VITE_APP_ID",              label: "OAuth app ID",               critical: true },
  { key: "OAUTH_SERVER_URL",          label: "OAuth server URL",           critical: true },
  { key: "BUILT_IN_FORGE_API_URL",    label: "Forge API URL (LLM/storage/notifications)", critical: false },
  { key: "BUILT_IN_FORGE_API_KEY",    label: "Forge API key",             critical: false },
  { key: "OWNER_OPEN_ID",            label: "Owner OpenID (using fallback)", critical: false },
  { key: "OWNER_NAME",               label: "Owner name (using fallback)",   critical: false },
  { key: "GEMINI_API_KEY",           label: "Gemini API key (document processing)", critical: false },
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
