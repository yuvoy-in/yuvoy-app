import type { components } from "@/lib/api/schema.gen";

/**
 * The search filter set, and the one place it is turned into a query.
 *
 * ## Why this is a module and not five `useState`s in the screen
 *
 * `GET /reels` is explicit, and it is the sharpest edge in this whole feature:
 *
 * > A cursor belongs to the filters it was minted under. Sending it with any
 * > different filter set is a `400`, because the rotation is counted within
 * > the filters and the same position means a different card under different
 * > ones. When the chips change, drop the cursor and start from the first
 * > page.
 *
 * A React Query key that does not carry every filter is therefore not a
 * caching mistake, it is a `400` on the second page of every changed search.
 * `reelFilterKey` is the key and `reelQuery` is the request, built from the
 * same object, so the two cannot drift — the failure would be silent until
 * somebody scrolled.
 *
 * The same object also travels in the URL, which is what lets a reel opened
 * from the grid swipe on through the same filtered order and come back.
 */

export type Category = components["schemas"]["Category"];

export interface ReelFilters {
  /** Free text. Trimmed, and absent rather than empty. */
  q?: string;
  /** `YYYY-MM-DD`, in the market's timezone. */
  bookableOn?: string;
  /** `<market>/<destination>`. */
  destinationKey?: string;
  /** A CLOSED enum: an unknown value is a 400, not an empty page. */
  category?: Category;
  /** An OPEN set: an unknown value is an empty page, not a 400. */
  activityType?: string;
}

/** Whether anything at all has been asked for. */
export function isAsking(filters: ReelFilters): boolean {
  return Object.values(filters).some((v) => v !== undefined && v !== "");
}

/**
 * The filter set as a stable query key.
 *
 * An ordered ARRAY, stringified. Two things are load-bearing about that and
 * both were wrong in a first draft.
 *
 * It is not `JSON.stringify(filters)` on the object: key order in JavaScript
 * is insertion order, so the same filter set built by two code paths would
 * stringify differently, get two cache entries, and each re-fetch what the
 * other already held.
 *
 * And it is not the five values joined on a separator. A traveller may type
 * one: `q: "diving | havelock"` and `q: "diving ", bookableOn: " havelock"`
 * are different searches that flatten to nearly the same string, and "nearly"
 * is not a property to rest a cursor on. `JSON.stringify` escapes the parts
 * for us, so no value can impersonate a boundary.
 */
export function reelFilterKey(filters: ReelFilters): string {
  return JSON.stringify([
    filters.q?.trim() ?? "",
    filters.bookableOn ?? "",
    filters.destinationKey ?? "",
    filters.category ?? "",
    filters.activityType ?? "",
  ]);
}

/** The filter set as `GET /reels` query parameters, omitting what is absent. */
export function reelQuery(filters: ReelFilters) {
  const q = filters.q?.trim();
  return {
    ...(q ? { q } : {}),
    ...(filters.bookableOn ? { bookableOn: filters.bookableOn } : {}),
    ...(filters.destinationKey
      ? { destinationKey: filters.destinationKey }
      : {}),
    ...(filters.category ? { category: filters.category } : {}),
    ...(filters.activityType ? { activityType: filters.activityType } : {}),
  };
}

/**
 * The filter set as URL search parameters, and back.
 *
 * Short names, because this string is on screen. `on` rather than `bookableOn`
 * and `place` rather than `destinationKey`: the API's names are the API's, and
 * a traveller sharing a search should not be sharing our field names.
 *
 * The filters live in the URL — a change from the chips-in-state screen this
 * replaces — and that is load-bearing rather than tidy. A reel opened from the
 * grid has to swipe on through the SAME filtered order, so the sequence has to
 * survive a navigation; and "back returns to the same grid" is the browser's
 * own behaviour once the state that built the grid is in the address.
 */
const PARAM = {
  q: "q",
  bookableOn: "on",
  destinationKey: "place",
  category: "kind",
  activityType: "doing",
} as const;

export function filtersToParams(filters: ReelFilters): URLSearchParams {
  const params = new URLSearchParams();
  for (const [field, name] of Object.entries(PARAM)) {
    const value = filters[field as keyof ReelFilters]?.trim();
    if (value) params.set(name, value);
  }
  return params;
}

export function filtersFromParams(
  params: URLSearchParams | null | undefined,
): ReelFilters {
  if (!params) return {};
  const read = (name: string) => params.get(name)?.trim() || undefined;
  return {
    q: read(PARAM.q),
    bookableOn: read(PARAM.bookableOn),
    destinationKey: read(PARAM.destinationKey),
    /*
      Not validated against the enum here, and deliberately.

      An unknown `category` is a 400 from the server, which is the contract
      telling us this build and the API disagree about a closed vocabulary —
      a real bug, and one worth surfacing as the error state rather than
      silently dropping the filter and showing results for a different search
      than the one in the address bar.
    */
    category: read(PARAM.category) as Category | undefined,
    activityType: read(PARAM.activityType),
  };
}
