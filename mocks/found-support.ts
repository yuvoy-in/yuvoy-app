import { HttpResponse, delay } from "msw";
import type { components } from "../src/lib/api/schema.gen";
import { mockHeaders, mockNow } from "./fixtures";
import { CHECKED_NOW, checkedSampleById } from "./found-checked-fixtures";
import { statedSampleById } from "./found-stated-fixtures";

export type FoundItemList = components["schemas"]["FoundItemList"];
export type FoundItemIndex = components["schemas"]["FoundItemIndex"];
export type EventReportReceipt = components["schemas"]["EventReportReceipt"];

const BASE = process.env.NEXT_PUBLIC_API_URL ?? "http://localhost:8099/v1";
export const url = (p: string) => `${BASE}${p}`;

/** The scenarios that open `checkedCities` at `staff`, with `explore`. */
export const CHECKED_STAFF_SCENARIOS: ReadonlySet<string> = new Set([
  "found-checked",
  "found-weekend-thin",
  "found-free-empty",
  "found-search-empty",
  "found-stated-facts",
]);

/** The scenarios whose places carry cards that state facts (yuvoy-app#195). */
export const STATED_SCENARIOS: ReadonlySet<string> = new Set([
  "found-stated-facts",
  "found-stated-closed",
]);

/** The scenarios that open `explore` at `staff`. See above for each. */
export const EXPLORE_STAFF_SCENARIOS: ReadonlySet<string> = new Set([
  ...CHECKED_STAFF_SCENARIOS,
  "found-stated-closed",
  "explore-staff",
  "found-empty",
  "found-error",
  "found-page-error",
  "found-stopped",
  "found-long",
  "found-slow",
  "found-dept-empty",
  "places-error",
  "report-throttled",
  "report-too-fast",
  "report-gone",
  "item-ended",
  "item-merged",
]);

/**
 * The stage a scenario gives `explore`, or null for every other scenario,
 * which leaves each handler answering exactly as it did before #179.
 * (`explore-early` moves the app-config alone and is not one of these.)
 */
export function exploreStageOf(scenario: string): "staff" | "all" | null {
  if (EXPLORE_STAFF_SCENARIOS.has(scenario)) return "staff";
  if (scenario === "explore-all") return "all";
  return null;
}

/**
 * The stage a scenario gives `checkedCities`, or null for every other
 * scenario, which the app-config answers as `off`.
 */
export function checkedStageOf(scenario: string): "staff" | null {
  return CHECKED_STAFF_SCENARIOS.has(scenario) ? "staff" : null;
}

/** Whether a scenario runs on R3's clock (`CHECKED_NOW`), as R3's fixtures are dated. */
export function onR3Clock(scenario: string): boolean {
  return checkedStageOf(scenario) !== null || STATED_SCENARIOS.has(scenario);
}

/** The found routes' clock: R3's stands still on a Friday evening. */
export function foundNow(scenario: string): number {
  return onR3Clock(scenario) ? CHECKED_NOW : mockNow();
}

/** A card of R3's worlds by id, with its place, or null outside them. */
export function r3SampleById(scenario: string, id: string) {
  if (STATED_SCENARIOS.has(scenario)) {
    return statedSampleById(id) ?? checkedSampleById(id);
  }
  return checkedStageOf(scenario) ? checkedSampleById(id) : null;
}

/** A sign-in session, as the mocks mint them (`sess_<digits>`). */
export function signedIn(request: Request): boolean {
  return /^Bearer sess_/.test(request.headers.get("authorization") ?? "");
}

/**
 * Whether `explore` is open to this caller: at `staff`, to a signed-in
 * traveller (every number is in the staff group under these scenarios); at
 * `all`, to everybody.
 */
export function exploreOpenFor(request: Request, scenario: string): boolean {
  const stage = exploreStageOf(scenario);
  return stage === "all" || (stage === "staff" && signedIn(request));
}

export function scenarioOf(request: Request): string {
  return (
    request.headers.get("x-yuvoy-scenario") ??
    new URL(request.url).searchParams.get("__scenario") ??
    "ok"
  );
}

let seq = 0;
export const rid = () =>
  `01JFND${(++seq).toString(36).toUpperCase().padStart(5, "0")}`;

export function envelope(
  code: string,
  message: string,
  status: number,
  details?: Record<string, unknown>,
) {
  return HttpResponse.json(
    { error: { code, message, details, requestId: rid() } },
    { status, headers: mockHeaders(rid()) },
  );
}

export const unavailable = () =>
  envelope("unavailable", "This part of Yuvoy is not answering.", 503);

export const PLACE_NOT_VISIBLE = "There is nothing to explore for that place.";
export const EVENT_NOT_FOUND = "We could not find that event.";
export const CARD_NOT_SHOWING = "This card is no longer showing.";

/** The failures any route can be forced into, as the catalog's are. */
export async function commonFailure(request: Request) {
  switch (scenarioOf(request)) {
    case "slow":
      await delay(3000);
      return null;
    case "offline":
      return HttpResponse.error();
    case "server-error":
      return envelope(
        "internal_error",
        "Something went wrong at our end.",
        500,
      );
    case "rate-limited":
      return envelope(
        "rate_limited",
        "Too many requests. Try again shortly.",
        429,
      );
    default:
      return null;
  }
}

export const DESTINATION_KEY = /^[a-z][a-z0-9_]*\/[a-z][a-z0-9_]*$/;
export const UUID =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/** Checked against the schema: a value the contract drops fails the build. */
export const CATEGORIES = new Set<string>([
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
] satisfies components["schemas"]["Category"][]);

export const REASONS = new Set<string>([
  "wrong_date",
  "wrong_place",
  "wrong_price",
  "cancelled",
  "broken_link",
  "not_appropriate",
  "other",
] satisfies components["schemas"]["EventReport"]["reason"][]);

/** A short, stable name for a filter set, so a cursor can say which one it is. */
function signature(text: string): string {
  let hash = 0x811c9dc5;
  for (let i = 0; i < text.length; i++) {
    hash ^= text.charCodeAt(i);
    hash = Math.imul(hash, 0x01000193) >>> 0;
  }
  return hash.toString(36);
}

/*
  A cursor: where the next page starts, bound to every filter it was minted
  under (the department, R3's filters and the search), as the API binds a
  cursor to its filters. Opaque to the app, which only ever passes
  `nextCursor` back.
*/
export const mintCursor = (offset: number, filters: string) =>
  `fc_${offset}_${signature(filters)}`;
export function readCursor(
  cursor: string,
  filters: string,
): number | "mismatch" | null {
  const match = /^fc_(\d+)_([0-9a-z]+)$/.exec(cursor);
  if (!match) return null;
  if (match[2] !== signature(filters)) return "mismatch";
  return Number(match[1]);
}

/** The headers of an answer, its `Date` on the found routes' clock. */
export const headersAt = (now: number) => ({
  ...mockHeaders(rid()),
  date: new Date(now).toUTCString(),
});
