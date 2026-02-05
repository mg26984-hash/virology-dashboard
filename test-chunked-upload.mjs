import fs from 'fs';
import path from 'path';

const CHUNK_SIZE = 5 * 1024 * 1024; // 5MB chunks

async function testChunkedUpload() {
  const zipPath = '/home/ubuntu/upload/Virology.zip';
  const fileBuffer = fs.readFileSync(zipPath);
  const fileName = path.basename(zipPath);
  const totalSize = fileBuffer.length;
  const totalChunks = Math.ceil(totalSize / CHUNK_SIZE);
  const uploadId = `test-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`;

  console.log(`Testing chunked upload: ${fileName}`);
  console.log(`File size: ${(totalSize / 1024 / 1024).toFixed(2)} MB`);
  console.log(`Total chunks: ${totalChunks}`);
  console.log(`Upload ID: ${uploadId}`);

  // Import the chunk manager
  const { initChunkedUpload, addChunk, getCompleteFile, cleanupUpload } = await import('./server/chunkManager.ts');

  // Initialize upload
  initChunkedUpload(uploadId, fileName, totalChunks, totalSize, 1);
  console.log('Upload initialized');

  // Upload chunks
  for (let i = 0; i < totalChunks; i++) {
    const start = i * CHUNK_SIZE;
    const end = Math.min(start + CHUNK_SIZE, totalSize);
    const chunk = fileBuffer.slice(start, end);
    
    const result = addChunk(uploadId, i, chunk);
    console.log(`Chunk ${i + 1}/${totalChunks}: ${chunk.length} bytes, complete: ${result.complete}`);
  }

  // Get complete file
  const completeFile = getCompleteFile(uploadId);
  if (completeFile) {
    console.log(`\nReassembled file: ${completeFile.buffer.length} bytes`);
    console.log(`Original size: ${totalSize} bytes`);
    console.log(`Match: ${completeFile.buffer.length === totalSize}`);
    
    // Test ZIP extraction
    const AdmZip = (await import('adm-zip')).default;
    const zip = new AdmZip(completeFile.buffer);
    const entries = zip.getEntries();
    const validEntries = entries.filter(e => !e.isDirectory && !e.entryName.startsWith('__MACOSX'));
    console.log(`\nZIP contains ${validEntries.length} valid files`);
  }

  cleanupUpload(uploadId);
  console.log('\nTest completed successfully!');
}

testChunkedUpload().catch(console.error);
