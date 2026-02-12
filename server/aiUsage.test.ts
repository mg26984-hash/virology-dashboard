import { describe, it, expect } from "vitest";
import {
  getAiUsageSummary,
  getAiUsageByDay,
  getAiUsageByWeek,
  getAiCostEstimate,
} from "./db";

describe("AI Usage Analytics", () => {
  describe("getAiUsageSummary", () => {
    it("should return an object with gemini, platform, unknown, and total fields", async () => {
      const summary = await getAiUsageSummary();
      expect(summary).toBeDefined();
      expect(typeof summary.gemini).toBe("number");
      expect(typeof summary.platform).toBe("number");
      expect(typeof summary.unknown).toBe("number");
      expect(typeof summary.total).toBe("number");
      expect(summary.total).toBe(summary.gemini + summary.platform + summary.unknown);
    });

    it("should return non-negative counts", async () => {
      const summary = await getAiUsageSummary();
      expect(summary.gemini).toBeGreaterThanOrEqual(0);
      expect(summary.platform).toBeGreaterThanOrEqual(0);
      expect(summary.unknown).toBeGreaterThanOrEqual(0);
      expect(summary.total).toBeGreaterThanOrEqual(0);
    });
  });

  describe("getAiUsageByDay", () => {
    it("should return an array of daily usage data", async () => {
      const daily = await getAiUsageByDay(30);
      expect(Array.isArray(daily)).toBe(true);
    });

    it("should have correct shape for each day entry", async () => {
      const daily = await getAiUsageByDay(30);
      for (const entry of daily) {
        expect(entry).toHaveProperty("date");
        expect(entry).toHaveProperty("gemini");
        expect(entry).toHaveProperty("platform");
        expect(entry).toHaveProperty("unknown");
        expect(typeof entry.date).toBe("string");
        expect(typeof entry.gemini).toBe("number");
        expect(typeof entry.platform).toBe("number");
        expect(typeof entry.unknown).toBe("number");
      }
    });

    it("should return entries in ascending date order", async () => {
      const daily = await getAiUsageByDay(30);
      for (let i = 1; i < daily.length; i++) {
        expect(daily[i].date >= daily[i - 1].date).toBe(true);
      }
    });

    it("should respect the days parameter", async () => {
      const daily7 = await getAiUsageByDay(7);
      const daily30 = await getAiUsageByDay(30);
      // 7-day data should be a subset of 30-day data
      expect(daily7.length).toBeLessThanOrEqual(daily30.length);
    });
  });

  describe("getAiUsageByWeek", () => {
    it("should return an array of weekly usage data", async () => {
      const weekly = await getAiUsageByWeek(12);
      expect(Array.isArray(weekly)).toBe(true);
    });

    it("should have correct shape for each week entry", async () => {
      const weekly = await getAiUsageByWeek(12);
      for (const entry of weekly) {
        expect(entry).toHaveProperty("week");
        expect(entry).toHaveProperty("weekStart");
        expect(entry).toHaveProperty("gemini");
        expect(entry).toHaveProperty("platform");
        expect(entry).toHaveProperty("unknown");
        expect(typeof entry.week).toBe("string");
        expect(typeof entry.weekStart).toBe("string");
      }
    });
  });

  describe("getAiCostEstimate", () => {
    it("should return cost estimate with all required fields", async () => {
      const cost = await getAiCostEstimate();
      expect(cost).toBeDefined();
      expect(typeof cost.gemini).toBe("number");
      expect(typeof cost.platform).toBe("number");
      expect(typeof cost.total).toBe("number");
      expect(typeof cost.platformCost).toBe("number");
      expect(typeof cost.geminiCost).toBe("number");
      expect(typeof cost.totalIfAllPlatform).toBe("number");
      expect(typeof cost.actualCost).toBe("number");
      expect(typeof cost.savings).toBe("number");
      expect(typeof cost.savingsPercent).toBe("number");
    });

    it("should have non-negative costs", async () => {
      const cost = await getAiCostEstimate();
      expect(cost.platformCost).toBeGreaterThanOrEqual(0);
      expect(cost.geminiCost).toBeGreaterThanOrEqual(0);
      expect(cost.totalIfAllPlatform).toBeGreaterThanOrEqual(0);
      expect(cost.actualCost).toBeGreaterThanOrEqual(0);
      expect(cost.savings).toBeGreaterThanOrEqual(0);
    });

    it("should have savings <= totalIfAllPlatform", async () => {
      const cost = await getAiCostEstimate();
      expect(cost.savings).toBeLessThanOrEqual(cost.totalIfAllPlatform);
    });

    it("should have savingsPercent between 0 and 100", async () => {
      const cost = await getAiCostEstimate();
      expect(cost.savingsPercent).toBeGreaterThanOrEqual(0);
      expect(cost.savingsPercent).toBeLessThanOrEqual(100);
    });
  });
});
