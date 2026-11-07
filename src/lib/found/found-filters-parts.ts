import { marketDaysFrom } from "@/lib/booking/availability-window";
import { civilFromDate, civilHere, civilInZone } from "@/lib/format/date";
import type {
  FoundItem,
  FoundTail,
  FoundWhen,
  UnderstoodChip,
} from "./found-words";
import type { FoundSearch } from "./found-filters";

/*
 * Search and Coming up over a place's found cards, with the small `own`
 * check that search shares. Moved out of found-filters.ts as they were, so
 * each file stays under 500 lines (yuvoy-app#243). found-filters.ts
 * re-exports every name here, so importers are unchanged.
 */
export const own = (table: object, value: unknown): value is string =>
  typeof value === "string" &&
  Object.prototype.hasOwnProperty.call(table, value);

/* ------------------------------------------------------------ search -- */

/** `q` is at most this many characters (the API's limit). */
export const FOUND_Q_MAX = 120;
/** Under this many characters nothing is searched, as on the phone. */
export const FOUND_Q_MIN = 2;
/** `asText` takes at most this many words, each at most this many characters. */
export const AS_TEXT_MAX_WORDS = 8;
export const AS_TEXT_MAX_CHARS = 40;

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
 * eight), each once, at most 40 characters (a chip's `from` can be 40), at
 * most eight.
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
