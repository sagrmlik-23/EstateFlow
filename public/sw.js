// ============================================================================
// EstateFlow CRM — PWA Service Worker
// Agent-8-PWA-Docs v1.0.0
// ============================================================================
// This service worker handles caching strategies, push notifications,
// and offline fallback for the PWA.
// ============================================================================

const CACHE_NAME = 'estateflow-crm-v1';
const STATIC_CACHE = 'estateflow-static-v1';
const API_CACHE = 'estateflow-api-v1';
const FONT_CACHE = 'estateflow-fonts-v1';

const STATIC_ASSETS = [
  '/',
  '/offline',
  '/manifest.json',
  '/favicon.ico',
  '/images/icon-192.png',
  '/images/icon-512.png',
  '/images/apple-touch-icon.png',
];

// ─── Install Event ──────────────────────────────────────────────────────────

self.addEventListener('install', (event) => {
  console.debug('[SW] Install event');

  // Activate immediately — don't wait for old SW to close
  self.skipWaiting();

  // Pre-cache static assets
  event.waitUntil(
    caches.open(STATIC_CACHE).then((cache) => {
      return cache.addAll(STATIC_ASSETS).catch((err) => {
        console.debug('[SW] Pre-cache non-critical failure:', err);
      });
    }),
  );
});

// ─── Activate Event ─────────────────────────────────────────────────────────

self.addEventListener('activate', (event) => {
  console.debug('[SW] Activate event');

  // Claim all clients so the SW controls all pages immediately
  event.waitUntil(self.clients.claim());

  // Clean up old caches
  event.waitUntil(
    caches.keys().then((cacheNames) => {
      return Promise.all(
        cacheNames
          .filter(
            (name) =>
              name !== CACHE_NAME &&
              name !== STATIC_CACHE &&
              name !== API_CACHE &&
              name !== FONT_CACHE,
          )
          .map((name) => caches.delete(name)),
      );
    }),
  );
});

// ─── Fetch Event ────────────────────────────────────────────────────────────

self.addEventListener('fetch', (event) => {
  const { request } = event;
  const url = new URL(request.url);

  // Only handle GET requests
  if (request.method !== 'GET') return;

  // Skip non-HTTP(S) requests
  if (!url.protocol.startsWith('http')) return;

  // ── Strategy 1: Cache-First for static assets ──────────────────────────
  if (
    url.origin === self.location.origin &&
    (url.pathname.match(/\.(js|css|png|jpg|jpeg|gif|svg|ico|woff2?|ttf|eot)$/) ||
      STATIC_ASSETS.includes(url.pathname))
  ) {
    event.respondWith(cacheFirst(request));
    return;
  }

  // ── Strategy 2: Network-First for API calls ────────────────────────────
  if (url.pathname.startsWith('/api/')) {
    event.respondWith(networkFirst(request, API_CACHE));
    return;
  }

  // ── Strategy 3: Stale-While-Revalidate for navigation/page requests ────
  if (request.mode === 'navigate') {
    event.respondWith(networkFirst(request, CACHE_NAME));
    return;
  }

  // ── Strategy 4: Network-First for everything else ──────────────────────
  event.respondWith(networkFirst(request, CACHE_NAME));
});

// ─── Caching Strategies ─────────────────────────────────────────────────────

/**
 * Cache-First strategy: serve from cache, fall back to network.
 * Ideal for static assets that rarely change.
 */
async function cacheFirst(request) {
  const cached = await caches.match(request);
  if (cached) return cached;

  try {
    const response = await fetch(request);
    if (response.ok) {
      const cache = await caches.open(STATIC_CACHE);
      cache.put(request, response.clone());
    }
    return response;
  } catch (error) {
    // If it's a navigation request, serve the offline page
    if (request.mode === 'navigate') {
      const offlinePage = await caches.match('/offline');
      if (offlinePage) return offlinePage;
    }
    return new Response('Offline', { status: 503, statusText: 'Service Unavailable' });
  }
}

/**
 * Network-First strategy: try network, fall back to cache.
 * Ideal for API calls and page navigations.
 */
async function networkFirst(request, cacheName) {
  try {
    const response = await fetch(request);
    if (response.ok) {
      const cache = await caches.open(cacheName);
      cache.put(request, response.clone());
    }
    return response;
  } catch (error) {
    const cached = await caches.match(request);
    if (cached) return cached;

    // If it's a navigation request and nothing in cache, serve the offline page
    if (request.mode === 'navigate') {
      const offlinePage = await caches.match('/offline');
      if (offlinePage) return offlinePage;
    }

    // For API calls, return a structured offline error
    if (request.url.includes('/api/')) {
      return new Response(
        JSON.stringify({
          success: false,
          error: 'You are offline. Please check your connection.',
          offline: true,
        }),
        {
          status: 503,
          headers: { 'Content-Type': 'application/json' },
        },
      );
    }

    return new Response('Offline', { status: 503, statusText: 'Service Unavailable' });
  }
}

// ─── Push Event ─────────────────────────────────────────────────────────────

self.addEventListener('push', (event) => {
  console.debug('[SW] Push event received');

  let payload;

  try {
    if (event.data) {
      payload = event.data.json();
    }
  } catch (err) {
    console.warn('[SW] Failed to parse push payload:', err);
  }

  if (!payload || !payload.title) {
    payload = {
      title: 'EstateFlow CRM',
      body: 'You have a new notification.',
      icon: '/images/icon-192.png',
      badge: '/images/icon-192.png',
    };
  }

  const notificationTitle = payload.title;
  const notificationOptions = {
    body: payload.body ?? '',
    icon: payload.icon ?? '/images/icon-192.png',
    badge: payload.badge ?? '/images/icon-192.png',
    tag: payload.tag ?? 'estateflow-general',
    data: payload.data ?? {},
    requireInteraction: payload.requireInteraction ?? false,
    actions: payload.actions ?? [],
    vibrate: [200, 100, 200],
    timestamp: Date.now(),
    renotify: true,
    silent: false,
  };

  event.waitUntil(
    self.registration.showNotification(notificationTitle, notificationOptions),
  );
});

// ─── Notification Click Event ───────────────────────────────────────────────

self.addEventListener('notificationclick', (event) => {
  console.debug('[SW] Notification click event:', event.notification);

  event.notification.close();

  const data = event.notification.data ?? {};
  const tenant = data.tenant ?? '';

  let url = data.url ?? '/';

  if (!url || url === '/') {
    if (data.leadId) {
      url = tenant ? `/${tenant}/leads/${data.leadId}` : `/leads/${data.leadId}`;
    } else if (data.propertyId) {
      url = tenant
        ? `/${tenant}/properties/${data.propertyId}`
        : `/properties/${data.propertyId}`;
    } else if (data.callId) {
      url = tenant
        ? `/${tenant}/ai/calls/${data.callId}`
        : `/ai/calls/${data.callId}`;
    } else if (data.notificationId) {
      url = tenant ? `/${tenant}/activity` : '/activity';
    } else {
      url = tenant ? `/${tenant}/dashboard` : '/';
    }
  }

  if (event.action) {
    switch (event.action) {
      case 'view':
        break;
      case 'dismiss':
        return;
      case 'mark-read':
        break;
      default:
        url = `${url}?action=${event.action}`;
        break;
    }
  }

  event.waitUntil(
    self.clients
      .matchAll({ type: 'window', includeUncontrolled: true })
      .then((clientList) => {
        for (const client of clientList) {
          if (client.url === url && 'focus' in client) {
            return client.focus();
          }
        }

        if (clientList.length > 0 && 'navigate' in clientList[0]) {
          return clientList[0].navigate(url).then((navigatedClient) => {
            if (navigatedClient && 'focus' in navigatedClient) {
              navigatedClient.focus();
            }
          });
        }

        if (self.clients.openWindow) {
          return self.clients.openWindow(url);
        }
      }),
  );
});

// ─── Notification Close Event ───────────────────────────────────────────────

self.addEventListener('notificationclose', (event) => {
  console.debug('[SW] Notification closed:', event.notification.tag);
});

// ─── Message Event (for client-to-sw communication) ─────────────────────────

self.addEventListener('message', (event) => {
  if (!event.data) return;

  const { type, payload } = event.data;

  switch (type) {
    case 'SKIP_WAITING':
      self.skipWaiting();
      break;
    case 'CLEAR_CACHE':
      caches.keys().then((names) => {
        Promise.all(names.map((name) => caches.delete(name)));
      });
      break;
    case 'CACHE_VERSION':
      event.source?.postMessage({ type: 'CACHE_VERSION', payload: CACHE_NAME });
      break;
    default:
      console.debug('[SW] Unknown message type:', type);
  }
});
