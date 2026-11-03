"use client";

import { useRef } from "react";
import Link from "@/components/ui/link";
import {
  PANEL_DEPARTURES,
  departureHref,
  type Departure,
  type NextDepartures,
} from "@/lib/feed/next-departures";
import { ChevronRightIcon } from "@/components/ui/icons";
import { Button } from "@/components/ui/button";
import { useHeightGlide } from "@/lib/motion/use-height-glide";

/**
 * "Coming up": the next open departures, each one a way into checkout on it.
 *
 * Every state says something true and none is a dead end: loading is a
 * skeleton the size of what it will become, a failure says so and offers the
 * read again (the action below still opens the listing), and none open says
 * so in words.
 *
 * The skeleton is the size of three, and a listing may have fewer, none, or a
 * read that failed. The panel fits its details, so its top moves when they
 * land at another height; it glides there while the panel is open
 * (`useHeightGlide`), rather than jumping.
 */
export function Departures({
  state,
  slug,
  instant,
  open,
}: {
  state: NextDepartures;
  slug: string;
  instant: boolean;
  /** Whether the panel is open: a shut panel has nothing to glide. */
  open: boolean;
}) {
  const ref = useRef<HTMLElement | null>(null);
  useHeightGlide(
    ref,
    state.state === "open" ? `open:${state.departures.length}` : state.state,
    open,
  );
  return (
    <section ref={ref} className="reel-sheet-deps" aria-label="Coming up">
      <p className="reel-sheet-deps-head">
        <span className="label text-paper/75">Coming up</span>
        {state.state === "open" ? (
          <span className="text-paper/70 text-xs">
            {instant ? "Tap one to book it" : "Tap one to ask"}
          </span>
        ) : null}
      </p>

      {state.state === "open" ? (
        <ul className="reel-sheet-dep-list">
          {state.departures.map((d) => (
            <li key={d.slotId}>
              <DepartureRow departure={d} slug={slug} instant={instant} />
            </li>
          ))}
        </ul>
      ) : state.state === "error" ? (
        <div className="reel-sheet-deps-note">
          <p>The departures did not load. The listing has them too.</p>
          <Button
            variant="outlineOnDark"
            size="sm"
            className="mt-2"
            onClick={state.retry}
          >
            Try again
          </Button>
        </div>
      ) : state.state === "none" ? (
        <p className="reel-sheet-deps-note">Nothing open to book right now.</p>
      ) : (
        <div role="status" aria-label="Loading departures">
          {Array.from({ length: PANEL_DEPARTURES }, (_, i) => (
            <span
              key={i}
              aria-hidden="true"
              className="reel-sheet-dep-skeleton"
            >
              <span className="reel-sheet-dep-skeleton-bar" />
            </span>
          ))}
        </div>
      )}
    </section>
  );
}

function DepartureRow({
  departure,
  slug,
  instant,
}: {
  departure: Departure;
  slug: string;
  instant: boolean;
}) {
  return (
    <Link href={departureHref(slug, departure)} className="reel-sheet-dep">
      {/* The verb, for a screen reader: sighted travellers have the hint. */}
      {/*
        Spaces between the parts are real text, so the link's name reads
        "Book Tomorrow 07:00 3 seats left" and not "Tomorrow07:00". A grid
        container drops whitespace-only text, so nothing moves on screen.
      */}
      <span className="sr-only">{instant ? "Book" : "Ask for"}</span>{" "}
      <span className="reel-sheet-dep-day">{departure.day}</span>{" "}
      <span className="reel-sheet-dep-time">{departure.time}</span>{" "}
      {departure.seats ? (
        <span className="reel-sheet-dep-seats">{departure.seats}</span>
      ) : (
        <span className="reel-sheet-dep-seats" aria-hidden="true" />
      )}
      <ChevronRightIcon className="text-paper/60 size-4 shrink-0" />
    </Link>
  );
}

/** The pull on the handle (T05 A). */
export const PULL = {
  /** A press becomes a pull past this many px. */
  slop: 6,
  /** Let go past this many px and it closes. */
  close: 64,
  /** Or flicked down at this speed, px per ms. */
  flick: 0.5,
} as const;

export interface PanelDrag {
  id: number;
  y0: number;
  y: number;
  at: number;
  /** Downward speed, px per ms. */
  v: number;
  /** How far the panel is pulled, px. */
  dy: number;
  on: boolean;
}
