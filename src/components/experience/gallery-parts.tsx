"use client";

import {
  useEffect,
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
import { useFeedStore } from "@/lib/feed/store";
import { cn } from "@/lib/cn";
import { ViewTransition } from "@/lib/motion/view-transition";
import { PICTURE_MOTION, pictureName } from "@/lib/motion/route-motion";
import type { components } from "@/lib/api/schema.gen";

/*
  The gallery's frames, the clip player, the full-screen view and the
  measures they share (gallery.tsx). Moved out of gallery.tsx so each file
  stays under 500 lines (yuvoy-app#243).
*/

type Media = components["schemas"]["Media"];

/**
 * The frame a saved card shows, wrapped so the two are one object across a
 * screen change (T03 B). Every other frame is left as it is. The name is only
 * ever given during the two picture changes (`PICTURE_MOTION`), and only to a
 * frame on screen, so a gallery swiped to another picture simply does not fly.
 */
export function sharedWithCard(
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
export function StillFrame({
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
export const FRAME =
  "bg-abyss relative aspect-4/5 w-full shrink-0 snap-center sm:aspect-video";
export const FRAME_SIZES = "(min-width: 1024px) 768px, 100vw";

/**
 * Above the part of the picture the sheet covers. `Screen` sets
 * `--hero-overlap` to the depth its sheet rises over a hero (none from `lg`
 * up), and anything drawn at the foot of a frame sits that far higher, or the
 * sheet's rounded top hides it. A gallery anywhere else has no overlap.
 */
export const FOOT = "bottom-[calc(var(--hero-overlap,0px)+0.75rem)]";

/** A clip with a stream to play. A clip without one is a poster. */
export function playsInPlace(media: Media): boolean {
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
export function ClipFrame({
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
export function useUncovered(
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

export function ClipBadge() {
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
 * A `<dialog>` for the same four reasons the sheet is one: the focus trap,
 * Escape, inertness and the top layer are the browser's and are laborious to
 * reproduce. `object-contain` on `abyss`, so a portrait frame is letterboxed
 * rather than cropped: the point of opening a photograph full screen is to see
 * all of it.
 *
 * Arrow keys move, because on a desktop that is what a full-screen gallery
 * answers to and there is no thumb.
 */
export function Lightbox({
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
