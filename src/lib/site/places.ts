import { cache } from "react";
import { createApiClient } from "@/lib/api/client";
import type { components } from "@/lib/api/schema.gen";

/**
 * Where Yuvoy is, from the API rather than from words in this app
 * (yuvoy-app#181, R0-T5).
 *
 * Yuvoy is opening to places beyond the Andamans, so no generic screen may
 * name a place, and a page about a listing names the listing's own market from
 * `GET /places` (`listPlaces`): "Name places from this list rather than from
 * text in the app". With Andaman the only market, every page reads exactly as
 * it did when the words were written into it.
 *
 * ## Read on the server, passed down as words
 *
 * `getPlaces` runs in a server render only. A page turns the list into the
 * sentence it needs (`feedHeading`, `marketPhrase`, `marketName`) and hands
 * the words to its components as props, so no client component fetches
 * places. A revalidated read keeps a static page static: the list is cached
 * for five minutes, as the API's own edge cache holds it.
 *
 * ## A list that did not load names nothing
 *
 * Null, never a guess. Every caller has a sentence that names no place, and
 * that sentence is true of any market, where "the Andaman Islands" written in
 * as a fallback would be wrong the day a second one opens.
 */

export type PlaceList = components["schemas"]["PlaceList"];
export type PlaceMarket = components["schemas"]["PlaceMarket"];

/**
 * How long a server render waits for the list before it names no place: the
 * same three seconds as the feed's first page (`FIRST_PAGE_TIMEOUT_MS`), for
 * the same trade.
 */
export const PLACES_TIMEOUT_MS = 3_000;

/** Seconds a read is cached: the API's own edge cache holds it for five minutes. */
export const PLACES_REVALIDATE_SECONDS = 300;

/**
 * How a market reads inside a sentence, where its name alone does not.
 *
 * "Experiences in Andaman Islands" is not English; the Andamans take "the".
 * A market missing here is named as the API names it, which is right for a
 * state or a city ("Experiences in Telangana").
 */
const IN_A_SENTENCE: Readonly<Record<string, string>> = {
  andaman: "the Andaman Islands",
};

/** A market as it reads after "in": "the Andaman Islands". */
export function placePhrase(market: PlaceMarket): string {
  return IN_A_SENTENCE[market.key] ?? market.name;
}

function marketOf(
  places: PlaceList | null,
  marketKey: string | null | undefined,
): PlaceMarket | null {
  if (!places || !marketKey) return null;
  return places.markets.find((market) => market.key === marketKey) ?? null;
}

/**
 * A market's own name, "Andaman Islands", or null when the list did not load
 * or does not have it.
 */
export function marketName(
  places: PlaceList | null,
  marketKey: string | null | undefined,
): string | null {
  return marketOf(places, marketKey)?.name ?? null;
}

/**
 * Every market's own name by its key, for a screen whose rows can each be in
 * a different one. Empty when the list did not load.
 */
export function marketNames(
  places: PlaceList | null,
): Readonly<Record<string, string>> {
  return Object.fromEntries(
    (places?.markets ?? []).map((market) => [market.key, market.name]),
  );
}

/**
 * A market as it reads after "in", "the Andaman Islands", or null when the
 * list did not load or does not have it.
 */
export function marketPhrase(
  places: PlaceList | null,
  marketKey: string | null | undefined,
): string | null {
  const market = marketOf(places, marketKey);
  return market ? placePhrase(market) : null;
}

/**
 * The feed's heading.
 *
 * With exactly one market to book in, it names it, so today's heading reads
 * "Experiences in the Andaman Islands" as it always has. With two, or with no
 * list, it names none: a feed of two places is not "in" either of them. A
 * market with no destination open to everybody sells nothing yet, and is not
 * counted.
 */
export function feedHeading(places: PlaceList | null): string {
  const bookable = (places?.markets ?? []).filter(
    (market) => market.mode === "bookable" && market.destinations.length > 0,
  );
  return bookable.length === 1
    ? `Experiences in ${placePhrase(bookable[0])}`
    : "Experiences you can book";
}

/**
 * The answer, if it is a list of markets. The contract is the shape; this is
 * only so a page never falls over on an answer that is not one.
 */
function asPlaceList(data: unknown): PlaceList | null {
  if (typeof data !== "object" || data === null) return null;
  const markets = (data as { markets?: unknown }).markets;
  if (!Array.isArray(markets)) return null;
  return {
    markets: markets.filter(
      (market): market is PlaceMarket =>
        typeof market === "object" &&
        market !== null &&
        typeof market.key === "string" &&
        typeof market.name === "string" &&
        Array.isArray(market.destinations),
    ),
  };
}

/**
 * Whether the last read failed. An outage is logged when it starts rather
 * than once per page: a build renders every static page, and each would
 * otherwise repeat the same line.
 */
let failing = false;

async function readPlaces(): Promise<PlaceList | null> {
  try {
    const { data, error } = await createApiClient().GET("/places", {
      next: { revalidate: PLACES_REVALIDATE_SECONDS },
      signal: AbortSignal.timeout(PLACES_TIMEOUT_MS),
    });
    if (error) throw error;
    const places = asPlaceList(data);
    if (!places)
      throw new Error("GET /places answered with no list of markets.");
    failing = false;
    return places;
  } catch (cause) {
    /*
      Logged, because the page stays a 200 and simply names no place, and the
      function log is the only place the cause is visible (the feed's first
      page, lib/feed/first-page.ts, for the same reason).
    */
    if (!failing) {
      console.error(
        "[places] GET /places failed; pages name no place until it answers.",
        cause,
      );
    }
    failing = true;
    return null;
  }
}

/**
 * `GET /places`, once per server render however many parts of a page ask: a
 * read with a deadline is not memoised by Next, so React's `cache` shares it.
 */
export const getPlaces = cache(readPlaces);
