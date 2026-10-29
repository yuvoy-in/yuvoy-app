import type { components } from "../src/lib/api/schema.gen";
import {
  multiDay,
  placeDate,
  statedOf,
  type FoundSample,
} from "./found-fixtures";
import {
  searchWords,
  textMatches,
  understand,
  type Understood,
} from "./found-understood";

/**
 * R3-T2's filters on a place's found items (yuvoy-app#180), judged and
 * applied as the API's are (yuvoy-api `handler/events.go`,
 * `found_items_narrowing.go`): `when`, `free`, `budget`, `timeOfDay` and
 * R3-T6's four, a search by `q` and `asText` (`found-understood.ts`), what
 * it understood and, for a `when`, its window. They narrow and never reorder.
 *
 * Only while `checkedCities` is open to the caller; `found-handlers.ts`
 * decides that, and while it is closed every parameter here is ignored
 * without being checked.
 *
 * R3-T6's four (yuvoy-app#195) read what each card's page states, as the
 * API sends it (`statedOf`): an item that does not state a fact never
 * matches its filter, and how hard is never sent, so never matched, on a
 * card no person checked. Only `found-stated-fixtures.ts` states anything,
 * so elsewhere they match nothing but a multi-day item's `longer`.
 */

type FoundItem = components["schemas"]["FoundItem"];
type ExplorePlace = components["schemas"]["ExplorePlace"];
type UnderstoodChip = components["schemas"]["UnderstoodChip"];

/** What R3 asked of a list. `free` is `free=true` or `budget=free`, the same thing. */
export interface R3Ask {
  when: string | null;
  free: boolean;
  /** `under_500` or `under_1500`; `any` narrows nothing and is dropped. */
  budget: string | null;
  timeOfDay: string | null;
  duration: string | null;
  setting: string | null;
  suits: string | null;
  difficulty: string | null;
  q: string | null;
  asText: string[];
}

/** Nothing asked: R2's answer, and what a closed `checkedCities` reads. */
export const NO_R3: R3Ask = Object.freeze({
  when: null,
  free: false,
  budget: null,
  timeOfDay: null,
  duration: null,
  setting: null,
  suits: null,
  difficulty: null,
  q: null,
  asText: [],
}) as R3Ask;

/** A 400's sentence and details, in the API's words. */
export interface R3Refusal {
  message: string;
  details: Record<string, unknown>;
}

/** Each closed value set, with the sentence its 400 says it in, in the API's order. */
const VALUES: readonly [keyof R3Ask, readonly string[], string][] = [
  [
    "when",
    ["today", "tomorrow", "weekend"],
    "when should be today, tomorrow or weekend",
  ],
  [
    "budget",
    ["free", "under_500", "under_1500", "any"],
    "budget should be free, under_500, under_1500 or any",
  ],
  [
    "timeOfDay",
    ["morning", "afternoon", "evening"],
    "timeOfDay should be morning, afternoon or evening",
  ],
  [
    "duration",
    ["under_2h", "half_day", "longer"],
    "duration should be under_2h, half_day or longer",
  ],
  ["setting", ["indoor", "outdoor"], "setting should be indoor or outdoor"],
  [
    "suits",
    ["solo", "couples", "friends", "families", "kids"],
    "suits should be solo, couples, friends, families or kids",
  ],
  [
    "difficulty",
    ["easy", "moderate", "hard"],
    "difficulty should be easy, moderate or hard",
  ],
];

/** R3's parameters read and judged as the API judges them: the ask, or the 400. */
export function readR3(params: URLSearchParams): R3Ask | R3Refusal {
  const free = params.get("free");
  if (free !== null && free !== "true" && free !== "false") {
    return { message: "free should be true or false", details: { free } };
  }
  const q = params.get("q");
  if (q !== null && [...q].length > 120) {
    return {
      message: "a search can be at most 120 characters",
      details: { q: "longer than 120 characters" },
    };
  }
  const asText = params.getAll("asText");
  if (asText.length > 8 || asText.some((w) => [...w].length > 30)) {
    return {
      message: "asText takes at most 8 words of at most 30 characters each",
      details: {
        asText: "more than 8 words, or a word longer than 30 characters",
      },
    };
  }
  const ask: R3Ask = { ...NO_R3, asText };
  for (const [name, values, sentence] of VALUES) {
    const value = params.get(name);
    if (value === null || value === "") continue;
    if (!values.includes(value)) {
      return { message: sentence, details: { [name]: value } };
    }
    (ask as unknown as Record<string, string>)[name] = value;
  }
  const under = ask.budget === "under_500" || ask.budget === "under_1500";
  if (free === "true" && under) {
    return {
      message: "free=true already means budget=free, so send one or the other",
      details: { free, budget: ask.budget },
    };
  }
  ask.free = free === "true" || ask.budget === "free";
  ask.budget = under ? ask.budget : null;
  ask.q = q?.trim() || null;
  return ask;
}

/** Whether `readR3` refused. */
export function refused(read: R3Ask | R3Refusal): read is R3Refusal {
  return "message" in read;
}

/** Everything a cursor is bound to, as one text. */
export function askKey(category: string, ask: R3Ask): string {
  return JSON.stringify([
    category,
    ask.when,
    ask.free,
    ask.budget,
    ask.timeOfDay,
    ask.duration,
    ask.setting,
    ask.suits,
    ask.difficulty,
    ask.q,
    ask.asText,
  ]);
}

/* ------------------------------------------------------------ windows */

/** India keeps one offset all year, as `found-fixtures.ts` counts it. */
const IST = "+05:30";

/** The place's ISO weekday today, 1 Monday to 7 Sunday. */
function isoWeekday(now: number): number {
  const day = new Date(`${placeDate(0, now)}T00:00:00Z`).getUTCDay();
  return day === 0 ? 7 : day;
}

/** Days from today to the Friday of the weekend today belongs to: Monday to Thursday the coming one. */
function weekendFriday(now: number): number {
  return 5 - isoWeekday(now);
}

/** Runs on that local date: a multi-day item on every day it runs, an undated one never. */
function runsOn(item: FoundItem, date: string): boolean {
  const start = item.when.startsOn;
  if (!start) return false;
  return start <= date && (item.when.endsOn ?? start) >= date;
}

/** Friday 17:00 to Sunday 24:00: an item whose last day is the Friday counts from 17:00 only. */
function inWeekend(item: FoundItem, now: number): boolean {
  const start = item.when.startsOn;
  if (!start) return false;
  const fri = placeDate(weekendFriday(now), now);
  const sun = placeDate(weekendFriday(now) + 2, now);
  const end = item.when.endsOn ?? start;
  if (!(start <= sun && end >= fri)) return false;
  return !(
    end === fri &&
    (!item.when.startTime || item.when.startTime < "17:00")
  );
}

/**
 * A home-city card whose person check is older than the weekend week's
 * Monday, once that weekend's Friday has begun: the weekend leaves it out.
 */
function staleForWeekend(
  item: FoundItem,
  place: ExplorePlace,
  now: number,
): boolean {
  if (place.kind !== "local") return false;
  const fri = placeDate(weekendFriday(now), now);
  if (now < Date.parse(`${fri}T00:00:00${IST}`)) return false;
  const monday = placeDate(weekendFriday(now) - 4, now);
  const at = item.check.checkedAt;
  return !at || Date.parse(at) < Date.parse(`${monday}T00:00:00${IST}`);
}

function onDay(
  item: FoundItem,
  when: string,
  place: ExplorePlace,
  now: number,
): boolean {
  if (when === "today") return runsOn(item, placeDate(0, now));
  if (when === "tomorrow") return runsOn(item, placeDate(1, now));
  return inWeekend(item, now) && !staleForWeekend(item, place, now);
}

/** The next date with that ISO weekday, today included. */
function nextWeekday(weekday: number, now: number): string {
  return placeDate((weekday - isoWeekday(now) + 7) % 7, now);
}

/** The window `when` covered, for the heading: local dates, both included. */
export function windowOf(
  when: string,
  now: number,
): { from: string; to: string } {
  if (when === "today") {
    return { from: placeDate(0, now), to: placeDate(0, now) };
  }
  if (when === "tomorrow") {
    return { from: placeDate(1, now), to: placeDate(1, now) };
  }
  const fri = weekendFriday(now);
  return { from: placeDate(fri, now), to: placeDate(fri + 2, now) };
}

/* ------------------------------------------------------------ filters */

/** Free counts under every limit; a price the page does not state is under none. */
function fitsBudget(item: FoundItem, ask: R3Ask): boolean {
  if (ask.free) return item.price.kind === "free";
  if (!ask.budget) return true;
  if (item.price.kind === "free") return true;
  const from = item.price.kind === "paid" ? item.price.from?.amountMinor : null;
  if (typeof from !== "number" || from <= 0) return false;
  return from < (ask.budget === "under_500" ? 50_000 : 150_000);
}

/** Morning before 12:00, afternoon to 16:59, evening from 17:00; a date-only item is none. */
function fitsTime(item: FoundItem, time: string): boolean {
  const start = item.when.startTime;
  if (!start) return false;
  if (time === "morning") return start < "12:00";
  if (time === "afternoon") return start >= "12:00" && start < "17:00";
  return start >= "17:00";
}

/** `HH:MM` as minutes into the day, or null. */
function minutes(time: string | null): number | null {
  const match = /^(\d{2}):(\d{2})$/.exec(time ?? "");
  return match ? Number(match[1]) * 60 + Number(match[2]) : null;
}

/**
 * From the stated start to the stated end on a one-day item: under 2 hours
 * below 120 minutes, half a day 120 to 300, longer above. A multi-day item is
 * `longer`; one missing either time is none.
 */
function fitsDuration(sample: FoundSample, duration: string): boolean {
  if (multiDay(sample.card)) return duration === "longer";
  const start = minutes(sample.card.when.startTime);
  const end = minutes(statedOf(sample).endTime);
  if (start === null || end === null || end <= start) return false;
  const long = end - start;
  if (duration === "under_2h") return long < 120;
  if (duration === "half_day") return long >= 120 && long <= 300;
  return long > 300;
}

function fits(
  sample: FoundSample,
  ask: R3Ask,
  place: ExplorePlace,
  now: number,
): boolean {
  const item = sample.card;
  const stated = statedOf(sample);
  if (ask.when && !onDay(item, ask.when, place, now)) return false;
  if (!fitsBudget(item, ask)) return false;
  if (ask.timeOfDay && !fitsTime(item, ask.timeOfDay)) return false;
  if (ask.duration && !fitsDuration(sample, ask.duration)) return false;
  // `indoor` and `outdoor` each match an item stated as both.
  if (
    ask.setting &&
    stated.setting !== ask.setting &&
    stated.setting !== "both"
  ) {
    return false;
  }
  if (ask.suits && !(stated.suits as string[]).includes(ask.suits)) {
    return false;
  }
  // Checked items only: `statedOf` sends no difficulty on any other.
  if (ask.difficulty && stated.difficulty !== ask.difficulty) return false;
  return true;
}

/** The card's own words, for the text search. */
function cardWords(sample: FoundSample): string[] {
  const { card } = sample;
  return searchWords(
    [
      card.title,
      card.where.placeText,
      card.where.town,
      sample.organiser,
      card.department?.replace(/_/g, " "),
    ]
      .filter(Boolean)
      .join(" "),
  );
}

/** Whether a card is what the search asked for. */
function searched(
  sample: FoundSample,
  u: Understood,
  place: ExplorePlace,
  now: number,
): boolean {
  if (u.ownPlaceOnly) return true;
  if (u.nothing) return false;
  const item = sample.card;
  const n = u.narrowing;
  if (
    n.departments.length > 0 &&
    !n.departments.includes(item.department ?? "")
  ) {
    return false;
  }
  if (n.days.length > 0 || n.weekdays.length > 0) {
    const day =
      n.days.some((d) => onDay(item, d, place, now)) ||
      n.weekdays.some((w) => runsOn(item, nextWeekday(w, now)));
    if (!day) return false;
  }
  if (n.free && item.price.kind !== "free") return false;
  return textMatches(u.text, cardWords(sample));
}

/**
 * A place's cards narrowed by what was asked, in the order given, and the
 * chips the search was taken to mean (empty without `q`).
 */
export function narrow(
  samples: FoundSample[],
  place: ExplorePlace,
  ask: R3Ask,
  now: number,
): { samples: FoundSample[]; understood: UnderstoodChip[] } {
  const u = ask.q ? understand(ask.q, ask.asText, place.key) : null;
  return {
    samples: samples.filter(
      (s) => fits(s, ask, place, now) && (!u || searched(s, u, place, now)),
    ),
    understood: u && !u.ownPlaceOnly ? u.chips : [],
  };
}
