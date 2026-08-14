// v133: runtime caching narrowed to SAME-ORIGIN assets — the version bump also
// deletes every prior cache generation on install/activate, which matters
// beyond hygiene: older generations could hold cross-origin signed media
// (progress photos, credential files) cached token-and-all.
const CACHE_NAME = 'shape-v133';
const ASSETS = [
  '/',
  '/index.html',
  '/home.html',
  '/styles.css',
  '/app.js',
  '/pwa-install.js',
  '/manifest.json',
  '/icon-192.png',
  '/icon-512.png',
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
  '/newdesign/consultation.html',
  '/signup-client.html',
  '/signup-trainer.html',
  '/signup-nutritionist.html',
  '/signup-gym.html',
  '/my-workouts.html',
  '/workout.html'
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
  // Only handle GET — Cache.put rejects POST/PUT/DELETE and those are
  // server actions / API calls we never want to cache anyway.
  if (e.request.method !== 'GET') return;

  // NEVER touch cross-origin requests. The old cache.put had no origin check,
  // so authenticated SIGNED media URLs (Supabase storage: progress photos,
  // meal-note memos, application/credential files — extension-bearing, token in
  // the query string) were written into CacheStorage and outlived sign-out.
  // Cross-origin subresources lose nothing here: they were only ever served
  // from cache as an offline fallback.
  const url = new URL(e.request.url);
  if (url.origin !== self.location.origin) return;

  // Always go network-first, never serve stale HTML pages from cache.
  // "HTML" here means both legacy .html files AND app-router routes
  // (which have no file extension — e.g. /pricing, /login, /dashboard).
  const hasExtension = /\.[a-z0-9]{1,6}$/i.test(url.pathname);
  const isHTML = !hasExtension || url.pathname.endsWith('.html') || url.pathname === '/';

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
