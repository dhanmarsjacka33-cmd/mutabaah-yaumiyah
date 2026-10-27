const CACHE_NAME = 'mutabaah-cache-v1';
const ASSETS_TO_CACHE = [
  './',
  './index.html',
  './style.css',
  './app.js',
  './manifest.json',
  'https://cdn.tailwindcss.com',
  'https://cdn.jsdelivr.net/npm/chart.js',
  'https://cdnjs.cloudflare.com/ajax/libs/font-awesome/6.4.0/css/all.min.css',
  'https://fonts.googleapis.com/css2?family=Plus+Jakarta+Sans:wght@400;500;600;700;800&display=swap'
];

// Proses Install: Simpan aset ke cache
self.addEventListener('install', (e) => {
  e.waitUntil(
    caches.open(CACHE_NAME).then((cache) => cache.addAll(ASSETS_TO_CACHE))
  );
  self.skipWaiting();
});

// Proses Activate: Hapus cache lama jika ada update
self.addEventListener('activate', (e) => {
  e.waitUntil(
    caches.keys().then((keys) => {
      return Promise.all(
        keys.map((key) => {
          if (key !== CACHE_NAME) return caches.delete(key);
        })
      );
    })
  );
  self.clients.claim();
});

// Proses Fetch: Ambil dari cache dulu, jika tidak ada baru ke internet
self.addEventListener('fetch', (e) => {
  // JANGAN cache request POST ke Google Apps Script (API)
  if (e.request.method !== 'GET' || e.request.url.includes('script.google.com')) {
    return;
  }
  
  e.respondWith(
    caches.match(e.request).then((cachedResponse) => {
      return cachedResponse || fetch(e.request).then((response) => {
        return caches.open(CACHE_NAME).then((cache) => {
          cache.put(e.request, response.clone());
          return response;
        });
      });
    }).catch(() => {
      // Jika offline dan aset tidak ditemukan di cache, buka index.html
      if (e.request.mode === 'navigate') {
        return caches.match('./index.html');
      }
    })
  );
});