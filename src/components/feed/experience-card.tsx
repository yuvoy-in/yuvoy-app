"use client";

import { useCallback, useId, useRef, useState } from "react";
import Link from "next/link";
import type { components } from "@/lib/api/schema.gen";
import { FeedPlayer } from "./feed-player";
import { ReelDetails } from "./reel-details";
import { useFeedStore } from "@/lib/feed/store";
import { useSwipeToOpen } from "@/lib/feed/use-swipe-to-open";
import { useSaved } from "@/lib/feed/use-saved";
import { nextDepartureSentence } from "@/lib/feed/availability";
import { IconButton } from "@/components/ui/icon-button";
import {
  BookmarkFilledIcon,
  BookmarkIcon,
  ChevronUpIcon,
  VolumeIcon,
  VolumeOffIcon,
} from "@/components/ui/icons";
import { ShareLink } from "@/components/ui/share-link";

type ExperienceSummary = components["schemas"]["ExperienceSummary"];
type Media = components["schemas"]["Media"];

/**
 * One reel, full-bleed 9:16, in the vertical scroller.
 *
 * ## The overlay, after two swings and a study
 *
 * It began carrying nine things: the operator, a Verified tag, the activity
 * type, the next departure, the price and its unit, an instant-or-request chip
 * and a full-width call to action. The owner walked it on a phone on 13
 * September and the reasoning did not survive contact: "I'm unable to see reel
 * fully, it is covered by lot of things" (yuvoy-app#36). It was cut to the
 * name and three discs.
 *
 * That cut was right about restraint and wrong about which words it kept. It
 * removed `nextAvailable`, whose absence the contract defines as *nothing
 * bookable in the next ninety days*, so the feed spent the next day sending
 * travellers to listings with no departures. `seatsOnNextDisplay`, built by the
 * API for this card, was rendered nowhere at all.
 *
 * The complaint was **spatial, not informational**. This is the answer to it:
 * the same restraint, spent on the two facts that decide a swipe, with
 * everything else one deliberate tap away.
 *
 * ## What is on the picture, and why each thing earns its place
 *
 * - **Activity and place.** On a feed where every clip is blue water, "Scuba
 *   diving · Havelock" is the difference between a scroll and a tap, and it is
 *   two words. Absent on a listing nobody has classified, in which case nothing
 *   is drawn rather than a prettified key.
 * - **The name.**
 * - **When you could go**, or the fact that you could not. This is the line
 *   that stops the losing tap, and it is also the control that opens the panel.
 * - **A rail**: sound, save, share, and the way out.
 *
 * Price, operator and evidence are behind the chevron. A feed that prices every
 * card invites comparison before understanding; a feed that never prices
 * anything makes every tap a coin flip. The panel is the middle, and it costs
 * no request: everything in it is already in this row.
 *
 * ## One job per control
 *
 * The chevron opens the panel. **Book** opens the listing. Neither carries the
 * other's meaning, which is what a right-pointing arrow that opened a panel was
 * doing before. The listing stays reachable four ways: Book, the title, a
 * right-to-left swipe, and the panel's own title and action.
 *
 * `feed-scrim` still sizes against the brightest pixel a clip can show rather
 * than the average, because video moves and a frame that is dark when the
 * poster loads can be white surf two seconds later. It is lighter and shorter
 * than it was; see `globals.css` for what that was measured against.
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
   * Passed in rather than read off `experience.heroMedia`: the feed is built on
   * `GET /reels`, where one listing may appear several times with a different
   * clip each. Optional, because a card with no clip is still a complete card.
   */
  media?: Media;
  active: boolean;
  mounted: boolean;
  muted: boolean;
  autoplayAllowed: boolean;
  index: number;
  /** How many reels the feed HAS, or `-1` when that is not yet known. */
  total: number;
}) {
  /*
    Built ONCE, and handed to every way in. Book, the title, the swipe and the
    panel are four routes to one screen; four string literals a hundred lines
    apart are how they quietly stop agreeing.
  */
  const href = `/e/${experience.slug}`;
  const surfaceRef = useRef<HTMLDivElement | null>(null);
  const swipeHandlers = useSwipeToOpen(href, surfaceRef);
  // Whether there is a clip to control. Set by the player; false for a poster
  // that will never play, so no dead mute disc is drawn.
  const [playable, setPlayable] = useState(false);
  const [detailsOpen, setDetailsOpen] = useState(false);
  const toggleMuted = useFeedStore((s) => s.toggleMuted);
  const setAutoplayAllowed = useFeedStore((s) => s.setAutoplayAllowed);
  const { isSaved, toggleSaved } = useSaved();

  const departure = nextDepartureSentence(experience);
  const saved = isSaved(experience.id);
  const panelId = useId();

  /*
    A card that scrolls out of view takes its panel with it.

    The panel covers the caption, so leaving one open on a card the traveller
    has left means returning to a reel with its own name hidden behind a panel
    about it. `active` is the strip's single source of truth for which reel is
    on screen, so this follows it rather than a scroll handler.
  */
  if (!active && detailsOpen) setDetailsOpen(false);

  const closeDetails = useCallback(() => setDetailsOpen(false), []);

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
      onKeyDown={(e) => {
        if (e.key === "Escape" && detailsOpen) {
          e.stopPropagation();
          setDetailsOpen(false);
        }
      }}
      /*
        Right to left opens this experience, the same href Book carries. The
        handlers sit on the ARTICLE so the whole card is the target, and the
        transform sits on the surface inside it so the snap child's own box is
        never touched: a scroll-snap area is the TRANSFORMED border box, and
        moving the element the scroller is snapping to is not a thing to find
        out about in production.
      */
      {...swipeHandlers}
    >
      <div
        ref={surfaceRef}
        className="relative h-full w-full"
        data-details={detailsOpen ? "open" : "shut"}
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
              answered the question the connection heuristic was guessing at.
            */
            onRequestPlay={() => setAutoplayAllowed(true)}
            /*
              Hidden while the panel is open.

              The panel's ground is 94% abyss, not 100%, so a 64px play glyph
              sitting at the centre of the card shows THROUGH it: not a z-order
              problem, a translucency one, and invisible to every test because
              both elements are exactly where they should be. It is also a
              control a traveller cannot reach while the panel covers it, and
              drawing one of those is drawing a lie.
            */
            hidden={detailsOpen}
          />
        ) : (
          /*
            No clip. Still a complete card: an editorial type plate, the same
            fallback the marketing site's destination panels use. The operator's
            logo goes above it when they have set one, because a business's own
            mark says more than a rectangle of nothing.
          */
          <div className="bg-abyss absolute inset-0 flex flex-col items-center justify-center gap-6 px-8">
            {experience.operator.logoUrl ? (
              // eslint-disable-next-line @next/next/no-img-element
              <img
                src={experience.operator.logoUrl}
                alt={experience.operator.name}
                className="max-h-20 w-auto max-w-[40%] object-contain opacity-80"
                loading="lazy"
                decoding="async"
              />
            ) : null}
            <p className="font-display text-paper/60 text-center text-3xl leading-tight">
              {experience.title}
            </p>
          </div>
        )}

        {/*
          Tapping the picture dismisses the panel.

          A layer rather than a handler on the player, so the shared component
          keeps knowing nothing about panels: it exists only while the panel is
          open, sits above the picture and below the panel, and is `aria-hidden`
          because the panel already has a named close control and a keyboard
          already has Escape. One tap does one thing.
        */}
        {detailsOpen ? (
          <button
            type="button"
            aria-hidden="true"
            tabIndex={-1}
            onClick={closeDetails}
            className="absolute inset-0 z-10 cursor-default"
          />
        ) : null}

        {/*
          The scrim. Sized against the brightest pixel a clip can show, not the
          average. Shorter and lighter than it was, and every number behind that
          is in `globals.css` beside the stops.
        */}
        <div
          aria-hidden="true"
          className="feed-scrim pointer-events-none absolute inset-x-0 bottom-0"
        />

        {/*
          The caption and the rail, bottom-aligned as one row.

          They are the two halves of a decision, which is why the rail is not
          floating higher up the frame: Book sits level with the line that says
          whether the tap is worth making. Both step aside when the panel opens,
          because the panel covers them and a control nobody can see must not
          still be reachable by a keyboard.
        */}
        <div className="feed-foot tabbar-clearance absolute inset-x-0 bottom-0 flex items-end gap-4 px-5">
          <div className="min-w-0 flex-1">
            {experience.activityTypeLabel || experience.location ? (
              <p className="label text-paper/70 mb-2">
                {[experience.activityTypeLabel, experience.location]
                  .filter(Boolean)
                  .join(" · ")}
              </p>
            ) : null}

            {/*
              The name, and a way in. A traveller who taps the title of the
              thing they are watching means to open it.

              `line-clamp-3` because a title is operator-written and unbounded,
              and a five-line headline over a reel is the complaint this screen
              started from.
            */}
            <h2 className="mb-2 min-w-0">
              <Link
                href={href}
                className="font-display text-paper tracking-display ease-interaction line-clamp-3 text-3xl leading-[1.05] transition-opacity duration-200 hover:opacity-80"
              >
                {experience.title}
              </Link>
            </h2>

            {/*
              When you could go, and the way to everything else.

              The whole line is the control, not the chevron alone: a 16px glyph
              is a 16px target, well under the 24px floor, and the line is what a
              thumb is aiming at anyway. 44px tall, the system's `md`, which is
              where it returned on 15 September when the owner reversed the
              "looks large" call.
            */}
            <button
              type="button"
              aria-expanded={detailsOpen}
              aria-controls={panelId}
              onClick={() => setDetailsOpen((open) => !open)}
              className="ease-interaction flex min-h-11 items-center text-left text-sm transition-opacity duration-200 hover:opacity-80"
            >
              <span
                className={departure.bookable ? "text-paper" : "text-paper/60"}
              >
                {departure.short}
              </span>
              {/*
                The server's own sentence, printed verbatim, and paper rather
                than the accent: `terra-soft` needs 79% abyss under it to clear
                4.5:1 over the palest surf, and the lighter scrim only reaches
                that below the caption. The scarcity is said by the words.
              */}
              {departure.seats ? (
                <span className="text-paper/70">
                  <span aria-hidden="true" className="mx-[0.4em] opacity-60">
                    ·
                  </span>
                  {departure.seats}
                </span>
              ) : null}
              <ChevronUpIcon className="text-paper/70 ml-2 size-4 shrink-0" />
            </button>
          </div>

          {/*
            The rail: sound, save, share, then the way out at the foot of it.

            The first three are translucent discs; Book is the system's solid
            paper control. That difference is doing real work: four identical
            discs would say that leaving the feed is worth exactly as much as
            muting it, and Book is the only one of the four that goes anywhere.
          */}
          <div className="flex shrink-0 flex-col items-end gap-3">
            {playable ? (
              <IconButton
                label={muted ? "Unmute" : "Mute"}
                variant="onDark"
                size="md"
                onClick={toggleMuted}
              >
                {muted ? <VolumeOffIcon /> : <VolumeIcon />}
              </IconButton>
            ) : null}

            {/*
              Save: a private wishlist, not a like.

              Nothing here is counted, published, or shown to an operator, which
              is why it is a bookmark and not a heart. It is device-local until
              yuvoy-api#192 lands; `use-saved` is written against an interface so
              that is a one-file swap.
            */}
            <IconButton
              label={
                saved
                  ? `Saved. Remove ${experience.title}`
                  : `Save ${experience.title}`
              }
              variant="onDark"
              size="md"
              aria-pressed={saved}
              className={
                saved ? "text-terra-soft ring-terra-soft/45" : undefined
              }
              onClick={() => toggleSaved(experience.id)}
            >
              {saved ? <BookmarkFilledIcon /> : <BookmarkIcon />}
            </IconButton>

            {/*
              The REEL, not the listing. Somebody sharing a clip means the clip.
              A card with no clip has nothing to share but the listing, and says
              so in its own label rather than sending a `/r/` address for a reel
              that does not exist.
            */}
            <ShareLink
              path={media ? `/r/${media.id}` : href}
              title={experience.title}
              label={media ? "Share this reel" : "Share this experience"}
              variant="onDark"
              size="md"
            />

            <Link href={href} className="feed-book">
              {departure.bookable ? "Book" : "View"}
            </Link>
          </div>
        </div>

        {/*
          Only the ACTIVE card carries a panel.

          Mounted for every card it is twelve panels of DOM on the first page
          alone, eleven of which can never be seen: a traveller can only open
          the reel they are looking at. On a mid-range Android that is real
          weight on the screen that is the product, for nothing.

          Mounted rather than conditional on `open`, though, because the slide
          needs a "from" state: a panel that appears already in place pops, and
          the active card's panel is the one that is about to be asked for.
        */}
        {active ? (
          <ReelDetails
            experience={experience}
            href={href}
            open={detailsOpen}
            onClose={closeDetails}
            id={panelId}
          />
        ) : null}
      </div>
    </article>
  );
}
