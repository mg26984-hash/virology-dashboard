/**
 * One-time data export from the Manus MySQL database.
 *
 * Usage:
 *   DATABASE_URL="mysql://..." npx tsx scripts/export-data.ts
 *
 * Exports all tables to JSON files in scripts/exported-data/.
 * Also downloads uploaded files referenced in the documents table.
 */

import { drizzle } from "drizzle-orm/mysql2";
import mysql from "mysql2/promise";
import { writeFileSync, mkdirSync, existsSync } from "fs";
import { join } from "path";

const DATABASE_URL = process.env.DATABASE_URL;
if (!DATABASE_URL) {
  console.error("DATABASE_URL environment variable is required");
  process.exit(1);
}

const OUTPUT_DIR = join(import.meta.dirname, "exported-data");
const FILES_DIR = join(OUTPUT_DIR, "files");

async function main() {
  mkdirSync(OUTPUT_DIR, { recursive: true });
  mkdirSync(FILES_DIR, { recursive: true });

  console.log("Connecting to MySQL database...");
  const connection = await mysql.createConnection(DATABASE_URL!);

  const tables = [
    "users",
    "patients",
    "virologyTests",
    "documents",
    "auditLogs",
    "uploadTokens",
    "uploadBatches",
    "chunkedUploadSessions",
  ];

  for (const table of tables) {
    console.log(`Exporting ${table}...`);
    const [rows] = await connection.execute(`SELECT * FROM \`${table}\``);
    const data = rows as any[];
    const outPath = join(OUTPUT_DIR, `${table}.json`);
    writeFileSync(outPath, JSON.stringify(data, null, 2));
    console.log(`  -> ${data.length} rows written to ${outPath}`);
  }

  // Download uploaded files
  console.log("\nDownloading uploaded files...");
  const [docRows] = await connection.execute(
    "SELECT id, fileUrl, fileKey FROM documents WHERE fileUrl IS NOT NULL AND fileUrl != ''"
  );
  const docs = docRows as Array<{ id: number; fileUrl: string; fileKey: string }>;

  let downloaded = 0;
  let failed = 0;

  for (const doc of docs) {
    try {
      const response = await fetch(doc.fileUrl);
      if (!response.ok) {
        console.warn(`  [SKIP] doc ${doc.id}: HTTP ${response.status}`);
        failed++;
        continue;
      }
      const buffer = Buffer.from(await response.arrayBuffer());
      const safeName = doc.fileKey.replace(/\//g, "_");
      const filePath = join(FILES_DIR, `${doc.id}_${safeName}`);
      writeFileSync(filePath, buffer);
      downloaded++;
      if (downloaded % 10 === 0) {
        console.log(`  Downloaded ${downloaded}/${docs.length} files...`);
      }
    } catch (error: any) {
      console.warn(`  [FAIL] doc ${doc.id}: ${error.message}`);
      failed++;
    }
  }

  console.log(`\nFile download complete: ${downloaded} downloaded, ${failed} failed out of ${docs.length} total`);

  await connection.end();
  console.log("\nExport complete! Data saved to:", OUTPUT_DIR);
}

main().catch((err) => {
  console.error("Export failed:", err);
  process.exit(1);
});
