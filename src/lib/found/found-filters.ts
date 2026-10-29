import { marketDaysFrom } from "@/lib/booking/availability-window";
import { civilFromDate, civilHere, civilInZone } from "@/lib/format/date";
import {
  foundWords,
  type FoundBudget,
  type FoundItem,
  type FoundTail,
  type FoundTimeOfDay,
  type FoundWhen,
  type UnderstoodChip,
} from "./found-words";

/**
 * R3's chips, Filters and search over a place's found cards (yuvoy-app#180,
 * the API's R3-T2 on `GET /events`), and the one place they become a request
 * and an address.
 *
 * The phone's rules (yuvoy-mobile `packages/core/src/explore/filters.ts` and
 * `found-search.ts`), so a place narrows the same way on both.
 *
 * ## A cursor belongs to the filters it was minted under
 *
 * "Pass `nextCursor` back with the same filters: a cursor belongs to the
 * filters it was minted under, `when`, `free` and `q` included." So the
 * query key (`foundFilterKey`) and the request (`foundListQuery`) are built
 * from the same object, and a change to any filter is a new list read from
 * its first page. Nothing chosen is the empty key, so R2's list keeps its key
 * and its cache.
 *
 * ## Free is Budget's Free
 *
 * The Free chip and the sheet's Free are one choice, so the two never
 * disagree, and it replaces an under-price budget: `free=true` with
 * `under_500` or `under_1500` is a `400`. In the address and the request it
 * is `free`, and an under-price budget is `budget`; `budget=any` narrows
 * nothing, so it is kept in the address (the sheet shows it chosen) and never
 * sent. An address that carries both Free and an under-price budget, which
 * this app never writes, is read as Free.
 *
 * ## The page computes no date window
 *
 * `when` names a day and the server works out its dates in the place's zone
 * and says them back (`window`). The one window drawn here is Coming up's two
 * weeks, which the issue asks for, read by the server's clock.
 *
 * No server or client boundary is declared: the server's first page reads the
 * address with these as the browser does.
 */

/** What is chosen over a place's cards: a day, and one choice in each of the sheet's rows. */
export interface FoundFilters {
  when: FoundWhen | null;
  budget: FoundBudget | null;
  timeOfDay: FoundTimeOfDay | null;
}

/** Nothing chosen: how a place's cards open, and what Show everything goes back to. */
export const NO_FOUND_FILTERS: Readonly<FoundFilters> = Object.freeze({
  when: null,
  budget: null,
  timeOfDay: null,
});

/** A search, as `GET /events` takes it: the words, and those kept as plain text. */
export interface FoundSearch {
  q: string;
  asText: readonly string[];
}

/* ------------------------------------------------------------ values -- */

const own = (table: object, value: unknown): value is string =>
  typeof value === "string" &&
  Object.prototype.hasOwnProperty.call(table, value);

/** A day this app sends, or null: anything else would be a `400`. */
export function whenParam(raw: unknown): FoundWhen | null {
  return own(foundWords.days, raw) ? (raw as FoundWhen) : null;
}

/** A budget this app sends, or null. */
export function budgetParam(raw: unknown): FoundBudget | null {
  return own(foundWords.budget.options, raw) ? (raw as FoundBudget) : null;
}

/** A time of day this app sends, or null. */
export function timeOfDayParam(raw: unknown): FoundTimeOfDay | null {
  return own(foundWords.timeOfDay.options, raw)
    ? (raw as FoundTimeOfDay)
    : null;
}

/* ------------------------------------------------------------ search -- */

/** `q` is at most this many characters (the API's limit). */
export const FOUND_Q_MAX = 120;
/** Under this many characters nothing is searched, as on the phone. */
export const FOUND_Q_MIN = 2;
/** `asText` takes at most this many words, each at most this many characters. */
export const AS_TEXT_MAX_WORDS = 8;
export const AS_TEXT_MAX_CHARS = 30;

/** Characters as a person counts them (code points), so a cut never splits one. */
const chars = (text: string) => [...text];

/**
 * What is typed, as `q`: trimmed, and cut to 120 characters if longer. Null
 * under two characters, which is not searched.
 */
export function foundSearchText(typed: string): string | null {
  const trimmed = typed.trim();
  const cut =
    chars(trimmed).length > FOUND_Q_MAX
      ? chars(trimmed).slice(0, FOUND_Q_MAX).join("")
      : trimmed;
  const q = cut.trim();
  return chars(q).length >= FOUND_Q_MIN ? q : null;
}

/**
 * A text's words as the API reads them: lower case, joined across an inner
 * apostrophe ("what's" is one word), split on anything that is not a letter
 * or a digit. A vowel sign stays in its word, so "రేపు" is one word.
 *
 * Only ever used to keep `asText` to words still in `q`: the chips are the
 * API's, and nothing here decides what a word means.
 */
export function foundSearchWords(text: string): string[] {
  return text
    .toLowerCase()
    .replace(/([\p{L}\p{M}\p{N}])['’]([\p{L}\p{M}\p{N}])/gu, "$1$2")
    .split(/[^\p{L}\p{M}\p{N}]+/u)
    .filter(Boolean);
}

/**
 * The words kept as plain text, as `asText` takes them: only words still in
 * `q` (the API ignores the others, and they would take a place among the
 * eight), each once, at most 30 characters, at most eight.
 */
export function keptAsText(asText: readonly string[], q: string): string[] {
  const inQ = new Set(foundSearchWords(q));
  const kept: string[] = [];
  for (const word of asText) {
    const w = word.toLowerCase();
    if (!inQ.has(w) || kept.includes(w) || chars(w).length > AS_TEXT_MAX_CHARS)
      continue;
    kept.push(w);
    if (kept.length === AS_TEXT_MAX_WORDS) break;
  }
  return kept;
}

/** A chip removed: its word joins the plain text, for the same `q`. */
export function withAsText(search: FoundSearch, from: string): FoundSearch {
  return {
    q: search.q,
    asText: keptAsText([...search.asText, ...foundSearchWords(from)], search.q),
  };
}

/** A search as `GET /events` takes it, or null when nothing searchable is typed. */
export function foundSearch(
  typed: string,
  asText: readonly string[] = [],
): FoundSearch | null {
  const q = foundSearchText(typed);
  return q ? { q, asText: keptAsText(asText, q) } : null;
}

const UNDERSTOOD_KINDS: Readonly<Record<UnderstoodChip["kind"], true>> =
  Object.freeze({ department: true, when: true, free: true, place: true });

/**
 * The understood row as drawn: the API's chips in its order, each once, with
 * words to show. A place chip only for a place this caller can be taken to
 * (`placeKnown`), since it never narrows and is only a way there; a chip of a
 * kind this app does not know is left out.
 */
export function understoodRow(
  chips: readonly UnderstoodChip[] | null | undefined,
  placeKnown: (destinationKey: string) => boolean,
): UnderstoodChip[] {
  const seen = new Set<string>();
  const row: UnderstoodChip[] = [];
  for (const chip of chips ?? []) {
    if (!chip || !own(UNDERSTOOD_KINDS, chip.kind)) continue;
    if (typeof chip.label !== "string" || typeof chip.value !== "string")
      continue;
    if (typeof chip.from !== "string") continue;
    const label = chip.label.trim();
    if (!label) continue;
    if (chip.kind === "place" && !placeKnown(chip.value)) continue;
    const id = `${chip.kind}\u0000${chip.value}`;
    if (seen.has(id)) continue;
    seen.add(id);
    row.push({ ...chip, label });
  }
  return row;
}

/* ----------------------------------------------------------- address -- */

/** The parameters of the address this module reads and writes, and no others. */
const OURS = ["when", "free", "budget", "timeOfDay", "q", "asText"] as const;

/**
 * A Server Component's `searchParams` as `URLSearchParams`, so the server and
 * the browser read the address with the same function. A repeated parameter
 * keeps every value, in order.
 */
export function paramsOf(
  query: Record<string, string | string[] | undefined>,
): URLSearchParams {
  const params = new URLSearchParams();
  for (const [key, value] of Object.entries(query)) {
    if (typeof value === "string") params.append(key, value);
    else if (Array.isArray(value))
      for (const one of value) params.append(key, one);
  }
  return params;
}

/**
 * The chips, Filters and search an address carries: `?when=`, `free=1`,
 * `budget=`, `timeOfDay=`, `q=` and `asText=` (repeated). A value this app
 * does not send is dropped, as `?category=` is, so a hand-edited address is
 * never a `400`.
 */
export function foundStateFrom(params: URLSearchParams): {
  filters: FoundFilters;
  search: FoundSearch | null;
} {
  const free = params.get("free");
  const budget =
    free === "1" || free === "true"
      ? "free"
      : budgetParam(params.get("budget"));
  return {
    filters: {
      when: whenParam(params.get("when")),
      budget,
      timeOfDay: timeOfDayParam(params.get("timeOfDay")),
    },
    search: foundSearch(params.get("q") ?? "", params.getAll("asText")),
  };
}

/**
 * `params` with the chips, Filters and search written in, leaving every other
 * parameter (`place`, `category`, a mocked build's `__scenario`) as it was.
 * Only what is chosen is written, so nothing chosen is the address R2 had.
 */
export function withFoundState(
  params: URLSearchParams,
  filters: FoundFilters,
  search: FoundSearch | null,
): URLSearchParams {
  const next = new URLSearchParams(params);
  for (const key of OURS) next.delete(key);
  if (filters.when) next.set("when", filters.when);
  if (filters.budget === "free") next.set("free", "1");
  else if (filters.budget) next.set("budget", filters.budget);
  if (filters.timeOfDay) next.set("timeOfDay", filters.timeOfDay);
  if (search) {
    next.set("q", search.q);
    for (const word of search.asText) next.append("asText", word);
  }
  return next;
}

/* ----------------------------------------------------------- request -- */

/** `GET /events`'s R3 parameters for what is chosen, leaving out what is not. */
export interface FoundListQuery {
  when?: FoundWhen;
  free?: true;
  budget?: "under_500" | "under_1500";
  timeOfDay?: FoundTimeOfDay;
  q?: string;
  asText?: string[];
}

/**
 * What is chosen, as `GET /events` parameters. Free goes as `free=true` and
 * an under-price budget as `budget`, so the two are never sent together, and
 * `any` is not sent at all.
 */
export function foundListQuery(
  filters: FoundFilters,
  search: FoundSearch | null,
): FoundListQuery {
  const { when, budget, timeOfDay } = filters;
  return {
    ...(when ? { when } : {}),
    ...(budget === "free" ? { free: true as const } : {}),
    ...(budget === "under_500" || budget === "under_1500" ? { budget } : {}),
    ...(timeOfDay ? { timeOfDay } : {}),
    ...(search ? { q: search.q } : {}),
    ...(search && search.asText.length > 0
      ? { asText: [...search.asText] }
      : {}),
  };
}

/**
 * What is chosen, as the query key's filter slot: an ordered array,
 * stringified, so a typed word can never imitate a separator. Built from the
 * request itself, so the key cannot carry less than the request does. Empty
 * when nothing narrows, so the list keeps R2's key.
 */
export function foundFilterKey(
  filters: FoundFilters,
  search: FoundSearch | null,
): string {
  const query = foundListQuery(filters, search);
  if (Object.keys(query).length === 0) return "";
  return JSON.stringify([
    query.when ?? "",
    query.free ? "free" : (query.budget ?? ""),
    query.timeOfDay ?? "",
    query.q ?? "",
    query.asText ?? [],
  ]);
}

/* ------------------------------------------------------------ choice -- */

/**
 * How many of the sheet's rows narrow, for Filters' count: an under-price
 * budget and a time of day. Free is the Free chip, which says it is on by
 * itself; `any` narrows nothing.
 */
export function foundRowsOn(filters: FoundFilters): number {
  const budget =
    filters.budget === "under_500" || filters.budget === "under_1500" ? 1 : 0;
  return budget + (filters.timeOfDay ? 1 : 0);
}

/** A day chip tapped: one day at a time, and a second tap clears it. */
export function toggleDay(
  filters: FoundFilters,
  when: FoundWhen,
): FoundFilters {
  return { ...filters, when: filters.when === when ? null : when };
}

/** Free tapped: Budget's Free on, or off again. It replaces an under-price budget. */
export function toggleFree(filters: FoundFilters): FoundFilters {
  return { ...filters, budget: filters.budget === "free" ? null : "free" };
}

/** Clear filters: every row of the sheet, Budget's Free with it; the day stays. */
export function clearRows(filters: FoundFilters): FoundFilters {
  return { ...NO_FOUND_FILTERS, when: filters.when };
}

/**
 * What a list emptied by R3 says, the narrowest thing first: the search
 * (with Clear search), the sheet's rows (with Clear filters), then the day,
 * then Free (each with Show everything). Null when none is on, for R2's own
 * lines (a department with nothing, or a place with nothing at all).
 */
export function foundEmpty(
  filters: FoundFilters,
  search: FoundSearch | null,
  place: string,
): {
  line: string;
  action: "clear-search" | "clear-filters" | "show-everything";
} | null {
  if (search) {
    return {
      line: foundWords.search.empty(place, search.q),
      action: "clear-search",
    };
  }
  if (foundRowsOn(filters) > 0) {
    return { line: foundWords.emptyFilters(place), action: "clear-filters" };
  }
  if (filters.when) {
    return {
      line: foundWords.emptyDay(filters.when, place),
      action: "show-everything",
    };
  }
  if (filters.budget === "free") {
    return { line: foundWords.emptyFree(place), action: "show-everything" };
  }
  return null;
}

/* ------------------------------------------------------- coming up -- */

/** Fewer than this many cards on a weekend the server says is complete: Coming up follows. */
export const THIN_WEEKEND = 3;

/** How far Coming up looks: today and the next thirteen days. */
export const COMING_UP_DAYS = 14;

/** Whether a chosen weekend is thin: complete, with fewer than three cards on screen. */
export function thinWeekend(
  when: FoundWhen | null,
  tail: FoundTail,
  cards: number,
): boolean {
  return when === "weekend" && tail === "end" && cards < THIN_WEEKEND;
}

const ISO_DATE = /^\d{4}-\d{2}-\d{2}$/;

/**
 * Coming up on a thin weekend: of the first page read without the day, the
 * cards that start from `today` to thirteen days on and are not already on
 * screen, in the server's order. An undated card has no start to fall in the
 * two weeks.
 */
export function comingUpCards<T extends Pick<FoundItem, "id" | "when">>(
  firstPage: readonly T[],
  onScreen: readonly Pick<FoundItem, "id">[],
  today: string,
): T[] {
  if (!civilFromDate(today)) return [];
  const last = marketDaysFrom(today, COMING_UP_DAYS).at(-1)!;
  const shown = new Set(onScreen.map((item) => item.id.toLowerCase()));
  return firstPage.filter((item) => {
    const start = item.when.startsOn;
    if (typeof start !== "string" || !ISO_DATE.test(start)) return false;
    if (!civilFromDate(start)) return false;
    return start >= today && start <= last && !shown.has(item.id.toLowerCase());
  });
}

const pad = (n: number) => String(n).padStart(2, "0");

/**
 * The place's date now, `YYYY-MM-DD`: `nowMs` (the server's clock: the
 * browser's plus the offset the API's `Date` header taught) in the place's
 * zone, or in the browser's when the zone is one it does not know.
 */
export function foundToday(
  nowMs: number,
  timeZone: string | null | undefined,
): string {
  const iso = new Date(nowMs).toISOString();
  const civil =
    (timeZone ? civilInZone(iso, timeZone) : null) ?? civilHere(iso)!;
  return `${civil.year}-${pad(civil.month)}-${pad(civil.day)}`;
}
