import fs from "fs";

// Read the actual virology report image
const imagePath = "/home/ubuntu/upload/5999e776-3464-41e4-bbe1-43730f564f58.jpeg";
const imageBuffer = fs.readFileSync(imagePath);

console.log("Original image size:", imageBuffer.length, "bytes");

// Convert to base64 (simulating what the frontend does)
const base64 = imageBuffer.toString('base64');
console.log("Base64 length:", base64.length, "chars");

// Convert back to buffer (simulating what the backend does)
const decodedBuffer = Buffer.from(base64, 'base64');
console.log("Decoded buffer size:", decodedBuffer.length, "bytes");

// Check if they match
console.log("Buffers match:", Buffer.compare(imageBuffer, decodedBuffer) === 0);
