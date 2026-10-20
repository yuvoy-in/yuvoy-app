"use client";

import { useId, useSyncExternalStore } from "react";
import { cn } from "@/lib/cn";
import {
  consentAskServerSnapshot,
  consentAskSnapshot,
  consentServerSnapshot,
  consentSnapshot,
  setConsent,
  subscribeConsent,
  type ConsentAskRead,
  type ConsentRead,
} from "@/lib/analytics/consent";
import { COUNT_SETTING } from "@/lib/analytics/consent-words";

/**
 * The analytics answer, to change at any time (yuvoy-app#181).
 *
 * The question promises "change it any time", and until this the only place
 * it could be answered was the card that asks it, which goes once answered.
 * Taking a yes back has to be as easy as giving it, so it is here, on the tab
 * a traveller looks in for settings, in the phone app's words for its own
 * switch (`COUNT_SETTING`). Off stops counting at once: reel views and
 * outcomes drop what is queued and abort what is in flight.
 *
 * Kept for the visit, like the answer itself (`lib/analytics/consent.ts`).
 */
export function UsageSetting({ className }: { className?: string }) {
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
  const ids = useId();
  const titleId = `${ids}-title`;
  const subId = `${ids}-sub`;

  const known = consent !== "unknown";
  const on = consent === "granted";
  // A yes given to the older words counts reel views only, and says so.
  const words = on && ask === "ask-again" ? 1 : 2;

  return (
    <section aria-labelledby={`${ids}-head`} className={className}>
      <h2 id={`${ids}-head`} className="label text-forest/75">
        {COUNT_SETTING.head}
      </h2>
      <div className="mt-3 flex items-start justify-between gap-4">
        <div className="min-w-0">
          <p id={titleId} className="text-body font-bold text-pretty">
            {COUNT_SETTING.title[words]}
          </p>
          <p id={subId} className="text-forest/70 mt-1 text-sm text-pretty">
            {COUNT_SETTING.sub[words]}
          </p>
        </div>
        <button
          type="button"
          role="switch"
          aria-checked={on}
          aria-labelledby={titleId}
          aria-describedby={subId}
          // Undecided until the page is in a browser, which knows the answer.
          disabled={!known}
          onClick={() => setConsent(on ? "denied" : "granted")}
          // 44px tall, the system's control height, around a 28px track.
          className="flex min-h-11 min-w-11 shrink-0 items-center justify-center disabled:opacity-50"
        >
          <span
            aria-hidden="true"
            className={cn(
              "ease-interaction relative inline-flex h-7 w-12 items-center rounded-full transition-colors duration-200",
              on ? "bg-forest" : "bg-forest/20",
            )}
          >
            <span
              className={cn(
                "bg-paper ease-interaction inline-block size-5 rounded-full shadow-sm transition-transform duration-200",
                on ? "translate-x-6" : "translate-x-1",
              )}
            />
          </span>
        </button>
      </div>
      {known ? (
        <p className="text-forest/70 mt-3 text-xs">
          {COUNT_SETTING.foot[consent]}
        </p>
      ) : null}
    </section>
  );
}
