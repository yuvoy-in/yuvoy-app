/**
 * Starting MSW exactly once, on either side.
 *
 * Both entry points can fire more than once, for different reasons, and MSW
 * throws on the second — "cannot configure an already enabled network":
 *
 *   BROWSER  React StrictMode runs every effect twice on mount in development.
 *            `reactStrictMode: true` is deliberate (it surfaces exactly this
 *            class of bug), so the fix belongs here, not in the config.
 *
 *   SERVER   Next re-runs `instrumentation.register()` across a Turbopack hot
 *            reload, and the module may be re-evaluated with it — so a
 *            module-scoped flag is not enough on its own.
 *
 * The guard therefore lives on `globalThis` and holds the PROMISE, not a
 * boolean: two callers racing before the first start resolves must await the
 * same start rather than both beginning one.
 */

const BROWSER_KEY = Symbol.for("yuvoy.msw.browser");
const SERVER_KEY = Symbol.for("yuvoy.msw.server");

type Slot = { promise?: Promise<void> };

function slot(key: symbol): Slot {
  const g = globalThis as Record<symbol, unknown>;
  if (!g[key]) g[key] = {} satisfies Slot;
  return g[key] as Slot;
}

/** Idempotent. Safe to call from a StrictMode effect. */
export function startBrowserMocks(): Promise<void> {
  const s = slot(BROWSER_KEY);
  s.promise ??= (async () => {
    const { worker } = await import("./browser");
    await worker.start({
      onUnhandledRequest: "bypass",
      quiet: true,
      serviceWorker: { url: "/mockServiceWorker.js" },
    });
  })();
  return s.promise;
}

/** Idempotent. Safe to call from a re-run of instrumentation.register(). */
export function startServerMocks(): Promise<void> {
  const s = slot(SERVER_KEY);
  s.promise ??= (async () => {
    const { server } = await import("./server");
    server.listen({ onUnhandledRequest: "bypass" });
  })();
  return s.promise;
}

/** Test-only: forget the memoised starts. */
export function __resetMockStarts(): void {
  slot(BROWSER_KEY).promise = undefined;
  slot(SERVER_KEY).promise = undefined;
}
