"use client";

import Link from "next/link";
import type { components } from "@/lib/api/schema.gen";
import { FeedPlayer } from "./feed-player";
import { formatFromPrice } from "@/lib/format/money";
import { cn } from "@/lib/cn";

type ExperienceSummary = components["schemas"]["ExperienceSummary"];

/**
 * One experience, one card, full-bleed 9:16.
 *
 * Everything that decides whether somebody taps is on the card: the price, the
 * operator, whether it is instant or a request, and whether there is a date at
 * all. Nothing is behind a tap-to-reveal — the feed's job is to let a traveller
 * skip what is not for them without paying a round trip to find out.
 */
export function ExperienceCard({
  experience,
  active,
  mounted,
  muted,
  autoplayAllowed,
  index,
  total,
}: {
  experience: ExperienceSummary;
  active: boolean;
  mounted: boolean;
  muted: boolean;
  autoplayAllowed: boolean;
  index: number;
  total: number;
}) {
  const price = formatFromPrice(experience.fromPrice);
  const instant = experience.bookingMode === "allotment";

  return (
    <article
      // Read by the feed's single IntersectionObserver. The index travels on
      // the node rather than through a closure, so the observer does not need
      // to be rebuilt when the list re-renders.
      data-feed-index={index}
      className="bg-abyss relative h-full w-full snap-start snap-always overflow-hidden"
      aria-posinset={index + 1}
      aria-setsize={total}
      aria-label={experience.title}
    >
      {experience.heroMedia ? (
        <FeedPlayer
          media={experience.heroMedia}
          active={active}
          mounted={mounted}
          muted={muted}
          autoplayAllowed={autoplayAllowed}
        />
      ) : (
        // No media at all. Still a complete card — an editorial type plate,
        // the same fallback the marketing site's destination panels use.
        <div className="bg-abyss absolute inset-0 flex items-center justify-center px-8">
          <p className="font-display text-cream/30 text-center text-3xl leading-tight">
            {experience.title}
          </p>
        </div>
      )}

      {/*
        The scrim. Sized against the brightest pixel a clip can show, not the
        average — video moves, and a frame that is dark when the poster loads
        can be white surf two seconds later.
      */}
      <div
        aria-hidden="true"
        className="feed-scrim pointer-events-none absolute inset-x-0 bottom-0 h-2/3"
      />

      <div className="absolute inset-x-0 bottom-0 p-5 pb-7">
        {/* Operator, and what we can honestly say about them. */}
        <div className="flex items-center gap-2">
          <span className="label text-cream/70">
            {experience.operator.name}
          </span>
          {experience.operator.verified ? (
            <span className="label text-terra-soft">· Verified</span>
          ) : null}
        </div>

        <h2 className="font-display text-cream tracking-display mt-2 text-[1.75rem] leading-[1.05]">
          {experience.title}
        </h2>

        <div className="mt-3 flex flex-wrap items-baseline gap-x-3 gap-y-1">
          {/*
            `fromPrice` is absent until a real contracted price exists. Never
            render ₹0 — that would be a fabricated claim, and this project
            removed a whole site for doing exactly that.
          */}
          {price ? (
            <p className="text-cream text-lg font-bold">
              {price}
              <span className="text-cream/60 ml-1 text-xs font-normal">
                per person
              </span>
            </p>
          ) : (
            <p className="text-cream/70 text-sm">Price on request</p>
          )}

          <span
            className={cn(
              "label",
              instant ? "text-terra-soft" : "text-cream/70",
            )}
          >
            {instant ? "Instant book" : "Ask the operator"}
          </span>
        </div>

        {/*
          `nextAvailable` absent means nothing is bookable in 90 days — NOT
          "we did not check". Saying so here is what stops the tap that ends
          in "no dates", which is the tap that loses the traveller.
        */}
        <p className="text-cream/60 mt-2 text-xs">
          {experience.nextAvailable
            ? nextAvailableLabel(
                experience.nextAvailable,
                experience.seatsOnNext,
              )
            : "No dates in the next 90 days"}
        </p>

        <Link
          href={`/e/${experience.slug}`}
          className={cn(
            "rounded-edge label mt-4 flex h-12 items-center justify-center font-bold",
            "bg-cream text-forest transition-transform active:scale-[0.99]",
          )}
        >
          {experience.nextAvailable ? "See dates" : "Have a look"}
        </Link>
      </div>
    </article>
  );
}

/**
 * `seatsOnNext` is present only for allotment mode — a request-mode departure
 * holds nothing, so a number would be a promise we cannot keep.
 */
function nextAvailableLabel(date: string, seats?: number): string {
  const when = new Intl.DateTimeFormat("en-IN", {
    weekday: "short",
    day: "numeric",
    month: "short",
    timeZone: "Asia/Kolkata",
  }).format(new Date(`${date}T00:00:00+05:30`));

  if (typeof seats === "number" && seats > 0 && seats <= 5) {
    return `Next ${when} · ${seats} seat${seats === 1 ? "" : "s"} left`;
  }
  return `Next ${when}`;
}
