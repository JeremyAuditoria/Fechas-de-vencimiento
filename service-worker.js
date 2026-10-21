/* Service worker PWA - Control de vencimientos.
   Estrategia: navegación network-first para recibir actualizaciones;
   archivos estáticos cache-first. No modifica localStorage ni IndexedDB. */
const CACHE_NAME = 'control-vencimientos-pwa-v15';
const APP_SHELL = [
  './',
  './index.html',
  './usuario.html',
  './manifest.json',
  './supabase-config.js',
  './icons/icon-192.png',
  './icons/icon-512.png',
  './icons/apple-touch-icon.png'
];

self.addEventListener('install', event => {
  event.waitUntil((async () => {
    const cache = await caches.open(CACHE_NAME);
    await cache.addAll(APP_SHELL);
    await self.skipWaiting();
  })());
});

self.addEventListener('activate', event => {
  event.waitUntil((async () => {
    const names = await caches.keys();
    await Promise.all(names
      .filter(name => name.startsWith('control-vencimientos-') && name !== CACHE_NAME)
      .map(name => caches.delete(name)));
    await self.clients.claim();
  })());
});

self.addEventListener('fetch', event => {
  const request = event.request;
  if (request.method !== 'GET') return;
  const url = new URL(request.url);

  // Cachea librerías externas después de una visita online; si falla la red,
  // intenta usar la copia anterior. La primera carga requiere internet.
  if (request.destination === 'script' &&
      (url.hostname === 'cdn.jsdelivr.net' || url.hostname === 'unpkg.com')) {
    event.respondWith((async () => {
      const cache = await caches.open(CACHE_NAME);
      const cached = await cache.match(request);
      try {
        const response = await fetch(request);
        if (response && (response.ok || response.type === 'opaque')) {
          try { await cache.put(request, response.clone()); } catch (_) {}
        }
        return response;
      } catch (error) {
        if (cached) return cached;
        throw error;
      }
    })());
    return;
  }

  if (url.origin !== self.location.origin) return;

  // HTML: intenta red primero para no quedarse pegado en una versión vieja.
  if (request.mode === 'navigate' || /\.html$/i.test(url.pathname)) {
    event.respondWith((async () => {
      const cache = await caches.open(CACHE_NAME);
      try {
        const response = await fetch(request);
        if (response && response.ok) {
          cache.put(request, response.clone()).catch(() => {});
          // Mantiene una copia del inicio para abrir la app si se pierde conexión.
          if (url.pathname.endsWith('/') || url.pathname.endsWith('/index.html')) {
            cache.put('./', response.clone()).catch(() => {});
            cache.put('./index.html', response.clone()).catch(() => {});
          }
        }
        return response;
      } catch (error) {
        const exact = await cache.match(request);
        if (exact) return exact;
        const path = url.pathname;
        if (path.endsWith('/usuario.html')) return (await cache.match('./usuario.html')) || (await cache.match('./'));
        return (await cache.match('./index.html')) || (await cache.match('./')) || Response.error();
      }
    })());
    return;
  }

  // Archivos locales: cache-first, actualizados desde la red si no están en caché.
  event.respondWith((async () => {
    const cache = await caches.open(CACHE_NAME);
    const cached = await cache.match(request);
    if (cached) return cached;
    const response = await fetch(request);
    if (response && response.ok) cache.put(request, response.clone()).catch(() => {});
    return response;
  })());
});
