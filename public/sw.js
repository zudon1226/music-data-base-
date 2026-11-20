/**
 * Music Data Base PWA service worker — installability only.
 * Network-only: no offline cache of auth, API payloads, or media.
 */
const SW_VERSION = "mdb-pwa-network-only-2";

self.addEventListener("install", (event) => {
  event.waitUntil(self.skipWaiting());
});

self.addEventListener("activate", (event) => {
  event.waitUntil(
    (async () => {
      const keys = await caches.keys();
      await Promise.all(keys.map((key) => caches.delete(key)));
      await self.clients.claim();
    })(),
  );
});

self.addEventListener("fetch", (event) => {
  const { request } = event;
  if (request.method !== "GET") {
    return;
  }
  let requestUrl;
  try {
    requestUrl = new URL(request.url);
  } catch {
    return;
  }
  if (requestUrl.protocol !== "http:" && requestUrl.protocol !== "https:") {
    return;
  }
  event.respondWith(
    (async () => {
      try {
        return await fetch(request);
      } catch (error) {
        const message = error instanceof Error ? error.message : String(error);
        console.warn("[sw] network fetch failed", {
          version: SW_VERSION,
          url: request.url,
          mode: request.mode,
          message,
        });
        return Response.error();
      }
    })(),
  );
});
