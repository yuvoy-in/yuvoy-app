"use client";

import { useRef, useState } from "react";
import Link from "next/link";
import type { components } from "@/lib/api/schema.gen";
import { FeedPlayer } from "./feed-player";
import { useFeedStore } from "@/lib/feed/store";
import { useSwipeToOpen } from "@/lib/feed/use-swipe-to-open";
import { IconButton, IconLink } from "@/components/ui/icon-button";
import {
  ArrowRightIcon,
  VolumeIcon,
  VolumeOffIcon,
} from "@/components/ui/icons";
import { ShareLink } from "@/components/ui/share-link";

type ExperienceSummary = components["schemas"]["ExperienceSummary"];
type Media = components["schemas"]["Media"];

/**
 * One reel, full-bleed 9:16, in the vertical scroller.
 *
 * ## The overlay is the reel's name and three controls, and nothing else
 *
 * It used to carry everything that might decide a tap — the operator, a
 * Verified tag, the activity type, the next departure, the price and its unit,
 * an instant-or-request chip and a full-width call to action — on the stated
 * reasoning that a traveller should be able to skip what is not for them
 * without paying a round trip. The owner walked it on a phone on 13 September
 * and the reasoning did not survive contact: "I'm unable to see reel fully, it
 * is covered by lot of things" (yuvoy-app#36).
 *
 * So the reel is the product and the overlay gets out of its way. Everything
 * removed is one tap away behind the arrow, and the arrow, the title and a
 * right-to-left swipe are three routes to the same listing.
 *
 * `feed-scrim` still sizes against the brightest pixel a clip can show rather
 * than the average, because video moves and a frame that is dark when the
 * poster loads can be white surf two seconds later.
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
  /*
    Built ONCE, and handed to all three ways in. The arrow, the title and the
    swipe are three routes to one screen; three string literals a hundred lines
    apart are how they quietly stop agreeing.
  */
  const href = `/e/${experience.slug}`;
  const surfaceRef = useRef<HTMLDivElement | null>(null);
  const swipeHandlers = useSwipeToOpen(href, surfaceRef);
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
      className="feed-card bg-abyss relative h-full w-full snap-start snap-always overflow-hidden"
      aria-posinset={index + 1}
      aria-setsize={total}
      aria-label={experience.title}
      /*
        Right to left opens this experience — the same href the button below
        carries. The handlers sit on the ARTICLE so the whole card is the
        target, and the transform sits on the surface inside it so the snap
        child's own box is never touched: a scroll-snap area is the
        TRANSFORMED border box, and moving the element the scroller is
        snapping to is not a thing to find out about in production.
      */
      {...swipeHandlers}
    >
      <div ref={surfaceRef} className="relative h-full w-full">
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
              A plain `<img>`, deliberately: a small mark on a card that has
              no clip, not the LCP element, loaded straight from Cloudflare
              Images — the host the CSP's `img-src` names for it.
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

        {/*
          The overlay, cut back to the picture — yuvoy-app#36.

          The owner's words on their own phone: "I'm unable to see reel fully,
          it is covered by lot of things." What was here was the operator's
          name, a Verified tag, the activity type, the next departure, the
          price and its unit, an instant-or-request chip, and a full-width
          call to action. Nine things over a video, each defensible on its own
          and collectively a card with a clip behind it.

          What is left is the reel, its name, and three controls. Everything
          removed is one tap away on the listing, which is what the arrow is
          for; nothing is hidden behind a tap-to-reveal, because a reel is a
          decision about whether to look closer and the overlay was answering
          a question nobody had asked yet.

          The foot is `tabbar-clearance`: the bar no longer retracts, so the
          caption clears it on every reel rather than moving out of its way and
          back. One number, the same one every other screen leaves.
        */}
        <div className="tabbar-clearance absolute inset-x-0 bottom-0 px-5">
          <div className="flex items-end gap-4">
            {/*
              The name, and a way in. The `<h2>` used to be plain text with the
              real route on a button below it; a traveller who taps the title
              of the thing they are watching means to open it, and did nothing.

              `line-clamp-3` because a title is operator-written and unbounded,
              and a five-line headline over a reel is the same complaint this
              issue is about. It clamps rather than truncating to one line, so
              a long name is still readable.
            */}
            <h2 className="min-w-0 flex-1">
              <Link
                href={href}
                className="font-display text-cream tracking-display ease-interaction line-clamp-3 text-[2rem] leading-[1.05] transition-opacity duration-200 hover:opacity-80"
              >
                {experience.title}
              </Link>
            </h2>

            {/*
              The rail. Arrow above sound and share, as asked.

              The arrow is `paper` — the system's solid cream disc — while the
              other two are translucent. With the call to action gone this is
              the only way forward on the card, and a rail of three identical
              discs would say the way out of the feed is worth exactly as much
              as muting it. It carries the same href as the swipe and the
              title, built once above.
            */}
            <div className="flex shrink-0 flex-col gap-3">
              <IconLink
                href={href}
                label={`Open ${experience.title}`}
                variant="paper"
              >
                <ArrowRightIcon />
              </IconLink>
              {playable ? (
                <IconButton
                  label={muted ? "Unmute" : "Mute"}
                  variant="onDark"
                  onClick={toggleMuted}
                >
                  {muted ? <VolumeOffIcon /> : <VolumeIcon />}
                </IconButton>
              ) : null}
              {/*
                The REEL, not the listing — yuvoy-app#36. Somebody sharing a
                clip means the clip. A card with no clip has nothing to share
                but the listing, and says so in its own label rather than
                sending a `/r/` address for a reel that does not exist.
              */}
              <ShareLink
                path={media ? `/r/${media.id}` : href}
                title={experience.title}
                label={media ? "Share this reel" : "Share this experience"}
                variant="onDark"
              />
            </div>
          </div>
        </div>
      </div>
    </article>
  );
}
