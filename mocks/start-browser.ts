import { startOnce, BROWSER_KEY } from "./once";

/**
 * Starts MSW in the BROWSER. Imports nothing from the Node side.
 *
 * That separation is load-bearing rather than tidy. When both starts lived in
 * one module, the bundler traced `msw/node` into the client graph even though
 * the import was dynamic — and `msw/node` imports `async_hooks`, which does not
 * exist in a browser. The build passed; `pnpm dev` did not.
 *
 * Idempotent: React StrictMode runs every effect twice on mount in
 * development, and MSW throws on a second start.
 */
/**
 * Resolves once the worker is intercepting.
 *
 * Exported so the API client can AWAIT it rather than race it. Without this,
 * queries that fire during hydration reach the real origin and fail with
 * ERR_CONNECTION_REFUSED; they recover on retry, which is luck rather than
 * design and costs a visible delay on a slow device.
 *
 * Gating the render instead was the first attempt, and it broke SSR entirely.
 */
export function startBrowserMocks(): Promise<void> {
  return startOnce(BROWSER_KEY, async () => {
    await dropStalledMockWorker();
    const { worker } = await import("./browser");
    await worker.start({
      onUnhandledRequest: "bypass",
      quiet: true,
      serviceWorker: { url: "/mockServiceWorker.js" },
    });
  });
}

/** The path `worker.start` registers, as `serviceWorker.url` above says. */
const MOCK_WORKER_PATH = "/mockServiceWorker.js";

/**
 * Unregisters a mock worker that never finished installing, before MSW
 * looks (yuvoy-app#256).
 *
 * MSW 2.15 reloads the page whenever no worker controls it and a mock
 * registration exists, and it counts an installing or waiting worker as one
 * (`get-worker-instance.ts`, `get-worker-by-registration.ts`). A page left
 * while its first install was still running hands the next page exactly
 * that. On WebKit the install seems never to finish, so every load reloads:
 * the iPhone motion spec saw 112 commits in one test. With the stalled
 * registration gone, MSW takes its first-visit path and registers afresh.
 *
 * Only when nothing is active. A hard reload also leaves the page with no
 * controller, but with an active worker, and that is the case MSW's own
 * reload is for, so it is left alone. Reached only from a build with
 * mocking on: both callers check `NEXT_PUBLIC_API_MOCKING` first.
 */
export async function dropStalledMockWorker(): Promise<void> {
  const container =
    typeof navigator === "undefined" ? undefined : navigator.serviceWorker;
  if (!container || container.controller) return;
  const registrations = await container.getRegistrations();
  await Promise.all(
    registrations
      .filter((r) => !r.active && isMockWorker(r))
      .map((r) => r.unregister()),
  );
}

function isMockWorker(registration: ServiceWorkerRegistration): boolean {
  return [registration.installing, registration.waiting].some(
    (w) => !!w && new URL(w.scriptURL).pathname === MOCK_WORKER_PATH,
  );
}
