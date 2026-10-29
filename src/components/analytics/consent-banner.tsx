"use client";

import { useEffect, useSyncExternalStore } from "react";
import { usePathname } from "next/navigation";
import { isMediaGroundRoute } from "@/lib/site/nav";
import { cn } from "@/lib/cn";
import {
  subscribeConsent,
  consentSnapshot,
  consentServerSnapshot,
  consentAskSnapshot,
  consentAskServerSnapshot,
  type ConsentAskRead,
  type ConsentRead,
  setConsent,
} from "@/lib/analytics/consent";
import { CONSENT_WORDS } from "@/lib/analytics/consent-words";
import { installReporter, consoleReporter } from "@/lib/observability/report";
import { isPlanLinkPath } from "@/lib/booking/scrub";
import { Button } from "@/components/ui/button";
import { CheckIcon, CloseIcon } from "@/components/ui/icons";
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
 *
 * ## The words, and when it asks (yuvoy-app#181)
 *
 * It asks the phone app's question (`CONSENT_WORDS`), because a yes now also
 * counts what is done with a card: shown, opened, saved, shared and a link
 * followed out (`lib/analytics/outcomes.ts`). A yes given to the older words
 * is asked once more and keeps counting reel views until it is answered; a no
 * is never asked again (`consentAskSnapshot`).
 *
 * It asks wherever something real is counted, not only where PostHog has a
 * key: reel views and outcomes go to the API either way. A build on the mock
 * counts into the mock, so it asks only with a key there, and every end to
 * end spec that is not about consent runs without the card over it.
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
  const consent = useSyncExternalStore<ConsentRead>(
    subscribeConsent,
    consentSnapshot,
    consentServerSnapshot,
  );
  const ask = useSyncExternalStore<ConsentAskRead>(
    subscribeConsent,
    consentAskSnapshot,
    consentAskServerSnapshot,
  );
  const counted =
    Boolean(key) || process.env.NEXT_PUBLIC_API_MOCKING !== "enabled";
  /*
    Over a reel it goes to the TOP, under the masthead. At the foot it sat over
    the band where the caption, the date line and Book are, so the first thing
    a new visitor saw covered the one row they came to act on, every new
    session (cited in the redesign's before page, 3 Oct 2026). At the top it
    covers picture, which a reel can spare for a moment. Everywhere else the
    foot is free and it stays there, above the tab bar.
  */
  const pathname = usePathname();
  const overReel = isMediaGroundRoute(pathname);
  /*
    Not on the plan link page (yuvoy-mobile#373). A friend opens it once from
    WhatsApp to answer a plan, and its address after the `#` is the plan's
    secret: no question about analytics there, and no analytics loaded from
    there, even for somebody who said yes elsewhere. Moving on to another
    page asks or loads as usual.
  */
  const planLink = isPlanLinkPath(pathname);

  // Loading analytics is a side effect of a granted choice, not of rendering.
  useEffect(() => {
    if (key && consent === "granted" && !planLink) void enable(key, host);
  }, [key, host, consent, planLink]);

  // Nothing counted, already answered, not yet in a browser, or a plan link.
  if (!counted || planLink || (ask !== "ask" && ask !== "ask-again"))
    return null;

  return (
    <div
      role="region"
      aria-label="Analytics choice"
      className={cn(
        "app-chrome ring-paper/12 rounded-card fixed inset-x-4 z-40 p-5 ring-1 lg:inset-x-auto lg:right-6 lg:max-w-md",
        overReel
          ? "top-[calc(4.5rem+env(safe-area-inset-top,0px))] lg:top-6"
          : "bottom-[calc(5.75rem+env(safe-area-inset-bottom,0px))] lg:bottom-6",
      )}
    >
      <h2 className="text-paper text-base font-bold text-balance">
        {CONSENT_WORDS.title}
      </h2>
      <p className="text-paper/80 mt-1 text-sm">{CONSENT_WORDS.lede}</p>
      {/*
        What is and is not counted, side by side on a phone: two short lists
        rather than a paragraph, so the answer is about something read, not a
        policy. The marks are drawn for the eye and said for the ear.
      */}
      <ul className="mt-3 grid grid-cols-2 gap-x-3 gap-y-1.5 text-xs">
        {CONSENT_WORDS.rows.map((row) => (
          <li
            key={row.text}
            className={cn(
              "flex items-start gap-1.5",
              row.counted ? "text-paper/90" : "text-paper/65",
            )}
          >
            {row.counted ? (
              <CheckIcon
                className="text-terra-soft mt-px size-3.5 shrink-0"
                aria-hidden="true"
              />
            ) : (
              <CloseIcon
                className="mt-px size-3.5 shrink-0"
                aria-hidden="true"
              />
            )}
            <span>
              <span className="sr-only">
                {row.counted ? "Counted: " : "Never counted: "}
              </span>
              {row.text}
            </span>
          </li>
        ))}
      </ul>
      <div className="mt-4 flex gap-2">
        <Button
          variant="paper"
          onClick={() => setConsent("granted")}
          className="flex-1"
        >
          {CONSENT_WORDS.yes}
        </Button>
        <Button
          variant="outlineOnDark"
          onClick={() => setConsent("denied")}
          className="flex-1"
        >
          {CONSENT_WORDS.no}
        </Button>
      </div>
      <p className="text-paper/70 mt-3 text-xs">{CONSENT_WORDS.reassure}</p>
      {/*
        The policy, at the moment somebody is asked to agree to something —
        yuvoy-app#15. A consent prompt that does not link what it is asking
        consent under is asking somebody to agree to a document they have no
        way to read.
      */}
      <LegalLinks tone="dark" className="mt-2 text-xs" />
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
