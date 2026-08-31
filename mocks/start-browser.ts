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
    const { worker } = await import("./browser");
    await worker.start({
      onUnhandledRequest: "bypass",
      quiet: true,
      serviceWorker: { url: "/mockServiceWorker.js" },
    });
  });
}
