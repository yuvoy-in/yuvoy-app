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
type Media = components["schemas"]["Media"];

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
  media,
  active,
  mounted,
  muted,
  autoplayAllowed,
  index,
  total,
}: {
  experience: ExperienceSummary;
  /**
   * The clip this card is showing.
   *
   * Passed in rather than read off `experience.heroMedia`, and that is the
   * whole shape of yuvoy-app#18: the feed is built on `GET /reels`, where one
   * listing may appear several times with a different clip each — a listing's
   * hero is one of its reels, not the only one a traveller may see.
   *
   * Optional, because a card with no clip is still a complete card. That is a
   * real state on `/e/[slug]` and a defensive one in the feed, where the
   * contract makes `media` optional even though the endpoint is reels.
   */
  media?: Media;
  active: boolean;
  mounted: boolean;
  muted: boolean;
  autoplayAllowed: boolean;
  index: number;
  /**
   * How many reels the feed HAS, or `-1` when that is not yet known.
   *
   * `-1` is ARIA's own value for an unknown set size, and it is what an
   * unfinished infinite scroll actually knows. See `Feed`'s `setSize`.
   */
  total: number;
}) {
  const price = formatFromPrice(experience.fromPrice);
  const instant = experience.bookingMode === "allotment";
  // Whether there is a clip to control. Set by the player; false for a
  // poster that will never play, so no dead mute disc is drawn.
  const [playable, setPlayable] = useState(false);
  const toggleMuted = useFeedStore((s) => s.toggleMuted);
  const setAutoplayAllowed = useFeedStore((s) => s.setAutoplayAllowed);

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
      {media ? (
        <FeedPlayer
          media={media}
          active={active}
          mounted={mounted}
          muted={muted}
          autoplayAllowed={autoplayAllowed}
          onPlayableChange={setPlayable}
          /*
            Asked once, trusted from then on. A traveller who taps play has
            answered the question the connection heuristic was guessing at, so
            the rest of the feed stops guessing — scrolling to the next card
            and having to tap again would read as the app not listening.
          */
          onRequestPlay={() => setAutoplayAllowed(true)}
        />
      ) : (
        /*
          No clip. Still a complete card — an editorial type plate, the same
          fallback the marketing site's destination panels use.

          The operator's logo goes above it when they have set one, because a
          business's own mark says more than a rectangle of nothing. It is
          `logoUrl` on `OperatorSummary`, "present when the business has set a
          logo, absent when not" — so there is no placeholder branch and no
          broken-image state to design around.
        */
        <div className="bg-abyss absolute inset-0 flex flex-col items-center justify-center gap-6 px-8">
          {experience.operator.logoUrl ? (
            /*
              A plain `<img>`, deliberately. `next/image` needs every remote
              host in `remotePatterns`, which would make adding a partner a
              deploy — and this is a small mark on a card that has no clip,
              not the LCP element.
            */
            // eslint-disable-next-line @next/next/no-img-element
            <img
              src={experience.operator.logoUrl}
              alt={experience.operator.name}
              className="max-h-20 w-auto max-w-[40%] object-contain opacity-80"
              loading="lazy"
              decoding="async"
            />
          ) : null}
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
                    experience.seatsOnNextDisplay,
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
 * The next departure, and what the server says about its seats.
 *
 * ## `seatsOnNextDisplay` is rendered verbatim, and the threshold is gone
 *
 * This function used to take `seatsOnNext` (an integer) and print "N seats
 * left" below a threshold of five that it kept ITSELF — a second copy of a
 * rule the server owns. "The moment the threshold moves — or counts start
 * being suppressed — the card and the slot row disagree about the same
 * departure."
 *
 * So the server now decides the sentence and the card prints it. Absent means
 * **say nothing about availability**, not "derive one from `seatsOnNext`":
 * both live listings are `request` mode today and the field correctly does not
 * appear on either, because a request-mode departure holds nothing until an
 * operator says yes and a seat count there is a promise Yuvoy cannot keep.
 *
 * yuvoy-api#92 — the field existed only inside `BookingMode`'s description
 * until 6 September, which is why the threshold survived this long.
 */
function nextAvailableLabel(date: string, seatsSentence?: string): string {
  const when = new Intl.DateTimeFormat("en-IN", {
    weekday: "short",
    day: "numeric",
    month: "short",
    timeZone: "Asia/Kolkata",
  }).format(new Date(`${date}T00:00:00+05:30`));

  return seatsSentence ? `Next ${when} · ${seatsSentence}` : `Next ${when}`;
}
