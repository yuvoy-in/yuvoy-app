import { slotIsOpen } from "./slot-open";
import type { components } from "@/lib/api/schema.gen";

type Slot = components["schemas"]["Slot"];
type Money = components["schemas"]["Money"];

/**
 * A month of departures, as one state per day (yuvoy-app#62 item 3).
 *
 * The calendar needs three things about a square: whether it can be tapped,
 * what it costs, and whether the reason it cannot be tapped is "full" rather
 * than "nothing that day". Those are different sentences to a traveller, and
 * telling them apart is the whole reason this is not a boolean.
 *
 * Kept out of the component because dates and money are where this kind of
 * screen goes wrong, and every rule here is checkable without rendering
 * anything.
 *
 * ## `soldOut` is not the only thing that closes a day
 *
 * The issue says an open day has "at least one departure that is not `soldOut`
 * and passes `slotIsOpen`", and both halves carry weight. A departure whose
 * booking cutoff has passed is `status: open` and not sold out, and the server
 * will still refuse it with `cutoff_passed`. Consulting `soldOut` alone would
 * offer the 07:00 dive at 06:55 and fail at the end of checkout.
 */
export type DayState = "open" | "full" | "none";

export interface DayAvailability {
  state: DayState;
  /** Every departure that day, in time order, open or not. */
  slots: Slot[];
  /** The lowest price among the OPEN departures. Absent when none are open. */
  from: Money | null;
}

/**
 * `YYYY-MM-DD` to what the calendar should draw.
 *
 * `now` is passed in rather than read, so the rule is pure and a render never
 * reads the clock. Callers hand in the server's own clock at the moment the
 * availability was read (`dataUpdatedAt` plus the measured offset), not the
 * device's: a phone with a skewed clock would otherwise grey out departures
 * that are still open, or offer ones that are not.
 */
export function daysFromSlots(
  slots: readonly Slot[] | undefined,
  now: number,
): Map<string, DayAvailability> {
  const days = new Map<string, DayAvailability>();
  if (!slots) return days;

  for (const slot of slots) {
    if (!slot.localDate) continue;
    const day = days.get(slot.localDate) ?? {
      state: "none" as DayState,
      slots: [],
      from: null,
    };
    day.slots.push(slot);
    days.set(slot.localDate, day);
  }

  for (const day of days.values()) {
    /*
      Sorted by the market's own start time, which is the order a traveller
      reads them in. `localStartTime` is "07:00:00", so a plain string compare
      is chronological; parsing it into a Date would reintroduce the timezone
      question the field exists to answer.
    */
    day.slots.sort((a, b) =>
      (a.localStartTime ?? "").localeCompare(b.localStartTime ?? ""),
    );

    const open = day.slots.filter(
      (slot) => !slot.soldOut && slotIsOpen(slot, now),
    );
    day.state =
      open.length > 0 ? "open" : day.slots.length > 0 ? "full" : "none";
    day.from = lowestPrice(open);
  }

  return days;
}

/**
 * The cheapest departure of the open ones.
 *
 * Compared in MINOR UNITS and only within one currency. A market sells in one
 * currency today, and comparing across two by their minor amounts would make
 * ¥500 look dearer than £400. When a day somehow carries two, the first one's
 * currency wins and the others are ignored rather than silently mixed.
 */
function lowestPrice(slots: readonly Slot[]): Money | null {
  let best: Money | null = null;
  for (const slot of slots) {
    const price = slot.price;
    if (!price || typeof price.amountMinor !== "number") continue;
    if (!best) {
      best = price;
      continue;
    }
    if (price.currency !== best.currency) continue;
    if (price.amountMinor < best.amountMinor) best = price;
  }
  return best;
}

/**
 * The first day anything is open, so the calendar opens where the trips are.
 *
 * "First month shown: the month of the first open day." A calendar that opens
 * on today for a listing whose next departure is five weeks out shows a whole
 * month of grey and asks the traveller to work out that they should press the
 * arrow.
 */
export function firstOpenDay(
  days: Map<string, DayAvailability>,
): string | null {
  let first: string | null = null;
  for (const [date, day] of days) {
    if (day.state !== "open") continue;
    if (first === null || date < first) first = date;
  }
  return first;
}
