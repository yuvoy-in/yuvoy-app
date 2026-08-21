"use client";

import { useEffect, useState, type ReactNode } from "react";

/**
 * Starts MSW in the browser, in development only.
 *
 * Children are held back until the worker is ready. Without that, the first
 * queries fire against a real origin before the worker has registered, which
 * looks exactly like a flaky backend and wastes an afternoon.
 *
 * The start itself is idempotent — React StrictMode runs this effect twice on
 * mount in development, and MSW throws on a second start. The guard lives in
 * mocks/start.ts rather than here, because the server side has the same
 * problem for a different reason.
 *
 * `NEXT_PUBLIC_API_MOCKING` gates it, so pointing the app at the real local Go
 * stack is a one-line env change rather than a code change.
 */
export function MswProvider({ children }: { children: ReactNode }) {
  const enabled =
    process.env.NODE_ENV === "development" &&
    process.env.NEXT_PUBLIC_API_MOCKING !== "disabled";

  const [ready, setReady] = useState(!enabled);

  useEffect(() => {
    if (!enabled) return;
    let cancelled = false;

    void (async () => {
      const { startBrowserMocks } = await import("../../../mocks/start");
      try {
        await startBrowserMocks();
      } catch (err) {
        // A failed worker must not leave the app blank forever. Render
        // anyway — requests will fall through to the real origin, which is a
        // visible, diagnosable failure rather than an empty page.
        console.error("[msw] worker failed to start", err);
      }
      if (!cancelled) setReady(true);
    })();

    return () => {
      cancelled = true;
    };
  }, [enabled]);

  if (!ready) return null;
  return <>{children}</>;
}
