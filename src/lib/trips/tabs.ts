import { formatMoney } from "@/lib/format/money";
import { marketToday } from "@/lib/booking/availability-window";
import type { components } from "@/lib/api/schema.gen";

export type InvitedTrip = components["schemas"]["InvitedTrip"];

/**
 * Which tab a trip belongs in, and what its price line says (yuvoy-app#38).
 *
 * ## Why the tab logic is here and not in the screen
 *
 * The API decides the tab for a trip the traveller BOOKED, and says so: it
 * sends `?tab=upcoming|past|cancelled` and the three "never overlap and
 * together they are the whole list". Nothing is re-derived for those.
 *
 * An INVITED trip is not paged and carries no tab, so the client has to place
 * it, and the rules the issue gives are not the same as the ones the API uses
 * for a booking. That is the part worth testing without a screen: a guest's
 * trip landing in the wrong tab is a trip they cannot find.
 *
 * ## The price line is five ordered rules, and the order is the whole thing
 *
 * Each rule below is reachable, and a traveller reads exactly one of them. Two
 * are money the traveller still owes or is owed, which is why the order matters
 * more than the wording: a cash booking that read "Paid ₹9,000" is the live
 * defect that #29 fixed on the booking page, and this card is the second place
 * the same mistake was available.
 */

/** The three tabs, in the order they appear. */
export const TRIP_TABS = ["upcoming", "past", "cancelled"] as const;
export type TripTab = (typeof TRIP_TABS)[number];

export const TAB_LABEL: Record<TripTab, string> = {
  upcoming: "Upcoming",
  past: "Past",
  cancelled: "Cancelled",
};

export const TAB_EMPTY: Record<TripTab, string> = {
  upcoming: "No upcoming trips",
  past: "No past trips yet",
  cancelled: "Nothing cancelled",
};

/**
 * The tab an INVITED trip belongs in.
 *
 * `cancelled` and `called_off` win over the date, the same way the API decides
 * a booking's tab: a trip that is not happening is not "upcoming" however soon
 * it was going to be.
 *
 * A `pending` or `confirmed` trip whose date has passed goes to Past rather
 * than staying in Upcoming forever. That is the case the issue spells out and
 * the one a naive `status`-only mapping gets wrong: an operator who never
 * answered a request leaves it `pending` indefinitely.
 */
export function invitedTripTab(
  trip: Pick<InvitedTrip, "status" | "localDate">,
  today: string = marketToday(),
): TripTab {
  if (trip.status === "cancelled" || trip.status === "called_off") {
    return "cancelled";
  }
  if (trip.status === "completed") return "past";
  // `pending` or `confirmed`: the date decides, in the MARKET's day.
  return trip.localDate >= today ? "upcoming" : "past";
}

/** What a guest's status chip reads. */
export const GUEST_STATUS_LABEL: Record<InvitedTrip["status"], string> = {
  pending: "Waiting for the operator",
  confirmed: "Going ahead",
  completed: "Done",
  cancelled: "Cancelled",
  called_off: "Called off by the operator",
};

/** The row shape the price line reads. A subset, so a test needs no fixture. */
export interface PricedTrip {
  state?: string;
  price?: { totalPaise: number; currency: string };
  payment?: { method: string; collected: boolean; amountPaise: number };
  refund?: { amountPaise: number; state: string };
}

/**
 * The one sentence about money on a trip card, or `null` for none.
 *
 * The rules are tried in order and the FIRST match wins, which is the issue's
 * own instruction and is load-bearing at two of the five:
 *
 *   1. **A waiting request says nothing about money**, because none has changed
 *      hands and none is owed until the operator answers. A price here would be
 *      a claim about a booking that does not exist.
 *   2. **Cash not yet collected comes before "Paid"**, because the API reports
 *      such a booking as `confirmed`. Reading `state` alone is exactly how
 *      app.yuvoy.in came to show "Paid ₹9,000" to travellers who had handed
 *      over nothing (#29, D-034). This card is the second surface that mistake
 *      was available on.
 *   3. **A refund outranks the paid line**, because a cancelled trip whose
 *      money is coming back is about the refund, not about what it cost.
 *   4. **Cancelled with no refund says nothing**, rather than "Paid": there is
 *      nothing to tell them and a paid line beside "Cancelled" reads as a loss.
 *   5. Otherwise the trip is paid for, and says so.
 */
export function tripPriceLine(trip: PricedTrip): string | null {
  /*
    `null` for anything that is not a number, which becomes "no line" rather
    than a line reading "₹NaN".

    The contract makes `amountPaise` and `totalPaise` required, and this guard
    exists anyway: the standing rule in this repo is that a pinned contract
    states what an API WILL send, never what it does send today, so every field
    is consumed as optional. A test fixture missing the amount is what found
    this, and "₹NaN cash on the day" is worse than saying nothing.
  */
  const money = (amountMinor: number | undefined) =>
    typeof amountMinor === "number" && Number.isFinite(amountMinor)
      ? formatMoney({ amountMinor, currency: trip.price?.currency ?? "INR" })
      : null;

  if (trip.state === "pending_request") return "Waiting for the operator";

  if (trip.payment?.method === "cash" && trip.payment.collected !== true) {
    /*
      Falls back to the price when the payment carries no amount of its own.
      The contract says they are the same number, and a traveller who has to
      hand over cash needs to be told how much far more than we need to be
      precise about which field it came from.
    */
    const owed =
      money(trip.payment.amountPaise) ?? money(trip.price?.totalPaise);
    return owed ? `Pay ${owed} cash on the day` : "Pay the operator on the day";
  }

  if (trip.refund) {
    const amount = money(trip.refund.amountPaise);
    if (!amount) return "A refund is on its way";
    return trip.refund.state === "processed"
      ? `Refunded ${amount}`
      : `Refund of ${amount} on its way`;
  }

  if (trip.state === "cancelled" || trip.state === "declined") return null;

  const paid = money(trip.price?.totalPaise);
  return paid ? `Paid ${paid}` : null;
}

/** "1 person" or "4 people". The singular is not a rounding error. */
export function partyLine(guests: number): string {
  return guests === 1 ? "1 person" : `${guests} people`;
}

/**
 * Sorts trips within a tab.
 *
 * Upcoming is soonest first; Past and Cancelled are most recent first. The API
 * already returns its own rows in that order, so this exists for the MERGED
 * list: invited trips arrive in their own order and would otherwise all land
 * at one end of the tab.
 */
export function sortForTab<T extends { localDate: string; localTime?: string }>(
  trips: T[],
  tab: TripTab,
): T[] {
  const at = (t: T) => `${t.localDate}T${t.localTime ?? "00:00"}`;
  return [...trips].sort((a, b) =>
    tab === "upcoming"
      ? at(a).localeCompare(at(b))
      : at(b).localeCompare(at(a)),
  );
}

/** Whether a date falls inside an applied `from`/`to` filter. */
export function withinDateFilter(
  localDate: string,
  range: { from?: string; to?: string },
): boolean {
  if (range.from && localDate < range.from) return false;
  if (range.to && localDate > range.to) return false;
  return true;
}
