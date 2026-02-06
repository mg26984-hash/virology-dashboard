// Test the complete ZIP upload flow - simulating browser behavior
import fs from 'fs';
import path from 'path';

const ZIP_PATH = '/home/ubuntu/upload/Virology.zip';
const API_URL = 'http://localhost:3000/api/trpc';
const CHUNK_SIZE = 5 * 1024 * 1024; // 5MB chunks

async function testZipUpload() {
  console.log('=== Testing ZIP Upload Flow ===\n');
  
  // Check if file exists
  if (!fs.existsSync(ZIP_PATH)) {
    console.error('ZIP file not found:', ZIP_PATH);
    return;
  }
  
  const stats = fs.statSync(ZIP_PATH);
  console.log(`File: ${ZIP_PATH}`);
  console.log(`Size: ${(stats.size / 1024 / 1024).toFixed(2)} MB`);
  
  const totalChunks = Math.ceil(stats.size / CHUNK_SIZE);
  console.log(`Chunks: ${totalChunks} (${CHUNK_SIZE / 1024 / 1024}MB each)\n`);
  
  const uploadId = `test-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`;
  console.log(`Upload ID: ${uploadId}\n`);
  
  try {
    // Step 1: Initialize chunked upload
    console.log('Step 1: Initializing chunked upload...');
    const initResponse = await fetch(`${API_URL}/documents.initChunkedUpload`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Cookie': 'manus_session=test' // Will need real session
      },
      body: JSON.stringify({
        json: {
          uploadId,
          fileName: 'Virology.zip',
          totalChunks,
          totalSize: stats.size
        }
      })
    });
    
    const initResult = await initResponse.json();
    console.log('Init response:', JSON.stringify(initResult, null, 2));
    
    if (initResult.error) {
      console.error('Init failed:', initResult.error);
      return;
    }
    
    // Step 2: Upload chunks
    console.log('\nStep 2: Uploading chunks...');
    const fileBuffer = fs.readFileSync(ZIP_PATH);
    
    for (let i = 0; i < totalChunks; i++) {
      const start = i * CHUNK_SIZE;
      const end = Math.min(start + CHUNK_SIZE, stats.size);
      const chunk = fileBuffer.slice(start, end);
      const chunkBase64 = chunk.toString('base64');
      
      console.log(`  Uploading chunk ${i + 1}/${totalChunks} (${chunk.length} bytes, ${chunkBase64.length} base64 chars)...`);
      
      const chunkResponse = await fetch(`${API_URL}/documents.uploadChunk`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          json: {
            uploadId,
            chunkIndex: i,
            chunkData: chunkBase64
          }
        })
      });
      
      const chunkResult = await chunkResponse.json();
      if (chunkResult.error) {
        console.error(`  Chunk ${i + 1} failed:`, chunkResult.error);
        return;
      }
      
      const progress = Math.round(((i + 1) / totalChunks) * 100);
      console.log(`  Chunk ${i + 1}/${totalChunks} uploaded (${progress}%)`);
    }
    
    // Step 3: Finalize upload
    console.log('\nStep 3: Finalizing upload...');
    const finalizeResponse = await fetch(`${API_URL}/documents.finalizeChunkedUpload`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        json: { uploadId }
      })
    });
    
    const finalizeResult = await finalizeResponse.json();
    console.log('Finalize response:', JSON.stringify(finalizeResult, null, 2));
    
    if (finalizeResult.result?.data?.json) {
      const result = finalizeResult.result.data.json;
      console.log('\n=== Upload Complete ===');
      console.log(`Total files: ${result.total}`);
      console.log(`Successful: ${result.successful}`);
      console.log(`Failed: ${result.failed}`);
    }
    
  } catch (error) {
    console.error('Error:', error);
  }
}

testZipUpload();
