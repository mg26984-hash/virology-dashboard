import { drizzle } from "drizzle-orm/mysql2";
import { documents } from "./drizzle/schema.js";
import { desc } from "drizzle-orm";

const db = drizzle(process.env.DATABASE_URL);
const docs = await db.select().from(documents).orderBy(desc(documents.createdAt)).limit(5);
console.log(JSON.stringify(docs, null, 2));
process.exit(0);
