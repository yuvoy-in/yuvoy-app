import type { components } from "@/lib/api/schema.gen";
import {
  foundWords,
  type FoundBudget,
  type FoundDifficulty,
  type FoundDuration,
  type FoundSetting,
  type FoundSuits,
  type FoundTimeOfDay,
  type FoundWhen,
} from "./found-words";
import { foundSearch, own } from "./found-filters-parts";

export {
  FOUND_Q_MAX,
  FOUND_Q_MIN,
  AS_TEXT_MAX_WORDS,
  AS_TEXT_MAX_CHARS,
  foundSearchText,
  foundSearchWords,
  keptAsText,
  withAsText,
  foundSearch,
  understoodRow,
  THIN_WEEKEND,
  COMING_UP_DAYS,
  thinWeekend,
  comingUpCards,
  foundToday,
} from "./found-filters-parts";

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
 * ## How hard is a local place's only
 *
 * The API matches `difficulty` on checked cards only, and only a local place
 * is all checked cards (yuvoy-app#195, R3-T6). So in a travel place the
 * sheet has no How hard row, and `difficulty` is left out of the request, the
 * key, the address and Filters' count even when something hands one in: every
 * function that turns filters into any of those takes `local`, the place's
 * `kind` being `local`, and reads them through `sendable`. The phone does the
 * same (`foundFilterRows`).
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
  duration: FoundDuration | null;
  setting: FoundSetting | null;
  suits: FoundSuits | null;
  difficulty: FoundDifficulty | null;
}

/** Nothing chosen: how a place's cards open, and what Show everything goes back to. */
export const NO_FOUND_FILTERS: Readonly<FoundFilters> = Object.freeze({
  when: null,
  budget: null,
  timeOfDay: null,
  duration: null,
  setting: null,
  suits: null,
  difficulty: null,
});

/** A row of the Filters sheet: every filter but the day, which has its chips. */
export type FoundRowKey = Exclude<keyof FoundFilters, "when">;

/** A row as the vocabulary sends it (`foundFilters`, yuvoy-api#589). */
export type FoundFilterRow = components["schemas"]["FoundFilterRow"];

/** A search, as `GET /events` takes it: the words, and those kept as plain text. */
export interface FoundSearch {
  q: string;
  asText: readonly string[];
}

/* ------------------------------------------------------------ values -- */

/** A day this app sends, or null: anything else would be a `400`. */
export function whenParam(raw: unknown): FoundWhen | null {
  return own(foundWords.days, raw) ? (raw as FoundWhen) : null;
}

/**
 * The values this app sends for each row, typed against the contract, so a
 * value it adds fails to compile until the address and the request can carry
 * it. The words are the API's: these only say what may be read and sent.
 */
const ROW_VALUES = {
  budget: {
    free: true,
    under_500: true,
    under_1500: true,
    any: true,
  } satisfies Record<FoundBudget, true>,
  timeOfDay: {
    morning: true,
    afternoon: true,
    evening: true,
  } satisfies Record<FoundTimeOfDay, true>,
  duration: {
    under_2h: true,
    half_day: true,
    longer: true,
  } satisfies Record<FoundDuration, true>,
  // No "both": an item stated as both matches either, and `setting=both` is a `400`.
  setting: {
    indoor: true,
    outdoor: true,
  } satisfies Record<FoundSetting, true>,
  suits: {
    solo: true,
    couples: true,
    friends: true,
    families: true,
    kids: true,
  } satisfies Record<FoundSuits, true>,
  difficulty: {
    easy: true,
    moderate: true,
    hard: true,
  } satisfies Record<FoundDifficulty, true>,
} satisfies Record<FoundRowKey, object>;

/** A budget this app sends, or null. */
export function budgetParam(raw: unknown): FoundBudget | null {
  return own(ROW_VALUES.budget, raw) ? (raw as FoundBudget) : null;
}

/** A time of day this app sends, or null. */
export function timeOfDayParam(raw: unknown): FoundTimeOfDay | null {
  return own(ROW_VALUES.timeOfDay, raw) ? (raw as FoundTimeOfDay) : null;
}

/**
 * A value of one of the sheet's rows this app sends, or null: only one in
 * `ROW_VALUES`, which is typed against the contract. So `setting=both`, which
 * the API refuses, is never read or sent.
 */
export function rowParam<K extends FoundRowKey>(
  key: K,
  raw: unknown,
): FoundFilters[K] | null {
  return own(ROW_VALUES[key], raw) ? (raw as FoundFilters[K]) : null;
}

/**
 * The rows the sheet draws in a place, in the vocabulary's order and with its
 * words. A row that matches checked cards only (`localOnly`, How hard) only
 * where the place is local. A row or a value this app cannot carry is left
 * out, since a choice the address would drop on reading must not be offered.
 */
export function foundSheetRows(
  rows: readonly FoundFilterRow[] | null | undefined,
  local: boolean,
): FoundFilterRow[] {
  return (rows ?? [])
    .filter((row) => own(ROW_VALUES, row.key) && (local || !row.localOnly))
    .map((row) => ({
      ...row,
      options: row.options.filter((o) => rowParam(row.key, o.key) !== null),
    }))
    .filter((row) => row.options.length > 0);
}

/** The filters as they may be sent: known values only, and How hard only in a local place. */
function sendable(filters: FoundFilters, local: boolean): FoundFilters {
  return {
    when: whenParam(filters.when),
    budget: rowParam("budget", filters.budget),
    timeOfDay: rowParam("timeOfDay", filters.timeOfDay),
    duration: rowParam("duration", filters.duration),
    setting: rowParam("setting", filters.setting),
    suits: rowParam("suits", filters.suits),
    difficulty: local ? rowParam("difficulty", filters.difficulty) : null,
  };
}

/* ----------------------------------------------------------- address -- */

/** The parameters of the address this module reads and writes, and no others. */
const OURS = [
  "when",
  "free",
  "budget",
  "timeOfDay",
  "duration",
  "setting",
  "suits",
  "difficulty",
  "q",
  "asText",
] as const;

/** The rows that go into the address and the request under their own name. */
const ROW_PARAMS = [
  "timeOfDay",
  "duration",
  "setting",
  "suits",
  "difficulty",
] as const satisfies readonly FoundRowKey[];

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
 * `budget=`, `timeOfDay=`, `duration=`, `setting=`, `suits=`, `difficulty=`
 * (in a local place only), `q=` and `asText=` (repeated). A value this app
 * does not send is dropped, as `?category=` is, so a hand-edited address is
 * never a `400`.
 */
export function foundStateFrom(
  params: URLSearchParams,
  local: boolean,
): {
  filters: FoundFilters;
  search: FoundSearch | null;
} {
  const free = params.get("free");
  const budget =
    free === "1" || free === "true"
      ? "free"
      : budgetParam(params.get("budget"));
  return {
    filters: sendable(
      {
        when: whenParam(params.get("when")),
        budget,
        timeOfDay: timeOfDayParam(params.get("timeOfDay")),
        duration: rowParam("duration", params.get("duration")),
        setting: rowParam("setting", params.get("setting")),
        suits: rowParam("suits", params.get("suits")),
        difficulty: rowParam("difficulty", params.get("difficulty")),
      },
      local,
    ),
    search: foundSearch(params.get("q") ?? "", params.getAll("asText")),
  };
}

/**
 * `params` with the chips, Filters and search written in, leaving every other
 * parameter (`place`, `category`, a mocked build's `__scenario`) as it was.
 * Only what is chosen is written, so nothing chosen is the address R2 had,
 * and How hard only in a local place.
 */
export function withFoundState(
  params: URLSearchParams,
  filters: FoundFilters,
  local: boolean,
  search: FoundSearch | null,
): URLSearchParams {
  const f = sendable(filters, local);
  const next = new URLSearchParams(params);
  for (const key of OURS) next.delete(key);
  if (f.when) next.set("when", f.when);
  if (f.budget === "free") next.set("free", "1");
  else if (f.budget) next.set("budget", f.budget);
  for (const key of ROW_PARAMS) {
    const value = f[key];
    if (value) next.set(key, value);
  }
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
  duration?: FoundDuration;
  setting?: FoundSetting;
  suits?: FoundSuits;
  difficulty?: FoundDifficulty;
  q?: string;
  asText?: string[];
}

/**
 * What is chosen, as `GET /events` parameters. Free goes as `free=true` and
 * an under-price budget as `budget`, so the two are never sent together, and
 * `any` is not sent at all. Only values this app knows are sent, and How hard
 * only in a local place (`local`).
 */
export function foundListQuery(
  filters: FoundFilters,
  local: boolean,
  search: FoundSearch | null,
): FoundListQuery {
  const { when, budget, timeOfDay, duration, setting, suits, difficulty } =
    sendable(filters, local);
  return {
    ...(when ? { when } : {}),
    ...(budget === "free" ? { free: true as const } : {}),
    ...(budget === "under_500" || budget === "under_1500" ? { budget } : {}),
    ...(timeOfDay ? { timeOfDay } : {}),
    ...(duration ? { duration } : {}),
    ...(setting ? { setting } : {}),
    ...(suits ? { suits } : {}),
    ...(difficulty ? { difficulty } : {}),
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
  local: boolean,
  search: FoundSearch | null,
): string {
  const query = foundListQuery(filters, local, search);
  if (Object.keys(query).length === 0) return "";
  return JSON.stringify([
    query.when ?? "",
    query.free ? "free" : (query.budget ?? ""),
    query.timeOfDay ?? "",
    query.duration ?? "",
    query.setting ?? "",
    query.suits ?? "",
    query.difficulty ?? "",
    query.q ?? "",
    query.asText ?? [],
  ]);
}

/* ------------------------------------------------------------ choice -- */

/**
 * How many of the sheet's rows narrow, for Filters' count: an under-price
 * budget, a time of day, how long, indoors or out, who it suits, and how hard
 * in a local place. Free is the Free chip, which says it is on by itself;
 * `any` narrows nothing.
 */
export function foundRowsOn(filters: FoundFilters, local: boolean): number {
  const f = sendable(filters, local);
  const budget = f.budget === "under_500" || f.budget === "under_1500" ? 1 : 0;
  return ROW_PARAMS.reduce((on, key) => on + (f[key] ? 1 : 0), budget);
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

/**
 * A choice in one of the sheet's rows: one at a time, and a second tap
 * clears it. A value the row does not have changes nothing.
 */
export function toggleRow(
  filters: FoundFilters,
  key: FoundRowKey,
  value: string,
): FoundFilters {
  const next = rowParam(key, value);
  if (next === null) return filters;
  return { ...filters, [key]: filters[key] === next ? null : next };
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
  local: boolean,
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
  if (foundRowsOn(filters, local) > 0) {
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
