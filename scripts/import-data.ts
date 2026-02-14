/**
 * One-time data import into the new Neon PostgreSQL database + Vercel Blob.
 *
 * Usage:
 *   DATABASE_URL="postgresql://..." BLOB_READ_WRITE_TOKEN="..." npx tsx scripts/import-data.ts
 *
 * Prerequisites:
 *   1. Run export-data.ts first to create scripts/exported-data/
 *   2. Run `drizzle-kit push` against the new Neon DB to create tables
 *   3. Set DATABASE_URL to the Neon connection string
 *   4. Set BLOB_READ_WRITE_TOKEN for Vercel Blob uploads
 *
 * This script:
 *   - Reads exported JSON files
 *   - Inserts data into Neon PostgreSQL (preserving IDs)
 *   - Uploads files to Vercel Blob
 *   - Updates document fileUrl values to new Vercel Blob URLs
 */

import { neon } from "@neondatabase/serverless";
import { drizzle } from "drizzle-orm/neon-http";
import { put } from "@vercel/blob";
import { readFileSync, existsSync, readdirSync } from "fs";
import { join } from "path";
import { sql } from "drizzle-orm";

const DATABASE_URL = process.env.DATABASE_URL;
const BLOB_TOKEN = process.env.BLOB_READ_WRITE_TOKEN;

if (!DATABASE_URL) {
  console.error("DATABASE_URL environment variable is required (Neon PostgreSQL)");
  process.exit(1);
}

const DATA_DIR = join(import.meta.dirname, "exported-data");
const FILES_DIR = join(DATA_DIR, "files");

function readJson(filename: string): any[] {
  const path = join(DATA_DIR, filename);
  if (!existsSync(path)) {
    console.warn(`  [SKIP] ${filename} not found`);
    return [];
  }
  return JSON.parse(readFileSync(path, "utf-8"));
}

async function main() {
  if (!existsSync(DATA_DIR)) {
    console.error(`Data directory not found: ${DATA_DIR}`);
    console.error("Run export-data.ts first.");
    process.exit(1);
  }

  console.log("Connecting to Neon PostgreSQL...");
  const queryClient = neon(DATABASE_URL!);
  const db = drizzle(queryClient);

  // Import tables in dependency order (parent tables first)
  const tableOrder = [
    "users",
    "patients",
    "documents",
    "virologyTests",
    "auditLogs",
    "uploadTokens",
    "uploadBatches",
    "chunkedUploadSessions",
  ];

  for (const table of tableOrder) {
    const rows = readJson(`${table}.json`);
    if (rows.length === 0) {
      console.log(`${table}: no data to import`);
      continue;
    }

    console.log(`Importing ${table} (${rows.length} rows)...`);

    // Convert MySQL timestamp strings to proper format & handle nulls
    const cleaned = rows.map((row: any) => {
      const r = { ...row };
      // Convert MySQL date strings to ISO format for PostgreSQL
      for (const [key, val] of Object.entries(r)) {
        if (val === null || val === undefined) continue;
        // MySQL datetime: "2024-01-15T12:00:00.000Z" or "2024-01-15 12:00:00"
        if (typeof val === "string" && /^\d{4}-\d{2}-\d{2}[T ]\d{2}:\d{2}:\d{2}/.test(val)) {
          r[key] = new Date(val).toISOString();
        }
      }
      return r;
    });

    // Build column list from first row
    const columns = Object.keys(cleaned[0]);
    const quotedColumns = columns.map((c) => `"${c}"`).join(", ");

    // Insert in batches of 50
    const BATCH_SIZE = 50;
    let inserted = 0;

    for (let i = 0; i < cleaned.length; i += BATCH_SIZE) {
      const batch = cleaned.slice(i, i + BATCH_SIZE);
      const valueSets = batch.map((row: any) => {
        const vals = columns.map((col) => {
          const v = row[col];
          if (v === null || v === undefined) return "NULL";
          if (typeof v === "number" || typeof v === "boolean") return String(v);
          // Escape single quotes
          return `'${String(v).replace(/'/g, "''")}'`;
        });
        return `(${vals.join(", ")})`;
      });

      const query = `INSERT INTO "${table}" (${quotedColumns}) VALUES ${valueSets.join(", ")} ON CONFLICT DO NOTHING`;
      try {
        await queryClient(query);
        inserted += batch.length;
      } catch (err: any) {
        console.error(`  Error inserting batch into ${table}:`, err.message);
        // Try one by one
        for (const row of batch) {
          const vals = columns.map((col) => {
            const v = row[col];
            if (v === null || v === undefined) return "NULL";
            if (typeof v === "number" || typeof v === "boolean") return String(v);
            return `'${String(v).replace(/'/g, "''")}'`;
          });
          const singleQuery = `INSERT INTO "${table}" (${quotedColumns}) VALUES (${vals.join(", ")}) ON CONFLICT DO NOTHING`;
          try {
            await queryClient(singleQuery);
            inserted++;
          } catch (e: any) {
            console.error(`    Row failed (id=${row.id}):`, e.message);
          }
        }
      }
    }

    console.log(`  -> ${inserted} rows imported`);

    // Reset serial sequence to max id + 1
    if (columns.includes("id")) {
      try {
        await queryClient(`SELECT setval(pg_get_serial_sequence('"${table}"', 'id'), COALESCE((SELECT MAX(id) FROM "${table}"), 0) + 1, false)`);
        console.log(`  -> Serial sequence reset for ${table}`);
      } catch (e: any) {
        console.warn(`  -> Could not reset sequence for ${table}:`, e.message);
      }
    }
  }

  // Migrate files to Vercel Blob
  if (BLOB_TOKEN && existsSync(FILES_DIR)) {
    console.log("\nMigrating files to Vercel Blob...");
    const files = readdirSync(FILES_DIR);
    let uploaded = 0;
    let failed = 0;

    // Build a map of docId -> file path
    const fileMap = new Map<number, string>();
    for (const f of files) {
      const match = f.match(/^(\d+)_(.+)$/);
      if (match) {
        fileMap.set(parseInt(match[1]), join(FILES_DIR, f));
      }
    }

    const docs = readJson("documents.json");
    for (const doc of docs) {
      const localPath = fileMap.get(doc.id);
      if (!localPath || !existsSync(localPath)) continue;

      try {
        const data = readFileSync(localPath);
        const blob = new Blob([data], { type: doc.mimeType || "application/octet-stream" });
        const result = await put(doc.fileKey || `uploads/${doc.id}`, blob, {
          contentType: doc.mimeType || "application/octet-stream",
          access: "public",
          token: BLOB_TOKEN,
        });

        // Update the document URL in the database
        await queryClient(
          `UPDATE documents SET "fileUrl" = '${result.url.replace(/'/g, "''")}' WHERE id = ${doc.id}`
        );

        uploaded++;
        if (uploaded % 10 === 0) {
          console.log(`  Uploaded ${uploaded}/${fileMap.size} files...`);
        }
      } catch (err: any) {
        console.warn(`  [FAIL] doc ${doc.id}: ${err.message}`);
        failed++;
      }
    }

    console.log(`File migration complete: ${uploaded} uploaded, ${failed} failed`);
  } else if (!BLOB_TOKEN) {
    console.log("\nSkipping file migration (BLOB_READ_WRITE_TOKEN not set)");
  }

  console.log("\nImport complete!");
}

main().catch((err) => {
  console.error("Import failed:", err);
  process.exit(1);
});
