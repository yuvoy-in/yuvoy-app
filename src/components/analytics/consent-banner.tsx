"use client";

import { useEffect, useSyncExternalStore } from "react";
import {
  subscribeConsent,
  consentSnapshot,
  consentServerSnapshot,
  setConsent,
} from "@/lib/analytics/consent";
import { installReporter, consoleReporter } from "@/lib/observability/report";

/**
 * The consent prompt, and the only thing that loads analytics.
 *
 * Nothing is downloaded before a grant — PostHog is imported inside the accept
 * path — so a visitor who declines never pays for it. On a 0.5 Mbps island
 * connection that is not a technicality.
 *
 * Deliberately not a modal and not blocking. A full-screen wall between a
 * traveller and the feed, on the one funnel there is, would cost more than the
 * analytics are worth.
 */
export function ConsentBanner() {
  const key = process.env.NEXT_PUBLIC_POSTHOG_KEY;
  const host =
    process.env.NEXT_PUBLIC_POSTHOG_HOST ?? "https://eu.i.posthog.com";

  /*
    sessionStorage is an external store, so this is the primitive for reading
    one. An effect plus setState would cascade a second render on every mount,
    and the React compiler rejects it — the same lesson as the booking screen's
    URL fragment.
  */
  const consent = useSyncExternalStore(
    subscribeConsent,
    consentSnapshot,
    consentServerSnapshot,
  );

  // Loading analytics is a side effect of a granted choice, not of rendering.
  useEffect(() => {
    if (key && consent === "granted") void enable(key, host);
  }, [key, host, consent]);

  // Nothing to consent to, already decided, or still hydrating on the server.
  if (!key || consent !== "unset") return null;

  return (
    <div
      role="region"
      aria-label="Analytics choice"
      className="bg-forest text-cream border-cream/12 lg:rounded-edge sticky bottom-0 z-40 border-t px-5 py-4 lg:bottom-4 lg:mx-auto lg:max-w-md lg:border"
    >
      <p className="text-cream/80 text-sm">
        May we count how this app gets used? It helps us fix what is broken. We
        never send your name, your number or your booking.
      </p>
      <div className="mt-3 flex gap-2">
        <button
          type="button"
          onClick={() => setConsent("granted")}
          className="rounded-edge label bg-cream text-forest h-11 flex-1 font-bold"
        >
          Yes, that is fine
        </button>
        <button
          type="button"
          onClick={() => setConsent("denied")}
          className="rounded-edge label border-cream/30 text-cream h-11 flex-1 border font-bold"
        >
          No thanks
        </button>
      </div>
    </div>
  );
}

/** Imported only on a grant, so a decline downloads nothing. */
async function enable(key: string, host: string): Promise<void> {
  try {
    const { createPostHogReporter } = await import("@/lib/analytics/posthog");
    const reporter = await createPostHogReporter(key, host);
    if (reporter) installReporter(reporter);
  } catch {
    // A blocked or failed analytics load must never affect the app.
    installReporter(consoleReporter);
  }
}
