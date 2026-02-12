/**
 * Scheduled job: Daily Gemini API health check
 * 
 * Runs once per day at 9:00 AM to verify the Gemini API key is working.
 * Sends an owner notification if the API is failing (invalid key, quota exceeded, network error).
 * 
 * This helps catch API issues proactively before users encounter them.
 */

import { testGeminiConnection } from "./gemini";
import { notifyOwner } from "./_core/notification";

export async function runGeminiHealthCheck(): Promise<void> {
  console.log("[GeminiHealthCheck] Running daily health check...");
  
  try {
    const result = await testGeminiConnection();
    
    if (result.success) {
      console.log(`[GeminiHealthCheck] ✅ Gemini API healthy (${result.responseTimeMs}ms)`);
    } else {
      console.log(`[GeminiHealthCheck] ❌ Gemini API failed: ${result.error}`);
      
      // Send notification to owner
      const notified = await notifyOwner({
        title: "⚠️ Gemini API Health Check Failed",
        content: `The daily Gemini API health check detected a problem:\n\n**Error:** ${result.error}\n**Response Time:** ${result.responseTimeMs}ms\n**Model:** ${result.model}\n\nDocuments will automatically fall back to the platform LLM until this is resolved. Please check your Gemini API key in Settings > Secrets or visit the AI Usage dashboard to test the connection manually.`
      });
      
      if (notified) {
        console.log("[GeminiHealthCheck] Owner notification sent successfully");
      } else {
        console.log("[GeminiHealthCheck] Failed to send owner notification");
      }
    }
  } catch (error: any) {
    console.error("[GeminiHealthCheck] Unexpected error during health check:", error.message);
  }
}

// Schedule the health check to run daily at 9:00 AM
// This is called from the server startup in server/_core/index.ts
export function scheduleGeminiHealthCheck(): void {
  const INTERVAL_MS = 24 * 60 * 60 * 1000; // 24 hours
  
  // Calculate time until next 9:00 AM
  const now = new Date();
  const next9AM = new Date();
  next9AM.setHours(9, 0, 0, 0);
  
  // If it's already past 9 AM today, schedule for tomorrow
  if (now >= next9AM) {
    next9AM.setDate(next9AM.getDate() + 1);
  }
  
  const msUntilNext9AM = next9AM.getTime() - now.getTime();
  
  console.log(`[GeminiHealthCheck] Scheduled to run at ${next9AM.toLocaleString()}`);
  
  // Run first check at 9:00 AM, then repeat every 24 hours
  setTimeout(() => {
    runGeminiHealthCheck();
    setInterval(runGeminiHealthCheck, INTERVAL_MS);
  }, msUntilNext9AM);
}
