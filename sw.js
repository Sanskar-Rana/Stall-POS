/* StallPOS v2 — service worker: saves every app file on the device so the Home Screen app opens with no internet.
   Bump CACHE when files change; the new version is picked up the next time the app is opened online. */
const CACHE = 'stallpos-v2-4';
const FILES = [
  './', './index.html', './css/styles.css', './manifest.webmanifest',
  './icons/icon-180.png', './icons/icon-192.png', './icons/icon-512.png',
  './js/util.js', './js/domain.js', './js/db.js', './js/store.js', './js/sample.js', './js/qr.js', './js/app.js',
  './js/ui/core.js', './js/ui/lock.js', './js/ui/register.js', './js/ui/queue.js', './js/ui/stock.js',
  './js/ui/plan.js', './js/ui/menu.js', './js/ui/shift.js', './js/ui/reports.js', './js/ui/settings.js'
];
self.addEventListener('install', e => e.waitUntil(caches.open(CACHE).then(c => c.addAll(FILES)).then(() => self.skipWaiting())));
self.addEventListener('activate', e => e.waitUntil(
  caches.keys().then(keys => Promise.all(keys.filter(k => k !== CACHE).map(k => caches.delete(k)))).then(() => self.clients.claim())));
// Cache first (works offline); page loads fall back to index.html
self.addEventListener('fetch', e => {
  if (e.request.method !== 'GET') return;
  e.respondWith(caches.match(e.request, { ignoreSearch: true }).then(r => r || fetch(e.request).catch(() =>
    e.request.mode === 'navigate' ? caches.match('./index.html') : Response.error())));
});
