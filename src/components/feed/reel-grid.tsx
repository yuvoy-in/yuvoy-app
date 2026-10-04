"use client";

import Link from "@/components/ui/link";
import Image from "next/image";
import type { Reel } from "@/lib/feed/reels";
import { nextDepartureSentence } from "@/lib/feed/availability";
import { formatFromPrice } from "@/lib/format/money";
import { Button } from "@/components/ui/button";
import { PlayIcon } from "@/components/ui/icons";
import { cn } from "@/lib/cn";

/**
 * Reels as a three-column grid of posters — yuvoy-app#33 and #37.
 *
 * Two surfaces show reels this way: a business's own page and a search result.
 * The grid itself is identical on both and the only difference is where a tile
 * goes, so `hrefFor` is a prop and everything else is here.
 *
 * ## Three across, at 9:16
 *
 * The same shape the reel itself is, so a poster is never letterboxed or
 * cropped to a tile that disagrees with the clip inside it. Three is what fits
 * a phone at a size where a face is still legible; two wastes the screen and
 * four turns the grid into texture.
 *
 * ## Paged with a button, not a sentinel
 *
 * The strip fetches two screens early because a snap scroller that stalls
 * feels broken. A grid does not: a traveller scanning posters is deciding, not
 * consuming, and an infinite grid on an island connection spends data on rows
 * nobody reached. "Show more" is also the only retry this needs, which is why
 * a failed page keeps the tiles it has and says so beside the button.
 */
export function ReelGrid({
  items,
  hrefFor,
  hasNextPage,
  isFetchingNextPage,
  isFetchNextPageError,
  fetchNextPage,
  className,
  label,
  words = false,
}: {
  items: Reel[];
  /** Where a tile goes. The two surfaces open different reel sequences. */
  hrefFor: (reel: Reel) => string | null;
  hasNextPage: boolean;
  isFetchingNextPage: boolean;
  isFetchNextPageError: boolean;
  fetchNextPage: () => void;
  className?: string;
  /** Names the list for a screen reader. */
  label: string;
  /**
   * Each tile says what it is under the picture: the title, the price with
   * its unit, and the next open day (the approved redesign, 3 Oct 2026, for
   * search). Bare posters made a traveller open a reel to learn what it was
   * and what it cost (cited in the before page). Two across on a phone, so
   * the words fit.
   */
  words?: boolean;
}) {
  return (
    <div className={className}>
      <ul
        className={cn(
          "grid",
          words
            ? "grid-cols-2 gap-x-3 gap-y-5 sm:grid-cols-3"
            : "grid-cols-3 gap-2",
        )}
        aria-label={label}
      >
        {items.map((reel, i) => {
          const href = hrefFor(reel);
          const title = reel.experience?.title ?? "";
          if (words) {
            return (
              <li key={`${reel.media?.id ?? "clip"}-${i}`}>
                <WordsTile reel={reel} href={href} title={title} />
              </li>
            );
          }
          return (
            <li key={`${reel.media?.id ?? "clip"}-${i}`}>
              {/*
                A clip we cannot open is still shown — it is the business's
                work — but it is not a link to nowhere.
              */}
              {href ? (
                <Link
                  href={href}
                  className="rounded-tile bg-abyss ease-interaction relative block aspect-[9/16] overflow-hidden transition-opacity duration-200 hover:opacity-90"
                  aria-label={title ? `Play ${title}` : "Play this reel"}
                >
                  <Poster url={reel.media?.posterUrl} />
                  <PlayBadge />
                </Link>
              ) : (
                <div className="rounded-tile bg-abyss relative block aspect-[9/16] overflow-hidden">
                  <Poster url={reel.media?.posterUrl} />
                </div>
              )}
            </li>
          );
        })}
      </ul>

      {/*
        `complete` is told, not inferred — a short page is a page, and treating
        it as the end is how a grid silently loses its tail.

        `isFetchNextPageError` rather than `isError`: on an infinite query
        `isError` is true whenever the LAST fetch failed, which would replace a
        grid full of loaded posters with an error state because one extra page
        did not arrive.
      */}
      {hasNextPage ? (
        <div className="mt-4 text-center">
          <Button
            variant="outline"
            disabled={isFetchingNextPage}
            onClick={fetchNextPage}
          >
            {isFetchingNextPage ? "Loading…" : "Show more"}
          </Button>
          {isFetchNextPageError ? (
            <p role="alert" className="text-terra-deep mt-2 text-sm">
              That did not load. The reels above are still here. Tap again.
            </p>
          ) : null}
        </div>
      ) : null}
    </div>
  );
}

/**
 * The mark that says a tile is a video rather than a photograph.
 *
 * Small, bottom right, and `aria-hidden`: the link's own name already says
 * "Play …", so announcing it twice is noise. It exists because a poster frame
 * is a still image and nothing else on the tile distinguishes the two.
 */
function PlayBadge() {
  return (
    <span
      aria-hidden="true"
      className="text-paper absolute right-1.5 bottom-1.5 drop-shadow-[0_1px_2px_rgba(0,0,0,0.6)]"
    >
      <PlayIcon className="size-4" />
    </span>
  );
}

/**
 * A tile that says what it is. The link holds the picture and the words, so
 * the whole tile is the target.
 *
 * Its name is written out rather than taken from the words, with commas
 * between the parts. Read from the content, the spans ran together into
 * "PlayTry-dive at Nemo Reef₹4,500per person": a name is assembled from text
 * without layout, and the same run-on as "07:003 seats left", in the ear.
 */
function WordsTile({
  reel,
  href,
  title,
}: {
  reel: Reel;
  href: string | null;
  title: string;
}) {
  const experience = reel.experience;
  const price = formatFromPrice(experience?.fromPrice);
  const next = experience ? nextDepartureSentence(experience) : null;
  const priceLine = price
    ? [price, experience?.pricingUnitLabel].filter(Boolean).join(" ")
    : null;
  const dateLine = next
    ? next.bookable
      ? `Next open: ${next.short}`
      : next.short
    : null;
  const name = [`Play ${title}`, priceLine, dateLine]
    .filter(Boolean)
    .join(", ");
  const body = (
    <>
      <span className="rounded-tile bg-abyss relative block aspect-[4/5] overflow-hidden">
        <Poster
          url={reel.media?.posterUrl}
          sizes="(max-width: 640px) 50vw, 240px"
        />
        <PlayBadge />
      </span>
      <span className="mt-2 line-clamp-2 block text-sm leading-snug font-bold">
        {title}
      </span>
      {price ? (
        <span className="mt-0.5 block text-xs font-bold">
          {price}
          {/* The server's unit phrase, verbatim, as on the listing. */}
          {experience?.pricingUnitLabel ? (
            <span className="text-forest/70 font-normal">
              {" "}
              {experience.pricingUnitLabel}
            </span>
          ) : null}
        </span>
      ) : null}
      {dateLine ? (
        <span className="text-forest/70 mt-0.5 block text-xs">{dateLine}</span>
      ) : null}
    </>
  );
  return href ? (
    <Link
      href={href}
      aria-label={name}
      className="ease-interaction group block transition-opacity duration-200 hover:opacity-90"
    >
      {body}
    </Link>
  ) : (
    <div>{body}</div>
  );
}

/** A poster, or the dark tile that stands in for one. */
function Poster({
  url,
  className,
  sizes = "(max-width: 640px) 33vw, 160px",
}: {
  url?: string;
  className?: string;
  sizes?: string;
}) {
  if (!url)
    return <div className={cn("bg-abyss absolute inset-0", className)} />;
  return (
    <Image
      src={url}
      alt=""
      fill
      sizes={sizes}
      className={cn("object-cover", className)}
      unoptimized={url.startsWith("data:")}
    />
  );
}
