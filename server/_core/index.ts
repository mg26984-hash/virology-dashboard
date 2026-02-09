import "dotenv/config";
import express from "express";
import { createServer } from "http";
import net from "net";
import { createExpressMiddleware } from "@trpc/server/adapters/express";
import { registerOAuthRoutes } from "./oauth";
import { appRouter } from "../routers";
import { createContext } from "./context";
import { serveStatic, setupVite } from "./vite";
import uploadRoutes from "../uploadRoutes";
import { startBackgroundWorker } from "../backgroundWorker";
import { startTempCleanupScheduler } from "../tempCleanup";

function isPortAvailable(port: number): Promise<boolean> {
  return new Promise(resolve => {
    const server = net.createServer();
    server.listen(port, () => {
      server.close(() => resolve(true));
    });
    server.on("error", () => resolve(false));
  });
}

async function findAvailablePort(startPort: number = 3000): Promise<number> {
  for (let port = startPort; port < startPort + 20; port++) {
    if (await isPortAvailable(port)) {
      return port;
    }
  }
  throw new Error(`No available port found starting from ${startPort}`);
}

async function startServer() {
  const app = express();
  const server = createServer(app);
  // Multipart file upload routes MUST be registered BEFORE body parsers
  // because express.raw/json would consume the request body before multer can parse it
  app.use("/api/upload", uploadRoutes);
  // Fallback: iOS Shortcuts may POST to /quick-upload (the frontend page URL)
  // instead of /api/upload/quick. Rewrite the URL so it hits the correct handler.
  app.use("/quick-upload", (req, res, next) => {
    if (req.method === "POST") {
      console.log("[Quick Upload Redirect] Rewriting POST /quick-upload -> /api/upload/quick");
      req.url = "/quick" + (req.originalUrl.includes("?") ? req.originalUrl.substring(req.originalUrl.indexOf("?")) : "");
      return uploadRoutes(req, res, next);
    }
    next();
  });
  // Configure body parser with larger size limit
  app.use(express.json({ limit: "200mb" }));
  app.use(express.urlencoded({ limit: "200mb", extended: true }));
  // OAuth callback under /api/oauth/callback
  registerOAuthRoutes(app);
  // tRPC API
  app.use(
    "/api/trpc",
    createExpressMiddleware({
      router: appRouter,
      createContext,
    })
  );
  // development mode uses Vite, production mode uses static files
  if (process.env.NODE_ENV === "development") {
    await setupVite(app, server);
  } else {
    serveStatic(app);
  }

  const preferredPort = parseInt(process.env.PORT || "3000");
  const port = await findAvailablePort(preferredPort);

  if (port !== preferredPort) {
    console.log(`Port ${preferredPort} is busy, using port ${port} instead`);
  }

  server.listen(port, () => {
    console.log(`Server running on http://localhost:${port}/`);
    // Start background worker to process pending documents
    startBackgroundWorker(30000); // Check every 30 seconds
    // Start periodic temp file cleanup (every 6 hours)
    startTempCleanupScheduler();
  });
}

startServer().catch(console.error);
