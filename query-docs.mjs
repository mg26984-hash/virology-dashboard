import { drizzle } from "drizzle-orm/mysql2";
import { documents } from "./drizzle/schema.js";
import { desc } from "drizzle-orm";

const db = drizzle(process.env.DATABASE_URL);
const docs = await db.select({
  id: documents.id,
  fileName: documents.fileName,
  processingStatus: documents.processingStatus,
  processingError: documents.processingError,
  fileSize: documents.fileSize,
  createdAt: documents.createdAt
}).from(documents).orderBy(desc(documents.createdAt)).limit(10);
console.log(JSON.stringify(docs, null, 2));
process.exit(0);
