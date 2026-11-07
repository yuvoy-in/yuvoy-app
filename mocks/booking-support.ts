import { http, HttpResponse } from "msw";
import { EXPERIENCE_DETAIL, mockHeaders } from "./fixtures";
import type { components, paths } from "../src/lib/api/schema.gen";

/*
  The booking mocks' shared state and helpers, moved word for word from
  booking-handlers.ts (yuvoy-app#243): the API base, the request ids, the
  error envelope, the scenario switch, the reservation store and its maps.
  The payment-order and cash-booking handlers live here too, because the
  cash one counts up `seq`, and a module can only write its own bindings.
  booking-handlers.ts lists them in their old place.
*/
/**
 * The two shapes `POST /reservations/{id}/payment-order` can answer with,
 * typed FROM the contract so the mock cannot drift from it.
 *
 * It did drift. The contract documents a `200 coming_soon` as what production
 * answers today, and the mock answered an uncontracted `503` instead — the one
 * shape the screen happened to render. Against the real API the Pay button
 * did nothing at all, and every test passed. `satisfies` turns that class of
 * divergence into a typecheck failure.
 */
type PaymentComingSoon =
  paths["/reservations/{id}/payment-order"]["post"]["responses"][200]["content"]["application/json"];
type PaymentOrder = components["schemas"]["PaymentOrder"];

const BASE = process.env.NEXT_PUBLIC_API_URL ?? "http://localhost:8099/v1";
export const url = (p: string) => `${BASE}${p}`;

let seq = 0;
export const rid = () =>
  `01J${(++seq).toString(36).toUpperCase().padStart(6, "0")}MOCK`;

export function envelope(
  code: string,
  message: string,
  status: number,
  details?: Record<string, unknown>,
) {
  return HttpResponse.json(
    { error: { code, message, details, requestId: rid() } },
    { status, headers: mockHeaders(rid()) },
  );
}

export function scenarioOf(request: Request): string {
  return (
    request.headers.get("x-yuvoy-scenario") ??
    new URL(request.url).searchParams.get("__scenario") ??
    "ok"
  );
}

/* ------------------------------------------------------------------ state */

export interface MockReservation {
  reservationId: string;
  slotId: string;
  guests: number;
  contactName: string;
  state: "active" | "pending_request";
  holdExpiresAt: string | null;
  requestExpiresAt: string | null;
  token: string;
  reference: string;
  /** How many status polls have happened, so `verifying` can resolve. */
  polls: number;
  paid: boolean;
  /** Given back by the traveller. `released` on status, final. */
  released?: boolean;
  /**
   * The reason an operator turned this request down (yuvoy-api#225), for a
   * listed row the operator declined. Its booking link reads `released` with
   * the API's sentence for this code and the listing's next date.
   */
  declineReasonCode?: string;
  /**
   * The reference minted by `POST /cash-booking` — yuvoy-app#29.
   *
   * Remembered so a RETRY returns the first one. "The second tap on ferry
   * wifi" is the same booking, and a fresh reference would be a second seat
   * gone from the boat and two references in the traveller's hands.
   */
  cashBookingReference?: string;
  /** Committed in cash, awaiting the operator recording the money. */
  cashBooked?: boolean;
  /**
   * The state `listMyBookings` filed this trip under, for a row this device
   * did not create. A seeded past trip must report `completed` on status too,
   * or the Trips card and the booking screen disagree about the same booking.
   */
  listedState?: string;
  /**
   * The listing's own questions, as answered by this party - yuvoy-app#46.
   *
   * Keyed by question id, and carried on the RESERVATION rather than derived
   * at read time: an answer belongs to the party that gave it, and the
   * listing's questions can change under a booking that was made before.
   */
  answers?: Record<string, string>;
  /** The slug whose questions this party was asked. */
  slug?: string;
  /** Messages written from this link - yuvoy-app#47. */
  messages?: BookingMessage[];
  /** The traveller's read marker: the last message id they were shown. */
  readUpTo?: string;
  /**
   * Whether the operator has recorded taking the cash — `payment.collected`.
   *
   * Reachable with `?__scenario=cash-collected`, so the state a traveller sees
   * on the morning AFTER handing the money over is testable. Without it the
   * "Bring ₹X in cash" line could only ever be proven to appear, never to go
   * away, which is half the behaviour and the half that would leave the line
   * on the screen of somebody who has already paid.
   */
  cashCollected?: boolean;
}

export const reservations = new Map<string, MockReservation>();
export const byToken = new Map<string, string>();
/** Idempotency: key -> the response body originally returned. */
export const idempotent = new Map<
  string,
  { fingerprint: string; body: Record<string, unknown> }
>();

/**
 * A message send's `Idempotency-Key` (yuvoy-api#282): booking and key -> the
 * text it was sent with and the message it wrote. Kept only once a message is
 * written, as the API keeps it, so a refused send leaves its key unused.
 */
export const messageKeys = new Map<
  string,
  { text: string; message: Record<string, unknown> }
>();

export type BookingMessage = components["schemas"]["BookingMessage"];

/** The reservation a status token opens, or `undefined`. */
export function recordFor(request: Request): MockReservation | undefined {
  const token = (request.headers.get("authorization") ?? "").replace(
    /^Bearer\s+/i,
    "",
  );
  const id = byToken.get(token);
  return id ? reservations.get(id) : undefined;
}

/** The departure every mocked booking is on. */
export const SLOT_STARTS_AT = "2026-08-22T01:30:00Z";

/** Answers are shut once the booking is no longer going ahead. */
export const ANSWERS_SHUT_STATES = [
  "cancelled",
  "declined",
  "expired",
  "released",
  "no_show",
  "completed",
];

export const paymentHandlers = [
  /* ------------------------------------------------------ payment order */

  http.post(
    url("/reservations/:id/payment-order"),
    async ({ request, params }) => {
      const scenario = scenarioOf(request);
      const record = reservations.get(String(params.id));

      if (!record) return envelope("not_found", "No such reservation.", 404);

      if (record.state === "pending_request") {
        // Do not open checkout on a request nobody has accepted.
        return envelope(
          "reservation_not_payable",
          "The operator has not answered yet.",
          409,
        );
      }

      /*
        "An experience with no contracted price ... answer[s]
        `reservation_not_payable`" (the contract). The mock took payment for
        the unpriced kayak until checkout began finishing holds in one tap
        (3 Oct 2026) and the gap showed: a hold the real API would refuse to
        take money for was being booked here.
      */
      if (record.slug && !EXPERIENCE_DETAIL[record.slug]?.fromPrice) {
        return envelope(
          "reservation_not_payable",
          "This experience has no price to pay against yet.",
          409,
        );
      }

      // A transport can always say 503; the deliberate-stop copy stays
      // exercised. Forced, never the default.
      if (scenario === "payments-unavailable") {
        return envelope(
          "payments_unavailable",
          "No payment processor is configured.",
          503,
        );
      }

      // The default, and what production answers today (D-021): payment is
      // not open yet, the hold is real, and this is NOT an error.
      if (scenario !== "payments-ready") {
        const comingSoon = {
          state: "coming_soon",
          message:
            "Card and UPI are opening shortly. You can book now and pay the operator in cash on the day.",
          holdStillActive: true,
          /*
            The only way to finish a booking while no processor is live —
            yuvoy-app#29. Without it this answer is a dead end: the screen
            renders the message, the traveller can do nothing, and the hold
            lapses fifteen minutes later.
          */
          payAtCounter: {
            available: true,
            confirmAt: `/v1/reservations/${record.reservationId}/cash-booking`,
          },
        } satisfies PaymentComingSoon;
        return HttpResponse.json(comingSoon, {
          status: 200,
          headers: mockHeaders(rid()),
        });
      }

      const order = {
        state: "ready",
        orderId: `ord_${record.reservationId}`,
        providerOrderId: `provider_${record.reservationId}`,
        provider: "mock",
        amountPaise: 450000 * record.guests,
        currency: "INR",
        // The HOLD's deadline, not a separate payment clock.
        expiresAt: record.holdExpiresAt ?? new Date().toISOString(),
        /*
          `payAtCounter` ON THE `ready` ANSWER TOO — yuvoy-app#29's correction.

          "Production has a provider configured, so it returns `ready`, not
          `coming_soon`. If you had branched on `state === 'coming_soon'` to
          decide whether to show the cash option, it would never have appeared."

          Inside the `satisfies` now. It used to be spread on after it, because
          `PaymentOrder` did not declare the field and the document was behind
          what production sent. yuvoy-api declared it at `79ce45af`, so the
          contract type-checks this answer instead of being worked around.
        */
        payAtCounter: {
          available: true,
          confirmAt: `/v1/reservations/${record.reservationId}/cash-booking`,
        },
      } satisfies PaymentOrder;

      return HttpResponse.json(order, {
        status: 201,
        headers: mockHeaders(rid()),
      });
    },
  ),

  /* ------------------------------------------------------ cash booking */

  /*
    Finishing without a card — yuvoy-app#29.

    Three behaviours the screen has to get right, all modelled:

      - `201` the first time and **`200` on a retry**, with the SAME booking.
        A phone on ferry wifi is tapped twice and that is the correct instinct;
        it must not be punished with a second booking or an error.
      - `409` once the hold has ended. Both causes — lapsed hold, card payment
        open — mean "start again", and the envelope's message is what the
        screen shows.
      - `503 operator_not_bookable`, the same refusal as everywhere else.
  */
  http.post(
    url("/reservations/:id/cash-booking"),
    async ({ request, params }) => {
      const scenario = scenarioOf(request);
      const record = reservations.get(String(params.id));

      if (!record) return envelope("not_found", "No such reservation.", 404);

      if (scenario === "operator-not-bookable") {
        return envelope(
          "operator_not_bookable",
          "This operator is not taking bookings right now.",
          503,
        );
      }

      if (scenario === "cutoff-passed" || record.released) {
        return envelope(
          "reservation_not_payable",
          "That hold has ended. Pick a departure again — nothing has been charged.",
          409,
        );
      }

      const farePaise = 450000 * record.guests;
      const already = Boolean(record.cashBookingReference);
      /*
        Minted once and remembered. A retry returns the first reference,
        because "the second tap on ferry wifi" is the same booking — handing
        back a new one would be a second booking in the traveller's hands and
        a second seat gone from the boat.
      */
      const reference =
        record.cashBookingReference ??
        `YV-${String(++seq).padStart(4, "0")}K2A`;
      record.cashBookingReference = reference;
      record.cashBooked = true;

      return HttpResponse.json(
        {
          bookingReference: reference,
          state: "paid_pending_ops",
          payAtCounterPaise: farePaise,
          currency: "INR",
        },
        { status: already ? 200 : 201, headers: mockHeaders(rid()) },
      );
    },
  ),
];
