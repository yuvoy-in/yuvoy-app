/**
 * Yuvoy service worker.
 *
 * Hand-written rather than generated. The policy below is deliberately narrow
 * and the wrong thing cached here is worse than caching nothing at all — a
 * stale seat count sells a seat that does not exist — so it is worth being able
 * to read the whole rule set on one screen.
 *
 * The rule, stated once: ANYTHING that decides whether a seat exists, or that
 * moves money, is network-only. Everything else may be served from a cache
 * with an honest "this is what we saved" story in the UI.
 */

const VERSION = "v1";
const SHELL = `yuvoy-shell-${VERSION}`;
const PAGES = `yuvoy-pages-${VERSION}`;
const ASSETS = `yuvoy-assets-${VERSION}`;
const POSTERS = `yuvoy-posters-${VERSION}`;

const OFFLINE_URL = "/offline";

/** Never cached, ever. Matched against the API path. */
const NEVER_CACHE = [
  "/availability", // the authority on seats
  "/reservations", // money
  "/bookings/status", // money
  "/bookings/cancellation",
  "/payment-order",
  "/auth/",
  "/scans",
];

/** Poster cache bounds. An unbounded image cache thrashes a cheap device. */
const POSTER_LIMIT = 60;

self.addEventListener("install", (event) => {
  event.waitUntil(
    caches
      .open(SHELL)
      .then((cache) => cache.addAll([OFFLINE_URL]))
      // A failed precache must not block activation — the app still works
      // online, and the offline page is a nicety rather than a dependency.
      .catch(() => undefined)
      .then(() => self.skipWaiting()),
  );
});

self.addEventListener("activate", (event) => {
  event.waitUntil(
    caches
      .keys()
      .then((keys) =>
        Promise.all(
          keys
            .filter((k) => k.startsWith("yuvoy-") && !k.endsWith(VERSION))
            .map((k) => caches.delete(k)),
        ),
      )
      .then(() => self.clients.claim()),
  );
});

async function trimCache(name, limit) {
  const cache = await caches.open(name);
  const keys = await cache.keys();
  if (keys.length <= limit) return;
  // Oldest first — Cache Storage preserves insertion order.
  await Promise.all(keys.slice(0, keys.length - limit).map((k) => cache.delete(k)));
}

self.addEventListener("fetch", (event) => {
  const { request } = event;

  // Never touch anything that is not a plain GET. A cached POST is not a
  // thing, and intercepting one risks replaying a booking.
  if (request.method !== "GET") return;

  const url = new URL(request.url);

  // Cross-origin: only poster images are worth holding, and only from the
  // media host. Everything else goes straight to the network.
  if (url.origin !== self.location.origin) {
    if (request.destination === "image") {
      event.respondWith(cacheFirst(request, POSTERS, POSTER_LIMIT));
    }
    return;
  }

  // The money and inventory paths.
  if (NEVER_CACHE.some((p) => url.pathname.includes(p))) return;

  // Next's build output is content-hashed, so it can be cached hard.
  if (url.pathname.startsWith("/_next/static/")) {
    event.respondWith(cacheFirst(request, ASSETS));
    return;
  }

  if (request.destination === "image" || request.destination === "font") {
    event.respondWith(cacheFirst(request, ASSETS));
    return;
  }

  // Documents: network first, so a traveller with signal always sees the
  // truth, and the cache is only a fallback for when they do not.
  if (request.mode === "navigate") {
    event.respondWith(networkFirstDocument(request));
    return;
  }
});

async function cacheFirst(request, cacheName, limit) {
  const cache = await caches.open(cacheName);
  const hit = await cache.match(request);
  if (hit) return hit;

  try {
    const response = await fetch(request);
    if (response.ok) {
      await cache.put(request, response.clone());
      if (limit) void trimCache(cacheName, limit);
    }
    return response;
  } catch (err) {
    // An image that cannot be fetched is a poster that does not paint. The
    // card is still complete without it.
    throw err;
  }
}

async function networkFirstDocument(request) {
  const cache = await caches.open(PAGES);
  try {
    const response = await fetch(request);
    if (response.ok) await cache.put(request, response.clone());
    return response;
  } catch {
    const hit = await cache.match(request);
    if (hit) return hit;

    // /booking is deliberately NOT served from a page cache — it renders from
    // IndexedDB instead, so a saved booking is stamped rather than presented
    // as live. The offline page routes there.
    const offline = await caches.match(OFFLINE_URL);
    return (
      offline ??
      new Response("You are offline.", {
        status: 503,
        headers: { "Content-Type": "text/plain" },
      })
    );
  }
}
