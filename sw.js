const CACHE_NAME = 'jmas-v1';

const ASSETS = [
    '/',
    '/index.html',
    '/manifest.json',
    '/styles.css',
    '/js/app.js',
    '/js/bus.js',
    '/js/lessons.js',
    '/js/player.js',
    '/js/pwa.js',
    '/js/storage.js',
    '/js/ui.js',
    '/lessons.json',
    'logo.jpg'
];

self.addEventListener('install', (e) => {
    self.skipWaiting();
    e.waitUntil(
        caches.open(CACHE_NAME).then((cache) => cache.addAll(ASSETS))
    );
});

self.addEventListener('activate', (e) => {
    e.waitUntil(
        caches.keys().then((keys) => Promise.all(
            keys.map((key) => {
                if (key !== CACHE_NAME) return caches.delete(key);
            })
        )).then(() => clients.claim())
    );
});

self.addEventListener('fetch', (e) => {
    e.respondWith(
        caches.match(e.request).then((res) => res || fetch(e.request))
    );
});