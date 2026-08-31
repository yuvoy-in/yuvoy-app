"use client";

import type { ReactNode } from "react";

/**
 * Starts MSW in the browser, when mocking is enabled at build time.
 *
 * **It renders children immediately and gates nothing.** The first version
 * returned `null` until the worker was ready, which gated the ENTIRE tree —
 * so every page server-rendered empty, including /e/[slug], the one page in
 * this app worth indexing. The content was present only in the RSC payload,
 * which a crawler does not execute. Nothing in the gate caught it: the build
 * passed, the unit tests passed, and only an e2e run against a production
 * build showed a body containing nothing but the skip link.
 *
 * The start is a MODULE-LEVEL side effect rather than an effect, so it begins
 * the moment this chunk loads — well before React finishes hydrating — which
 * removes the race the gate existed to paper over. Anything that still slips
 * through hits the API client's retry, which handles a NetworkError once.
 *
 * Mocking is a build-time flag (NEXT_PUBLIC_* is inlined), so a deploy that
 * does not set it contains none of this.
 */

if (
  process.env.NEXT_PUBLIC_API_MOCKING === "enabled" &&
  typeof window !== "undefined"
) {
  void import("../../../mocks/start-browser")
    .then(({ startBrowserMocks }) => startBrowserMocks())
    .catch((err) => {
      // A failed worker must not leave the app blank. Requests fall through to
      // the real origin, which is a visible, diagnosable failure.
      console.error("[msw] worker failed to start", err);
    });
}

export function MswProvider({ children }: { children: ReactNode }) {
  return <>{children}</>;
}
