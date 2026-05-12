/// <reference lib="webworker" />
import { precacheAndRoute, cleanupOutdatedCaches } from 'workbox-precaching';
import { registerRoute, NavigationRoute } from 'workbox-routing';
import { NetworkFirst, CacheFirst } from 'workbox-strategies';
import { ExpirationPlugin } from 'workbox-expiration';
import { CacheableResponsePlugin } from 'workbox-cacheable-response';

declare const self: ServiceWorkerGlobalScope;

cleanupOutdatedCaches();
precacheAndRoute(self.__WB_MANIFEST);

registerRoute(
  new NavigationRoute(
    new NetworkFirst({
      cacheName: 'hestia-pages',
      networkTimeoutSeconds: 3,
    }),
    { denylist: [/^\/api/, /^\/socket\.io/] },
  ),
);

registerRoute(
  ({ url }) => url.pathname.startsWith('/api/'),
  new NetworkFirst({
    cacheName: 'hestia-api',
    networkTimeoutSeconds: 5,
    plugins: [
      new CacheableResponsePlugin({ statuses: [0, 200] }),
      new ExpirationPlugin({ maxEntries: 200, maxAgeSeconds: 60 * 60 * 24 }),
    ],
  }),
);

registerRoute(
  ({ url }) => url.origin === 'https://world.openfoodfacts.org',
  new CacheFirst({
    cacheName: 'openfoodfacts',
    plugins: [
      new CacheableResponsePlugin({ statuses: [0, 200] }),
      new ExpirationPlugin({ maxEntries: 500, maxAgeSeconds: 60 * 60 * 24 * 30 }),
    ],
  }),
);

self.addEventListener('push', (event) => {
  if (!event.data) return;
  let payload: { title?: string; body?: string; url?: string; tag?: string } = {};
  try {
    payload = event.data.json();
  } catch {
    payload = { title: 'Hestia', body: event.data.text() };
  }

  event.waitUntil(
    self.registration.showNotification(payload.title ?? 'Hestia', {
      body: payload.body,
      icon: '/icons/icon-192.png',
      badge: '/icons/icon-192.png',
      tag: payload.tag,
      data: { url: payload.url ?? '/' },
    }),
  );
});

self.addEventListener('notificationclick', (event) => {
  event.notification.close();
  const targetUrl = (event.notification.data as { url?: string } | null)?.url ?? '/';

  event.waitUntil(
    (async () => {
      const allClients = await self.clients.matchAll({ type: 'window', includeUncontrolled: true });
      for (const client of allClients) {
        if ('focus' in client) {
          await client.focus();
          if ('navigate' in client) await (client as WindowClient).navigate(targetUrl);
          return;
        }
      }
      await self.clients.openWindow(targetUrl);
    })(),
  );
});

self.addEventListener('message', (event) => {
  if (event.data?.type === 'SKIP_WAITING') self.skipWaiting();
});
