const CACHE_NAME = 'shape-v42';
const ASSETS = [
  '/',
  '/index.html',
  '/home.html',
  '/styles.css',
  '/app.js',
  '/logo.png',
  '/trainers.html',
  '/nutritionists.html',
  '/marketplace.html',
  '/pricing.html',
  '/contact.html',
  '/landing.html',
  '/login.html',
  '/clients.html',
  '/nutrition-schedule.html',
  '/trainer-dashboard.html',
  '/messages.html',
  '/consultation.html',
  '/signup-client.html',
  '/signup-trainer.html',
  '/signup-nutritionist.html',
  '/signup-gym.html'
];

self.addEventListener('install', e => {
  e.waitUntil(
    // Delete ALL old caches first, then cache fresh assets
    caches.keys()
      .then(keys => Promise.all(keys.map(k => caches.delete(k))))
      .then(() => caches.open(CACHE_NAME).then(cache => cache.addAll(ASSETS)))
  );
  self.skipWaiting();
});

self.addEventListener('activate', e => {
  e.waitUntil(
    caches.keys().then(keys =>
      Promise.all(keys.filter(k => k !== CACHE_NAME).map(k => caches.delete(k)))
    )
  );
  self.clients.claim();
});

self.addEventListener('fetch', e => {
  // Always go network-first, never serve stale HTML pages from cache
  const url = new URL(e.request.url);
  const isHTML = url.pathname.endsWith('.html') || url.pathname === '/';

  if (isHTML) {
    // HTML pages: network only, no cache fallback
    e.respondWith(fetch(e.request));
    return;
  }

  e.respondWith(
    fetch(e.request)
      .then(res => {
        const clone = res.clone();
        caches.open(CACHE_NAME).then(cache => cache.put(e.request, clone));
        return res;
      })
      .catch(() => caches.match(e.request))
  );
});
