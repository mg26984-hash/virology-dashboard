/**
 * Scheduled job: Daily Gemini API health check
 *
 * Runs once per day at 9:00 AM to verify the Gemini API key is working.
 * Logs errors if the API is failing (invalid key, quota exceeded, network error).
 */

import { testGeminiConnection } from "./gemini";

export async function runGeminiHealthCheck(): Promise<void> {
  console.log("[GeminiHealthCheck] Running daily health check...");

  try {
    const result = await testGeminiConnection();

    if (result.success) {
      console.log(`[GeminiHealthCheck] ✅ Gemini API healthy (${result.responseTimeMs}ms)`);
    } else {
      console.error(`[GeminiHealthCheck] ❌ Gemini API failed: ${result.error}`);
    }
  } catch (error: any) {
    console.error("[GeminiHealthCheck] Unexpected error during health check:", error.message);
  }
}

// Schedule the health check to run daily at 9:00 AM
export function scheduleGeminiHealthCheck(): void {
  const INTERVAL_MS = 24 * 60 * 60 * 1000; // 24 hours

  const now = new Date();
  const next9AM = new Date();
  next9AM.setHours(9, 0, 0, 0);

  if (now >= next9AM) {
    next9AM.setDate(next9AM.getDate() + 1);
  }

  const msUntilNext9AM = next9AM.getTime() - now.getTime();

  console.log(`[GeminiHealthCheck] Scheduled to run at ${next9AM.toLocaleString()}`);

  setTimeout(() => {
    runGeminiHealthCheck();
    setInterval(runGeminiHealthCheck, INTERVAL_MS);
  }, msUntilNext9AM);
}
