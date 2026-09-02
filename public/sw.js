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
 *
 * ## Versioning
 *
 * The version comes from the registration URL (`/sw.js?v=<build>`), stamped
 * per deploy by the app. A hand-typed constant meant a byte-identical worker
 * never reinstalled: the offline page precached at first install outlived the
 * deploys whose hashed chunks it referenced, and rendered unstyled once those
 * aged out of the asset cache. A new `v` is a new worker, a new install, a
 * fresh precache, and `activate` deletes everything from the old one.
 */

const VERSION =
  new URL(self.location.href).searchParams.get("v") || "unversioned";
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

/**
 * The offline page's own assets, read out of its HTML at install time.
 *
 * The page is precached; its stylesheet and scripts were not, so an offline
 * navigation served a shell whose chunks the network could not deliver. Each
 * `/_next/static/…` reference in the page is fetched into the asset cache
 * alongside it, so the fallback paints as designed with no signal at all.
 */
function assetUrlsIn(html) {
  const found = new Set();
  const re = /(?:src|href)="(\/_next\/static\/[^"]+)"/g;
  let m;
  while ((m = re.exec(html)) !== null) found.add(m[1]);
  return [...found];
}

self.addEventListener("install", (event) => {
  event.waitUntil(
    (async () => {
      try {
        const shell = await caches.open(SHELL);
        const response = await fetch(OFFLINE_URL, { cache: "no-store" });
        if (response.ok) {
          await shell.put(OFFLINE_URL, response.clone());
          const assets = await caches.open(ASSETS);
          const html = await response.text();
          await Promise.all(
            assetUrlsIn(html).map((u) => assets.add(u).catch(() => undefined)),
          );
        }
      } catch {
        // A failed precache must not block activation — the app still works
        // online, and the offline page is a nicety rather than a dependency.
      }
      await self.skipWaiting();
    })(),
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

/**
 * A cross-origin `<img>` without CORS arrives as an OPAQUE response: status
 * 0, `ok` false, body unreadable — and perfectly cacheable. Checking `ok`
 * alone meant the poster cache, limit machinery and all, never stored a
 * single poster. Opaque responses are kept; a real error status is not.
 */
function cacheable(response) {
  return response.ok || response.type === "opaque";
}

async function cacheFirst(request, cacheName, limit) {
  const cache = await caches.open(cacheName);
  const hit = await cache.match(request);
  if (hit) return hit;

  const response = await fetch(request);
  if (cacheable(response)) {
    await cache.put(request, response.clone());
    if (limit) void trimCache(cacheName, limit);
  }
  return response;
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

    // /booking's SHELL is cached like any page — its DATA never is, because
    // `/bookings/status` is on the never-cache list. Offline, the shell
    // renders from IndexedDB and stamps what it shows as saved rather than
    // live. The offline page routes there.
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
