"use client";

import { useState } from "react";
import type { components } from "@/lib/api/schema.gen";
import { FeedPlayer } from "./feed-player";
import { formatFromPrice } from "@/lib/format/money";
import { useFeedStore } from "@/lib/feed/store";
import { ButtonArrow, ButtonLink } from "@/components/ui/button";
import { Chip } from "@/components/ui/chip";
import { IconButton } from "@/components/ui/icon-button";
import {
  CheckIcon,
  VolumeIcon,
  VolumeOffIcon,
  ZapIcon,
} from "@/components/ui/icons";
import { ShareExperience } from "@/components/experience/share-experience";

type ExperienceSummary = components["schemas"]["ExperienceSummary"];

/**
 * One experience, one card, full-bleed 9:16.
 *
 * Everything that decides whether somebody taps is on the card: the price, the
 * operator, whether it is instant or a request, and whether there is a date at
 * all. Nothing is behind a tap-to-reveal — the feed's job is to let a traveller
 * skip what is not for them without paying a round trip to find out.
 *
 * The caption's ORDER is load-bearing for contrast (see `feed-scrim`): the
 * accent chip sits in the bottom band, beside the price, where the scrim is
 * nearly closed; the operator line above the title is cream, never accent.
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
  // Whether there is a clip to control. Set by the player; false for a
  // poster that will never play, so no dead mute disc is drawn.
  const [playable, setPlayable] = useState(false);
  const toggleMuted = useFeedStore((s) => s.toggleMuted);

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
          onPlayableChange={setPlayable}
        />
      ) : (
        // No media at all. Still a complete card — an editorial type plate,
        // the same fallback the marketing site's destination panels use.
        <div className="bg-abyss absolute inset-0 flex items-center justify-center px-8">
          <p className="font-display text-cream/60 text-center text-3xl leading-tight">
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

      <div className="tabbar-clearance absolute inset-x-0 bottom-0 px-5">
        <div className="flex items-end gap-4">
          <div className="min-w-0 flex-1">
            {/* Operator, and what we can honestly say about them. */}
            <div className="flex flex-wrap items-center gap-2">
              <span className="label text-cream/70">
                {experience.operator.name}
              </span>
              {experience.operator.verified ? (
                <Chip surface="dark" size="sm">
                  <CheckIcon className="size-3.5" />
                  Verified
                </Chip>
              ) : null}
            </div>

            <h2 className="font-display text-cream tracking-display mt-2 text-[2rem] leading-[1.05]">
              {experience.title}
            </h2>

            {/*
              `nextAvailable` absent means nothing is bookable in 90 days — NOT
              "we did not check". Saying so here is what stops the tap that ends
              in "no dates", which is the tap that loses the traveller.
            */}
            <p className="text-cream/70 mt-2 text-xs">
              {experience.nextAvailable
                ? nextAvailableLabel(
                    experience.nextAvailable,
                    experience.seatsOnNext,
                  )
                : "No dates in the next 90 days"}
            </p>

            <div className="mt-3 flex flex-wrap items-center gap-x-3 gap-y-2">
              {/*
                `fromPrice` is absent until a real contracted price exists. Never
                render ₹0 — that would be a fabricated claim, and this project
                removed a whole site for doing exactly that.
              */}
              {price ? (
                <p className="text-cream text-lg font-bold">
                  {price}
                  <span className="text-cream/70 ml-1.5 text-xs font-normal">
                    per person
                  </span>
                </p>
              ) : (
                <p className="text-cream/70 text-sm">Price on request</p>
              )}

              <Chip
                surface="dark"
                tone={instant ? "accent" : "neutral"}
                size="sm"
              >
                {instant ? <ZapIcon className="size-3.5" /> : null}
                {instant ? "Instant book" : "Ask the operator"}
              </Chip>
            </div>
          </div>

          {/* The action rail. Only controls that do something are drawn. */}
          <div className="flex shrink-0 flex-col gap-3">
            {playable ? (
              <IconButton
                label={muted ? "Unmute" : "Mute"}
                variant="onDark"
                onClick={toggleMuted}
              >
                {muted ? <VolumeOffIcon /> : <VolumeIcon />}
              </IconButton>
            ) : null}
            <ShareExperience
              slug={experience.slug}
              title={experience.title}
              variant="onDark"
            />
          </div>
        </div>

        <ButtonLink
          href={`/e/${experience.slug}`}
          variant="paper"
          size="lg"
          block
          className="mt-5"
        >
          {experience.nextAvailable ? "See dates" : "Have a look"}
          <ButtonArrow />
        </ButtonLink>
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
