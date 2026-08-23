const CACHE_NAME = 'jmas-v2';

// App-shell assets. Bump CACHE_NAME whenever you ship changes to these files
// (a stale shell is worse than a re-download). lessons.json is intentionally
// NOT here — it updates daily and is handled with stale-while-revalidate below.
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
    'logo.jpg',
    'icons/icon-192.png',
    'icons/icon-512.png',
    'icons/icon-512-maskable.png'
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
    const req = e.request;
    const url = new URL(req.url);

    // lessons.json: serve the cached copy instantly (great on slow connections),
    // then refresh it in the background so new lessons appear automatically.
    if (url.pathname.endsWith('/lessons.json')) {
        e.respondWith(staleWhileRevalidate(req));
        return;
    }

    // Page navigations: try the network first (fresh app after each deploy),
    // fall back to the cached shell when offline.
    if (req.mode === 'navigate') {
        e.respondWith(networkFirst(req));
        return;
    }

    // Static assets: cache-first, then fetch + store on miss.
    e.respondWith(cacheFirst(req));
});

async function cacheFirst(req) {
    const cached = await caches.match(req);
    if (cached) return cached;
    const res = await fetch(req);
    if (res && res.ok) {
        const cache = await caches.open(CACHE_NAME);
        cache.put(req, res.clone());
    }
    return res;
}

async function networkFirst(req) {
    try {
        const res = await fetch(req);
        if (res && res.ok) {
            const cache = await caches.open(CACHE_NAME);
            cache.put(req, res.clone());
        }
        return res;
    } catch {
        return caches.match(req, { ignoreSearch: true });
    }
}

async function staleWhileRevalidate(req) {
    const cache = await caches.open(CACHE_NAME);
    const cached = await cache.match(req);
    const network = fetch(req).then((res) => {
        if (res && res.ok) cache.put(req, res.clone());
        return res;
    }).catch(() => cached);
    return cached || network;
}