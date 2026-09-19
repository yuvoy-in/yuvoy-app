"use client";

import { useEffect, useRef, useState } from "react";
import Image from "next/image";
import type { components } from "@/lib/api/schema.gen";
import { cn } from "@/lib/cn";

type Media = components["schemas"]["Media"];

/**
 * Poster-first video.
 *
 * The architecture, not a fallback. `posterUrl` always resolves; `hlsUrl` is
 * not populated before M15 and may never be for a given clip. A card is
 * COMPLETE with only a poster — playback is progressive enhancement, and on a
 * 0.5-3 Mbps connection the poster is what most travellers see anyway.
 *
 * Three rules hold this together:
 *   - Scroll is never blocked on a network request.
 *   - hls.js (~150 KB) is imported only when the browser cannot play HLS
 *     natively. Safari and iOS can, and that is most of our traffic.
 *   - A failed clip degrades to its poster silently. A broken-video icon on
 *     the feed reads as a broken app.
 *
 * `onPlayableChange` tells the card whether there is a clip to control, so
 * the mute disc exists only when there is sound to mute. A control for a
 * poster that will never play is a control that does nothing.
 *
 * ## Two questions, kept apart — yuvoy-app#17
 *
 * "Should this play by itself?" and "may this play at all?" are different, and
 * this file used to answer both with `autoplayAllowed`. The `<video>` was not
 * rendered unless autoplay was permitted, so on every browser without the
 * Network Information API — Safari, Firefox, all of iOS — the element never
 * existed and the poster was the entire experience, with nothing to tap.
 *
 * Now: `autoplayAllowed` decides only whether playback STARTS on its own, and
 * a traveller can always ask. Asking is what `onRequestPlay` is for, and once
 * they have asked once the feed stops second-guessing the connection for the
 * rest of the session.
 *
 * ## Starting is not refusing - yuvoy-app#78
 *
 * The owner reported a play icon appearing over every reel before it began
 * playing by itself. It was three defects wearing one symptom, and all three
 * are fixed here and in `store.ts`.
 *
 *   1. **The store began in the refusing state.** `autoplayAllowed` was
 *      `false` until an effect corrected it, and the `<video>` was not even
 *      RENDERED unless it was true. So first paint had no video element and a
 *      tap-to-play control over the poster, on every card, every load. The
 *      store answers `undefined` now, and the element no longer hangs off the
 *      decision: `hasClip` draws it, `mayPlay` starts it.
 *
 *   2. **"Starting" and "refused" were the same state.** The control keyed off
 *      the ABSENCE of the `playing` event, so everything before the first
 *      frame - element mount, source attach, manifest, buffer - drew it. On a
 *      0.5-3 Mbps island connection that window is seconds long. It is now
 *      drawn only on evidence of refusal: a decision that actually said no, or
 *      a `play()` the browser actually rejected.
 *
 *   3. **The preload budget bought no bytes on iOS.** `preload="none"` is
 *      correct for a card nobody may play; it was applied to every card. On
 *      the hls.js path `loadSource` fetches anyway, so Android pre-buffered
 *      and Safari did not - and Safari plus iOS is most of our traffic. So the
 *      neighbour the budget mounted still started cold. `preload` now follows
 *      the decision: `none` until we may play, `metadata` for a mounted
 *      neighbour, `auto` for the card in view.
 *
 * The rule that falls out, and the one to keep: **nothing renders a refusal
 * the app has not actually been given.**
 */
export function FeedPlayer({
  media,
  active,
  mounted,
  muted,
  autoplayAllowed,
  onPlayableChange,
  onRequestPlay,
  hidden,
  className,
}: {
  media: Media;
  /** This card fills the viewport. */
  active: boolean;
  /** Inside the preload budget — may hold a video element at all. */
  mounted: boolean;
  muted: boolean;
  /** `undefined` until the browser has been asked. Undecided is not refused. */
  autoplayAllowed: boolean | undefined;
  onPlayableChange?: (playable: boolean) => void;
  /**
   * Draw no play control, whatever the clip is doing.
   *
   * For a caller that has put something over the picture: the control would be
   * unreachable, and on a translucent surface it is also VISIBLE through what
   * covers it. Playback itself is untouched, so a clip keeps running behind.
   */
  hidden?: boolean;
  /** The traveller asked for video. Lets the feed stop asking the connection. */
  onRequestPlay?: () => void;
  className?: string;
}) {
  const videoRef = useRef<HTMLVideoElement | null>(null);
  const [playable, setPlayable] = useState(false);
  const [failed, setFailed] = useState(false);
  /** They tapped play on THIS card, whatever the connection thinks. */
  const [asked, setAsked] = useState(false);
  const [playing, setPlaying] = useState(false);
  /**
   * Which attempt the browser refused, rather than merely that one was.
   *
   * A bare boolean needed an effect to clear it when a traveller tapped play,
   * and a synchronous `setState` in an effect body is a cascading render the
   * React compiler rejects outright. Naming the attempt removes the reset: a
   * refusal recorded for the automatic start does not survive into the one
   * they asked for, and the derivation below simply stops matching.
   */
  const [rejectedFor, setRejectedFor] = useState<"auto" | "asked" | null>(null);

  const src = media.hlsUrl;

  /** There is a clip here, and it has not failed. Nothing about starting it. */
  const hasClip = Boolean(src) && mounted && !failed;

  /*
    May playback start by itself?

    `autoplayAllowed === true`, not a truthiness test: `undefined` is undecided
    and must not fall through to the refusing branch. That distinction is #78.
  */
  const mayPlay = autoplayAllowed === true || asked;

  /*
    When to attach the source and spend bytes.

    Still gated, and deliberately: on the hls.js path `loadSource` fetches the
    manifest immediately, `preload="none"` or not. A traveller on Data Saver or
    a 2g link should not pay for a manifest they did not ask for — they get the
    poster and a play button, which is the outcome the old code was reaching
    for and missed by never drawing the button.

    This no longer decides whether the ELEMENT exists, only whether it is fed.
    A `<video>` with no source costs nothing and keeps the markup identical
    either side of the decision, which is what stops the flash.
  */
  const canPlay = hasClip && mayPlay;

  /*
    Evidence of refusal, and nothing weaker.

    Two sources, both of them something that actually said no: a decision that
    came back `false` with no tap to override it, or a `play()` the browser
    rejected. Buffering is not here. Undecided is not here.
  */
  const attempt = asked ? "asked" : "auto";
  const refused =
    (autoplayAllowed === false && !asked) || rejectedFor === attempt;

  /*
    Starting: we mean to play this and it is not running yet.

    The state that used to draw a play button. It draws nothing at all for the
    first moment, because on a decent connection the first frame arrives before
    anybody could read a spinner and chrome that flickers is worse than none.
  */
  const starting = hasClip && active && mayPlay && !playing && !refused;

  /*
    Unless it is genuinely slow, and then silence is its own defect.

    A poster that sits there with no chrome on a 0.5 Mbps link is
    indistinguishable from a broken card, which is the trap at the other end of
    #78: the fix for a control that appears too eagerly must not be a card that
    never admits it is working. 600ms is past the point a start reads as
    instant and short of the point it reads as broken.
  */
  const [slowFor, setSlowFor] = useState<string | null>(null);
  useEffect(() => {
    if (!starting) return;
    const timer = setTimeout(() => setSlowFor(src ?? null), 600);
    return () => clearTimeout(timer);
  }, [starting, src]);

  /*
    Derived rather than reset, for the reason `rejectedFor` gives: clearing it
    would mean a synchronous `setState` in an effect body.

    It re-shows at once if the SAME clip stalls again, which is the behaviour
    worth having: we already know this one is slow, so there is nothing to be
    gained by making the traveller wait another 600ms to be told twice.
  */
  const slowStart = starting && slowFor === src;

  useEffect(() => {
    const video = videoRef.current;
    if (!video || !src || !canPlay) return;

    let hls: { destroy: () => void } | null = null;
    let cancelled = false;

    const nativeHls = video.canPlayType("application/vnd.apple.mpegurl") !== "";

    void (async () => {
      try {
        if (nativeHls) {
          video.src = src;
          setPlayable(true);
          return;
        }
        // Only reached off Safari/iOS. Dynamic so the bytes never load for
        // the browsers that do not need them.
        const { default: Hls } = await import("hls.js");
        if (cancelled) return;
        if (!Hls.isSupported()) {
          setFailed(true);
          return;
        }
        const instance = new Hls({
          // Island connection: keep the buffer small so a stall recovers fast
          // rather than sitting on 30 seconds of stale segments.
          maxBufferLength: 10,
          maxMaxBufferLength: 20,
          // Keeps the rendition matched to a phone-sized element rather than
          // fetching a 1080p ladder for a 480px column.
          capLevelToPlayerSize: true,
        });
        hls = instance;
        instance.on(Hls.Events.ERROR, (_e, data) => {
          if (data.fatal) setFailed(true);
        });
        instance.loadSource(src);
        instance.attachMedia(video);
        setPlayable(true);
      } catch {
        setFailed(true);
      }
    })();

    return () => {
      cancelled = true;
      hls?.destroy();
    };
  }, [src, canPlay]);

  /*
    Play/pause follows the active card. Never autoplay off-screen.

    `asked` joins `autoplayAllowed` here so a tap starts playback on a card the
    connection heuristic had refused. The gesture is not needed for the play
    itself — the feed is muted by default and muted playback needs no gesture
    in any browser — which is why setting state and letting this effect do the
    work is safe. Unmuting is the only thing that requires one, and that is
    already behind its own tap.
  */
  useEffect(() => {
    const video = videoRef.current;
    if (!video || !playable) return;
    if (active && mayPlay) {
      // Captured at the moment of the attempt, so a refusal is filed against
      // the try that earned it and not against whatever is current when the
      // promise settles.
      const forAttempt = asked ? "asked" : "auto";
      void video.play().then(
        () => setRejectedFor(null),
        () => {
          /*
            Refused by the browser is a normal outcome, not an error — but it
            IS the moment there is something for a traveller to do, and the
            only moment. Recording it here is what lets the control stay away
            while a clip is merely still buffering (#78).
          */
          setRejectedFor(forAttempt);
        },
      );
    } else {
      video.pause();
    }
  }, [active, playable, mayPlay, asked]);

  /*
    Whether it is actually running, read from the element rather than assumed.

    `play()` resolving is not the same as playing — a stall, a policy refusal
    or a source error all leave the promise settled and the picture still. The
    play control keys off this, so it must be the truth.
  */
  useEffect(() => {
    const video = videoRef.current;
    if (!video) return;
    const on = () => setPlaying(true);
    const off = () => setPlaying(false);
    video.addEventListener("playing", on);
    video.addEventListener("pause", off);
    video.addEventListener("ended", off);
    video.addEventListener("stalled", off);
    return () => {
      video.removeEventListener("playing", on);
      video.removeEventListener("pause", off);
      video.removeEventListener("ended", off);
      video.removeEventListener("stalled", off);
    };
  }, [canPlay]);

  // The card learns whether there is a clip to control, and forgets it when
  // the player leaves the preload budget.
  useEffect(() => {
    onPlayableChange?.(playable && canPlay);
    return () => onPlayableChange?.(false);
  }, [playable, canPlay, onPlayableChange]);

  return (
    <div
      className={cn(
        "bg-abyss relative h-full w-full overflow-hidden",
        className,
      )}
    >
      {/*
        The poster is an <Image>, not a background: it is the LCP element on
        the feed and needs the optimiser's sizing and priority handling.
      */}
      <Image
        src={media.posterUrl}
        alt={media.alt ?? ""}
        fill
        sizes="(min-width: 1024px) 480px, 100vw"
        className="object-cover"
        // The first card is the LCP element; the rest are below the fold.
        priority={active}
        unoptimized={media.posterUrl.startsWith("data:")}
      />

      {/*
        Drawn whenever there is a clip, NOT when we are allowed to play it.

        An element with no source costs nothing and fetches nothing, and it
        keeps this markup identical before and after the autoplay decision —
        which is what stops the control below flashing on first paint (#78).
        What the decision gates is the source (`canPlay`, in the effect above)
        and `preload`, which is where the bytes actually are.
      */}
      {hasClip ? (
        <video
          ref={videoRef}
          className={cn(
            "absolute inset-0 h-full w-full object-cover transition-opacity duration-500",
            playable && active ? "opacity-100" : "opacity-0",
          )}
          muted={muted}
          playsInline
          loop
          /*
            The preload budget, finally spending something on Safari.

            `none` until we may play at all, so a refusal still costs nothing.
            Then `metadata` for a mounted neighbour and `auto` for the card in
            view. This attribute is why `PRELOAD_AHEAD` did nothing on native
            HLS: the element was mounted and told to fetch nothing, so every
            scroll started cold on most of our traffic.
          */
          preload={canPlay ? (active ? "auto" : "metadata") : "none"}
          aria-hidden="true"
          tabIndex={-1}
        />
      ) : null}

      {/*
        The way in, and the whole point of yuvoy-app#17: a poster is never a
        dead end.

        Drawn whenever there is a clip on the card in view and it is not
        running — whether that is because the connection heuristic said no,
        because the traveller prefers reduced motion, or because the browser
        refused the autoplay. All three used to end at the same still image
        with nothing to press.

        Only on the ACTIVE card. A play button on a half-scrolled neighbour is
        a target somebody hits by accident on a phone, and it would start a
        clip they cannot see.

        And only on REFUSAL (#78). It used to be drawn whenever a clip was not
        yet running, which meant it was drawn through every normal start: the
        decision, the source attach, the manifest, the buffer. A control that
        appears and then withdraws on its own teaches a traveller that the app
        is unsure, and it was the first thing anybody saw.
      */}
      {hasClip && active && !playing && !hidden && refused ? (
        <button
          type="button"
          onClick={() => {
            setAsked(true);
            onRequestPlay?.();
            // Already attached: start it here, inside the gesture, rather than
            // waiting a render. Muted playback needs no gesture, but spending
            // one when we have it is free.
            void videoRef.current?.play().catch(() => {});
          }}
          aria-label={`Play ${media.alt ?? "this clip"}`}
          className={cn(
            "absolute top-1/2 left-1/2 z-10 -translate-x-1/2 -translate-y-1/2",
            "grid size-16 place-items-center rounded-full",
            "bg-abyss/55 text-paper backdrop-blur-sm",
            "ease-interaction transition-[transform,background-color] duration-200",
            "hover:bg-abyss/70 active:scale-95",
            "focus-visible:ring-paper focus-visible:ring-2 focus-visible:outline-none",
          )}
        >
          {/*
            A triangle, nudged right of centre. An optically centred play glyph
            sits about 8% right of true centre, and the difference reads as a
            wobble at this size.
          */}
          <svg
            viewBox="0 0 24 24"
            fill="currentColor"
            aria-hidden="true"
            className="size-7 translate-x-[2px]"
          >
            <path d="M8 5.14v13.72a1 1 0 0 0 1.54.84l10.29-6.86a1 1 0 0 0 0-1.68L9.54 4.3A1 1 0 0 0 8 5.14Z" />
          </svg>
        </button>
      ) : null}

      {/*
        A clip that is taking its time, saying so. See `slowStart`.

        Deliberately not the play button's twin: it is smaller, it is not a
        target, and it carries no glyph anybody could read as "tap here". A
        traveller must never learn to tap a thing that is already working.

        `role="status"` with a label rather than a bare spinner, because on a
        screen reader an unlabelled spinning div is nothing at all.
      */}
      {slowStart && !hidden ? (
        <div
          role="status"
          aria-label="Loading video"
          className="absolute top-1/2 left-1/2 z-10 -translate-x-1/2 -translate-y-1/2"
        >
          <span className="border-paper/30 border-t-paper block size-8 rounded-full border-2 motion-safe:animate-spin" />
        </div>
      ) : null}
    </div>
  );
}
