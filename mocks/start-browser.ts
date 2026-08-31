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
