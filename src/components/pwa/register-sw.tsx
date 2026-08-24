"use client";

import { useEffect } from "react";

/**
 * Registers the service worker.
 *
 * Production only. In development the worker would sit in front of Turbopack's
 * HMR requests and MSW's own worker, and debugging that costs more than the
 * offline support is worth while iterating.
 */
export function RegisterServiceWorker() {
  useEffect(() => {
    if (process.env.NODE_ENV !== "production") return;
    if (!("serviceWorker" in navigator)) return;

    const register = () => {
      void navigator.serviceWorker.register("/sw.js").catch(() => {
        // A failed registration costs offline support and nothing else. The
        // app must not surface an error for it.
      });
    };

    // After load, so registration never competes with the first paint on a
    // 0.5 Mbps connection.
    if (document.readyState === "complete") register();
    else window.addEventListener("load", register, { once: true });
  }, []);

  return null;
}
