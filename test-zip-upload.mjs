import AdmZip from "adm-zip";
import { storagePut } from "./server/storage.js";
import { processUploadedDocument } from "./server/documentProcessor.js";
import { drizzle } from "drizzle-orm/mysql2";
import { documents } from "./drizzle/schema.js";
import fs from "fs";
import { nanoid } from "nanoid";

const db = drizzle(process.env.DATABASE_URL);

// Read the ZIP file
const zipPath = "/home/ubuntu/upload/Virology.zip";
const zipBuffer = fs.readFileSync(zipPath);
console.log("ZIP file size:", zipBuffer.length, "bytes");

// Extract and process
const zip = new AdmZip(zipBuffer);
const zipEntries = zip.getEntries();
console.log("Total entries in ZIP:", zipEntries.length);

const allowedExtensions = ['.jpg', '.jpeg', '.png', '.pdf'];
const validEntries = zipEntries.filter(entry => {
  if (entry.isDirectory) return false;
  const fileName = entry.entryName.split('/').pop() || '';
  if (fileName.startsWith('.') || fileName.startsWith('__MACOSX')) return false;
  const ext = fileName.toLowerCase().slice(fileName.lastIndexOf('.'));
  return allowedExtensions.includes(ext);
});

console.log("Valid files in ZIP:", validEntries.length);

// Process first 3 files as a test
const testEntries = validEntries.slice(0, 3);
for (const entry of testEntries) {
  try {
    const fileName = entry.entryName.split('/').pop() || entry.entryName;
    const fileBuffer = entry.getData();
    const ext = fileName.toLowerCase().slice(fileName.lastIndexOf('.'));
    
    let mimeType = 'application/octet-stream';
    if (ext === '.jpg' || ext === '.jpeg') mimeType = 'image/jpeg';
    else if (ext === '.png') mimeType = 'image/png';
    else if (ext === '.pdf') mimeType = 'application/pdf';
    
    console.log(`\nProcessing: ${fileName} (${fileBuffer.length} bytes, ${mimeType})`);
    
    // Upload to S3
    const fileKey = `virology-reports/zip-test/${nanoid()}-${fileName}`;
    const { url } = await storagePut(fileKey, fileBuffer, mimeType);
    console.log("Uploaded to:", url);
    
    // Create document record
    const [result] = await db.insert(documents).values({
      uploadedBy: 1,
      fileName: fileName,
      fileKey: fileKey,
      fileUrl: url,
      mimeType: mimeType,
      fileSize: fileBuffer.length,
      processingStatus: "pending",
    }).$returningId();
    
    console.log("Document ID:", result.id);
    
    // Process the document
    const processResult = await processUploadedDocument(result.id, url, mimeType);
    console.log("Result:", processResult.status, processResult.testsCreated ? `(${processResult.testsCreated} tests)` : (processResult.error || ''));
  } catch (error) {
    console.error("Error processing file:", error.message);
  }
}

process.exit(0);
