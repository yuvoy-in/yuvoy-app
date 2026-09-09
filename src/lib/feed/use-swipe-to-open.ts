"use client";

import { useCallback, useRef, type PointerEvent, type RefObject } from "react";
import { useRouter } from "next/navigation";

/**
 * Swipe a reel from right to left to open it — the gesture half of the card's
 * "See dates" button.
 *
 * ## It is a SHORTCUT, never the only way
 *
 * WCAG 2.5.1 asks that anything driven by a path-based gesture also work
 * without one, and that is not a box being ticked here: the button is the
 * primary control, it is on every card, it states where it goes, and it is
 * what a keyboard, a switch and a screen reader use. This hook adds a second
 * route to the same href for the thumb that is already on the glass. If the
 * two ever disagree about the destination that is a bug — which is why the
 * card builds the href once and hands the same string to both.
 *
 * ## What it refuses to touch
 *
 * - **A mouse.** Dragging with a mouse is how a person selects text and how
 *   they drag an image; hijacking it to navigate is the kind of surprise this
 *   pattern is notorious for. Pointer type is checked, not guessed.
 * - **The right edge.** On iOS a drag beginning within a couple of dozen
 *   pixels of the frame's edge belongs to the system's own back/forward
 *   gesture. Competing with it gives a traveller two navigations for one
 *   swipe, so the last {@link EDGE_GUARD} pixels are simply not ours.
 * - **A second finger.** `isPrimary` keeps a pinch from reading as a swipe.
 * - **The vertical axis.** The feed's whole reason for existing is the
 *   vertical scroll, so the axis is decided ONCE per gesture, and a gesture
 *   that goes to the scroller never comes back. See the lock below.
 *
 * ## Why the transform is written to the DOM by hand
 *
 * The card follows the finger, and following the finger through React state
 * is a re-render of a card holding a playing `<video>` on every pointermove —
 * sixty a second, on the screen that is the product, on the phones that can
 * least afford it. The offset is a compositor transform and nothing else in
 * the tree depends on it, so it is written straight to the node. React owns
 * everything about this card except one `style.transform` during a drag.
 *
 * Reduced motion still wins: the settle's `transition` is inline, and the
 * global `prefers-reduced-motion` rule in `globals.css` is `!important`.
 */

/** How far a finger travels before the gesture commits to an axis. */
const SLOP = 12;

/**
 * How much more horizontal than vertical a move must be to be a swipe.
 *
 * Above 1 on purpose. A feed is scrolled with the thumb, and a thumb arcs —
 * a "vertical" flick on a phone held one-handed carries real horizontal
 * movement with it. At 1.0 those arcs open experiences nobody asked for.
 */
const AXIS_BIAS = 1.4;

/** Travel that opens the experience on release. */
const COMMIT = 72;

/** The furthest the card will move, however far the finger goes. */
const MAX_TRAVEL = 96;

/** The strip along the right edge left to the platform's own gesture. */
const EDGE_GUARD = 24;

/** A flick this fast (px per ms, leftward) opens on less travel. */
const FLICK_VELOCITY = 0.5;

/** …but never on a nudge. */
const FLICK_TRAVEL = 40;

/**
 * The spring back, and the last of the slide out.
 *
 * Inside the design system's 250ms interaction budget (§3): this answers a
 * gesture the traveller is still making, and a card that takes half a second
 * to come back reads as the app thinking about it.
 */
const SETTLE_MS = 220;

/**
 * How far the card moves for a finger that has travelled `pulled` pixels.
 *
 * One-to-one up to the commit point, so the card is genuinely attached to the
 * thumb for the whole of the part that decides anything, and damped after it
 * onto an asymptote at {@link MAX_TRAVEL}. The two halves meet with the same
 * slope, so there is no step at the join — a rubber band that jerks at the
 * moment it starts resisting reads as a dropped frame.
 *
 * Exported for the unit tests: this is the only arithmetic in the gesture and
 * it is far easier to prove here than through a synthesised pointer stream.
 */
export function swipeTravel(pulled: number): number {
  if (pulled <= 0) return 0;
  if (pulled <= COMMIT) return pulled;
  const room = MAX_TRAVEL - COMMIT;
  return COMMIT + room * (1 - Math.exp(-(pulled - COMMIT) / room));
}

/**
 * Whether a released gesture opens the experience.
 *
 * Two ways to say yes, because a feed is used two ways: a deliberate drag
 * past the commit point, and a flick — short, fast, and finished before the
 * thumb has covered any distance at all. A flick still has to clear
 * {@link FLICK_TRAVEL}, so a fast tap-and-twitch is not a navigation.
 *
 * `velocity` is negative leftward, in px/ms.
 */
export function swipeOpens(pulled: number, velocity: number): boolean {
  if (pulled >= COMMIT) return true;
  return pulled >= FLICK_TRAVEL && velocity <= -FLICK_VELOCITY;
}

type Axis = "undecided" | "swipe" | "scroll";

/** Spread these on the element the finger lands on. */
export interface SwipeHandlers {
  onPointerDown: (e: PointerEvent) => void;
  onPointerMove: (e: PointerEvent) => void;
  onPointerUp: (e: PointerEvent) => void;
  onPointerCancel: (e: PointerEvent) => void;
  onClickCapture: (e: React.MouseEvent) => void;
}

/**
 * @param href     where the swipe leads — the card's own "See dates" target.
 * @param surfaceRef the element that follows the finger. Held by the CALLER
 *   rather than handed back from here: a hook that returns a ref inside an
 *   object makes every read of that object a ref access during render, which
 *   is what `react-hooks/refs` refuses. The caller owns its own DOM node
 *   anyway, so this is the honest shape as well as the legal one.
 */
export function useSwipeToOpen(
  href: string,
  surfaceRef: RefObject<HTMLElement | null>,
): SwipeHandlers {
  const router = useRouter();

  const pointer = useRef<number | null>(null);
  const axis = useRef<Axis>("undecided");
  const startX = useRef(0);
  const startY = useRef(0);
  const lastX = useRef(0);
  const lastAt = useRef(0);
  const velocity = useRef(0);
  /**
   * A click is coming and it is not a tap.
   *
   * A drag that ends on a control — the mute disc, the share disc, the button
   * itself — still produces a `click`, and acting on it would fire a control
   * the traveller was only resting a thumb on. Set when the gesture becomes a
   * swipe, cleared by the click it suppresses and by the next press, so it can
   * never outlive the gesture that set it.
   */
  const swallowClick = useRef(false);

  const paint = useCallback(
    (offset: number, animate: boolean) => {
      const el = surfaceRef.current;
      if (!el) return;
      el.style.transition = animate
        ? `transform ${SETTLE_MS}ms var(--ease-interaction)`
        : "none";
      el.style.transform = offset
        ? `translate3d(${offset.toFixed(2)}px, 0, 0)`
        : "";
    },
    [surfaceRef],
  );

  const onPointerDown = useCallback(
    (e: PointerEvent) => {
      // Every press starts a clean gesture, whatever the last one did.
      swallowClick.current = false;
      axis.current = "undecided";
      pointer.current = null;

      if (e.pointerType === "mouse" || !e.isPrimary) return;

      const el = surfaceRef.current;
      if (!el) return;

      /*
        The edge guard is skipped when the element has no box. That is jsdom
        in a unit test, and it is also a card that is not laid out — neither
        can be swiped, and a zero rect would otherwise put the guard at
        x < -24 and refuse every gesture on the feed.
      */
      const rect = el.getBoundingClientRect();
      if (rect.width > 0 && e.clientX > rect.right - EDGE_GUARD) return;

      pointer.current = e.pointerId;
      startX.current = e.clientX;
      startY.current = e.clientY;
      lastX.current = e.clientX;
      lastAt.current = e.timeStamp;
      velocity.current = 0;
    },
    [surfaceRef],
  );

  const onPointerMove = useCallback(
    (e: PointerEvent) => {
      if (pointer.current !== e.pointerId) return;
      if (axis.current === "scroll") return;

      const dx = e.clientX - startX.current;
      const dy = e.clientY - startY.current;

      if (axis.current === "undecided") {
        if (Math.abs(dx) < SLOP && Math.abs(dy) < SLOP) return;

        /*
          Decided once and never revisited. Re-deciding mid-gesture is what
          makes a swipe feel like it is fighting the scroll: a thumb that
          curves would hand the gesture back and forth, and the card would
          twitch sideways in the middle of a scroll.

          Rightward is not ours either — there is nothing to the left of a
          reel to reveal — so it goes to the scroller with everything else.
        */
        if (dx < 0 && Math.abs(dx) > Math.abs(dy) * AXIS_BIAS) {
          axis.current = "swipe";
          swallowClick.current = true;
          try {
            (e.currentTarget as Element).setPointerCapture?.(e.pointerId);
          } catch {
            // Already released, or a browser that will not capture this
            // pointer. The gesture still works; it just ends if the finger
            // leaves the card, which on a full-bleed reel means leaving the
            // screen.
          }
        } else {
          axis.current = "scroll";
          pointer.current = null;
          return;
        }
      }

      const dt = e.timeStamp - lastAt.current;
      if (dt > 0) velocity.current = (e.clientX - lastX.current) / dt;
      lastX.current = e.clientX;
      lastAt.current = e.timeStamp;

      paint(-swipeTravel(-dx), false);
    },
    [paint],
  );

  const onPointerUp = useCallback(
    (e: PointerEvent) => {
      if (pointer.current !== e.pointerId || axis.current !== "swipe") {
        pointer.current = null;
        axis.current = "undecided";
        return;
      }
      pointer.current = null;
      axis.current = "undecided";

      const pulled = Math.max(0, startX.current - e.clientX);
      if (swipeOpens(pulled, velocity.current)) {
        /*
          The card carries on out while the route changes under it. The button
          beside it is a `<Link>`, so this href is already prefetched and the
          screen is usually there before the slide finishes; when it is not,
          a card held aside reads as "opening" rather than as a dropped
          gesture.
        */
        paint(-MAX_TRAVEL, true);
        router.push(href);
      } else {
        paint(0, true);
      }
    },
    [href, paint, router],
  );

  const onPointerCancel = useCallback(
    (e: PointerEvent) => {
      if (pointer.current !== e.pointerId) return;
      // The browser claimed the gesture — a scroll started, a call arrived,
      // the app went to the background. Put the card back.
      pointer.current = null;
      axis.current = "undecided";
      paint(0, true);
    },
    [paint],
  );

  const onClickCapture = useCallback((e: React.MouseEvent) => {
    if (!swallowClick.current) return;
    swallowClick.current = false;
    e.preventDefault();
    e.stopPropagation();
  }, []);

  return {
    onPointerDown,
    onPointerMove,
    onPointerUp,
    onPointerCancel,
    onClickCapture,
  };
}
