import { describe, it, expect } from "vitest";

describe("Gemini API Key Validation", () => {
  it("GEMINI_API_KEY is set in environment", () => {
    const key = process.env.GEMINI_API_KEY;
    expect(key).toBeDefined();
    expect(key!.length).toBeGreaterThan(10);
    expect(key).toMatch(/^AIza/);
  });

  it("Gemini API key can list models (lightweight validation)", async () => {
    const key = process.env.GEMINI_API_KEY;
    expect(key).toBeDefined();

    const response = await fetch(
      `https://generativelanguage.googleapis.com/v1beta/models?key=${key}`
    );
    expect(response.status).toBe(200);

    const data = await response.json();
    expect(data.models).toBeDefined();
    expect(data.models.length).toBeGreaterThan(0);

    // Verify Gemini 2.0 Flash is available
    const modelNames = data.models.map((m: any) => m.name);
    const hasFlash = modelNames.some((n: string) => n.includes("gemini-2.0-flash"));
    expect(hasFlash).toBe(true);
  }, 15000);
});
