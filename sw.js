/**
 * Face Logger v2 – Service Worker
 * Caches the app shell so the camera view loads even on a slow
 * connection, and satisfies Chrome's PWA install requirement.
 */

const CACHE  = 'fl-v2-shell-3';
const SHELL  = [
  '/',
  '/index.html',
  '/camera.html',
  '/admin.html',
  '/dashboard.html',
  '/manifest.json',
  '/icons/icon-192.png',
  '/icons/icon-512.png'
];

// ── INSTALL: pre-cache the app shell ──────────────────────────
self.addEventListener('install', e => {
  e.waitUntil(
    caches.open(CACHE)
      .then(c => c.addAll(SHELL).catch(() => {})) // fail open — don't block install
      .then(() => self.skipWaiting())
  );
});

// ── ACTIVATE: clean up old caches ─────────────────────────────
self.addEventListener('activate', e => {
  e.waitUntil(
    caches.keys().then(keys =>
      Promise.all(keys.filter(k => k !== CACHE).map(k => caches.delete(k)))
    ).then(() => self.clients.claim())
  );
});

// ── FETCH: network-first for API calls, cache-first for shell ──
self.addEventListener('fetch', e => {
  const url = new URL(e.request.url);

  // Always go to the network for Apps Script and CDN requests
  if (url.hostname.includes('google') ||
      url.hostname.includes('jsdelivr') ||
      url.hostname.includes('googleapis')) {
    return; // let the browser handle it normally
  }

  // Cache-first for everything else (app shell)
  e.respondWith(
    caches.match(e.request).then(cached => {
      if (cached) return cached;
      return fetch(e.request).then(resp => {
        // Cache successful GET responses for the shell
        if (e.request.method === 'GET' && resp && resp.status === 200) {
          const clone = resp.clone();
          caches.open(CACHE).then(c => c.put(e.request, clone)).catch(() => {});
        }
        return resp;
      }).catch(() => cached || new Response('Offline', { status: 503 }));
    })
  );
});
