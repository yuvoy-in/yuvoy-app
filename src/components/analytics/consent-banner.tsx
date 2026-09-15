"use client";

import { useEffect, useSyncExternalStore } from "react";
import {
  subscribeConsent,
  consentSnapshot,
  consentServerSnapshot,
  setConsent,
} from "@/lib/analytics/consent";
import { installReporter, consoleReporter } from "@/lib/observability/report";
import { Button } from "@/components/ui/button";
import { LegalLinks } from "@/components/site/legal-links";

/**
 * The consent prompt, and the only thing that loads analytics.
 *
 * Nothing is downloaded before a grant — PostHog is imported inside the accept
 * path — so a visitor who declines never pays for it. On a 0.5 Mbps island
 * connection that is not a technicality.
 *
 * Deliberately not a modal and not blocking. A full-screen wall between a
 * traveller and the feed, on the one funnel there is, would cost more than the
 * analytics are worth. It floats above the tab bar as a chrome card, and on a
 * desktop tucks into the corner.
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
      className="app-chrome ring-paper/12 rounded-card fixed inset-x-4 bottom-[calc(5.75rem+env(safe-area-inset-bottom,0px))] z-40 p-5 ring-1 lg:inset-x-auto lg:right-6 lg:bottom-6 lg:max-w-md"
    >
      <p className="text-paper/80 text-sm">
        May we count how this app gets used? It helps us fix what is broken. We
        never send your name, your number or your booking.
      </p>
      <div className="mt-4 flex gap-2">
        <Button
          variant="paper"
          onClick={() => setConsent("granted")}
          className="flex-1"
        >
          Yes, that is fine
        </Button>
        <Button
          variant="outlineOnDark"
          onClick={() => setConsent("denied")}
          className="flex-1"
        >
          No thanks
        </Button>
      </div>
      {/*
        The policy, at the moment somebody is asked to agree to something —
        yuvoy-app#15. A consent prompt that does not link what it is asking
        consent under is asking somebody to agree to a document they have no
        way to read.
      */}
      <LegalLinks tone="dark" className="mt-4 text-xs" />
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
