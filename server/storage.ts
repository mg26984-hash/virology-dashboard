// Vercel Blob storage helpers
// Replaces the previous Manus Forge storage proxy

import { put, del } from '@vercel/blob';

function normalizeKey(relKey: string): string {
  return relKey.replace(/^\/+/, "");
}

export async function storagePut(
  relKey: string,
  data: Buffer | Uint8Array | string,
  contentType = "application/octet-stream"
): Promise<{ key: string; url: string }> {
  const key = normalizeKey(relKey);

  // Vercel Blob's put() accepts Buffer, string, ReadableStream, or Blob directly
  const body = typeof data === "string" ? data : Buffer.from(data);

  const result = await put(key, body, {
    contentType,
    access: "public",
  });

  return { key, url: result.url };
}

export async function storageDelete(relKey: string): Promise<boolean> {
  try {
    const key = normalizeKey(relKey);
    await del(key);
    return true;
  } catch (error) {
    console.error(`[Storage] Failed to delete ${relKey}:`, error);
    return false;
  }
}

export async function storageGet(relKey: string): Promise<{ key: string; url: string }> {
  const key = normalizeKey(relKey);
  // Vercel Blob URLs are stored in the database at upload time.
  // This function returns the key; the caller should use the URL from the DB.
  return { key, url: "" };
}
