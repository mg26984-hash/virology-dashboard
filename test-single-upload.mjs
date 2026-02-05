import { storagePut } from "./server/storage.js";
import { processUploadedDocument } from "./server/documentProcessor.js";
import { drizzle } from "drizzle-orm/mysql2";
import { documents } from "./drizzle/schema.js";
import fs from "fs";
import { nanoid } from "nanoid";

const db = drizzle(process.env.DATABASE_URL);

// Read the test image
const imageBuffer = fs.readFileSync("/home/ubuntu/test-virology/00000005-PHOTO-2023-11-16-14-41-00.jpg");
console.log("Image size:", imageBuffer.length, "bytes");

// Upload to S3
const fileKey = `virology-reports/test/${nanoid()}-test-report.jpg`;
const { url } = await storagePut(fileKey, imageBuffer, "image/jpeg");
console.log("Uploaded to:", url);

// Create document record
const [result] = await db.insert(documents).values({
  uploadedBy: 1,
  fileName: "test-report.jpg",
  fileKey: fileKey,
  fileUrl: url,
  mimeType: "image/jpeg",
  fileSize: imageBuffer.length,
  processingStatus: "pending",
}).$returningId();

console.log("Document created with ID:", result.id);

// Process the document
console.log("Starting processing...");
const processResult = await processUploadedDocument(result.id, url, "image/jpeg");
console.log("Processing result:", JSON.stringify(processResult, null, 2));

process.exit(0);
