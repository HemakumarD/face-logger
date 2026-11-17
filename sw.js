/**
 * Face Logger – Service Worker v2
 * Cache-first for static assets, network-first for API calls
 * Background Sync for offline log queue
 */
const SW_VERSION  = 'fl-v2.0.0';
const STATIC_CACHE = `${SW_VERSION}-static`;
const QUEUE_STORE  = 'fl-sync-queue';

const STATIC_ASSETS = [
  './',
  './camera.html',
  './admin.html',
  './dashboard.html',
  './js/config.js',
  './manifest.json',
  './icons/icon.svg'
];

// ── INSTALL ────────────────────────────────────────────────────
self.addEventListener('install', e => {
  e.waitUntil(
    caches.open(STATIC_CACHE)
      .then(cache => cache.addAll(STATIC_ASSETS))
      .then(() => self.skipWaiting())
  );
});

// ── ACTIVATE ───────────────────────────────────────────────────
self.addEventListener('activate', e => {
  e.waitUntil(
    caches.keys()
      .then(keys => Promise.all(
        keys.filter(k => k !== STATIC_CACHE).map(k => caches.delete(k))
      ))
      .then(() => self.clients.claim())
  );
});

// ── FETCH ──────────────────────────────────────────────────────
self.addEventListener('fetch', e => {
  const url = new URL(e.request.url);

  // Let Apps Script calls go straight through
  if (url.hostname.includes('script.google.com') ||
      url.hostname.includes('googleapis.com') ||
      url.hostname.includes('accounts.google.com')) {
    return; // network only
  }

  // face-api.js models from CDN: cache-first with long TTL
  if (url.hostname.includes('jsdelivr.net') || url.hostname.includes('unpkg.com')) {
    e.respondWith(
      caches.match(e.request).then(cached => cached || fetch(e.request).then(res => {
        const clone = res.clone();
        caches.open(STATIC_CACHE).then(c => c.put(e.request, clone));
        return res;
      }))
    );
    return;
  }

  // Static assets: cache-first
  e.respondWith(
    caches.match(e.request).then(cached => {
      if (cached) return cached;
      return fetch(e.request).then(res => {
        if (res.ok && e.request.method === 'GET') {
          const clone = res.clone();
          caches.open(STATIC_CACHE).then(c => c.put(e.request, clone));
        }
        return res;
      }).catch(() => {
        // Offline fallback for HTML
        if (e.request.headers.get('accept')?.includes('text/html')) {
          return caches.match('./');
        }
      });
    })
  );
});

// ── BACKGROUND SYNC ────────────────────────────────────────────
self.addEventListener('sync', e => {
  if (e.tag === 'fl-log-sync') {
    e.waitUntil(flushQueue());
  }
});

async function flushQueue() {
  const db  = await openDB();
  const tx  = db.transaction(QUEUE_STORE, 'readwrite');
  const all = await getAllRecords(tx.objectStore(QUEUE_STORE));

  if (!all.length) return;

  // Group by slot URL
  const groups = {};
  all.forEach(r => {
    if (!groups[r.url]) groups[r.url] = [];
    groups[r.url].push(r);
  });

  for (const [url, records] of Object.entries(groups)) {
    for (const rec of records) {
      try {
        const res = await fetch(url, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ action: 'log', token: rec.token, entry: rec.entry })
        });
        if (res.ok) {
          const tx2 = db.transaction(QUEUE_STORE, 'readwrite');
          tx2.objectStore(QUEUE_STORE).delete(rec.id);
        }
      } catch (_) { /* remain in queue */ }
    }
  }
}

// ── INDEXEDDB HELPERS ──────────────────────────────────────────
function openDB() {
  return new Promise((resolve, reject) => {
    const req = indexedDB.open('FaceLoggerDB', 1);
    req.onupgradeneeded = e => {
      const db = e.target.result;
      if (!db.objectStoreNames.contains(QUEUE_STORE)) {
        db.createObjectStore(QUEUE_STORE, { keyPath: 'id', autoIncrement: true });
      }
    };
    req.onsuccess = e => resolve(e.target.result);
    req.onerror   = e => reject(e.target.error);
  });
}

function getAllRecords(store) {
  return new Promise((resolve, reject) => {
    const req = store.getAll();
    req.onsuccess = e => resolve(e.target.result);
    req.onerror   = e => reject(e.target.error);
  });
}

// ── PUSH NOTIFICATIONS (future) ────────────────────────────────
self.addEventListener('push', e => {
  const data = e.data?.json() || {};
  e.waitUntil(
    self.registration.showNotification(data.title || 'Face Logger Alert', {
      body:  data.body  || 'New entry detected',
      icon:  './icons/icon.svg',
      badge: './icons/icon.svg',
      tag:   'fl-alert'
    })
  );
});

self.addEventListener('notificationclick', e => {
  e.notification.close();
  e.waitUntil(clients.openWindow('./dashboard.html'));
});
