"use client";

import { useEffect, useRef, useState } from "react";
import Image from "next/image";
import { IconButton } from "@/components/ui/icon-button";
import {
  ArrowLeftIcon,
  ArrowRightIcon,
  CloseIcon,
  PlayIcon,
} from "@/components/ui/icons";
import { cn } from "@/lib/cn";
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
 * ## A clip shows its poster, and says it is a clip
 *
 * The gallery does not play video. The reel feed is where clips play, and
 * `/r/{media.id}` is where a single one does; a listing is a page to read, and
 * six autoplaying clips on a jetty connection is the whole page's data budget.
 * The badge is what stops a poster being mistaken for a photograph.
 */
export function Gallery({
  items,
  title,
}: {
  items: Media[];
  /** The listing's name, for the alt text of an image that has none. */
  title: string;
}) {
  const [active, setActive] = useState(0);
  const [lightbox, setLightbox] = useState<number | null>(null);
  const stripRef = useRef<HTMLDivElement | null>(null);

  /*
    Which frame is showing. One observer over the strip's children, set up once
    per item count — never a scroll handler, which fires at frame rate and
    fights the browser's own momentum.
  */
  useEffect(() => {
    const strip = stripRef.current;
    if (!strip) return;

    const observer = new IntersectionObserver(
      (entries) => {
        for (const entry of entries) {
          if (!entry.isIntersecting) continue;
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
  }, [items.length]);

  const scrollTo = (index: number) => {
    const strip = stripRef.current;
    if (!strip) return;
    const next = Math.max(0, Math.min(items.length - 1, index));
    strip.scrollTo({ left: strip.clientWidth * next, behavior: "smooth" });
  };

  if (items.length === 0) return null;

  return (
    <>
      <div className="bg-abyss relative">
        <div
          ref={stripRef}
          className="flex snap-x snap-mandatory overflow-x-auto overscroll-x-contain"
          role="group"
          aria-roledescription="carousel"
          aria-label={`Photographs and clips of ${title}`}
        >
          {items.map((media, i) => (
            <button
              key={media.id}
              type="button"
              data-frame={i}
              onClick={() => setLightbox(i)}
              /* 4:5 rather than 9:16 — this is a page to read, not a feed. */
              className="bg-abyss relative aspect-4/5 w-full shrink-0 snap-center sm:aspect-video"
              aria-label={`Open ${i + 1} of ${items.length} full screen`}
            >
              <Image
                src={media.posterUrl}
                alt={media.alt ?? title}
                fill
                sizes="(min-width: 1024px) 768px, 100vw"
                className="object-cover"
                /*
                  Only the first frame is on the LCP path. The rest are one
                  swipe away and eagerly loading six full-bleed images on a
                  0.5 Mbps island link is the page's whole budget.
                */
                priority={i === 0}
                loading={i === 0 ? undefined : "lazy"}
                unoptimized={media.posterUrl.startsWith("data:")}
              />
              {media.kind === "video" ? <ClipBadge /> : null}
            </button>
          ))}
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
              className="pointer-events-none absolute inset-x-0 bottom-3 flex justify-center gap-1.5"
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

function ClipBadge() {
  return (
    <span className="label bg-abyss/70 text-paper absolute bottom-3 left-3 inline-flex items-center gap-1 rounded-full px-2 py-1 text-[10px]">
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
        <Image
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
