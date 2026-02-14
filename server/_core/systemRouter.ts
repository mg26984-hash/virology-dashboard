import { z } from "zod";
import { adminProcedure, publicProcedure, router } from "./trpc";
import { ENV } from "./env";

export const systemRouter = router({
  health: publicProcedure
    .input(
      z.object({
        timestamp: z.number().min(0, "timestamp cannot be negative"),
      })
    )
    .query(() => ({
      ok: true,
    })),

  checkGeminiKey: adminProcedure.query(() => {
    const key = ENV.geminiApiKey;
    return {
      keyLoaded: !!key,
      keyPrefix: key ? key.substring(0, 20) : 'none',
      keySuffix: key ? key.substring(key.length - 10) : 'none',
    };
  }),
});
