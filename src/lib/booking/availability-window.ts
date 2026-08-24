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
  return { from, to: end.toISOString().slice(0, 10) };
}
