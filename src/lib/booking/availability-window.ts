/**
 * The availability window both the picker and checkout ask for.
 *
 * Shared deliberately. When these drifted — the picker asking 14 days and
 * checkout 30 — they produced two differently-keyed queries for the same data,
 * so opening checkout refetched availability instead of reusing what the
 * traveller had just been shown, and the two could disagree about a seat count
 * across a single tap.
 */

/** Two weeks is what somebody with a few days on an island actually plans in. */
export const WINDOW_DAYS = 14;

/**
 * Checkout asks for a WIDER window than the picker, and that is deliberate.
 *
 * The picker offers 14 days, so every slot a traveller can tap is inside it.
 * But `/e/[slug]/book?slot=…` is a URL: it survives a bookmark, a shared
 * message and a back button, and it can name a departure further out than the
 * picker ever showed. Fetching 14 days there would answer a perfectly valid
 * future slot with "that departure is no longer open" — the same words the
 * screen uses for a full boat, on a booking that is fine.
 *
 * This was inline arithmetic in the checkout screen with no reason attached,
 * which read as exactly the drift this module was written to stop. It is a
 * named constant now so the difference is a decision rather than an accident.
 */
export const CHECKOUT_WINDOW_DAYS = 30;

export interface DateRange {
  from: string;
  to: string;
}

/** Today in the MARKET's timezone, not the device's. */
export function marketToday(): string {
  return new Intl.DateTimeFormat("en-CA", { timeZone: "Asia/Kolkata" }).format(
    new Date(),
  );
}

/**
 * Anchored on the market's today — a phone west of IST is otherwise a day
 * behind and asks for a range that has already started.
 */
export function marketDateRange(days: number = WINDOW_DAYS): DateRange {
  const from = marketToday();
  const end = new Date(`${from}T00:00:00+05:30`);
  end.setDate(end.getDate() + days);

  /*
    `to` lands one calendar day BEFORE `from + days`, and that is right rather
    than an off-by-one.

    `end` is IST midnight on day `from + days`. `toISOString()` renders it in
    UTC, which is 18:30 the previous day, so slicing the date gives
    `from + days - 1`. The result is a range of exactly `days` INCLUSIVE
    dates — 19 Aug to 1 Sep is fourteen days, not fifteen — which is what the
    endpoint wants and what the picker renders.

    It reads like an accident and is load-bearing, so the test asserts the
    inclusive count rather than a literal date. Anybody "fixing" the slice
    would silently ask for one day more than the picker shows.
  */
  return { from, to: end.toISOString().slice(0, 10) };
}

/**
 * A run of consecutive days from the market's today, as `YYYY-MM-DD`.
 *
 * Lives here rather than in the search screen because it is the same
 * arithmetic in the same timezone as everything above it, and because a copy
 * of it in a component is how the picker and checkout drifted twice. Search
 * needs a LIST of days rather than a range — the pills are the primary control
 * and each one is its own `bookableOn` — so it is a different shape of the
 * same question, not a different question.
 */
export function marketDays(count: number): string[] {
  return marketDaysFrom(marketToday(), count);
}

/**
 * `count` consecutive `YYYY-MM-DD` days from `today`.
 *
 * Calendar arithmetic on a UTC-noon anchor, never `setDate` on a local Date.
 * `setDate` adds days in the DEVICE's zone, and across the device's own
 * daylight-saving change an IST-midnight instant lands an hour off — which,
 * formatted back into IST, repeats a day and drops another. A traveller whose
 * phone was still on London time in late March saw two pills for the same
 * Sunday and no pill for the Monday. UTC has no daylight saving, and noon is
 * twelve hours clear of any date boundary in any zone.
 */
export function marketDaysFrom(today: string, count: number): string[] {
  const [y, m, d] = today.split("-").map(Number);
  const anchor = Date.UTC(y, m - 1, d, 12);
  return Array.from({ length: count }, (_, i) =>
    new Date(anchor + i * 86_400_000).toISOString().slice(0, 10),
  );
}
