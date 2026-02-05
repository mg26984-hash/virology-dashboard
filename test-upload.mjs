import { storagePut } from "./server/storage.js";
import fs from "fs";

// Read the actual virology report image
const imagePath = "/home/ubuntu/upload/5999e776-3464-41e4-bbe1-43730f564f58.jpeg";
const imageBuffer = fs.readFileSync(imagePath);

console.log("Image size:", imageBuffer.length, "bytes");

try {
  const result = await storagePut("test-virology-report.jpg", imageBuffer, "image/jpeg");
  console.log("Upload result:", result);
} catch (error) {
  console.error("Upload error:", error);
}
