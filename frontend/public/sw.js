const CACHE_NAME = 'itdropped-v4';
// Only assets that are safe to serve from cache indefinitely. HTML documents
// are deliberately NOT here: a cached page references build-hashed chunk URLs
// that stop existing at the next deploy, and serving it then produces a
// ChunkLoadError and a blank screen.
const STATIC_ASSETS = [
    '/manifest.json',
];

// Install: cache static assets
self.addEventListener('install', (event) => {
    event.waitUntil(
        caches.open(CACHE_NAME).then((cache) => {
            return cache.addAll(STATIC_ASSETS);
        })
    );
    self.skipWaiting();
});

// Activate: clean old caches
self.addEventListener('activate', (event) => {
    event.waitUntil(
        caches.keys().then((keys) => {
            return Promise.all(
                keys.filter((key) => key !== CACHE_NAME).map((key) => caches.delete(key))
            );
        })
    );
    self.clients.claim();
});

// Fetch: network-first everywhere; the cache is a fallback, never a source
// of first resort
self.addEventListener('fetch', (event) => {
    const { request } = event;
    const url = new URL(request.url);

    // Skip non-GET requests
    if (request.method !== 'GET') return;

    // Never touch another origin. Supabase reads are cross-origin GETs whose
    // pathname is /rest/v1/..., so they missed the /api check below and fell
    // through to stale-while-revalidate — which returned the CACHED body and
    // revalidated in the background. A comment posted and then re-read came
    // back without itself, appearing only on the next page load. The same
    // applied to every client-side read: wishlist, alerts, notifications,
    // profile. Authenticated responses have no business in a shared cache
    // regardless.
    if (url.origin !== self.location.origin) return;

    // Navigations: documents are never cached (see STATIC_ASSETS note), so
    // intercepting them could only ever replay the fetch we'd be replacing.
    // The old code did exactly that, then fell back to caches.match — which
    // could not hit, resolved undefined, and respondWith(undefined) is a
    // TypeError: offline navigations got the browser's *error* page instead
    // of its offline page. Don't intercept; let the browser own the request.
    if (request.mode === 'navigate') return;

    // Everything else (API + static): network-first, cache successes, and
    // fall back to cache only when there is actually something cached. On a
    // cache miss rethrow the fetch error so the outcome is byte-for-byte what
    // the browser would have shown with no service worker at all —
    // resolving undefined here throws inside respondWith and replaces a
    // plain failed request with an error page.
    event.respondWith(
        fetch(request)
            .then((response) => {
                if (response.ok) {
                    const clone = response.clone();
                    caches.open(CACHE_NAME).then((cache) => cache.put(request, clone));
                }
                return response;
            })
            .catch(async (err) => {
                const cached = await caches.match(request);
                if (cached) return cached;
                throw err;
            })
    );
});

// Push notifications (for Phase 3)
self.addEventListener('push', (event) => {
    if (!event.data) return;

    const data = event.data.json();
    const options = {
        body: data.body || 'New drop detected!',
        icon: '/icon-192.png',
        badge: '/icon-192.png',
        vibrate: [100, 50, 100],
        data: { url: data.url || '/drops' },
        actions: [
            { action: 'view', title: 'View Drop' },
            { action: 'dismiss', title: 'Dismiss' },
        ],
    };

    event.waitUntil(self.registration.showNotification(data.title || 'IT DROPPED', options));
});

// Notification click handler
self.addEventListener('notificationclick', (event) => {
    event.notification.close();
    if (event.action === 'dismiss') return;

    const url = event.notification.data?.url || '/drops';
    event.waitUntil(clients.openWindow(url));
});
