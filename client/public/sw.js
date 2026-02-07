// Service Worker for Virology Dashboard PWA
// Handles Web Share Target API for Android share-to functionality

const CACHE_NAME = 'virology-share-v1';

self.addEventListener('install', (event) => {
  self.skipWaiting();
});

self.addEventListener('activate', (event) => {
  event.waitUntil(clients.claim());
});

self.addEventListener('fetch', (event) => {
  const url = new URL(event.request.url);

  // Intercept share target POST requests
  if (url.pathname === '/share-target' && event.request.method === 'POST') {
    event.respondWith(handleShareTarget(event.request));
    return;
  }
});

async function handleShareTarget(request) {
  try {
    const formData = await request.formData();
    const files = formData.getAll('images');

    if (!files || files.length === 0) {
      return Response.redirect('/upload?share_error=no_files', 303);
    }

    // Store files in cache for the upload page to pick up
    const cache = await caches.open(CACHE_NAME);
    const fileData = [];

    for (let i = 0; i < files.length; i++) {
      const file = files[i];
      if (file instanceof File) {
        const cacheKey = `/share-cache/file-${i}-${Date.now()}`;
        await cache.put(cacheKey, new Response(file, {
          headers: {
            'Content-Type': file.type,
            'X-File-Name': file.name,
            'X-File-Size': String(file.size),
          }
        }));
        fileData.push(cacheKey);
      }
    }

    // Redirect to upload page with share indicator
    const params = new URLSearchParams({ shared: 'true', count: String(fileData.length) });
    return Response.redirect(`/quick-upload?${params.toString()}`, 303);
  } catch (error) {
    console.error('[SW] Share target error:', error);
    return Response.redirect('/upload?share_error=processing_failed', 303);
  }
}
