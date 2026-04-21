/// <reference lib="webworker" />

declare const __SHELL_MANIFEST__: {
  version: string;
  urls: readonly string[];
};

const MANIFEST = __SHELL_MANIFEST__;
const CACHE_NAME = `bsa-shell-${MANIFEST.version}`;
const serviceWorker = globalThis as unknown as ServiceWorkerGlobalScope;

serviceWorker.addEventListener("install", (event: ExtendableEvent) => {
  event.waitUntil(
    (async () => {
      const cache = await caches.open(CACHE_NAME);
      await cache.addAll([...MANIFEST.urls]);
      await serviceWorker.skipWaiting();
    })(),
  );
});

serviceWorker.addEventListener("activate", (event: ExtendableEvent) => {
  event.waitUntil(
    (async () => {
      const cacheKeys = await caches.keys();

      await Promise.all(
        cacheKeys
          .filter((cacheKey) => cacheKey.startsWith("bsa-shell-") && cacheKey !== CACHE_NAME)
          .map((cacheKey) => caches.delete(cacheKey)),
      );

      await serviceWorker.clients.claim();
    })(),
  );
});

serviceWorker.addEventListener("fetch", (event: FetchEvent) => {
  const { request } = event;

  if (request.method !== "GET") {
    return;
  }

  const url = new URL(request.url);

  if (url.pathname.startsWith("/api/")) {
    return;
  }

  if (!MANIFEST.urls.includes(url.pathname)) {
    return;
  }

  event.respondWith(
    (async () => {
      const cachedResponse = await caches.match(request);
      return cachedResponse ?? fetch(request);
    })(),
  );
});
