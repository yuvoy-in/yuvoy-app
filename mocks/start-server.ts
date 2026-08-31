import { startOnce, SERVER_KEY } from "./once";

/**
 * Starts MSW in the NEXT SERVER. Imports nothing from the browser side.
 *
 * See start-browser.ts for why the two are separate files.
 *
 * Idempotent: Next re-runs `instrumentation.register()` across a Turbopack hot
 * reload and may re-evaluate the module with it.
 */
export function startServerMocks(): Promise<void> {
  return startOnce(SERVER_KEY, async () => {
    const { server } = await import("./server");
    server.listen({ onUnhandledRequest: "bypass" });
  });
}
