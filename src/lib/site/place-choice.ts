import type { components } from "@/lib/api/schema.gen";
import { placePhrase, type PlaceList, type PlaceMarket } from "./places";

/**
 * Which place `/` shows (yuvoy-app#179, R2-T4).
 *
 * The server reads it in this order: `?place=`, kept only when the caller's
 * list has it; the cookie `yv_place`; otherwise the bookable market, which is
 * the reels every visitor saw before R2. A bookable market (or any of its
 * towns) is the reels, untouched; a town in a discover market is the cards
 * Trigo found there.
 *
 * Pure, and imported by both sides: the page decides on the server, and the
 * picker writes the cookie in the browser. Nothing here reads a request.
 *
 * ## The cookie, and the promise it keeps (R2-T4 note, section 6 point 11)
 *
 * The privacy page promises "Nothing tracks what you click" and "nothing to
 * consent to". `yv_place` keeps that promise only while it stays a
 * preference, like the language a site remembers, so it is set without the
 * analytics consent and each of these holds, each with its own test:
 *
 * - the value is the place key alone, `<market>/<destination>` or a bookable
 *   market key, checked against the caller's list before it is written;
 * - no id and nothing about the person: one name, one key, nothing else;
 * - `SameSite=Lax`, `Path=/`, and `Secure` on https (always, on
 *   app.yuvoy.in and every preview);
 * - `Max-Age` 180 days (15552000 seconds).
 *
 * Anything more in it, a name for the gone line, a time, a count, is a
 * different cookie and goes back to the manager first. That is why the gone
 * line below says "That place" when the list no longer names it: mobile keeps
 * the name beside the key on the phone, and the web may not.
 */

export type PlaceDestination = components["schemas"]["PlaceDestination"];
export type Category = components["schemas"]["Category"];

export const PLACE_COOKIE = "yv_place";

/** 180 days, the most section 6 point 11 allows. */
export const PLACE_COOKIE_MAX_AGE = 15_552_000;

/**
 * Keys as the API writes them: `andaman`, `karnataka/bengaluru`.
 *
 * Checked before the list is even asked, so a cookie somebody wrote by hand
 * with a quote or a semicolon in it never reaches a comparison, a log or an
 * address. The length bound is generous; the API's keys are a word or two.
 */
const MARKET_KEY = /^[a-z][a-z0-9_]*$/;
const DESTINATION_KEY = /^[a-z][a-z0-9_]*\/[a-z][a-z0-9_]*$/;
const KEY_MAX = 120;

/** Whether `value` has the shape of a place key. Not whether it is open. */
export function isPlaceKey(value: unknown): value is string {
  return (
    typeof value === "string" &&
    value.length <= KEY_MAX &&
    (MARKET_KEY.test(value) || DESTINATION_KEY.test(value))
  );
}

/** A market with somewhere in it. One with no destination is not offered. */
const offered = (market: PlaceMarket) => market.destinations.length > 0;

/**
 * The market the reels are for: the first bookable market with somewhere in
 * it, in the server's order, as mobile's `bookableMarket` reads it. Null when
 * the list did not load or has none.
 */
export function bookableMarket(list: PlaceList | null): PlaceMarket | null {
  return list?.markets.find((m) => m.mode === "bookable" && offered(m)) ?? null;
}

/** Whether the list holds a place to find things in: the picker's switch. */
export function hasDiscoverPlace(list: PlaceList | null): boolean {
  return (list?.markets ?? []).some((m) => m.mode === "discover" && offered(m));
}

/** What `/` shows. */
export type Shown =
  | { kind: "reels"; market: PlaceMarket | null }
  | { kind: "found"; market: PlaceMarket; destination: PlaceDestination };

/**
 * A key, read against the caller's list. Null when the list did not load,
 * the key is not one, or the list does not have it.
 *
 * A bookable market's own key, and any of its towns, are the reels: the
 * reels are never filtered by town here (that stays in Search's Where chips,
 * as on mobile). A discover market's key alone is not a place to show: the
 * picker always picks a town in one.
 */
export function placeIn(list: PlaceList | null, key: unknown): Shown | null {
  if (!list || !isPlaceKey(key)) return null;
  for (const market of list.markets) {
    if (!offered(market)) continue;
    if (market.mode === "bookable") {
      if (key === market.key || market.destinations.some((d) => d.key === key))
        return { kind: "reels", market };
      continue;
    }
    const destination = market.destinations.find((d) => d.key === key);
    if (destination) return { kind: "found", market, destination };
  }
  return null;
}

/**
 * The key a choice is kept under: a bookable market's own key, or a
 * discover town's. A bookable town is kept as its market, so a link to
 * `?place=andaman/havelock` remembers the reels, not a filter.
 */
export function keyOf(shown: Shown): string | null {
  return shown.kind === "found"
    ? shown.destination.key
    : (shown.market?.key ?? null);
}

/** What the gone line calls a place the list no longer names (mobile's `UNNAMED_PLACE`). */
export const UNNAMED_PLACE = "That place";

/**
 * The gone line (R2-T4 section 3), with the bookable market named from the
 * list, never typed: "{place} isn't available right now, so here's the
 * Andaman Islands." Null with no bookable market to name, since a sentence
 * that ends "so here's" nothing is worse than none.
 */
export function goneLine(
  name: string,
  bookable: PlaceMarket | null,
): string | null {
  if (!bookable) return null;
  return `${name} isn't available right now, so here's ${placePhrase(bookable)}.`;
}

export interface PlaceChoice {
  shown: Shown;
  /** The key of what is shown, or null on reels with no market known. */
  key: string | null;
  /** Said once over the reels, when a remembered place has gone. */
  gone: string | null;
  /**
   * What the browser does with `yv_place` once the page is up: keep the key
   * the address chose (`write`), forget a place that has gone (`clear`), or
   * leave it be. The server never sets it: it is the browser's preference,
   * written where the choice was made.
   */
  cookie: "write" | "clear" | null;
}

/**
 * The place `/` shows, from the caller's list (null when it did not load),
 * the `?place=` value and the cookie's.
 *
 * Section 6 point 2, as mobile's `feedView` reads it: a place is gone only by
 * an ANSWER, never by a read that failed. A list that answered without the
 * remembered place shows the reels, says so once and forgets it. A list that
 * failed shows the reels and keeps the cookie, so the next load can still
 * find it.
 */
export function choiceFrom(
  list: PlaceList | null,
  param: unknown,
  cookie: string | null | undefined,
): PlaceChoice {
  const bookable = bookableMarket(list);
  const reels: Shown = { kind: "reels", market: bookable };

  // The address first, and only a place this caller may see.
  const linked = placeIn(list, param);
  if (linked) {
    const key = keyOf(linked);
    return {
      shown: linked,
      key,
      gone: null,
      cookie: key && key !== cookie ? "write" : null,
    };
  }

  // Nothing to read a remembered place against: the reels, and keep it.
  if (!list) return { shown: reels, key: null, gone: null, cookie: null };

  const none = { shown: reels, key: bookable?.key ?? null, gone: null };
  if (!cookie) return { ...none, cookie: null };

  // Not a key at all: not ours. Forgotten, and nothing said about it.
  if (!isPlaceKey(cookie)) return { ...none, cookie: "clear" };

  const kept = placeIn(list, cookie);
  if (kept) return { shown: kept, key: keyOf(kept), gone: null, cookie: null };

  // The list answered without it.
  return {
    ...none,
    gone: goneLine(UNNAMED_PLACE, bookable),
    cookie: "clear",
  };
}

/**
 * A found place the server would not show after all: its first page answered
 * 404, which is the API saying this caller may not see it (closed, or the
 * `explore` switch turned back). That is an answer too, so the reels, the
 * gone line once, and the cookie forgotten when it was the cookie's place.
 * Here the list still names it, so the line can.
 */
export function goneAfterAnswer(
  list: PlaceList | null,
  choice: PlaceChoice,
  cookie: string | null | undefined,
): PlaceChoice {
  const bookable = bookableMarket(list);
  const name =
    choice.shown.kind === "found"
      ? choice.shown.destination.name
      : UNNAMED_PLACE;
  return {
    shown: { kind: "reels", market: bookable },
    key: bookable?.key ?? null,
    gone: goneLine(name, bookable),
    cookie: choice.key !== null && choice.key === cookie ? "clear" : null,
  };
}

/**
 * The cookie as written: the name, the key, and the four attributes, and
 * nothing else. Exported for its tests: `writePlaceCookie` is the only writer.
 */
export function placeCookie(key: string, secure: boolean): string {
  return `${PLACE_COOKIE}=${key}; Path=/; Max-Age=${PLACE_COOKIE_MAX_AGE}; SameSite=Lax${secure ? "; Secure" : ""}`;
}

/**
 * Whether this page is https, which decides `Secure`.
 *
 * Always true on app.yuvoy.in and every Vercel preview. Read rather than
 * fixed for the same reason as `oweSignOut` (`lib/auth/sign-out-owed.ts`): the
 * e2e suite runs a production build over plain http, where some browsers
 * refuse a `Secure` cookie written by script and the remembered place would
 * silently not be.
 */
function secure(): boolean {
  return typeof location !== "undefined" && location.protocol === "https:";
}

/**
 * Remembers a place, in the browser. Writes only a key the caller's list has,
 * as the key the list resolves it to, and answers whether it wrote.
 *
 * The list is required rather than trusted to the caller: "checked against
 * the caller's list before it is written" is one of the cookie's conditions,
 * and a condition a caller can forget is not one.
 */
export function writePlaceCookie(key: string, list: PlaceList | null): boolean {
  const shown = placeIn(list, key);
  const kept = shown ? keyOf(shown) : null;
  if (!kept) return false;
  try {
    document.cookie = placeCookie(kept, secure());
    return true;
  } catch {
    // Only a sandboxed or opaque document refuses, and this app is never one.
    return false;
  }
}

/** Forgets the remembered place, in the browser. */
export function clearPlaceCookie(): void {
  try {
    document.cookie = `${PLACE_COOKIE}=; Path=/; Max-Age=0; SameSite=Lax${secure() ? "; Secure" : ""}`;
  } catch {
    // As above: nothing to forget in a document that keeps no cookies.
  }
}

/**
 * The contract's twelve departments, to read `?category=` against before it
 * reaches `GET /events`, where an unknown one is a 400 (section 4: "unknown
 * → ignored"). Keys only: the words on the chips come from the vocabulary
 * answer and are never listed here (REQ-R0-16).
 */
const CATEGORIES = [
  "adventure",
  "nature_wildlife",
  "food_drink",
  "arts_creativity",
  "learning",
  "culture_heritage",
  "wellness",
  "entertainment",
  "community",
  "sports",
  "local_life",
  "events",
] as const satisfies readonly Category[];
// Fails to compile when the contract adds a department this list lacks.
const everyCategory: Exclude<
  Category,
  (typeof CATEGORIES)[number]
> extends never
  ? true
  : false = true;
void everyCategory;

/** `?category=`, when it is one of the contract's departments; else none. */
export function categoryParam(raw: unknown): Category | null {
  return typeof raw === "string" &&
    (CATEGORIES as readonly string[]).includes(raw)
    ? (raw as Category)
    : null;
}
