"use client";

import { useEffect, useRef, useState } from "react";
import Image from "next/image";
import type { components } from "@/lib/api/schema.gen";
import type { ReelWatch } from "@/lib/feed/use-reel-views";
import { cn } from "@/lib/cn";

type Media = components["schemas"]["Media"];

/** A media-time step larger than this is a jump, not playback. */
const MAX_STEP_S = 2;
/** Within this of the end is the end, for `timeupdate`'s quarter-second grain. */
const END_SLACK_S = 0.35;

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
 *     natively. Safari and iOS can, and that is most of our traffic;
 *     Chromium now can too.
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
  watch,
  sizes = "(min-width: 1024px) 480px, 100vw",
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
  /**
   * Where to report how much of the clip actually played, for a reel view
   * (yuvoy-app#96). Given to the card on screen only, and only with consent;
   * absent, nothing is measured at all.
   */
  watch?: ReelWatch;
  /**
   * The poster's `sizes`. The feed's well is 480px wide from `lg` up; a
   * listing's gallery is wider, and a poster fetched for the narrower well
   * would be upscaled there.
   */
  sizes?: string;
  className?: string;
}) {
  const videoRef = useRef<HTMLVideoElement | null>(null);
  const [playable, setPlayable] = useState(false);
  const [failed, setFailed] = useState(false);
  /** They tapped play on THIS card, whatever the connection thinks. */
  const [asked, setAsked] = useState(false);
  const [playing, setPlaying] = useState(false);
  /*
    Which clip has a FIRST FRAME to show (T12 A, approved 4 Oct 2026).

    The clip used to fade in when its source was attached, so on a slow start
    the fade finished over an empty video and the picture then jumped in. It
    now stays invisible over its poster until it has decoded a frame
    (`loadeddata`), then crossfades in 200ms. Named by the clip, as
    `rejectedFor` is, so a new clip starts hidden without a reset.
  */
  const [framedFor, setFramedFor] = useState<string | null>(null);
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
  /*
    The traveller paused this clip (a tap on the picture).

    A settled feed ruling production never built until the redesign (traveller
    A, 3 Oct 2026): tap is play and pause. It is also the only way to stop a
    looping clip, which WCAG 2.2.2 asks for of anything that moves for more
    than five seconds. A clip paused and scrolled past plays again when it is
    back on screen, as every reel feed does: the pause is about this viewing,
    not a setting. Reset during render, not in an effect, for the reason
    `rejectedFor` gives.
  */
  const [userPaused, setUserPaused] = useState(false);
  if (!active && userPaused) setUserPaused(false);

  /*
    Play, from either way in: the play control or a tap on a stopped picture.
    A traveller's own pause is simply lifted; a browser's refusal is answered
    the way it always was, by recording that they asked.
  */
  const resume = () => {
    if (userPaused) setUserPaused(false);
    else {
      setAsked(true);
      onRequestPlay?.();
    }
    // Already attached: start it here, inside the gesture, rather than
    // waiting a render. Muted playback needs no gesture, but spending one
    // when we have it is free.
    void videoRef.current?.play().catch(() => {});
  };

  const src = media.hlsUrl;

  /** There is a clip here, and it has not failed. Nothing about starting it. */
  const hasClip = Boolean(src) && mounted && !failed;
  /*
    A clip drawn again (back inside the preload budget) is a new element with
    no frame yet, and earns its fade again; the old one's frame said nothing
    about it. Reset during render, for the reason `rejectedFor` gives.
  */
  if (!hasClip && framedFor !== null) setFramedFor(null);

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

    Not while the traveller has paused it. A clip they stopped is not slow to
    start, and the ring used to come up behind the play control 600ms after
    a pause, named "Loading video".
  */
  const starting =
    hasClip && active && mayPlay && !userPaused && !playing && !refused;

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
  const framed = framedFor === src;

  useEffect(() => {
    const video = videoRef.current;
    if (!video || !src || !canPlay) return;

    let hls: { destroy: () => void } | null = null;
    let cancelled = false;
    const onNativeError = () => {
      if (!cancelled) setFailed(true);
    };

    const nativeHls = video.canPlayType("application/vnd.apple.mpegurl") !== "";

    void (async () => {
      try {
        if (nativeHls) {
          /*
            A clip that cannot play on the native path says so here, and
            nowhere else: a browser playing HLS itself (Safari, iOS, and now
            Chromium too) reports a dead manifest or segment only as the
            element's own `error`. With nothing listening, the card kept a
            play control and a sound toggle for a clip that could never play,
            or the slow ring spun over the poster for ever (motion audit
            3.10). Failed is a card with its poster and no clip, the same as
            hls.js's fatal error below.
          */
          video.addEventListener("error", onNativeError);
          video.src = src;
          setPlayable(true);
          return;
        }
        // Only reached where the browser cannot play HLS itself. Dynamic so
        // the bytes never load for the browsers that do not need them.
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
      video.removeEventListener("error", onNativeError);
      hls?.destroy();
    };
  }, [src, canPlay]);

  // The first decoded frame of this clip: from here it may be seen.
  useEffect(() => {
    const video = videoRef.current;
    if (!video || !src) return;
    // A new element, or a new source on this one, always fires it.
    const framedNow = () => setFramedFor(src);
    video.addEventListener("loadeddata", framedNow);
    return () => video.removeEventListener("loadeddata", framedNow);
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
    if (active && mayPlay && !userPaused) {
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
  }, [active, playable, mayPlay, asked, userPaused]);

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

  /*
    HOW MUCH OF THE CLIP ACTUALLY PLAYED, for a reel view (yuvoy-app#96).

    Read from the element's own clock, not from a timer beside it: a clip that
    is buffering, paused or refused is on screen and not playing, and the API
    asks for the time it PLAYED. Each `timeupdate` (four or so a second) adds
    the media time that passed since the last one, while the element is not
    paused.

    `loop` means the clip never reports `ended`: it comes round to the start
    and carries on. That shows up as the media time going BACKWARDS, and is
    both the rest of the last pass (up to `duration`) plus the start of this
    one, and the evidence it played to its end. A frame within `END_SLACK_S`
    of the end counts as the end too, for the traveller who scrolls on just as
    it gets there. A jump of more than `MAX_STEP_S` is not playback (a source
    attaching, a stall recovering), so it is not counted.
  */
  useEffect(() => {
    const video = videoRef.current;
    if (!video || !watch) return;

    let last: number | null = null;
    const finite = (n: number) => Number.isFinite(n) && n > 0;

    const sample = () => {
      const now = video.currentTime;
      const duration = video.duration;
      if (last !== null && !video.paused) {
        const step = now - last;
        if (step > 0 && step <= MAX_STEP_S) {
          watch.played(step * 1000);
        } else if (step < 0 && finite(duration)) {
          const lap = duration - last + now;
          if (lap > 0 && lap <= MAX_STEP_S) watch.played(lap * 1000);
          watch.completed();
        }
      }
      if (finite(duration) && now >= duration - END_SLACK_S) watch.completed();
      last = now;
    };
    // Resuming after a pause or a stall measures from where it resumed.
    const resume = () => {
      last = video.currentTime;
    };
    const ended = () => {
      sample();
      watch.completed();
    };

    video.addEventListener("timeupdate", sample);
    video.addEventListener("playing", resume);
    video.addEventListener("ended", ended);
    return () => {
      video.removeEventListener("timeupdate", sample);
      video.removeEventListener("playing", resume);
      video.removeEventListener("ended", ended);
    };
  }, [watch, hasClip]);

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
        sizes={sizes}
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
          // Its own reduced version, a 120ms crossfade (T12 A, S01 A).
          data-motion=""
          className={cn(
            "ease-interaction absolute inset-0 h-full w-full object-cover transition-opacity duration-200",
            "motion-reduce:duration-120 motion-reduce:ease-linear",
            playable && framed && active ? "opacity-100" : "opacity-0",
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

        And on the traveller's own pause (a tap on the picture, below), which
        is a refusal they gave themselves: the same control brings it back.
      */}
      {/*
        The picture as the clip's control.

        While the clip is meant to be playing, the whole picture is a real
        button named "Pause video": reachable without a pointer, and as big as
        the place a thumb lands. Once it is stopped (paused, or refused by the
        browser) the play control below is the one named control, and the
        picture steps down to a pointer-only surface that does the same thing,
        so there is exactly one control for the clip in the accessibility tree
        at a time.

        No z-index, on purpose: by document order it sits over the video and
        under the caption, the rail and any panel, which all come later, so
        Book and the discs keep their own taps. A swipe never reaches it (the
        card swallows the click a drag ends in, `useSwipeToOpen`) and a scroll
        produces no click at all.
      */}
      {hasClip && active && !hidden && (refused || userPaused) ? (
        <button
          type="button"
          aria-hidden="true"
          tabIndex={-1}
          onClick={resume}
          className="absolute inset-0 cursor-default"
        />
      ) : hasClip && active && !hidden && mayPlay ? (
        <button
          type="button"
          aria-label="Pause video"
          onClick={() => {
            setUserPaused(true);
            videoRef.current?.pause();
          }}
          className="focus-visible:ring-paper absolute inset-0 cursor-default focus-visible:ring-2 focus-visible:outline-none focus-visible:ring-inset"
        />
      ) : null}

      {hasClip && active && !playing && !hidden && (refused || userPaused) ? (
        <button
          type="button"
          onClick={resume}
          aria-label={`Play ${media.alt ?? "this clip"}`}
          className={cn(
            "absolute top-1/2 left-1/2 z-10 -translate-x-1/2 -translate-y-1/2",
            "grid size-16 place-items-center rounded-full",
            "bg-abyss/55 text-paper backdrop-blur-sm",
            "motion-disc hover:bg-abyss/70 active:scale-95",
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
      {/*
        Drawn for as long as the clip could be starting, and SHOWN only while
        a start is slow, so it fades in when it is due and out when the clip
        plays rather than popping in and vanishing (T12 A). Drawn only while
        starting, it was gone in the frame `playing` arrived, fade and all.
        A first frame is not the end of a start: a clip can hold its first
        picture while it buffers, and a stall shows the ring again at once.
      */}
      {hasClip && active && mayPlay && !hidden ? (
        <div
          role={slowStart ? "status" : undefined}
          aria-label={slowStart ? "Loading video" : undefined}
          aria-hidden={slowStart ? undefined : true}
          data-shown={slowStart}
          data-motion=""
          className="feed-slow-ring absolute top-1/2 left-1/2 z-10 -translate-x-1/2 -translate-y-1/2"
        >
          <span className="border-paper/30 border-t-paper block size-8 rounded-full border-2" />
        </div>
      ) : null}
    </div>
  );
}
