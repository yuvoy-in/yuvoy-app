"use client";

import { useEffect } from "react";

/**
 * Registers the service worker.
 *
 * Production only, and never when mocking is enabled — see below. In
 * development it would sit in front of Turbopack's HMR requests, and
 * debugging that costs more than the offline support is worth while
 * iterating.
 */
export function RegisterServiceWorker() {
  useEffect(() => {
    if (process.env.NODE_ENV !== "production") return;
    if (!("serviceWorker" in navigator)) return;

    /*
      Never alongside MSW. Two service workers cannot both control a page, and
      when the end-to-end suite runs a production build with mocking enabled
      they raced — whichever won decided whether the API was intercepted, so
      tests failed intermittently with "No connection" and a real network call
      to a port nothing was listening on.

      This is not a test-only concern: a build that mocks is a build that must
      not also be pretending to work offline against a mock.
    */
    if (process.env.NEXT_PUBLIC_API_MOCKING === "enabled") return;

    /*
      Versioned by the build. A changed URL is a new worker to the browser:
      it installs, precaches a fresh offline page and its assets, and its
      `activate` deletes the previous version's caches. Without this a
      byte-identical sw.js never reinstalled and the precache outlived the
      deploys it was made for. See public/sw.js and next.config.ts.
    */
    const version = process.env.NEXT_PUBLIC_SW_VERSION ?? "dev";
    const register = () => {
      void navigator.serviceWorker
        .register(`/sw.js?v=${encodeURIComponent(version)}`)
        .catch(() => {
          // A failed registration costs offline support and nothing else.
          // The app must not surface an error for it.
        });
    };

    // After load, so registration never competes with the first paint on a
    // 0.5 Mbps connection.
    if (document.readyState === "complete") register();
    else window.addEventListener("load", register, { once: true });
  }, []);

  return null;
}
