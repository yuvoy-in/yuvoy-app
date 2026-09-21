import { formatMoney } from "@/lib/format/money";
import { civilInZone, weekdayDayMonth, clockTime } from "@/lib/format/date";
import type { components } from "@/lib/api/schema.gen";

type BookingStatus = components["schemas"]["BookingStatus"];

/**
 * The vocabulary, one entry per contract state.
 *
 * `verifying` is the one that matters most: money may have moved and the
 * outcome is not settled. It is ALSO what the server says when a booking
 * exists but is not yet visible to it. Rendering it as failure tells somebody
 * who has just been debited that they have lost their money.
 */
export const STATE_COPY: Record<
  string,
  { eyebrow: string; title: string; body: string }
> = {
  /*
    A CASH BOOKING, BEFORE THE OPERATOR HAS RECORDED THE MONEY — yuvoy-app#29.

    Keyed by `string` rather than by `BookingStatus["state"]` because
    `paid_pending_ops` is NOT in that enum: the traveller contract declares it
    only on `CashBooking`. `STATE_COPY[status.state]` is dereferenced three
    lines into the render, so an undeclared state was a TypeError on the screen
    of somebody who had just committed money — the worst place in the product
    to crash. `stateCopy` below makes the lookup total.

    The copy says BOOKED. "Both should read as booked to the traveller — the
    difference is our bookkeeping, not their standing." Never "unpaid", never
    "pending payment": it is a confirmed seat on a boat.
  */
  paid_pending_ops: {
    eyebrow: "Booked",
    title: "You're booked",
    body: "Your seat is held on the boat. Pay the operator in cash when you arrive. The amount and where to meet are below.",
  },
  holding: {
    eyebrow: "Seats held",
    title: "Your seats are held",
    body: "Nobody else can take them while this clock runs. Pay to confirm.",
  },
  awaiting_operator: {
    eyebrow: "Asked",
    title: "We have asked the operator",
    body: "They confirm this one by hand, so it is a person answering rather than a system. We will message you the moment they do. Nothing has been charged.",
  },
  verifying: {
    eyebrow: "Checking",
    title: "Confirming your payment",
    /*
      Copy set by yuvoy-api#53, which answered this precisely: there is no
      bound on `verifying` and nothing measures it, because it is a RACE
      WINDOW of milliseconds to seconds — the moment between a payment landing
      and the booking row becoming visible — not a waiting room. A traveller
      sitting here for two hours is an incident, not the design.

      So: no number, no countdown, and no "come back later". The prototype's
      two-hour cap was drawn for a sustained operational state that does not
      exist yet; publishing it would publish a promise nothing keeps.
    */
    body: "This usually takes a few seconds. If money left your account it is safe, and this page updates itself the moment it settles.",
  },
  confirmed: {
    eyebrow: "Confirmed",
    title: "You are going",
    body: "Everything you need is on this page. Save the link. It works from any device, and you do not need an account or a password.",
  },
  declined: {
    eyebrow: "Refunded",
    title: "We could not get you the seat",
    body: "Money was taken and the seat could not be delivered, so a full refund is already on its way. You do not need to ask for it.",
  },
  cancelled: {
    eyebrow: "Cancelled",
    title: "This trip was called off",
    /*
      The "if the sea called it off" hedge was removed with yuvoy-app#22 §2 —
      the real reason is rendered above this from `cancellation.reasonCode`.
      What is left is the refund fact and the rebooking rule, both of which
      are true whatever the reason was.
    */
    body: "Your refund has already started. Rebooking is a fresh booking rather than a silent move. The price you see will be the price you pay.",
  },
  expired: {
    eyebrow: "Expired",
    title: "The hold ran out",
    body: "The seats went back on sale. Nothing was charged, and you can book again if they are still there.",
  },
  released: {
    eyebrow: "Released",
    title: "This booking was let go",
    body: "Either you gave it up or the operator could not take it. Nothing was charged.",
  },
  completed: {
    eyebrow: "Done",
    title: "Hope it was worth it",
    body: "This trip has happened. If you want to say something about it, we would read it.",
  },
  no_show: {
    eyebrow: "Not boarded",
    title: "You did not board",
    body: "The operator marked this one as a no-show. If that is wrong, tell us and we will look.",
  },
};

/**
 * The copy for a state, for ANY state.
 *
 * `STATE_COPY[status.state]` was dereferenced unguarded three lines into the
 * render, so a state this build has never heard of took the whole booking
 * screen to the error boundary — for somebody holding a reference, possibly
 * having just handed over money. `paid_pending_ops` is exactly such a state
 * today: real, returned after a cash booking, and absent from the enum.
 *
 * The fallback is deliberately vague and deliberately not alarming. There is
 * no honest specific: "Confirmed" would be a lie for a cancellation and
 * "Something went wrong" a lie for a booking that is fine. It says what is
 * certainly true — the booking exists, we can see it, here is your reference —
 * and leaves the rest of the screen, which is all derived from fields rather
 * than from the state, to say the rest.
 */
export function stateCopy(state: string): {
  eyebrow: string;
  title: string;
  body: string;
} {
  return (
    STATE_COPY[state] ?? {
      eyebrow: "Your booking",
      title: "Your booking",
      body: "We can see this booking. Your reference and the details are below. If anything here looks wrong, send us the reference and we will check it.",
    }
  );
}

/* ------------------------------------------------------------- fragments */

/**
 * What sort of update this is.
 *
 * `kind` is the field, and `intent` is a name that was only ever in the
 * document: "Never emitted. This document named the field `intent` while the
 * server has always sent `kind`; read `kind`." So the panel read a key the API
 * has never sent, fell through to `"note"` on every update, and labelled a
 * moved meeting point "A note" for as long as it has shipped. The mock sent
 * `intent`, which is why nothing caught it.
 *
 * `intent` is still read, second: the contract keeps declaring it, and a field
 * that is deprecated rather than deleted costs one `??` to honour.
 */
export function updateKind(u: { kind?: string; intent?: string }): string {
  return u.kind ?? u.intent ?? "note";
}

/** What the operator has told everybody on this departure. */
export const UPDATE_LABEL: Record<string, string> = {
  time_change: "Time changed",
  meeting_point_change: "Meeting point changed",
  weather_watch: "Weather watch",
  bring_item: "Bring",
  note: "A note",
};

/**
 * When an update was sent, in the MARKET's zone.
 *
 * Assembled from civil fields rather than formatted, which fixes two separate
 * things (yuvoy-app#67). `Intl` with these options rendered `Wed, 16 Sept,
 * 17:30` in node and Chromium and `Wed, 16 Sep at 17:30` in WebKit, so an
 * iPhone and an Android read the same update differently, and a server render
 * would disagree with either.
 *
 * This screen cannot currently server render at all: its data hangs off a
 * status token in the URL fragment, and `useFragmentToken`'s server snapshot
 * is `null` because a fragment is never sent to a server. So the hydration
 * half is structural today. The cross-browser half was live regardless, and is
 * the reason this was worth changing rather than commenting.
 *
 * An unreadable instant or an unknown zone answers `null`, so the caller drops
 * the whole line rather than printing `Invalid Date`, or an empty paragraph
 * still carrying its margin, beside an operator's message.
 */
export function formatSentAt(iso: string, timeZone: string): string | null {
  const civil = civilInZone(iso, timeZone);
  if (!civil) return null;
  return `${weekdayDayMonth(civil)}, ${clockTime(civil)}`;
}

/** The frozen total. `totalPaise` on a booking, not `amountMinor`. */
export function formatTotal(price: BookingStatus["price"]): string {
  return formatMoney({
    amountMinor: price.totalPaise,
    currency: price.currency,
  });
}

/**
 * Why a trip was called off, in a sentence a traveller can act on.
 *
 * The codes are a closed set in `cancellation_reason_codes` — twelve today —
 * and they are OUR tokens. `CREDENTIAL_LAPSE` is a column value, not an
 * explanation, and printing it is the same defect as printing a booking state.
 *
 * `TRAVELLER_REQUEST` and `CUSTOMER_REQUEST` are the same event under two
 * names. That duplicate is in the backend's data and is not ours to fix, so
 * both are mapped to the same sentence rather than one of them falling
 * through.
 *
 * The FALLBACK is the load-bearing part. The set grows by INSERT on the
 * server with no deploy here, so an unmapped code is not a defect to guard
 * against, it is the expected steady state after any addition. It must not
 * render blank and it must not render the token.
 */
export function cancellationReason(code?: string): string | null {
  const key = code?.trim().toUpperCase();
  if (!key) return null;

  const sentences: Record<string, string> = {
    WEATHER: "Conditions on the day.",
    SAFETY: "The operator made a safety call.",
    OPERATOR_CANCELLED: "The operator cancelled.",
    OPERATOR_DISHONOUR: "The operator could not honour the booking.",
    OPERATOR_UNREACHABLE: "We could not reach the operator.",
    CAPACITY_LOST: "The seats were no longer available.",
    CREDENTIAL_LAPSE: "The operator's paperwork was not current.",
    MEDICAL_UNFIT: "This trip was not medically suitable.",
    TRAVELLER_REQUEST: "You asked us to cancel.",
    CUSTOMER_REQUEST: "You asked us to cancel.",
    /*
      D-032.3, yuvoy-app#48 §1. The operator moved the departure after this
      booking was made, so cancelling refunded everything paid online whatever
      the tier. Without an entry the fallback said "The operator or we called
      it off." to somebody who cancelled BECAUSE the time changed under them:
      the wrong actor, and it hides the one fact that explains the full refund.
    */
    OPERATOR_MOVED_IT: "The operator moved this departure after you booked.",
    PAYMENT_FAILED: "The payment did not complete.",
    ADMIN_ERROR: "This was our mistake.",
  };

  return sentences[key] ?? "The operator or we called it off.";
}

/** Renders the departure in the MARKET's zone, never the device's. */
export function formatDeparture(slot: BookingStatus["slot"]): string {
  const when = new Date(slot.startsAt);
  const date = new Intl.DateTimeFormat("en-IN", {
    timeZone: slot.timezone,
    weekday: "long",
    day: "numeric",
    month: "long",
  }).format(when);
  const time = new Intl.DateTimeFormat("en-IN", {
    timeZone: slot.timezone,
    hour: "2-digit",
    minute: "2-digit",
    hour12: false,
  }).format(when);
  return `${time} on ${date}`;
}
