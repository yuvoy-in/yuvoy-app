"use client";

import {
  useEffect,
  useLayoutEffect,
  useRef,
  useState,
  type PointerEvent as ReactPointerEvent,
} from "react";
import Link from "@/components/ui/link";
import type { components } from "@/lib/api/schema.gen";
import { formatFromPrice } from "@/lib/format/money";
import { formatDuration } from "@/lib/format/time";
import { nextDepartureSentence } from "@/lib/feed/availability";
import {
  PANEL_DEPARTURES,
  departureHref,
  departurePhrase,
  useNextDepartures,
  type Departure,
  type NextDepartures,
} from "@/lib/feed/next-departures";
import {
  CheckIcon,
  ArrowRightIcon,
  ChevronRightIcon,
} from "@/components/ui/icons";
import { Button } from "@/components/ui/button";
import {
  DURATION,
  EASE,
  prefersReducedMotion,
  scaledDuration,
} from "@/lib/motion";

type ExperienceSummary = components["schemas"]["ExperienceSummary"];

/**
 * What the reel does not say, one tap away and without leaving the feed.
 *
 * ## Why a panel rather than the listing
 *
 * The overlay answers "what is this and could I go", which is what decides the
 * next swipe. It deliberately does not answer "what does it cost and who runs
 * it", because a feed that prices every card invites comparison before
 * understanding, and because that was most of what yuvoy-app#36 removed.
 *
 * But price is also the question that ends the most sessions when it goes
 * unanswered, and until now answering it cost a page load. This is the middle:
 * a traveller asks, and the answer arrives over the reel they are still
 * watching.
 *
 * The title, the price, the facts and the operator's evidence come from the
 * feed's own `ExperienceSummary`, so they open instantly, offline included.
 *
 * ## And the departures, since the redesign (traveller A, 3 Oct 2026)
 *
 * The panel used to make no request at all, and so could not do what a
 * traveller opening it is closest to wanting: pick a departure. Its action
 * said "See dates" and cost a page load. It now lists the next three open
 * departures, each one a way straight into checkout on it, read once, on the
 * first open (`useNextDepartures`, the listing bar's own read and rule). The
 * instant half never waits for it, and the action falls back to the listing
 * while the departures are loading, when they failed and when there are none.
 *
 * ## Non-modal, on purpose
 *
 * A `<dialog>` would bring a focus trap and a backdrop, and both stop the video
 * being watched. This covers a stated ceiling of the frame and no more, leaves
 * the clip running above it, and is dismissed four ways: the handle, a tap on
 * the picture, Escape, and scrolling on to the next reel.
 *
 * Nothing inside is reachable by tab while it is shut. That is `inert`, not a
 * `tabIndex` sweep: the attribute takes the subtree out of the accessibility
 * tree as well as out of the tab order, which is the difference between hidden
 * and merely unfocusable.
 *
 * ## It behaves as it looks (T05 A, approved 4 Oct 2026)
 *
 * It has a handle and a rounded top, so it is pulled down like a sheet: the
 * panel follows the finger on the handle one to one, and let go past 64px, or
 * flicked, it closes from where it is; otherwise it settles back (200ms). It
 * opens in 250ms and closes faster than it opens, in 200ms. The handle stays a
 * button, so the gesture is never the only way to close it (WCAG 2.5.7).
 */
export function ReelDetails({
  experience,
  href,
  open,
  onClose,
  id,
}: {
  experience: ExperienceSummary;
  href: string;
  open: boolean;
  onClose: () => void;
  /**
   * So the control that opens this can point at it with `aria-controls`.
   *
   * NOT `aria-labelledby` pointing the other way, which is what this was first.
   * `aria-labelledby` WINS over `aria-label` when both are present, so the
   * panel ended up named by the availability line that opened it: a group
   * called "Thu, 20 Aug · 3 seats left". `aria-controls` is the relationship
   * that was actually meant, and it leaves the panel free to say what it is.
   */
  id: string;
}) {
  const ref = useRef<HTMLDivElement | null>(null);
  const scrollRef = useRef<HTMLDivElement | null>(null);

  /*
    Nothing is rendered inside until the panel has actually been opened once.
    After that it stays, for the rest of this card's life.

    ## Why not simply render on `open`

    Because the way out would be ugly: the panel takes 200ms to slide down, and
    contents unmounted at the first frame leave an empty box sliding off the
    screen. Keeping them after the first open costs a few elements on a card the
    traveller has already engaged with.

    ## Why not render them always

    Two reasons, and the second is the one that bites.

    It is DOM nobody has asked for, on the screen that is the product, on the
    phones that can least afford it. And the panel names the experience it
    describes, so an always-mounted panel puts a SECOND copy of every title in
    the document: `getByText(title)` stops being unambiguous, which is not a
    test detail but a statement about the accessibility tree. `inert` hides the
    shut panel from assistive technology in a browser, and jsdom does not
    implement it, so a test cannot see the protection a real user gets.

    Rendering on demand makes the document say what it means in both.
  */
  const [everOpened, setEverOpened] = useState(false);
  if (open && !everOpened) setEverOpened(true);

  /*
    The pull on the handle. The panel's own transitions do the travel; while a
    finger holds it the panel follows inline, and its release hands the rest
    back to them from where it was let go.
  */
  const drag = useRef<PanelDrag | null>(null);
  /** The click a drag ends in is not a tap on the handle. */
  const swallow = useRef(false);
  /** Clears the release's own timing once it has run. */
  const release = useRef<number | undefined>(undefined);

  /*
    A fresh opening starts from the stylesheet, whatever the last release left
    inline; and a panel closed under a finger (Escape, the next reel) is let go
    so the stylesheet takes it from where it is. Before paint, so the opening
    never runs a release's leftover curve.
  */
  useLayoutEffect(() => {
    const panel = ref.current;
    if (!panel) return;
    if (open || drag.current) {
      window.clearTimeout(release.current);
      drag.current = null;
      panel.removeAttribute("data-held");
      panel.style.transition = "";
      panel.style.transform = "";
    }
  }, [open]);

  const onGrip = (e: ReactPointerEvent<HTMLButtonElement>) => {
    if (!open || e.button > 0 || !e.isPrimary) return;
    drag.current = {
      id: e.pointerId,
      y0: e.clientY,
      y: e.clientY,
      at: e.timeStamp,
      v: 0,
      dy: 0,
      on: false,
    };
    ref.current?.setAttribute("data-held", "");
  };

  const onPull = (e: ReactPointerEvent<HTMLButtonElement>) => {
    const d = drag.current;
    const panel = ref.current;
    if (!d || !panel || d.id !== e.pointerId) return;
    /*
      The card's swipe to the listing never sees a pull's moves, so a pull
      that wanders sideways stays a pull. Its press does reach the card: that
      is where the swipe forgets whatever its last gesture left behind.
    */
    e.stopPropagation();
    if (!d.on) {
      if (Math.abs(e.clientY - d.y0) < PULL.slop) return;
      d.on = true;
      try {
        e.currentTarget.setPointerCapture(e.pointerId);
      } catch {
        // Not captured: the pull still works while the finger is on the handle.
      }
      window.clearTimeout(release.current);
      panel.style.transition = "none";
      // From here, so the panel does not jump by the slop.
      d.y0 = e.clientY;
    }
    const dt = e.timeStamp - d.at;
    if (dt > 0) d.v = (e.clientY - d.y) / dt;
    d.y = e.clientY;
    d.at = e.timeStamp;
    d.dy = Math.max(0, e.clientY - d.y0);
    panel.style.transform = `translateY(${d.dy}px)`;
  };

  const onLetGo = (
    e: ReactPointerEvent<HTMLButtonElement>,
    cancelled: boolean,
  ) => {
    const d = drag.current;
    const panel = ref.current;
    if (!d || d.id !== e.pointerId) return;
    drag.current = null;
    panel?.removeAttribute("data-held");
    if (!d.on || !panel) return;
    e.stopPropagation();
    swallow.current = true;
    const closes = !cancelled && (d.dy > PULL.close || d.v >= PULL.flick);
    const reduced = prefersReducedMotion();
    let ms: number;
    if (reduced) {
      /*
        Nothing travels: a closing pull fades out where it was let go, then the
        panel goes home unseen; a short one is simply back.
      */
      ms = closes ? DURATION.reducedFade : 0;
      panel.style.transition = closes
        ? `opacity ${ms}ms linear, visibility 0s linear ${ms}ms`
        : "none";
      if (!closes) panel.style.transform = "";
    } else {
      const h = panel.offsetHeight || 1;
      ms = closes
        ? scaledDuration(h - Math.min(d.dy, h), h)
        : DURATION.standard;
      panel.style.transition = closes
        ? `transform ${ms}ms ${EASE.move}, visibility 0s linear ${ms}ms`
        : `transform ${ms}ms ${EASE.move}`;
      panel.style.transform = "";
    }
    release.current = window.setTimeout(() => {
      panel.style.transition = "";
      if (closes) panel.style.transform = "";
    }, ms + 50);
    if (closes) onClose();
  };

  /*
    `inert` is set imperatively because React does not yet type it as a DOM
    prop everywhere, and because setting it on a ref is the only way to be sure
    it lands on the element rather than being dropped as an unknown attribute.
  */
  useEffect(() => {
    const node = ref.current;
    if (!node) return;
    if (open) node.removeAttribute("inert");
    else node.setAttribute("inert", "");
  }, [open]);

  /*
    Focus goes into the panel when it opens.

    The line that opens it steps aside with the rest of the caption, so the
    focus it held was left on a control nobody could see, and the next Tab
    started from somewhere else entirely. The panel is a named group, so a
    screen reader announces what opened. Closing hands focus back to that line
    (the card does it, because it owns the line).
  */
  useEffect(() => {
    if (open) ref.current?.focus({ preventScroll: true });
  }, [open]);

  /*
    Whether there is more below, so the fade is drawn only when it means
    something.

    A `ResizeObserver` rather than a measurement on open: the panel's content
    is the same height every time, but the FRAME is not. A rotation, a
    different phone, a longer operator name and a listing that carries a party
    size all change whether this overflows, and none of them fire a scroll.
  */
  useEffect(() => {
    const node = scrollRef.current;
    if (!node) return;
    const mark = () => {
      const more = node.scrollHeight - node.clientHeight - node.scrollTop;
      node.setAttribute("data-more", more > 2 ? "true" : "false");
    };
    mark();
    node.addEventListener("scroll", mark);
    const observer = new ResizeObserver(mark);
    observer.observe(node);
    return () => {
      node.removeEventListener("scroll", mark);
      observer.disconnect();
    };
  }, [open]);

  const price = formatFromPrice(experience.fromPrice);
  const duration = formatDuration(experience.durationMinutes);
  const departure = nextDepartureSentence(experience);
  const instant = experience.bookingMode === "allotment";
  /*
    Asked only once the panel has been opened, and only for a listing with
    something on sale: `nextAvailable` absent is the contract saying nothing
    is bookable in ninety days, and a read to confirm it is a read for nothing.
  */
  const departures = useNextDepartures(
    experience.slug,
    everOpened && departure.bookable,
  );
  const first =
    departures.state === "open" ? departures.departures[0] : undefined;

  return (
    <div
      ref={ref}
      className="reel-sheet"
      data-open={open ? "open" : "shut"}
      // Ships its own reduced motion (a crossfade), so the global rule leaves it.
      data-motion=""
      id={id}
      role="group"
      aria-label={`Details, ${experience.title}`}
      // Focusable by script only, so focus can land here when it opens.
      tabIndex={-1}
      // Every press starts clean, whatever the last pull left behind.
      onPointerDownCapture={() => {
        swallow.current = false;
      }}
      onClickCapture={(e) => {
        if (!swallow.current) return;
        swallow.current = false;
        e.preventDefault();
        e.stopPropagation();
      }}
    >
      {/*
        The handle. The 4px bar is the affordance; the CONTROL is 36px tall and
        the full width of the panel, because a 4px target is not a target.
        Material and iOS both formalise a handle that can be operated as well as
        dragged, which is what makes this reachable without a gesture at all.
      */}
      <button
        type="button"
        onClick={onClose}
        aria-label="Close details"
        className="reel-sheet-handle"
        onPointerDown={onGrip}
        onPointerMove={onPull}
        onPointerUp={(e) => onLetGo(e, false)}
        onPointerCancel={(e) => onLetGo(e, true)}
      />

      {everOpened ? (
        <>
          <div ref={scrollRef} className="reel-sheet-scroll">
            {/*
          The name, and the way to it.

          The caption steps aside when this opens, taking its link with it, so
          without this the panel would describe an experience it never names and
          offer no route to it but the action at the foot.
        */}
            <Link href={href} className="reel-sheet-title">
              {experience.title}
            </Link>

            <p className="reel-sheet-price">
              {price ? (
                <>
                  <span className="reel-sheet-amount">{price}</span>
                  {/*
                The server's phrase, verbatim. Never built from `pricingUnit`:
                for a per-group charter "from ₹18,000 per person" is wrong twice,
                and a client deriving its own is a second copy of a rule this API
                owns.
              */}
                  {experience.pricingUnitLabel ? (
                    <span className="reel-sheet-unit">
                      {experience.pricingUnitLabel}
                    </span>
                  ) : null}
                </>
              ) : (
                /* `fromPrice` is absent until a real contracted price exists. Never
               render ₹0: this project removed a whole site for doing that. */
                <span className="reel-sheet-absent">Price on request</span>
              )}
            </p>

            {/*
              One line where three facts were: how long, and how booking
              works, in the listing's own words. The rows it replaced gave
              their room to the departures, which is what a traveller opening
              this is closest to wanting, and the panel has a ceiling.
            */}
            <p className="reel-sheet-line">
              {[duration, instant ? "Instant book" : "Operator confirms first"]
                .filter(Boolean)
                .join(" · ")}
            </p>

            {departure.bookable ? (
              <Departures
                state={departures}
                slug={experience.slug}
                instant={instant}
              />
            ) : (
              /* The absence, stated: the contract's own ninety days. */
              <p className="reel-sheet-absent mb-3">{departure.full}</p>
            )}

            <p className="mb-3">
              <Link href={href} className="reel-sheet-more">
                Everything about it
              </Link>
            </p>

            {/*
          Who runs it, and the evidence.

          Where a competitor writes a star average and a review count, this
          writes what was checked. `verified` is "every mandatory credential is
          on file, verified and unexpired": a statement about documents we hold,
          not a badge. An unverified business gets its name and nothing else,
          because the contract publishes a boolean and not a journey, so there
          is no pending state to draw.
        */}
            <div className="reel-sheet-operator">
              {/*
                Their page, one tap away (cited in the redesign's before page,
                3 Oct 2026): the panel named the business and went nowhere.
                `slug` is required on the summary and guarded anyway; without
                it the name stays plain text rather than a link to
                `/o/undefined`.
              */}
              <p className="reel-sheet-operator-name">
                {experience.operator.slug ? (
                  <Link
                    href={`/o/${experience.operator.slug}`}
                    className="tap-target decoration-paper/40 hover:decoration-paper underline underline-offset-4"
                  >
                    {experience.operator.name}
                  </Link>
                ) : (
                  experience.operator.name
                )}
              </p>
              {experience.operator.verified ? (
                <p className="reel-sheet-evidence">
                  <CheckIcon className="size-4 shrink-0" />
                  <span>
                    {experience.operator.credentialsSummary?.[0] ??
                      "Credentials checked and current"}
                  </span>
                </p>
              ) : null}
            </div>
          </div>

          {/*
        The action, pinned outside the scrolling body.

        The panel has a ceiling it may not break, so when the content does not
        fit the content gives way. This is the one control a traveller came here
        for, so it is the one thing that never leaves the screen.
      */}
          <div className="reel-sheet-foot">
            {/*
              The first open departure, booked from here, once the panel knows
              it. Until then, and whenever it cannot know (a failed read, none
              open), the action is the listing, as it was: this control never
              waits on the read and never goes nowhere.
            */}
            {first ? (
              <Link
                href={departureHref(experience.slug, first)}
                className="reel-sheet-cta"
              >
                <span>
                  {instant ? "Book " : "Ask for "}
                  {departurePhrase(first)}
                </span>
                <ArrowRightIcon />
              </Link>
            ) : (
              <Link href={href} className="reel-sheet-cta">
                <span>{departure.bookable ? "See dates" : "Have a look"}</span>
                <ArrowRightIcon />
              </Link>
            )}
          </div>
        </>
      ) : null}
    </div>
  );
}

/**
 * "Coming up": the next open departures, each one a way into checkout on it.
 *
 * Every state says something true and none is a dead end: loading is a
 * skeleton the size of what it will become, a failure says so and offers the
 * read again (the action below still opens the listing), and none open says
 * so in words.
 */
function Departures({
  state,
  slug,
  instant,
}: {
  state: NextDepartures;
  slug: string;
  instant: boolean;
}) {
  return (
    <section className="reel-sheet-deps" aria-label="Coming up">
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
const PULL = {
  /** A press becomes a pull past this many px. */
  slop: 6,
  /** Let go past this many px and it closes. */
  close: 64,
  /** Or flicked down at this speed, px per ms. */
  flick: 0.5,
} as const;

interface PanelDrag {
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
