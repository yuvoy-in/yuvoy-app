"use client";

import { useEffect, useLayoutEffect, useRef, useState } from "react";
import Image from "next/image";
import { IconButton } from "@/components/ui/icon-button";
import { ArrowLeftIcon, ArrowRightIcon } from "@/components/ui/icons";
import { detectAutoplayAllowed, useFeedStore } from "@/lib/feed/store";
import { cn } from "@/lib/cn";
import { clearPicture, pictureHandedOff } from "@/lib/motion/picture-handoff";
import { useIsListingPreview, useListingLive } from "./preview-context";
import type { components } from "@/lib/api/schema.gen";
import {
  ClipBadge,
  ClipFrame,
  FOOT,
  FRAME,
  FRAME_SIZES,
  Lightbox,
  playsInPlace,
  sharedWithCard,
  StillFrame,
  useUncovered,
} from "./gallery-parts";

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
