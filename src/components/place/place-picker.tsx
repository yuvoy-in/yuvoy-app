"use client";

import { useEffect, useRef, useState, type ReactNode } from "react";
import { Sheet } from "@/components/ui/sheet";
import { Button } from "@/components/ui/button";
import { LoadingState, Skeleton } from "@/components/states";
import {
  ArrowLeftIcon,
  CheckIcon,
  ChevronRightIcon,
  MapPinIcon,
} from "@/components/ui/icons";
import { cn } from "@/lib/cn";
import type { PlaceList, PlaceMarket } from "@/lib/site/places";
import type { PlaceDestination } from "@/lib/site/place-choice";
import type { NearYou } from "@/lib/site/near-you";

/**
 * Pick a place (yuvoy-app#179, R2-T4): a sheet with two levels, the web twin
 * of mobile's `place-sheet.tsx` (yuvoy-mobile#346).
 *
 * Level one lists every region with somewhere in it, in the SERVER's order
 * (section 6 point 6: the two surfaces list places alike, so neither sorts).
 * Each row has the region's name, the tag "Book on Yuvoy" on a bookable one,
 * and up to three of its places under it, as mobile's `placesLine`. A
 * bookable region, or a region with one place, is chosen in one tap; a region
 * with more opens its towns. On the web only, "Near you" leads the list when
 * the visitor's state has an open local place (DEC-14 A).
 *
 * Level two is a region's towns, each saying how its cards are checked, with
 * "All places" back. The focus follows the level: to "All places" on the way
 * in, and back to the region's own row on the way out, so a keyboard or a
 * screen reader is never dropped at the top of the sheet.
 *
 * Nothing here fetches or remembers: the trigger (`PlaceButton`) owns the
 * list, its loading and its failure, and what a pick does. This draws them.
 */

export const PLACE_PICKER_WORDS = Object.freeze({
  title: "Pick a place",
  nearYou: (name: string) => `Near you · ${name}`,
  bookable: "Book on Yuvoy",
  back: "All places",
  local: "Every card checked by a person",
  travel: "Found by Trigo, labelled",
  loading: "Loading the places",
  failed: "We couldn't load the places.",
  retry: "Try again",
  retrying: "Trying again",
});

/** How a place was picked, for `place_picked`. A link is the third way. */
export type PickedVia = "list" | "near_you";

/**
 * "Coorg, Hampi, Gokarna and 2 more": up to three of a region's places, in
 * the server's order, as mobile's `placesLine` (`choice.ts:145-149`).
 */
export function placesLine(destinations: readonly PlaceDestination[]): string {
  const names = destinations.map((d) => d.name);
  if (names.length <= 3) return names.join(", ");
  return `${names.slice(0, 3).join(", ")} and ${names.length - 3} more`;
}

/** The regions the picker lists: every market with somewhere in it, in order. */
export function pickableMarkets(list: PlaceList | null): PlaceMarket[] {
  return (list?.markets ?? []).filter((m) => m.destinations.length > 0);
}

/**
 * A bookable region, or a region with one place, is chosen in one tap; a
 * region with more opens its towns (mobile's `regionOpensPlaces`).
 */
export function regionOpensPlaces(market: PlaceMarket): boolean {
  return market.mode === "discover" && market.destinations.length > 1;
}

/** The key a tap on a region row picks, when it picks one. */
function regionKey(market: PlaceMarket): string {
  return market.mode === "bookable" ? market.key : market.destinations[0].key;
}

export function PlacePicker({
  onClose,
  list,
  loading,
  failed,
  retrying = false,
  onRetry,
  currentKey,
  nearYou,
  onPick,
}: {
  onClose: () => void;
  /** The caller's places, or null while none has loaded. */
  list: PlaceList | null;
  /** Reading the list for the first time. */
  loading: boolean;
  /** The read failed and there is no list to show. */
  failed: boolean;
  retrying?: boolean;
  onRetry: () => void;
  /** The key of the place `/` shows now, marked in the list. */
  currentKey: string | null;
  nearYou: NearYou | null;
  onPick: (key: string, via: PickedVia) => void;
}) {
  const markets = pickableMarkets(list);
  const [level, setLevel] = useState<string | null>(null);
  const region = level
    ? (markets.find((m) => m.key === level) ?? null)
    : null;

  const backRef = useRef<HTMLButtonElement | null>(null);
  const rowRefs = useRef(new Map<string, HTMLButtonElement | null>());
  /** The region the towns were opened from, to give its row the focus back. */
  const cameFrom = useRef<string | null>(null);

  useEffect(() => {
    if (region) {
      backRef.current?.focus();
      return;
    }
    const from = cameFrom.current;
    if (!from) return;
    cameFrom.current = null;
    rowRefs.current.get(from)?.focus();
  }, [region]);

  const tapRegion = (market: PlaceMarket) => {
    if (regionOpensPlaces(market)) {
      cameFrom.current = market.key;
      setLevel(market.key);
      return;
    }
    onPick(regionKey(market), "list");
  };

  let body: ReactNode;
  if (loading) {
    body = (
      <LoadingState label={PLACE_PICKER_WORDS.loading}>
        <ul className="space-y-2" data-testid="place-picker-loading">
          {[0, 1, 2].map((n) => (
            <li key={n} className="rounded-card bg-paper-deep space-y-2 px-4 py-4">
              <Skeleton className="h-4 w-1/2 rounded-full" />
              <Skeleton className="h-3 w-3/4 rounded-full" />
            </li>
          ))}
        </ul>
      </LoadingState>
    );
  } else if (failed || !list) {
    body = (
      <div className="flex flex-col items-center gap-4 py-8 text-center">
        <p role="alert">{PLACE_PICKER_WORDS.failed}</p>
        <Button
          variant="outline"
          onClick={onRetry}
          pending={retrying}
          pendingLabel={PLACE_PICKER_WORDS.retrying}
        >
          {PLACE_PICKER_WORDS.retry}
        </Button>
      </div>
    );
  } else if (region) {
    body = (
      <div>
        <button
          ref={backRef}
          type="button"
          onClick={() => setLevel(null)}
          className="text-forest hover:bg-forest/5 -ml-2 flex min-h-11 items-center gap-1.5 rounded-full pr-3 pl-2 font-medium"
        >
          <ArrowLeftIcon className="size-5" />
          {PLACE_PICKER_WORDS.back}
        </button>
        <h3 className="font-display tracking-display leading-display mt-3 mb-3 text-2xl text-balance">
          {region.name}
        </h3>
        <ul className="rounded-card bg-paper-deep divide-paper-line divide-y overflow-hidden">
          {region.destinations.map((d) => (
            <li key={d.key}>
              <Row
                current={currentKey === d.key}
                onClick={() => onPick(d.key, "list")}
                name={d.name}
                line={
                  d.kind === "local"
                    ? PLACE_PICKER_WORDS.local
                    : PLACE_PICKER_WORDS.travel
                }
              />
            </li>
          ))}
        </ul>
      </div>
    );
  } else {
    body = (
      <ul className="rounded-card bg-paper-deep divide-paper-line divide-y overflow-hidden">
        {nearYou ? (
          <li>
            <Row
              current={currentKey === nearYou.key}
              onClick={() => onPick(nearYou.key, "near_you")}
              name={PLACE_PICKER_WORDS.nearYou(nearYou.name)}
              icon={<MapPinIcon className="text-terra-deep size-5" />}
            />
          </li>
        ) : null}
        {markets.map((m) => {
          const opens = regionOpensPlaces(m);
          const bookable = m.mode === "bookable";
          return (
            <li key={m.key}>
              <Row
                rowRef={(node) => void rowRefs.current.set(m.key, node)}
                current={!opens && currentKey === regionKey(m)}
                onClick={() => tapRegion(m)}
                name={m.name}
                tag={bookable ? PLACE_PICKER_WORDS.bookable : undefined}
                line={placesLine(m.destinations)}
                opens={opens}
                inside={
                  opens &&
                  currentKey !== null &&
                  m.destinations.some((d) => d.key === currentKey)
                }
              />
            </li>
          );
        })}
      </ul>
    );
  }

  return (
    <Sheet open onClose={onClose} title={PLACE_PICKER_WORDS.title}>
      {body}
    </Sheet>
  );
}

/**
 * One row: a button the width of the list, 64px at least. Its name is the
 * words on it, in reading order, with commas between so a screen reader
 * pauses where the eye does.
 */
function Row({
  name,
  tag,
  line,
  icon,
  opens = false,
  inside = false,
  current,
  onClick,
  rowRef,
}: {
  name: string;
  tag?: string;
  line?: string;
  icon?: ReactNode;
  /** Opens a region's towns rather than picking. */
  opens?: boolean;
  /** A town in this region is the place shown now. */
  inside?: boolean;
  /** This row is the place shown now. */
  current: boolean;
  onClick: () => void;
  rowRef?: (node: HTMLButtonElement | null) => void;
}) {
  return (
    <button
      ref={rowRef}
      type="button"
      onClick={onClick}
      aria-label={[name, tag, line].filter(Boolean).join(", ")}
      aria-current={current || inside ? "true" : undefined}
      className={cn(
        "text-forest flex min-h-16 w-full items-center gap-3 px-4 py-3 text-left",
        "hover:bg-forest/5 focus-visible:bg-forest/5",
      )}
    >
      {icon}
      <span className="min-w-0 flex-1">
        <span className="flex flex-wrap items-center gap-x-2 gap-y-1">
          <span className="font-bold">{name}</span>
          {tag ? (
            <span className="bg-paper text-terra-deep ring-terra-deep/35 rounded-full px-2 py-0.5 text-[11px]/4 font-bold ring-1">
              {tag}
            </span>
          ) : null}
        </span>
        {line ? (
          <span className="text-label text-forest/70 mt-0.5 block">{line}</span>
        ) : null}
      </span>
      {opens ? (
        <span className="flex items-center gap-2">
          {inside ? (
            <span className="bg-terra size-2 rounded-full" aria-hidden="true" />
          ) : null}
          <ChevronRightIcon className="text-forest/70 size-5" />
        </span>
      ) : current ? (
        <CheckIcon className="size-5" />
      ) : null}
    </button>
  );
}
