import { marketToday, marketDaysFrom } from "@/lib/booking/availability-window";
import { civilFromDate, weekdayName, dayMonth } from "@/lib/format/date";
import type { ReelFilters } from "./filters";

/**
 * What each applied filter is CALLED, for the pills under the search bar.
 *
 * ## Why the labels come from the server and the dates do not
 *
 * A place, a category and an activity type are the API's own words:
 * "Havelock (Swaraj Dweep)" is not something any title-casing of
 * `andaman/havelock` produces, and inventing one would put a name on screen
 * that no operator agreed to. So those three are looked up in the vocabulary
 * and, while it is loading, the pill shows a skeleton rather than the raw key
 * (yuvoy-app#37 item 1).
 *
 * A date is ours to format, in the MARKET's timezone. A traveller in London
 * reading "Mon 15 Sep" about a 7am dive in Havelock is reading a different day
 * to the one they will be on a boat.
 */

/** The four filters that show as pills, in the order the issue names. */
export const PILL_ORDER = [
  "destinationKey",
  "bookableOn",
  "category",
  "activityType",
] as const;

export type PillField = (typeof PILL_ORDER)[number];

/** How many pills would show. The typed word is deliberately not one. */
export function activeFilterCount(filters: ReelFilters): number {
  return PILL_ORDER.filter((field) => Boolean(filters[field])).length;
}

/**
 * A date as a chip or pill reads it: "Today", "Tomorrow", or "Sat 20 Sep".
 *
 * `today` is injectable so a test can pin the day without stubbing a clock.
 * Every caller in the app leaves it out and gets the market's own today.
 */
export function dayLabel(date: string, today: string = marketToday()): string {
  if (date === today) return "Today";
  const [tomorrow] = marketDaysFrom(today, 2).slice(1);
  if (date === tomorrow) return "Tomorrow";
  return dateLabel(date);
}

/**
 * The same date, always spelled out: "Tue 15 Sep", never "Tomorrow".
 *
 * For a calendar CELL. Two reasons, and the second is the one that made this a
 * separate function rather than a flag.
 *
 * In a month grid "Tomorrow" tells a reader less than the date does: the whole
 * point of the grid is which square in which week.
 *
 * And a cell named "Today" would collide with the WHEN CHIP named "Today", in
 * the same dialog, three inches apart. Two buttons with one accessible name is
 * ambiguous to anybody navigating by name, and it is how a test found this:
 * "Found multiple elements with the role button and name Tomorrow".
 */
export function dateLabel(date: string): string {
  /*
    No timezone step, and no `Intl` (yuvoy-app#67).

    This used to parse the date as noon in `Asia/Kolkata` and ask a formatter
    what day that instant fell on, which is a round trip: `date` is already a
    plain `YYYY-MM-DD` in the market's own calendar. Noon was the guard against
    a UTC-midnight parse naming the previous day, and the guard is unnecessary
    once nothing is converted.

    The old version was already immune to the "Sept" divergence, because it
    assembled the label from `formatToParts` and cut the month to three. Moving
    it here is not a fix, it is the rule: `month: "short"` lives in exactly one
    module now, so `pnpm qa` can refuse it everywhere else.

    A date the server sent in a shape this cannot read is echoed unchanged
    rather than dropped. This names a calendar CELL and a blank cell is worse
    than an oddly spelled one.
  */
  const civil = civilFromDate(date);
  if (!civil) return date;
  return `${weekdayName(civil)} ${dayMonth(civil)}`;
}

/** The vocabulary, in the shape this module needs. */
export interface VocabularyLike {
  destinations?: { key: string; label: string }[];
  categories?: { key: string; label: string }[];
  activityTypes?: { key: string; label: string; category?: string }[];
}

export interface FilterPill {
  field: PillField;
  /** The word on the pill, or `null` while the vocabulary is still loading. */
  label: string | null;
}

/**
 * The applied filters as pills, in order, skipping what is not set.
 *
 * A value the vocabulary does not know answers `null` rather than the key.
 * Two ways that happens and both are real: the read has not landed yet, and
 * the address carries a key this deployment's vocabulary has dropped. Showing
 * `andaman/havelock` in either case is worse than showing a skeleton, and
 * dropping the pill entirely would leave a filter applied with nothing on
 * screen to remove it.
 */
export function filterPills(
  filters: ReelFilters,
  vocabulary: VocabularyLike | null | undefined,
  today: string = marketToday(),
): FilterPill[] {
  const find = (
    list: { key: string; label: string }[] | undefined,
    key: string,
  ) => list?.find((entry) => entry.key === key)?.label ?? null;

  const pills: FilterPill[] = [];
  for (const field of PILL_ORDER) {
    const value = filters[field];
    if (!value) continue;

    if (field === "bookableOn") {
      pills.push({ field, label: dayLabel(value, today) });
      continue;
    }
    const list =
      field === "destinationKey"
        ? vocabulary?.destinations
        : field === "category"
          ? vocabulary?.categories
          : vocabulary?.activityTypes;
    pills.push({ field, label: find(list, value) });
  }
  return pills;
}

/**
 * The filter set with one pill removed.
 *
 * Removing the category also removes the activity type. The type chips are
 * narrowed BY the category, so a type left behind is a filter with no chip to
 * un-tap and no pill of its own that explains where it came from
 * (yuvoy-app#37 item 1).
 */
export function withoutFilter(
  filters: ReelFilters,
  field: PillField,
): ReelFilters {
  const next: ReelFilters = { ...filters, [field]: undefined };
  if (field === "category") next.activityType = undefined;
  return next;
}

/** Every filter off, keeping the typed word. */
export function withoutFilters(filters: ReelFilters): ReelFilters {
  return { q: filters.q };
}
