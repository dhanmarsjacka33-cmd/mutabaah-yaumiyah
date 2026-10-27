const CACHE_NAME = 'mutabaah-cache-v2'; // Versi dinaikkan agar cache lama terhapus
const ASSETS_TO_CACHE = [
  './',
  './index.html',
  './style.css',
  './app.js',
  './manifest.json'
  // URL CDN eksternal dihapus dari sini untuk mencegah kegagalan instalasi
];

// Proses Install: Simpan aset lokal ke cache
self.addEventListener('install', (e) => {
  e.waitUntil(
    caches.open(CACHE_NAME).then((cache) => {
      // Simpan satu per satu. Jika ada yang gagal, abaikan dan lanjutkan.
      return Promise.all(
        ASSETS_TO_CACHE.map((url) => {
          return cache.add(url).catch((err) => {
            console.warn('Gagal menyimpan ke cache:', url, err);
          });
        })
      );
    })
  );
  self.skipWaiting();
});

// Proses Activate: Hapus cache lama
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

// Proses Fetch: Ambil dari cache, jika tidak ada ambil dari internet
self.addEventListener('fetch', (e) => {
  // Jangan intersepsi request POST ke Google Apps Script
  if (e.request.method !== 'GET' || e.request.url.includes('script.google.com')) {
    return;
  }
  
  e.respondWith(
    caches.match(e.request).then((cachedResponse) => {
      return cachedResponse || fetch(e.request).then((response) => {
        // Hanya cache response yang valid dan bukan opaque (untuk menghindari error)
        if (response && response.status === 200 && response.type === 'basic') {
          const responseClone = response.clone();
          caches.open(CACHE_NAME).then((cache) => {
            cache.put(e.request, responseClone);
          });
        }
        return response;
      });
    }).catch(() => {
      // Jika offline dan request adalah navigasi halaman, tampilkan index.html
      if (e.request.mode === 'navigate') {
        return caches.match('./index.html');
      }
    })
  );
});