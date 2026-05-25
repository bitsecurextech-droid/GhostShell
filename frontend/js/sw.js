// sw.js – Service Worker for GHOST SHELL
const CACHE_NAME = 'ghost-shell-v1';
const urlsToCache = [
    '/',
    '/index.html',
    '/dashboard.html',
    '/tools.html',
    '/chat.html',
    '/ai.html',
    '/marketplace.html',
    '/esim-shop.html',
    '/virtual-numbers.html',
    '/logistics-tracking.html',
    '/blog.html',
    '/admin.html',
    '/disclaimer.html',
    '/privacy.html',
    '/agreement.html',
    '/faq.html',
    '/css/style.css',
    '/js/matrix.js',
    '/js/common.js',
    '/js/dashboard.js',
    '/js/tools.js',
    '/js/chat.js',
    '/js/ai.js',
    '/js/marketplace.js',
    '/js/esim-shop.js',
    '/js/virtual-numbers.js',
    '/js/logistics-tracking.js',
    '/js/blog.js',
    '/manifest.json'
];

// Install event – cache core files
self.addEventListener('install', event => {
    event.waitUntil(
        caches.open(CACHE_NAME)
            .then(cache => cache.addAll(urlsToCache))
            .then(() => self.skipWaiting())
    );
});

// Fetch event – serve from cache then network
self.addEventListener('fetch', event => {
    event.respondWith(
        caches.match(event.request)
            .then(response => response || fetch(event.request))
    );
});

// Activate event – clean old caches
self.addEventListener('activate', event => {
    event.waitUntil(
        caches.keys().then(cacheNames => {
            return Promise.all(
                cacheNames.map(cache => {
                    if (cache !== CACHE_NAME) {
                        return caches.delete(cache);
                    }
                })
            );
        }).then(() => self.clients.claim())
    );
});
