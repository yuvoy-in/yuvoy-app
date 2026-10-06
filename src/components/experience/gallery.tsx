"use client";

import {
  useEffect,
  useLayoutEffect,
  useRef,
  useState,
  type ReactNode,
  type RefObject,
} from "react";
import Image from "next/image";
import { IconButton } from "@/components/ui/icon-button";
import {
  ArrowLeftIcon,
  ArrowRightIcon,
  CloseIcon,
  PlayIcon,
  VolumeIcon,
  VolumeOffIcon,
} from "@/components/ui/icons";
import { FeedPlayer } from "@/components/feed/feed-player";
import { detectAutoplayAllowed, useFeedStore } from "@/lib/feed/store";
import { cn } from "@/lib/cn";
import { ViewTransition } from "@/lib/motion/view-transition";
import { PICTURE_MOTION, pictureName } from "@/lib/motion/route-motion";
import { clearPicture, pictureHandedOff } from "@/lib/motion/picture-handoff";
import { useIsListingPreview, useListingLive } from "./preview-context";
import type { components } from "@/lib/api/schema.gen";

type Media = components["schemas"]["Media"];

/**
 * The photographs and clips at the top of a listing — yuvoy-app#32.
 *
 * ## What it replaces
 *
 * One still, `gallery[0] ?? heroMedia`, with the rest of the array in a
 * "More from the water" strip further down the page. So a listing with six
 * clips showed one of them where it mattered, and the other five as 160px
 * thumbnails below the fold that were not links to anything. The owner asked
 * for "a proper gallery: swipe between them and a full-screen view".
 *
 * ## Swiping is CSS, not JavaScript
 *
 * A scroll-snap strip. The browser owns the momentum, the rubber band and the
 * snap, which on a mid-range Android is the difference between a gallery that
 * feels native and one that feels like a web page. The only JavaScript in the
 * scroll path is one IntersectionObserver deciding which dot is lit — the same
 * shape the reel feed uses, for the same reason.
 *
 * Arrows appear from `sm` up, where there is no thumb to swipe with. They are
 * `hidden` below it rather than always drawn: a control that does nothing a
 * gesture does not already do is a control competing with the picture.
 *
 * ## A clip plays where it is (the approved redesign, 3 Oct 2026)
 *
 * The listing is the reel's far side: the picture stays at the top while the
 * sheet scrolls over it, and a clip keeps running there. So a clip with a
 * stream plays in place, through the feed's own player and by the feed's own
 * rules, which is what answers the data budget this gallery used to protect by
 * never playing anything:
 *
 *   - Only the frame on screen ever holds a source, and only while the gallery
 *     is actually visible: a sheet risen over it, or a page scrolled past it,
 *     stops it (`useUncovered`). Six clips are never six downloads.
 *   - It starts by itself only where the feed would (`autoplayAllowed`: not on
 *     Data Saver, a slow link or reduced motion), and muted, with the feed's
 *     session sound setting. Otherwise it is a poster with a play control.
 *   - A tap on the picture pauses it, as on a reel.
 *
 * A clip with no stream yet (`hlsUrl` arrives with M15, and may never for a
 * given clip) is a poster: it opens full screen like a photograph, and the
 * badge is what stops it being mistaken for one.
 */
export function Gallery({
  items,
  title,
  picture,
}: {
  items: Media[];
  /** The listing's name, for the alt text of an image that has none. */
  title: string;
  /**
   * The picture a saved card shows for this listing (its `heroMedia`). Its
   * frame and that card are one object: the picture flies between them when
   * one leads to the other (T03 B).
   */
  picture?: string;
}) {
  /*
    The frame to open on: the first, unless a card has just handed over the
    picture it was showing (T03 B). Read once, on the client, never on the
    server, so a loaded page and its hydration both open on the first.
  */
  // The page, or the preview that slides in from a reel (T02 C).
  const preview = useIsListingPreview();
  const live = useListingLive();
  const [opening] = useState(() => {
    const handed = preview
      ? null
      : pictureHandedOff(items.map((media) => media.id));
    return handed ? items.findIndex((media) => media.id === handed) : 0;
  });
  const [active, setActive] = useState(opening);
  const [lightbox, setLightbox] = useState<number | null>(null);
  const stripRef = useRef<HTMLDivElement | null>(null);
  const rootRef = useRef<HTMLDivElement | null>(null);
  const hasClip = !preview && items.some(playsInPlace);
  const onScreen = useUncovered(rootRef, hasClip);
  const setAutoplayAllowed = useFeedStore((s) => s.setAutoplayAllowed);

  /*
    Whether a clip may start by itself, decided the way the feed decides it.
    The feed answers it when its strip mounts; a listing opened straight from
    a link answers it here. An answer already given stands, including a
    traveller's own tap on play earlier in the session.
  */
  useEffect(() => {
    if (!hasClip) return;
    if (useFeedStore.getState().autoplayAllowed === undefined) {
      setAutoplayAllowed(detectAutoplayAllowed());
    }
  }, [hasClip, setAutoplayAllowed]);

  /*
    Open on that frame before anything is painted, and before a screen
    change takes its picture of the arrival: the picture can only land on a
    hero that is showing it. Instant by definition (see the reel strip's
    jump for why not `scrollTo`).
  */
  useLayoutEffect(() => {
    if (preview) return;
    clearPicture();
    const strip = stripRef.current;
    if (strip && opening > 0) strip.scrollLeft = strip.clientWidth * opening;
  }, [opening, preview]);

  /*
    Which frame is showing. One observer over the strip's children, set up once
    per item count — never a scroll handler, which fires at frame rate and
    fights the browser's own momentum.
  */
  useEffect(() => {
    const strip = stripRef.current;
    if (!strip || preview) return;

    const observer = new IntersectionObserver(
      (entries) => {
        for (const entry of entries) {
          // The ratio, for the reason the feed's strip gives: `isIntersecting`
          // is true for a frame on its way out in any engine that keeps the spec.
          if (entry.intersectionRatio < 0.6) continue;
          const index = Number(
            (entry.target as HTMLElement).dataset.frame ?? "-1",
          );
          if (index >= 0) setActive(index);
        }
      },
      { threshold: 0.6, root: strip },
    );
    for (const frame of strip.querySelectorAll("[data-frame]")) {
      observer.observe(frame);
    }
    return () => observer.disconnect();
  }, [items.length, preview]);

  const scrollTo = (index: number) => {
    const strip = stripRef.current;
    if (!strip) return;
    const next = Math.max(0, Math.min(items.length - 1, index));
    strip.scrollTo({ left: strip.clientWidth * next, behavior: "smooth" });
  };

  if (items.length === 0) return null;

  return (
    <>
      {/*
        The listing's far side (T15 A): it recedes as the sheet covers it,
        over its own height, which is its frame's shape at full width (4:5 on
        a phone, 16:9 from `sm`; FRAME below). Kept beside each other so the
        two cannot drift; `e2e/support/media-motion.ts` measures both.
      */}
      <div
        ref={rootRef}
        data-motion=""
        className="bg-abyss far-side-picture relative [--hero-height:125vw] sm:[--hero-height:56.25vw]"
      >
        <div
          ref={stripRef}
          className="flex snap-x snap-mandatory overflow-x-auto overscroll-x-contain"
          role="group"
          aria-roledescription="carousel"
          aria-label={`Photographs and clips of ${title}`}
        >
          {items.map((media, i) =>
            preview ? (
              <StillFrame
                key={media.id}
                media={media}
                index={i}
                title={title}
                load={live && i === opening}
              />
            ) : (
              sharedWithCard(
                media,
                picture,
                playsInPlace(media) ? (
                  <ClipFrame
                    key={media.id}
                    media={media}
                    index={i}
                    count={items.length}
                    current={i === active}
                    near={Math.abs(i - active) <= 1}
                    onScreen={onScreen}
                  />
                ) : (
                  <button
                    key={media.id}
                    type="button"
                    data-frame={i}
                    onClick={() => setLightbox(i)}
                    className={FRAME}
                    aria-label={`Open ${i + 1} of ${items.length} full screen`}
                  >
                    <Image
                      src={media.posterUrl}
                      alt={media.alt ?? title}
                      fill
                      sizes={FRAME_SIZES}
                      className="object-cover"
                      /*
                      Only the frame it opens on is on the LCP path (the
                      first, unless a saved card handed over another), so it
                      asks first. The frames either side of the one in view
                      load now, because native lazy loading measures the
                      viewport rather than this strip and fetched a frame
                      only as it slid in (6 Oct 2026). The rest wait:
                      eagerly loading six full-bleed images on a 0.5 Mbps
                      island link is the page's whole budget.
                    */
                      loading={Math.abs(i - active) <= 1 ? "eager" : "lazy"}
                      fetchPriority={i === opening ? "high" : "auto"}
                      unoptimized={media.posterUrl.startsWith("data:")}
                    />
                    {media.kind === "video" ? <ClipBadge /> : null}
                  </button>
                ),
              )
            ),
          )}
        </div>

        {items.length > 1 ? (
          <>
            {/*
              Dots, not a counter. `aria-hidden` because the strip already
              announces itself as a carousel and each frame's button says
              "3 of 6" — a live dot row would say it a second time.
            */}
            <div
              aria-hidden="true"
              className={cn(
                "pointer-events-none absolute inset-x-0 flex justify-center gap-1.5",
                FOOT,
              )}
            >
              {items.map((media, i) => (
                <span
                  key={media.id}
                  className={cn(
                    "ease-interaction size-1.5 rounded-full transition-colors duration-200",
                    i === active ? "bg-paper" : "bg-paper/40",
                  )}
                />
              ))}
            </div>

            <div className="pointer-events-none absolute inset-y-0 right-0 left-0 hidden items-center justify-between px-3 sm:flex">
              <IconButton
                label="Previous photograph"
                variant="chrome"
                className="pointer-events-auto"
                disabled={active === 0}
                onClick={() => scrollTo(active - 1)}
              >
                <ArrowLeftIcon />
              </IconButton>
              <IconButton
                label="Next photograph"
                variant="chrome"
                className="pointer-events-auto"
                disabled={active === items.length - 1}
                onClick={() => scrollTo(active + 1)}
              >
                <ArrowRightIcon />
              </IconButton>
            </div>
          </>
        ) : null}
      </div>

      {lightbox !== null ? (
        <Lightbox
          items={items}
          title={title}
          index={lightbox}
          onClose={() => setLightbox(null)}
        />
      ) : null}
    </>
  );
}

/**
 * The frame a saved card shows, wrapped so the two are one object across a
 * screen change (T03 B). Every other frame is left as it is. The name is only
 * ever given during the two picture changes (`PICTURE_MOTION`), and only to a
 * frame on screen, so a gallery swiped to another picture simply does not fly.
 */
function sharedWithCard(
  media: Media,
  picture: string | undefined,
  frame: ReactNode,
): ReactNode {
  if (!picture || media.id !== picture) return frame;
  return (
    <ViewTransition
      key={media.id}
      name={pictureName(media.id)}
      {...PICTURE_MOTION}
    >
      {frame}
    </ViewTransition>
  );
}

/**
 * A frame as the listing's preview draws it (T02 C): the picture alone, as
 * the page's first paint shows it, with nothing to play and nothing to press.
 * Its picture is only asked for once the preview is shown (`load`), and only
 * for the frame on screen, which is the one the page itself loads first.
 */
function StillFrame({
  media,
  index,
  title,
  load,
}: {
  media: Media;
  index: number;
  title: string;
  load: boolean;
}) {
  return (
    <div data-frame={index} className={FRAME}>
      {load ? (
        <Image
          src={media.posterUrl}
          alt={media.alt ?? title}
          fill
          sizes={FRAME_SIZES}
          className="object-cover"
          // Shown means a finger is bringing it in: the page's own LCP image.
          loading="eager"
          fetchPriority="high"
          unoptimized={media.posterUrl.startsWith("data:")}
        />
      ) : null}
      {media.kind === "video" ? <ClipBadge /> : null}
    </div>
  );
}

/* 4:5 rather than 9:16: this is a page to read, not a feed. */
const FRAME =
  "bg-abyss relative aspect-4/5 w-full shrink-0 snap-center sm:aspect-video";
const FRAME_SIZES = "(min-width: 1024px) 768px, 100vw";

/**
 * Above the part of the picture the sheet covers. `Screen` sets
 * `--hero-overlap` to the depth its sheet rises over a hero (none from `lg`
 * up), and anything drawn at the foot of a frame sits that far higher, or the
 * sheet's rounded top hides it. A gallery anywhere else has no overlap.
 */
const FOOT = "bottom-[calc(var(--hero-overlap,0px)+0.75rem)]";

/** A clip with a stream to play. A clip without one is a poster. */
function playsInPlace(media: Media): boolean {
  return media.kind === "video" && Boolean(media.hlsUrl);
}

/**
 * One clip, playing in place: the feed's player, by the feed's rules.
 *
 * `current` is the frame the strip is showing; only it holds a source, so a
 * swipe away drops the clip and a swipe back starts it again, the feed's own
 * preload budget at its smallest. `onScreen` stops it under the sheet without
 * dropping it, so it carries on from where it was when the picture comes back.
 *
 * Its own component so `setPlayable` is a stable setter: the player reports
 * through an effect, and a callback that changed every render would re-run it
 * every render.
 */
function ClipFrame({
  media,
  index,
  count,
  current,
  near,
  onScreen,
}: {
  media: Media;
  index: number;
  count: number;
  current: boolean;
  /** One swipe from the frame in view: its poster loads now. */
  near: boolean;
  onScreen: boolean;
}) {
  const [playable, setPlayable] = useState(false);
  const muted = useFeedStore((s) => s.muted);
  const toggleMuted = useFeedStore((s) => s.toggleMuted);
  const autoplayAllowed = useFeedStore((s) => s.autoplayAllowed);
  const setAutoplayAllowed = useFeedStore((s) => s.setAutoplayAllowed);
  const running = current && playable;

  return (
    <div
      data-frame={index}
      role="group"
      aria-roledescription="slide"
      aria-label={`${index + 1} of ${count}, a clip`}
      className={FRAME}
    >
      <FeedPlayer
        media={media}
        active={current && onScreen}
        mounted={current}
        near={near}
        muted={muted}
        autoplayAllowed={autoplayAllowed}
        onPlayableChange={setPlayable}
        // Asked once, trusted from then on, as on the feed.
        onRequestPlay={() => setAutoplayAllowed(true)}
        sizes={FRAME_SIZES}
      />
      {/* Playing is its own evidence; a poster still needs the word. */}
      {running ? null : <ClipBadge />}
      {/*
        Sound, only when there is a clip with sound to give: the feed's
        session setting, so a traveller who unmuted a reel hears this too.
      */}
      {running ? (
        <IconButton
          label={muted ? "Unmute" : "Mute"}
          variant="chrome"
          className={cn("absolute right-3", FOOT)}
          onClick={toggleMuted}
        >
          {muted ? <VolumeOffIcon /> : <VolumeIcon />}
        </IconButton>
      ) : null}
    </div>
  );
}

/**
 * Whether the middle of `ref` is on screen and is what a tap there would hit.
 *
 * On a phone the gallery is sticky, so it never leaves the viewport and an
 * IntersectionObserver would call it visible under a sheet that covers it
 * completely. Asking the browser what is at its centre answers both cases at
 * once: scrolled off (the point is outside the viewport) and covered (the
 * point lands on the sheet). Checked on scroll and resize, at most once a
 * frame, and only while there is a clip to stop.
 *
 * Assumed visible until measured, which is the truth on arrival: the gallery
 * is the top of the page.
 */
function useUncovered(
  ref: RefObject<HTMLElement | null>,
  enabled: boolean,
): boolean {
  const [uncovered, setUncovered] = useState(true);

  useEffect(() => {
    const el = ref.current;
    if (!enabled || !el) return;

    let pending = false;
    let handle = 0;
    const measure = () => {
      pending = false;
      // No layout engine (a unit test): nothing can be covered.
      if (typeof document.elementFromPoint !== "function") return;
      const box = el.getBoundingClientRect();
      const x = box.left + box.width / 2;
      const y = box.top + box.height / 2;
      const inView =
        x >= 0 && y >= 0 && x <= window.innerWidth && y <= window.innerHeight;
      const hit = inView ? document.elementFromPoint(x, y) : null;
      setUncovered(hit !== null && el.contains(hit));
    };
    // A flag rather than the handle, so it holds whenever the frame runs.
    const schedule = () => {
      if (pending) return;
      pending = true;
      handle = requestAnimationFrame(measure);
    };

    schedule();
    window.addEventListener("scroll", schedule, { passive: true });
    window.addEventListener("resize", schedule);
    return () => {
      cancelAnimationFrame(handle);
      window.removeEventListener("scroll", schedule);
      window.removeEventListener("resize", schedule);
    };
  }, [ref, enabled]);

  return uncovered;
}

function ClipBadge() {
  return (
    <span
      className={cn(
        "bg-abyss/70 text-paper absolute left-3 inline-flex items-center gap-1 rounded-full px-2 py-1 text-[10px]/4 font-medium",
        FOOT,
      )}
    >
      <PlayIcon className="size-3" />
      Clip
    </span>
  );
}

/**
 * The full-screen view.
 *
 * A `<dialog>` for the same four reasons the sheet is one — the focus trap,
 * Escape, inertness and the top layer are the browser's and are laborious to
 * reproduce. `object-contain` on `abyss`, so a portrait frame is letterboxed
 * rather than cropped: the point of opening a photograph full screen is to see
 * all of it.
 *
 * Arrow keys move, because on a desktop that is what a full-screen gallery
 * answers to and there is no thumb.
 */
function Lightbox({
  items,
  title,
  index,
  onClose,
}: {
  items: Media[];
  title: string;
  index: number;
  onClose: () => void;
}) {
  const [at, setAt] = useState(index);
  const ref = useRef<HTMLDialogElement | null>(null);

  useEffect(() => {
    const dialog = ref.current;
    if (!dialog) return;
    // `showModal` is not implemented in jsdom. See `Sheet` for the same guard
    // and why the fallback is enough for a unit test.
    if (typeof dialog.showModal === "function") dialog.showModal();
    else dialog.setAttribute("open", "");
    return () => {
      if (typeof dialog.close === "function" && dialog.open) dialog.close();
    };
  }, []);

  useEffect(() => {
    const dialog = ref.current;
    if (!dialog) return;
    const handler = () => onClose();
    dialog.addEventListener("close", handler);
    return () => dialog.removeEventListener("close", handler);
  }, [onClose]);

  const media = items[at];

  return (
    <dialog
      ref={ref}
      aria-label={`${title}, ${at + 1} of ${items.length}`}
      onClick={(e) => {
        if (e.target === ref.current) onClose();
      }}
      onKeyDown={(e) => {
        if (e.key === "ArrowRight")
          setAt((i) => Math.min(items.length - 1, i + 1));
        if (e.key === "ArrowLeft") setAt((i) => Math.max(0, i - 1));
      }}
      className="app-lightbox bg-abyss"
    >
      <div className="relative flex h-full w-full items-center justify-center">
        {/*
          Keyed by the photograph, so the next one is a new picture rather
          than a new address for the old one: the old frame stayed on screen
          under the new counter until the next had loaded, "3 of 5" over
          photograph 2 with no cue (stability audit, 6 Oct 2026).
        */}
        <Image
          key={at}
          src={media.posterUrl}
          alt={media.alt ?? title}
          fill
          sizes="100vw"
          className="object-contain"
          unoptimized={media.posterUrl.startsWith("data:")}
        />

        <div className="absolute top-4 right-4">
          <IconButton label="Close" variant="onDark" onClick={onClose}>
            <CloseIcon />
          </IconButton>
        </div>

        {items.length > 1 ? (
          <div className="absolute inset-x-0 bottom-0 flex items-center justify-between px-4 pb-6">
            <IconButton
              label="Previous photograph"
              variant="onDark"
              disabled={at === 0}
              onClick={() => setAt((i) => Math.max(0, i - 1))}
            >
              <ArrowLeftIcon />
            </IconButton>
            <p className="label text-paper/70">
              {at + 1} of {items.length}
            </p>
            <IconButton
              label="Next photograph"
              variant="onDark"
              disabled={at === items.length - 1}
              onClick={() => setAt((i) => Math.min(items.length - 1, i + 1))}
            >
              <ArrowRightIcon />
            </IconButton>
          </div>
        ) : null}
      </div>
    </dialog>
  );
}
