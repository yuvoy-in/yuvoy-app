"use client";

import { useEffect, useState, type ReactNode } from "react";

/**
 * Starts MSW in the browser, in development only.
 *
 * Children are held back until the worker is ready. Without that, the first
 * queries fire against a real origin before the worker has registered, which
 * looks exactly like a flaky backend and wastes an afternoon.
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
      const { worker } = await import("../../../mocks/browser");
      await worker.start({
        onUnhandledRequest: "bypass",
        quiet: true,
        serviceWorker: { url: "/mockServiceWorker.js" },
      });
      if (!cancelled) setReady(true);
    })();
    return () => {
      cancelled = true;
    };
  }, [enabled]);

  if (!ready) return null;
  return <>{children}</>;
}
