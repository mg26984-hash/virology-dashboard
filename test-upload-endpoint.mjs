import fs from "fs";
import { storagePut } from "./server/storage.js";

// Read the actual virology report image
const imagePath = "/home/ubuntu/upload/5999e776-3464-41e4-bbe1-43730f564f58.jpeg";
const imageBuffer = fs.readFileSync(imagePath);

console.log("Original buffer size:", imageBuffer.length, "bytes");

// Simulate frontend: convert to base64
const base64 = imageBuffer.toString('base64');
console.log("Base64 length:", base64.length, "chars");

// Simulate backend: convert back to buffer
const decodedBuffer = Buffer.from(base64, 'base64');
console.log("Decoded buffer size:", decodedBuffer.length, "bytes");

// Upload to S3
const fileKey = `test-upload-endpoint-${Date.now()}.jpg`;
try {
  const result = await storagePut(fileKey, decodedBuffer, "image/jpeg");
  console.log("Upload result:", result);
  
  // Check the uploaded file size
  const response = await fetch(result.url, { method: 'HEAD' });
  console.log("Uploaded file content-length:", response.headers.get('content-length'));
} catch (error) {
  console.error("Upload error:", error);
}
