const CACHE_NAME = 'ghostshell-v2';
const urlsToCache = [
  '/index.html',
  '/dashboard.html',
  '/tools.html',
  '/chat.html',
  '/ai.html',
  '/marketplace.html',
  '/admin.html',
  '/faq.html',
  '/css/style.css',
  '/js/matrix.js'
];

self.addEventListener('install', event => {
  event.waitUntil(
    caches.open(CACHE_NAME).then(cache => cache.addAll(urlsToCache))
  );
});

self.addEventListener('fetch', event => {
  event.respondWith(
    caches.match(event.request).then(response => response || fetch(event.request))
  );
});
