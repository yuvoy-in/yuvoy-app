import { http, HttpResponse, delay } from "msw";
import {
  EXPERIENCE_DETAIL,
  availabilityFor,
  mockHeaders,
  mockNow,
} from "./fixtures";
import type { components, paths } from "../src/lib/api/schema.gen";

type Experience = components["schemas"]["Experience"];

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
type OperatorUpdates = NonNullable<
  components["schemas"]["BookingStatus"]["operatorUpdates"]
>;

/**
 * The money loop, mocked.
 *
 * This file carries more scenario switches than the catalog one because the
 * states that matter here are the ones that only happen when something goes
 * wrong — a hold expiring mid-payment, a declared medical condition, a
 * duplicate submit, a payment app that never comes back. None of them is
 * reachable on demand against a real backend.
 */

const BASE = process.env.NEXT_PUBLIC_API_URL ?? "http://localhost:8099/v1";
const url = (p: string) => `${BASE}${p}`;

let seq = 0;
const rid = () =>
  `01J${(++seq).toString(36).toUpperCase().padStart(6, "0")}MOCK`;

function envelope(
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

function scenarioOf(request: Request): string {
  return (
    request.headers.get("x-yuvoy-scenario") ??
    new URL(request.url).searchParams.get("__scenario") ??
    "ok"
  );
}

/* ------------------------------------------------------------------ state */

interface MockReservation {
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

const reservations = new Map<string, MockReservation>();
const byToken = new Map<string, string>();
/** Idempotency: key -> the response body originally returned. */
const idempotent = new Map<
  string,
  { fingerprint: string; body: Record<string, unknown> }
>();

type MockQuestion = NonNullable<Experience["questions"]>[number];

/**
 * What the server would actually record from a sent `answers` list.
 *
 * Everything that "does not fit" is dropped silently, because that is what the
 * contract says happens: "an answer that does not fit is not recorded and
 * never refuses the checkout on its own; it leaves its question unanswered".
 * A mock that accepted anything would hide a client sending a `choice` value
 * that is not one of the options - which is exactly the silent loss the
 * controls in `question-fields.tsx` are shaped to prevent.
 *
 * Case is ignored on `yes_no` and `choice`, as `POST /bookings/answers` says.
 */
function recordAnswers(
  questions: readonly MockQuestion[],
  sent: readonly unknown[],
): Record<string, string> {
  const byId = new Map(questions.map((q) => [q.id, q]));
  const out: Record<string, string> = {};
  for (const entry of sent) {
    if (!entry || typeof entry !== "object") continue;
    const { questionId, answer } = entry as {
      questionId?: unknown;
      answer?: unknown;
    };
    if (typeof questionId !== "string" || typeof answer !== "string") continue;
    const question = byId.get(questionId);
    if (!question) continue;
    if (answer.length > 300) continue;
    if (question.answerType === "yes_no") {
      const lower = answer.toLowerCase();
      if (lower !== "yes" && lower !== "no") continue;
      out[questionId] = lower;
      continue;
    }
    if (question.answerType === "choice") {
      const match = (question.options ?? []).find(
        (o) => o.toLowerCase() === answer.toLowerCase(),
      );
      if (!match) continue;
      out[questionId] = match;
      continue;
    }
    out[questionId] = answer;
  }
  return out;
}

/**
 * Every question this party was asked, as the status page shows them.
 *
 * The listing's current questions first, in its order, then anything this
 * party answered that it no longer asks, with `current: false`.
 */
function partyQuestions(record: MockReservation) {
  const questions = record.slug
    ? (EXPERIENCE_DETAIL[record.slug]?.questions ?? [])
    : [];
  const answers = record.answers ?? {};
  const current = questions.map((q) => ({
    questionId: q.id,
    text: q.text,
    answerType: q.answerType,
    ...(q.options ? { options: q.options } : {}),
    required: q.required,
    current: true,
    answered: answers[q.id] !== undefined,
    ...(answers[q.id] !== undefined
      ? { answer: answers[q.id], answeredAt: new Date(mockNow()).toISOString() }
      : {}),
  }));
  const known = new Set(questions.map((q) => q.id));
  const retired = Object.entries(answers)
    .filter(([id]) => !known.has(id))
    .map(([id, answer]) => ({
      questionId: id,
      text: "A question this trip no longer asks.",
      answerType: "short_text" as const,
      required: false,
      current: false,
      answered: true,
      answer,
      answeredAt: new Date(mockNow()).toISOString(),
    }));
  return [...current, ...retired];
}

type BookingMessage = components["schemas"]["BookingMessage"];

/**
 * The conversation on a booking.
 *
 * Seeded with enough from the business to exercise every shape the panel has
 * to draw, and ids are ordered strings so "newer than the marker" is a string
 * comparison rather than a date parse.
 *
 * `?__scenario=long-thread` seeds 60, which is past the 50 a page holds, so
 * "See earlier messages" and the cursor are reachable by hand.
 * `?__scenario=text-removed` seeds one carrying `textRemovedAt` in place of
 * `text` - the case that must render as a message whose text was removed and
 * never as a blank bubble.
 */
function conversation(
  record: MockReservation,
  scenario: string,
): BookingMessage[] {
  const from = record.slug ? "Sample Dive Operator" : "Sample Dive Operator";
  const seeded: BookingMessage[] = [];
  const count = scenario === "long-thread" ? 60 : 2;
  for (let i = 0; i < count; i++) {
    seeded.push({
      id: `msg_${String(i).padStart(4, "0")}_s`,
      from: "operator",
      senderName: from,
      text: `Message ${i + 1} from the boat.`,
      sentAt: new Date(mockNow() - (count - i) * 60_000).toISOString(),
    });
  }
  if (scenario === "text-removed") {
    seeded.push({
      id: "msg_9998_s",
      from: "operator",
      senderName: from,
      // Exactly one of `text` and `textRemovedAt`, never both, never neither.
      textRemovedAt: "2026-11-20T00:00:00Z",
      sentAt: new Date(mockNow() - 30_000).toISOString(),
    });
  }
  return [...seeded, ...(record.messages ?? [])];
}

/** Why writing is shut, or `undefined` while it is open. */
function closedReasonFor(
  record: MockReservation,
  scenario: string,
): "not_booked" | "cancelled" | "declined" | "window_closed" | undefined {
  if (scenario === "messages-window-closed") return "window_closed";
  if (scenario === "cancelled") return "cancelled";
  if (scenario === "declined") return "declined";
  if (record.released) return "cancelled";
  /*
    A link whose hold or request never became a booking. It answers an empty,
    complete conversation with `canWrite: false`, "not an error" - which is
    the case a client is most likely to have treated as a failure.
  */
  if (!record.cashBooked && !record.paid) return "not_booked";
  return undefined;
}

function closedSentence(reason: string): string {
  switch (reason) {
    case "not_booked":
      return "There is no booking behind this link yet, so there is nobody to write to. Messages open once the booking is made.";
    case "cancelled":
      return "This booking was cancelled, so no more messages can be sent. The conversation can still be read.";
    case "declined":
      return "This booking was declined, so no more messages can be sent. The conversation can still be read.";
    default:
      return "Messages close seven days after a trip ends, and this one has closed. The conversation can still be read.";
  }
}

/**
 * The server's D-051 rules, mirrored closely enough to be worth testing
 * against. The APP does not re-implement these; this is the other side.
 */
function contactDetailIn(text: string): "phone" | "email" | "link" | null {
  if (/[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Za-z]{2,}/.test(text))
    return "email";
  if (/(^|\s)(https?:\/\/|www\.)/i.test(text)) return "link";
  if (/\b[a-z0-9-]+\.(com|in|net|org|io|co|me)\b/i.test(text)) return "link";
  /*
    Seven or more digits counted through the separators between them, EXCEPT a
    date written like 14.09.2026 or 2026-09-14. Dates are struck out first, so
    "see you on 14.09.2026" sends and "call me on 98765 43210" does not.
  */
  const withoutDates = text
    .replace(/\b\d{1,2}[.\-/]\d{1,2}[.\-/]\d{2,4}\b/g, " ")
    .replace(/\b\d{4}[.\-/]\d{1,2}[.\-/]\d{1,2}\b/g, " ");
  for (const run of withoutDates.match(/[\d\s().\-]+/g) ?? []) {
    if (run.replace(/\D/g, "").length >= 7) return "phone";
  }
  return null;
}

/** The reservation a status token opens, or `undefined`. */
function recordFor(request: Request): MockReservation | undefined {
  const token = (request.headers.get("authorization") ?? "").replace(
    /^Bearer\s+/i,
    "",
  );
  const id = byToken.get(token);
  return id ? reservations.get(id) : undefined;
}

/** The departure every mocked booking is on. */
const SLOT_STARTS_AT = "2026-08-22T01:30:00Z";

/** Answers are shut once the booking is no longer going ahead. */
const ANSWERS_SHUT_STATES = [
  "cancelled",
  "declined",
  "expired",
  "released",
  "no_show",
  "completed",
];

function reference(): string {
  const chars = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789";
  let out = "";
  for (let i = 0; i < 8; i++)
    out += chars[Math.floor(Math.random() * chars.length)];
  return `YV-${out}`;
}

export const bookingHandlers = [
  /* ------------------------------------------------------- reservations */

  http.post(url("/reservations"), async ({ request }) => {
    const scenario = scenarioOf(request);

    /*
      THE API'S INVITE GATE, SWITCHED ON (yuvoy-api#195).

      `?__scenario=invite-required` is production after Hima flips the server
      switch: a guest checkout, or a signed-in number that has not redeemed a
      code, is refused with `403 invite_required` "before anything is checked
      or held", so it comes before the key and the body are even read. A
      number that redeemed a code here (see `isAdmitted`) books as usual,
      which is how the whole way through the gate stays walkable.
    */
    if (scenario === "invite-required" && !isAdmitted(request)) {
      return envelope(
        "invite_required",
        "Booking is by invitation. Sign in with your number, then enter your invite code.",
        403,
      );
    }

    const key = request.headers.get("idempotency-key");
    const body = (await request.json()) as {
      slotId: string;
      guests: number;
      contact: { name: string; whatsapp: string; email?: string };
      screening?: { declaredClear?: boolean; ageBands?: string[] };
      attribution?: Record<string, unknown>;
      answers?: unknown;
      expectTotalPaise?: unknown;
    };

    if (!key) {
      return envelope(
        "idempotency_key_malformed",
        "Idempotency-Key is required.",
        400,
      );
    }
    if (!/^[A-Za-z0-9_.:-]{16,128}$/.test(key)) {
      return envelope(
        "idempotency_key_malformed",
        "Key is not 16-128 chars of A-Za-z0-9_.:-",
        400,
      );
    }

    const fingerprint = JSON.stringify(body);

    // Same key + same body -> the ORIGINAL 201, unchanged. The client cannot
    // tell it repeated itself, which is the entire point on this network.
    const prior = idempotent.get(key);
    if (prior) {
      if (prior.fingerprint !== fingerprint) {
        return envelope(
          "idempotency_key_reuse",
          "That key was already used with a different request.",
          409,
        );
      }
      return HttpResponse.json(prior.body, {
        status: 201,
        headers: { "Idempotent-Replay": "true", ...mockHeaders(rid()) },
      });
    }

    switch (scenario) {
      case "capacity-unavailable":
        return envelope(
          "capacity_unavailable",
          "Those seats went while you were deciding.",
          409,
          { remaining: 2 },
        );
      case "request-window-closed":
        return envelope(
          "request_window_closed",
          "Outside the operator's hours.",
          409,
          { opensAt: "2026-08-22T00:30:00Z" },
        );
      case "cutoff-passed":
        return envelope(
          "cutoff_passed",
          "Booking has closed for this departure.",
          409,
        );
      case "booking-disabled":
        return envelope("booking_disabled", "Booking is paused.", 503);
      /*
        Forces the moved-price refusal below, so its panel can be seen in dev
        without editing a fixture price mid-session. Only when a total was
        sent: omitted, the real API checks nothing, and neither does this.
      */
      case "price-moved":
        if (typeof body.expectTotalPaise === "number") {
          return envelope(
            "price_moved",
            "The price of this departure changed while you were deciding.",
            409,
          );
        }
        break;
      case "slow":
        await delay(3000);
        break;
    }

    // The safety gates, enforced at reservation time rather than at the jetty.
    const slug = Object.keys(EXPERIENCE_DETAIL).find((s) =>
      availabilityFor(s).some((slot) => slot.id === body.slotId),
    );
    const safety = slug ? EXPERIENCE_DETAIL[slug]?.safety : undefined;

    if (safety?.screener) {
      // Omitted is NOT false. A default here is an answer nobody gave.
      if (body.screening?.declaredClear === undefined) {
        return envelope(
          "screening_required",
          "This listing asks a health question and nothing was sent.",
          400,
        );
      }
      // A declared condition books NOTHING. No hold, no payment order,
      // nothing to refund — the whole transaction rolls back.
      if (body.screening.declaredClear === false) {
        return envelope(
          "screening_needs_a_doctor",
          "We need to talk before you book this one.",
          409,
        );
      }
    }

    if (safety?.minAge && body.screening?.ageBands) {
      const FLOOR: Record<string, number> = {
        under_10: 0,
        "10_11": 10,
        "12_14": 12,
        "15_17": 15,
        "18_plus": 18,
      };
      // Checked against the FLOOR — somebody in 12_14 could be 12.
      if (
        body.screening.ageBands.some((b) => (FLOOR[b] ?? 0) < safety.minAge!)
      ) {
        return envelope(
          "under_minimum_age",
          `This experience is for ${safety.minAge} and over.`,
          409,
        );
      }
    }

    /*
      THE LISTING'S OWN QUESTIONS - yuvoy-app#46 §3.

      The gate is the PRESENCE of `answers`, not its contents: "send it, even
      as an empty list, and required questions are enforced", and "`null`, or
      a value that is not a list, counts as not sent". A body without it is
      never refused over a question, which is the path the Ask pop-up takes.

      An answer that does not fit is dropped rather than refused - a question
      the listing no longer asks, a choice outside its options, a value its
      type does not take. It then counts as unanswered, which is what can
      produce the 409 even on a body that did send something for it.
    */
    const questions = slug ? (EXPERIENCE_DETAIL[slug]?.questions ?? []) : [];
    const sentAnswers = Array.isArray(body.answers) ? body.answers : null;
    const recorded = sentAnswers ? recordAnswers(questions, sentAnswers) : {};

    if (sentAnswers) {
      const missing = questions.filter(
        (q) => q.required && recorded[q.id] === undefined,
      );
      if (missing.length > 0) {
        return envelope(
          "answers_required",
          "Some questions this trip asks need an answer before you can book.",
          409,
          {
            questions: missing.map((q) => ({ questionId: q.id, text: q.text })),
          },
        );
      }
    }

    const slot = slug
      ? availabilityFor(slug).find((s) => s.id === body.slotId)
      : undefined;
    const isRequest = slot?.bookingMode === "request";

    /*
      THE TOTAL THE TRAVELLER AGREED TO - yuvoy-app#62 item 7, yuvoy-api#193.

      "Optional, and send it. Omitted, nothing is checked ... Sent, the
      checkout is refused 409 price_moved when the listing no longer costs
      that." Read under the contract's name, `expectTotalPaise`, and computed
      the API's way: a price for the whole group is not multiplied by the
      party (`case pricing_unit when 'per_group' then unit_price else unit_price
      * guests`). The mock used to ignore the field entirely, which is how the
      app sent it under a name the API does not read for a week and every test
      here still passed.
    */
    const perGroup = slug
      ? EXPERIENCE_DETAIL[slug]?.pricingUnit === "per_group"
      : false;
    if (
      typeof body.expectTotalPaise === "number" &&
      slot?.price &&
      (perGroup
        ? slot.price.amountMinor
        : slot.price.amountMinor * body.guests) !== body.expectTotalPaise
    ) {
      return envelope(
        "price_moved",
        "The price of this departure changed while you were deciding.",
        409,
      );
    }

    const id = `res_${Date.now().toString(36)}_${Math.floor(Math.random() * 1e6).toString(36)}`;
    const token = `tok_${Math.random().toString(36).slice(2)}${Math.random().toString(36).slice(2)}`;
    const record: MockReservation = {
      reservationId: id,
      slotId: body.slotId,
      guests: body.guests,
      contactName: body.contact.name,
      state: isRequest ? "pending_request" : "active",
      // Ten minutes for a hold; hours for a request.
      holdExpiresAt: isRequest
        ? null
        : new Date(mockNow() + 10 * 60_000).toISOString(),
      requestExpiresAt: isRequest
        ? new Date(mockNow() + 2 * 60 * 60_000).toISOString()
        : null,
      token,
      reference: reference(),
      polls: 0,
      paid: false,
      answers: recorded,
      slug,
    };
    reservations.set(id, record);
    byToken.set(token, id);

    const response = {
      reservationId: id,
      state: record.state,
      guests: record.guests,
      holdExpiresAt: record.holdExpiresAt,
      requestExpiresAt: record.requestExpiresAt,
      // Returned exactly once.
      statusToken: token,
    };
    idempotent.set(key, { fingerprint, body: response });

    return HttpResponse.json(response, {
      status: 201,
      headers: mockHeaders(rid()),
    });
  }),

  http.post(url("/reservations/:id/release"), async ({ params }) => {
    /*
      Idempotent, and the record stays: "releasing an already-released hold
      is not an error", and the status link keeps working afterwards — it
      answers `released`, which is what the screen is built to say. Deleting
      the record made the next status poll a 401, which is a dead link, not a
      released booking.
    */
    const record = reservations.get(String(params.id));
    if (!record) return envelope("not_found", "No such reservation.", 404);
    record.released = true;
    return new HttpResponse(null, { status: 204 });
  }),

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

  /* ----------------------------------------------------- booking status */

  http.get(url("/bookings/status"), async ({ request }) => {
    const scenario = scenarioOf(request);
    const auth = request.headers.get("authorization") ?? "";
    const token = auth.replace(/^Bearer\s+/i, "");

    const id = byToken.get(token);
    const record = id ? reservations.get(id) : undefined;

    if (!record)
      return envelope("unauthorized", "That link is not valid.", 401);
    if (scenario === "token-expired") {
      return envelope("token_expired", "That link has expired.", 401);
    }

    record.polls += 1;

    /*
      A row this device did not create reports what the list said it was. A
      seeded past trip answering "holding" would have the Trips card and the
      booking screen describing the same booking two different ways, which is
      a fixture disagreeing with itself rather than a state worth testing.
    */
    // `verifying` resolves after a couple of polls, so the interrupted-payment
    // screen can be exercised without a real provider.
    let state: string =
      record.listedState ??
      (record.state === "pending_request" ? "awaiting_operator" : "holding");
    if (scenario === "verifying") state = "verifying";
    if (scenario === "paid") {
      state = record.polls < 3 ? "verifying" : "confirmed";
    }
    if (scenario === "declined") {
      state = record.polls < 2 ? "verifying" : "declined";
    }
    if (scenario === "cancelled") state = "cancelled";
    if (scenario === "expired") state = "expired";
    /*
      A trip that has already happened (yuvoy-app#38 item 3). Needed so the
      review form is reachable at all: `canReview` below is the server's
      "completed, unreviewed, inside 30 days", and with no completed scenario
      every test of that form would silently be a test of its absent branch.

      `reviewed` is the same trip on the other side of leaving one.
    */
    if (scenario === "completed" || scenario === "reviewed") {
      state = "completed";
    }
    /*
      COMMITTED IN CASH — yuvoy-app#29, and the projection changed under us.

      This used to answer `paid_pending_ops`, which is what the API returned
      and which is NOT in `BookingStatus.state`'s enum. That mock is what
      caught the screen dereferencing its state map unguarded — an undeclared
      state took the whole booking page to the error boundary, for somebody who
      had just committed money.

      Owner decision D-034 (yuvoy-api#168, live since 12 Sep) changed it: a
      cash booking reads `confirmed` from the moment it is made, because the
      seat was taken against a live hold and no money is in flight to wait on.
      What is still owed moved to `payment`, below.

      `GET /me/bookings` is unchanged and still carries the raw
      `paid_pending_ops` — two endpoints, two shapes, and the mock has to keep
      them apart or the trips list is tested against a state it will never see.
    */
    if (record.cashBooked) state = "confirmed";
    if (scenario === "cash-collected") record.cashCollected = true;
    if (record.released) state = "released";

    const final = [
      "confirmed",
      "declined",
      "cancelled",
      "expired",
      "released",
      "completed",
      "no_show",
    ].includes(state);

    return HttpResponse.json(
      {
        reservationId: record.reservationId,
        bookingReference: record.cashBookingReference ?? record.reference,
        state,
        final,
        guests: record.guests,
        contactName: record.contactName,
        // holdExpiresAt is present ONLY while holding, so a countdown is
        // never rendered beside a dead booking.
        holdExpiresAt: state === "holding" ? record.holdExpiresAt : null,
        experience: {
          slug: "try-dive-nemo-reef",
          title: "Try-dive at Nemo Reef",
          operator: "Sample Dive Operator",
        },
        slot: {
          startsAt: SLOT_STARTS_AT,
          timezone: "Asia/Kolkata",
        },
        price: { totalPaise: 450000 * record.guests, currency: "INR" },
        /*
          Present ONLY for a cash booking — D-034. `collected` flips when the
          operator records taking the money, and `cashCollected` is what the
          operator-side mock sets. A card booking carries no `payment` at all,
          which is the distinction the booking screen now reads instead of the
          state it used to.
        */
        ...(record.cashBooked
          ? {
              payment: {
                method: "cash" as const,
                collected: Boolean(record.cashCollected),
                amountPaise: 450000 * record.guests,
              },
            }
          : {}),
        /*
          THE LISTING'S OWN QUESTIONS - yuvoy-app#46 §4.

          Absent when the listing asks nothing and nothing was answered, which
          is the commoner case and the one the panel must not render for.

          `answersOpen` is TOLD, never inferred: true while the booking is
          going ahead and its departure has not left. The mock computes it
          here so a client that derived it from `state` would visibly disagree.
        */
        ...(partyQuestions(record).length > 0
          ? {
              questions: partyQuestions(record),
              /*
                The same instant this response reports as `slot.startsAt`, so
                the mock cannot contradict itself, and `?__scenario=
                answers-closed` for the morning after: the form must be gone
                and a stale submit must answer `409 answers_closed`.
              */
              answersOpen:
                scenario !== "answers-closed" &&
                !ANSWERS_SHUT_STATES.includes(state) &&
                new Date(SLOT_STARTS_AT).getTime() > mockNow(),
            }
          : {}),
        /*
          HOW TO REACH A PERSON - yuvoy-app#38 item 4.

          "Always sent (since 2026-09-13)", and the same shape as on
          `getMyAccount`, so a traveller on a booking link who never signed in
          can still Chat with us. `?__scenario=no-support-number` is the other
          half of the contract's own sentence: `whatsappE164` is null while
          there is no number, and the button is hidden then. Without a scenario
          for it the hidden branch would never be exercised, and this product
          has shipped an unconfigured number before.
        */
        support: {
          whatsappE164:
            scenario === "no-support-number" ? null : "+919000000001",
          hours: "9am to 7pm, every day",
        },
        /*
          WHETHER TO OFFER "HOW WAS IT" - yuvoy-app#38 item 3.

          "Always sent", and the mock now sends it, because the screen reads
          `review.canReview` instead of deriving the rule from `state`
          (yuvoy-app#53). Without this the booking page could never show the
          form against the mock, and every test of it would have been a test of
          the absent branch.

          `canReview` is the server's own definition: a completed trip with no
          review that ended no more than 30 days ago, which is exactly when
          `leaveReview` accepts one. `?__scenario=reviewed` is the other side,
          a trip already rated, so the thanks line can be proven too.
        */
        review:
          scenario === "reviewed"
            ? { reviewed: true, canReview: false, rating: 5 }
            : {
                reviewed: false,
                canReview: state === "completed",
              },
        ...(scenario === "operator-updates"
          ? {
              /*
                `kind` and `from`, which is what the server sends.

                This mock sent `intent`, a name that only ever existed in the
                document — "Never emitted ... the server has always sent
                `kind`". So the screen read `intent`, found it, and every test
                passed while the real API mislabelled every update as "A note".
                Sending what the server sends is what makes the panel testable.
              */
              operatorUpdates: [
                {
                  kind: "meeting_point_change",
                  from: "Sample Dive Operator",
                  detail: "Jetty 2, not Jetty 1",
                  note: "The usual spot is under repair this week.",
                  sentAt: "2026-08-21T10:15:00Z",
                },
                {
                  kind: "bring_item",
                  from: "Sample Dive Operator",
                  detail: "A towel and a dry change of clothes",
                  sentAt: "2026-08-21T10:16:00Z",
                },
              ] satisfies OperatorUpdates,
            }
          : {}),
        ...(state === "declined"
          ? {
              refund: {
                state: "pending",
                amountPaise: 450000 * record.guests,
                message: "Your refund is with your bank.",
              },
            }
          : {}),
      },
      { headers: mockHeaders(rid()) },
    );
  }),
  /* --------------------------------------------------------- recovery */

  // 202 for EVERY number, whether or not it booked. A different answer would
  // turn this into a way to test whether a phone number has a Yuvoy booking.
  http.post(url("/bookings/recovery/request"), async () =>
    HttpResponse.json(
      { devCode: "123456" },
      { status: 202, headers: mockHeaders(rid()) },
    ),
  ),

  http.post(url("/bookings/recovery/verify"), async ({ request }) => {
    const { code } = (await request.json()) as { phone: string; code: string };
    if (code !== "123456") {
      return envelope("unauthorized", "That code is not right.", 401);
    }
    // A FRESH token. The previous link stops working.
    const existing = [...reservations.values()][0];
    if (!existing)
      return envelope("not_found", "No booking for that number.", 404);

    const token = `tok_recovered_${Math.random().toString(36).slice(2)}`;
    byToken.set(token, existing.reservationId);
    return HttpResponse.json(
      { statusToken: token, note: "Your previous link no longer works." },
      { headers: mockHeaders(rid()) },
    );
  }),
  /* ------------------------------------------ the conversation (#47) */

  http.get(url("/bookings/messages"), async ({ request }) => {
    const scenario = scenarioOf(request);
    const record = recordFor(request);
    if (!record)
      return envelope("unauthorized", "That link is not valid.", 401);

    const all = conversation(record, scenario);
    const query = new URL(request.url).searchParams;
    const cursor = query.get("cursor");
    const raw = Number(query.get("limit"));
    // "None, or a value that is not a whole number above zero, gets 50."
    const limit = Number.isInteger(raw) && raw > 0 ? Math.min(raw, 200) : 50;

    /*
      The cursor is an INDEX from the end, opaque to the client. A cursor this
      conversation did not issue is a 400, which is what makes a client that
      constructs one fail loudly rather than silently re-paging.
    */
    let end = all.length;
    if (cursor !== null) {
      const parsed = /^cur_(\d+)$/.exec(cursor);
      if (!parsed || Number(parsed[1]) > all.length) {
        return envelope(
          "invalid_input",
          "That is not a cursor we issued.",
          400,
        );
      }
      end = Number(parsed[1]);
    }
    const start = Math.max(0, end - limit);
    const page = all.slice(start, end);

    const closed = closedReasonFor(record, scenario);
    return HttpResponse.json(
      {
        // Oldest first WITHIN the page; the first page is the most recent.
        messages: page,
        complete: start === 0,
        ...(start > 0 ? { nextCursor: `cur_${start}` } : {}),
        unreadCount: page.filter(
          (m) => m.from === "operator" && m.id > (record.readUpTo ?? ""),
        ).length,
        canWrite: !closed,
        ...(closed ? { closedReason: closed } : {}),
        ...(closed ? {} : { writableUntil: "2026-08-29T01:30:00Z" }),
      },
      { headers: mockHeaders(rid()) },
    );
  }),

  http.post(url("/bookings/messages"), async ({ request }) => {
    const scenario = scenarioOf(request);
    const record = recordFor(request);
    if (!record)
      return envelope("unauthorized", "That link is not valid.", 401);

    const { text } = (await request.json()) as { text?: unknown };
    if (typeof text !== "string" || text.trim().length === 0) {
      return envelope("invalid_input", "Write something before sending.", 400, {
        text: "required",
      });
    }
    if (text.length > 1000) {
      return envelope(
        "invalid_input",
        `A message can be up to 1000 characters, and this one is ${text.length}. Shorten it and send it again.`,
        400,
        { text: "too long" },
      );
    }

    /*
      D-018, and the one rule a client must NOT re-implement: the sentences
      below are the server's and the app renders them. A phone number is seven
      or more digits counted THROUGH the spaces, dashes, brackets and dots
      between them, except a date written like 14.09.2026.
    */
    const contact = contactDetailIn(text);
    if (contact) {
      const kind =
        contact === "phone"
          ? "a phone number, from seven or more digits written close together"
          : contact === "email"
            ? "an email address"
            : "a link";
      return envelope(
        "invalid_input",
        `Messages cannot include phone numbers, email addresses or links. This one looks like it has ${kind}. Take it out and send the message again.`,
        400,
        { text: "contact details", contactDetail: contact },
      );
    }

    const closed = closedReasonFor(record, scenario);
    if (closed) {
      return envelope("messages_closed", closedSentence(closed), 409, {
        reason: closed,
      });
    }

    const message = {
      id: `msg_${String(record.messages?.length ?? 0).padStart(4, "0")}_w`,
      from: "traveller" as const,
      senderName: record.contactName,
      text: text.trim(),
      sentAt: new Date(mockNow()).toISOString(),
    };
    record.messages = [...(record.messages ?? []), message];
    return HttpResponse.json(message, {
      status: 201,
      headers: mockHeaders(rid()),
    });
  }),

  http.post(url("/bookings/messages/read"), async ({ request }) => {
    const record = recordFor(request);
    if (!record)
      return envelope("unauthorized", "That link is not valid.", 401);

    const { upTo } = (await request.json()) as { upTo?: unknown };
    const all = conversation(record, scenarioOf(request));
    if (typeof upTo !== "string" || !all.some((m) => m.id === upTo)) {
      return envelope(
        "not_found",
        "No such message in this conversation.",
        404,
      );
    }
    // "A marker never moves back: naming an older message changes nothing."
    if (!record.readUpTo || upTo > record.readUpTo) record.readUpTo = upTo;
    return HttpResponse.json(
      {
        unreadCount: all.filter(
          (m) => m.from === "operator" && m.id > (record.readUpTo ?? ""),
        ).length,
      },
      { headers: mockHeaders(rid()) },
    );
  }),

  /* ------------------------------------------------- the listing's questions */

  /*
    yuvoy-app#46 §4. Answers given from the booking link, after checkout.

    ALL OR NOTHING, which is the behaviour a client can get wrong invisibly:
    "if one answer does not fit its question, nothing is saved". A mock that
    saved the good ones would let a screen ship that reports success over a
    partial write.
  */
  http.post(url("/bookings/answers"), async ({ request }) => {
    const scenario = scenarioOf(request);
    const auth = request.headers.get("authorization") ?? "";
    const token = auth.replace(/^Bearer\s+/i, "");
    const id = byToken.get(token);
    const record = id ? reservations.get(id) : undefined;
    if (!record)
      return envelope("unauthorized", "That link is not valid.", 401);

    const body = (await request.json()) as { answers?: unknown };
    const sent = Array.isArray(body.answers) ? body.answers : [];
    if (sent.length < 1 || sent.length > 10) {
      return envelope(
        "invalid_input",
        "some of these answers need fixing",
        400,
        {
          answers: "1 to 10 answers",
        },
      );
    }

    const state = record.released
      ? "released"
      : record.cashBooked
        ? "confirmed"
        : record.state === "pending_request"
          ? "awaiting_operator"
          : "holding";
    if (
      scenario === "answers-closed" ||
      ANSWERS_SHUT_STATES.includes(state) ||
      new Date(SLOT_STARTS_AT).getTime() <= mockNow()
    ) {
      return envelope(
        "answers_closed",
        "This booking is no longer taking answers, because its departure has left or it is no longer going ahead.",
        409,
      );
    }

    const questions = record.slug
      ? (EXPERIENCE_DETAIL[record.slug]?.questions ?? [])
      : [];
    const accepted = recordAnswers(questions, sent);
    // All or nothing: one that did not fit means nothing is saved.
    if (Object.keys(accepted).length !== sent.length) {
      return envelope(
        "invalid_input",
        "some of these answers need fixing",
        400,
        {
          "answers[0].answer": "does not fit this question",
        },
      );
    }

    // Each answer REPLACES; questions left out keep what they had.
    record.answers = { ...(record.answers ?? {}), ...accepted };
    return HttpResponse.json(
      { questions: partyQuestions(record) },
      { headers: mockHeaders(rid()) },
    );
  }),

  /* ------------------------------------------------ cancel / share / review */

  http.get(url("/bookings/cancellation-quote"), async ({ request }) => {
    const scenario = scenarioOf(request);

    if (scenario === "partial-refund") {
      // selfService false: a partial refund is a person's decision, and the
      // UI must hide the button rather than show one that gets refused.
      return HttpResponse.json({
        cancellable: true,
        selfService: false,
        capturedPaise: 900000,
        refundPaise: 450000,
        refundTier: "half",
        hoursBeforeStart: 20,
        note: "Under 24 hours, so this one is half back and a person checks it.",
      });
    }
    /*
      A DEPARTURE THE OPERATOR MOVED — D-032.3, yuvoy-app#48 §1.

      Everything paid online comes back whatever tier the snapshot holds, so
      this is self-service AND carries a `note`. That pairing is the whole
      point of the fix: the sheet used to show `note` only when `selfService`
      was false, so this quote rendered "You get everything back." with no
      explanation at all.
    */
    if (scenario === "operator-moved") {
      return HttpResponse.json({
        bookingReference: "YV-4K2M9P7Q",
        cancellable: true,
        selfService: true,
        capturedPaise: 900000,
        refundPaise: 900000,
        refundTier: "half",
        hoursBeforeStart: 20,
        note: "The operator moved this departure after you booked, so you get everything back whatever the usual policy says.",
      });
    }
    /*
      A CASH BOOKING IN THE 24-TO-48-HOUR TIER — D28, yuvoy-app#48 §2.

      A partial tier with nothing to refund "needs nobody", so this quotes
      `selfService: true` where it used to send the traveller to WhatsApp.
      Both figures are 0, which is what used to print "You get everything
      back." above ₹0.
    */
    if (scenario === "cash-nothing-to-refund") {
      return HttpResponse.json({
        bookingReference: "YV-4K2M9P7Q",
        cancellable: true,
        selfService: true,
        capturedPaise: 0,
        refundPaise: 0,
        refundTier: "half",
        hoursBeforeStart: 30,
      });
    }
    if (scenario === "not-cancellable") {
      return HttpResponse.json({
        cancellable: false,
        selfService: false,
        reason: "This departure has already left.",
      });
    }

    return HttpResponse.json({
      bookingReference: "YV-4K2M9P7Q",
      cancellable: true,
      selfService: true,
      capturedPaise: 900000,
      refundPaise: 900000,
      refundTier: "full",
      hoursBeforeStart: 72,
    });
  }),

  http.post(url("/bookings/cancellation"), async ({ request }) => {
    const scenario = scenarioOf(request);
    const body = (await request.json()) as { expectedRefundPaise: number };

    /*
      The quote moved between quoting and committing.

      `0` is a legitimate echo now, not only `900000`: a partial tier with
      nothing to refund cancels from here (D28), and treating its `0` as a
      moved quote would make the one path yuvoy-app#48 §2 opens impossible to
      exercise. The scenario switch stays the way to force a real re-quote.
    */
    const quoted = scenario === "cash-nothing-to-refund" ? 0 : 900000;
    if (scenario === "quote-moved" || body.expectedRefundPaise !== quoted) {
      return envelope(
        "refund_quote_moved",
        "The refund changed while you were deciding.",
        409,
      );
    }

    return HttpResponse.json({
      bookingReference: "YV-4K2M9P7Q",
      state: "cancelled",
      refundPaise: body.expectedRefundPaise,
      refundTier: quoted === 0 ? "half" : "full",
      seatsReleased: 2,
      /*
        "Says why" when nothing comes back. Present only then, so a full
        refund is not narrated at somebody who can see the figure.
      */
      ...(quoted === 0
        ? {
            refundNote:
              "Nothing was paid online for this booking, so there is nothing to refund.",
          }
        : {}),
    });
  }),

  http.post(url("/bookings/share"), async () =>
    HttpResponse.json(
      {
        shareUrl: "http://localhost:3000/trip/shr_sample",
        expiresIn: 604800,
        reveals:
          "Shows the meeting point and the time. Not what anyone paid, and it cannot cancel anything.",
      },
      { status: 201, headers: mockHeaders(rid()) },
    ),
  ),

  http.get(url("/trips/:token"), async ({ params }) => {
    if (String(params.token) === "missing") {
      return envelope("not_found", "That link is not valid.", 404);
    }
    return HttpResponse.json({
      experience: "Try-dive at Nemo Reef",
      operator: "Sample Dive Operator",
      localDate: "2026-08-22",
      localTime: "07:00",
      meetingPoint: "Jetty 2, Havelock",
      landmark: "The blue kiosk, 15 minutes before.",
      durationMinutes: 180,
      bring: ["Swimwear", "A towel", "Sunscreen"],
      partySize: 2,
      cancelled: false,
    });
  }),

  http.post(url("/bookings/review"), async ({ request }) => {
    const scenario = scenarioOf(request);
    if (scenario === "already-reviewed") {
      return envelope("conflict", "This trip was already reviewed.", 409);
    }
    return new HttpResponse(null, { status: 204 });
  }),
  /* --------------------------------------------------------------- auth */

  /*
    There are deliberately NO /auth/otp/* handlers.

    That endpoint pair was deleted upstream on 2026-08-20 ("the second sign-in
    is deleted"). A mock for an endpoint the contract no longer has is worse
    than no mock: it is how somebody rebuilds a deleted feature against a shape
    that only exists on their laptop.

    `/me/sign-in/*` below is a DIFFERENT thing and is current (yuvoy-api#172):
    a session over a phone number, which any number can get whether or not it
    has ever booked, and which revokes nothing.
  */

  http.post(url("/me/sign-in/request"), async ({ request }) => {
    const body = (await request.json()) as { phone?: string };
    const phone = body.phone?.trim() ?? "";

    // E.164 or nothing. The real API is strict here and the screen has a
    // branch for it, so the mock has to be able to reach that branch.
    if (!/^\+[1-9]\d{7,14}$/.test(phone)) {
      return envelope("invalid_input", "That is not a phone number.", 400);
    }
    // Reachable with `?__scenario=otp-rate-limited`, so the 429 copy is
    // testable without sending six codes.
    if (scenarioOf(request) === "otp-rate-limited") {
      return envelope("rate_limited", "Too many codes for that number.", 429);
    }

    /*
      202 and a plain answer. Unlike recovery, this one has nothing to reveal:
      "there is no booking for the answer to reveal, so it says plainly that a
      code was sent."
    */
    return HttpResponse.json(
      {
        sent: true,
        message: "A code is on its way to that number.",
        devCode: DEV_SIGN_IN_CODE,
      },
      { status: 202, headers: mockHeaders(rid()) },
    );
  }),

  http.post(url("/me/sign-in/verify"), async ({ request }) => {
    const body = (await request.json()) as { phone?: string; code?: string };
    const phone = body.phone?.trim() ?? "";
    const code = body.code?.trim() ?? "";

    if (!phone) {
      return envelope("invalid_input", "That is not a phone number.", 400);
    }
    /*
      "Wrong, expired, used and over-attempted codes all answer 401 with one
      message." One answer, deliberately: telling them apart would say whether
      a code had been issued for a number.
    */
    if (code !== DEV_SIGN_IN_CODE) {
      return envelope("unauthorized", "That code did not work.", 401);
    }

    return HttpResponse.json(
      {
        sessionToken: `sess_${phone.replace(/\D/g, "")}`,
        expiresAt: new Date(mockNow() + 30 * 24 * 60 * 60_000).toISOString(),
      },
      { headers: mockHeaders(rid()) },
    );
  }),

  http.delete(url("/me/session"), async ({ request }) => {
    if (!request.headers.get("authorization")) {
      return envelope("unauthorized", "Sign in first.", 401);
    }
    /*
      204 whatever the token was, including one already ended — so there is no
      server-side session to forget here. The mock deliberately keeps none: the
      real API's session is a token the client holds, and inventing a
      server-side record would let a test pass on state production does not
      have.
    */
    return new HttpResponse(null, { status: 204 });
  }),

  /*
    The Account tab, and the read every signed-in screen makes (yuvoy-api,
    14 Sep). `session.expiresAt` is what the cookie's life is set from: a
    traveller session lasts 14 days SINCE LAST USE, and this answers the
    current end rather than the one sign-in returned (yuvoy-app#57).

    `name` and `email` are null for a number with no profile, which is the
    common first-sign-in state and the one #32 and #38 branch on. The scenario
    switch reaches it without needing a second fixture number.
  */
  http.get(url("/me"), async ({ request }) => {
    if (!request.headers.get("authorization")) {
      return envelope("unauthorized", "Sign in first.", 401);
    }
    if (scenarioOf(request) === "session-expired") {
      return envelope("token_expired", "That session has ended.", 401);
    }

    const fresh = scenarioOf(request) === "first-sign-in";
    return HttpResponse.json(
      {
        phone: "+919000000000",
        name: fresh ? null : "Asha Menon",
        email: fresh ? null : "asha@example.com",
        interests: fresh ? [] : ["adventure", "scuba-diving"],
        onboardingRequired: fresh,
        memberSince: fresh ? null : "2026-07-02T04:30:00Z",
        trips: { total: 3, upcoming: 1, completed: 2 },
        reviews: { count: 1 },
        support: {
          whatsappE164: "+919000000001",
          hours: "9am to 7pm, every day",
        },
        /*
          Booking by invitation (yuvoy-api#195). Production has sent this
          since 6caa728, so the mock does too: a screen that never sees the
          field is green against data production never sends.

          True by default, because this number held a booking before
          invitations began and the migration admitted every such number.
          `?__scenario=not-admitted` (and the two scenarios below that need
          a number that is not in) says false until a code is redeemed, and
          `?__scenario=admitted-absent` leaves the field out, as an API from
          before #195 would.
        */
        ...(scenarioOf(request) === "admitted-absent"
          ? {}
          : { admitted: isAdmitted(request) }),
        /*
          Present only under a traveller session. The mock cannot tell a
          session token from a status token by inspection, so it keys on the
          prefix the verify handler mints.
        */
        ...(request.headers.get("authorization")?.includes("Bearer sess_")
          ? {
              session: {
                expiresAt: new Date(
                  mockNow() + 14 * 24 * 60 * 60_000,
                ).toISOString(),
              },
            }
          : {}),
      },
      { headers: mockHeaders(rid()) },
    );
  }),

  /*
    Redeeming an invite code (yuvoy-api#195), modelled on the API as Hima
    described it on the issue and on the contract:

      - Signed in only. No `Authorization` is a 401, and a finished session
        is a 401 too (`?__scenario=session-expired`).
      - `?__scenario=invite-rate-limited` is the throttle: ten tries an hour
        per number and a limit per connection, answered `429`.
      - A number that is already admitted gets `200` with
        `alreadyAdmitted: true` WHATEVER it sends, even a malformed code, and
        the code is not used up.
      - Otherwise the code decides: `MOCK_INVITE_CODES.valid` admits the
        number, `.used` is `409 invite_code_used`, `.expired` is
        `410 invite_code_expired`, any other well-formed code is
        `404 invite_code_unknown`, and a malformed one is a `400`.

    The valid code is not consumed, unlike production's one-person-once.
    Two e2e projects run the same walk at the same time against one server,
    and a code that could be spent once would fail whichever came second.
    Admission is still per number, which is the part the client reads.
  */
  http.post(url("/me/invite-codes/redeem"), async ({ request }) => {
    const auth = request.headers.get("authorization");
    if (!auth) {
      return envelope("unauthorized", "Sign in to use an invite code.", 401);
    }
    const scenario = scenarioOf(request);
    if (scenario === "session-expired") {
      return envelope("token_expired", "That session has ended.", 401);
    }
    if (scenario === "invite-rate-limited") {
      return envelope(
        "rate_limited",
        "Too many invite codes tried. Try again later.",
        429,
      );
    }
    if (isAdmitted(request)) {
      return HttpResponse.json(
        { admitted: true, alreadyAdmitted: true },
        { headers: mockHeaders(rid()) },
      );
    }

    const body = (await request.json().catch(() => ({}))) as {
      code?: unknown;
    };
    const code =
      typeof body.code === "string"
        ? body.code.replace(/[\s-]/g, "").toUpperCase()
        : "";
    if (!/^[A-HJKMNP-Z2-9]{8}$/.test(code)) {
      return envelope("invalid_input", "That is not an invite code.", 400);
    }

    switch (code) {
      case MOCK_INVITE_CODES.used:
        return envelope(
          "invite_code_used",
          "Somebody has already used this code.",
          409,
        );
      case MOCK_INVITE_CODES.expired:
        return envelope("invite_code_expired", "This code has expired.", 410);
      case MOCK_INVITE_CODES.valid:
        admittedByCode.add(auth);
        return HttpResponse.json(
          { admitted: true },
          { headers: mockHeaders(rid()) },
        );
      default:
        return envelope(
          "invite_code_unknown",
          "There is no such code, or it was withdrawn.",
          404,
        );
    }
  }),

  /* -------------------------------------------------- invited trips ---- */

  /*
    Trips somebody else booked (yuvoy-app#38). A guest's row carries no price,
    no payment, no refund and no booking reference, and this fixture carries
    none either: a mock that sent them would let a card render money a guest
    must never see, and the issue forbids it twice.
  */
  http.get(url("/me/invited-trips"), async ({ request }) => {
    if (!request.headers.get("authorization")) {
      return envelope("unauthorized", "Sign in first.", 401);
    }
    /*
      A revoked session refuses EVERY authenticated call, which is what the real
      API does and what this scenario has to reproduce.

      Without this the mock was incoherent, and an e2e test found it: bookings
      answered 401 and cleared the cookie, then this call answered 200 and the
      proxy re-set the cookie from the token that request had carried. The proxy
      is right to do that (a 200 means the API accepted the token), so the
      mock was the thing that was wrong.
    */
    if (scenarioOf(request) === "session-expired") {
      return envelope("token_expired", "That session has ended.", 401);
    }
    return HttpResponse.json(
      { trips: [INVITED_TRIP, INVITED_CANCELLED] },
      { headers: mockHeaders(rid()) },
    );
  }),

  http.get(url("/me/invited-trips/:id"), async ({ request, params }) => {
    if (!request.headers.get("authorization")) {
      return envelope("unauthorized", "Sign in first.", 401);
    }
    if (params.id === INVITED_CANCELLED.id) {
      return HttpResponse.json(INVITED_CANCELLED);
    }
    if (params.id !== INVITED_TRIP.id) {
      return envelope("not_found", "No such invitation.", 404);
    }
    return HttpResponse.json(INVITED_TRIP, { headers: mockHeaders(rid()) });
  }),

  http.post(url("/me/invited-trips/:id/accept"), async ({ request }) => {
    if (!request.headers.get("authorization")) {
      return envelope("unauthorized", "Sign in first.", 401);
    }
    return HttpResponse.json({ ...INVITED_TRIP, guestState: "joined" });
  }),

  http.post(url("/me/invited-trips/:id/decline"), async ({ request }) => {
    if (!request.headers.get("authorization")) {
      return envelope("unauthorized", "Sign in first.", 401);
    }
    return new HttpResponse(null, { status: 204 });
  }),

  /*
    The invite LINK's preview. No credential at all, deliberately: the landing
    page shows the trip to a signed-out visitor and then asks them to sign in,
    which is the whole shape of the flow.
  */
  http.get(url("/invites/:token"), async ({ params }) => {
    if (params.token === "gone") {
      return envelope("not_found", "No such invitation.", 404);
    }
    return HttpResponse.json({
      experience: INVITED_TRIP.experience,
      experienceSlug: INVITED_TRIP.experienceSlug,
      operator: INVITED_TRIP.operator,
      localDate: INVITED_TRIP.localDate,
      localTime: INVITED_TRIP.localTime,
      status: INVITED_TRIP.status,
    });
  }),

  http.post(url("/invites/:token/accept"), async ({ request }) => {
    if (!request.headers.get("authorization")) {
      return envelope("unauthorized", "Sign in first.", 401);
    }
    return HttpResponse.json({ id: INVITED_TRIP.id });
  }),

  /* --------------------------------------------- the booker's guests ---- */

  /*
    Inviting people onto a booking (yuvoy-app#38 items 6 and 12).

    In-memory, so the panel can be walked end to end: invite, see the row
    appear, remove it, see it go. A mock that answered a fixed list would let
    the panel pass every test while never actually refetching.

    `maxGuests` is the party size less the booker, which is the rule the client
    is forbidden from deriving. `delivery: not_sent_no_channel` is what the API
    answers today, because there is no WhatsApp sender yet, and it is the case
    where the BOOKER has to deliver the link.
  */
  http.post(url("/bookings/invites"), async ({ request }) => {
    if (!request.headers.get("authorization")) {
      return envelope("unauthorized", "That link is not valid.", 401);
    }
    const scenario = scenarioOf(request);
    if (scenario === "party-full") {
      return envelope("conflict", "Every place is already offered.", 409);
    }

    const body = (await request.json().catch(() => ({}))) as {
      phone?: string;
    };
    const id = `tgi_${guestSeq++}`;
    mockGuests.push({
      id,
      ...(body.phone ? { phoneMasked: `••• ${body.phone.slice(-4)}` } : {}),
      state: "invited" as const,
      delivery: "not_sent_no_channel" as const,
      createdAt: new Date(mockNow()).toISOString(),
    });
    return HttpResponse.json(
      {
        id,
        state: "invited",
        delivery: "not_sent_no_channel",
        inviteUrl: `https://app.yuvoy.in/i/${id}`,
      },
      { status: 201, headers: mockHeaders(rid()) },
    );
  }),

  http.get(url("/bookings/invites"), async ({ request }) => {
    if (!request.headers.get("authorization")) {
      return envelope("unauthorized", "That link is not valid.", 401);
    }
    return HttpResponse.json(
      {
        guests: mockGuests,
        // A party of three: the booker plus two places to offer.
        maxGuests: scenarioOf(request) === "party-of-one" ? 0 : 2,
      },
      { headers: mockHeaders(rid()) },
    );
  }),

  http.delete(url("/bookings/invites/:id"), async ({ request, params }) => {
    if (!request.headers.get("authorization")) {
      return envelope("unauthorized", "That link is not valid.", 401);
    }
    const at = mockGuests.findIndex((g) => g.id === params.id);
    if (at >= 0) mockGuests.splice(at, 1);
    // 204 "also when they were already removed".
    return new HttpResponse(null, { status: 204 });
  }),

  /* ------------------------------------------------------ help ---------- */

  /*
    The in-app help form (yuvoy-app#38 items 4 and 9).

    Takes EITHER credential, which is the contract's own point: "a traveller
    who booked without signing in can still ask for help". The mock refuses an
    unauthenticated call and accepts both a `sess_` session and a booking
    link's status token, because the two callers reach this from different
    screens and only one of them has a session.

    Two scenarios, both of which the form has a branch for and neither of which
    is reachable without the mock producing it: `support-invalid` for the
    per-field `400`, and `support-rate-limited` for the `429` after five in an
    hour.
  */
  http.post(url("/support/requests"), async ({ request }) => {
    if (!request.headers.get("authorization")) {
      return envelope("unauthorized", "Sign in first.", 401);
    }
    const scenario = scenarioOf(request);
    if (scenario === "support-rate-limited") {
      return envelope("rate_limited", "Too many messages.", 429);
    }

    const body = (await request.json()) as {
      message?: string;
      topic?: string;
      bookingReference?: string;
    };

    /*
      The contract's own floor, enforced here so the field-level branch is
      exercised by something. `details` is a map of field to sentence, which is
      what the form renders under the box rather than at the top.
    */
    if (scenario === "support-invalid" || (body.message ?? "").length < 10) {
      return HttpResponse.json(
        {
          error: {
            code: "invalid_input",
            message: "That message is too short.",
            details: {
              message: "Tell us a little more, at least 10 characters.",
            },
          },
        },
        { status: 400, headers: mockHeaders(rid()) },
      );
    }

    /*
      Kept, so the reads below have something to read (yuvoy-api#196). The
      same message about the same booking is the same request, "resubmitting
      returns the same reference rather than opening a second case", and a
      closed or resolved one reopens as `open`.
    */
    const record = recordFor(request);
    const aboutBooking =
      body.bookingReference ??
      (record ? (record.cashBookingReference ?? record.reference) : undefined);
    const text = (body.message ?? "").trim();
    const now = new Date(mockNow()).toISOString();
    const existing = supportRequests.find(
      (r) => r.message === text && r.bookingReference === aboutBooking,
    );
    if (existing) {
      existing.status = "open";
      existing.updatedAt = now;
    } else {
      supportRequests.unshift({
        reference:
          supportRequests.length === 0
            ? "SR-3F9A12C0"
            : `SR-${(0x3f9a12c0 + supportRequests.length).toString(16).toUpperCase()}`,
        status: "open",
        topic: (body.topic as SupportTopic | undefined) ?? "other",
        createdAt: now,
        updatedAt: now,
        message: text,
        ...(aboutBooking ? { bookingReference: aboutBooking } : {}),
        viaToken: record?.token,
      });
    }
    const reference = (existing ?? supportRequests[0]).reference;

    return HttpResponse.json(
      {
        reference,
        message: "Thanks. We have your message and will reply on WhatsApp.",
      },
      { status: 201, headers: mockHeaders(rid()) },
    );
  }),

  /*
    Reading them back (yuvoy-api#196). The list is the SESSION's, and a
    booking's status token is a 401 on it: "a status token proves one booking,
    not the number on it". One request by reference takes either credential,
    and a token opens only requests raised about its own booking. An unknown
    reference and somebody else's are the same 404, word for word.

    `support-read-missing` answers the way the API did before #209 was
    deployed (405 on the list, 404 on one), so the screens' "an older API"
    branch is reachable from a URL.
  */
  http.get(url("/support/requests"), async ({ request }) => {
    const auth = request.headers.get("authorization") ?? "";
    const scenario = scenarioOf(request);
    if (scenario === "support-read-missing") {
      return envelope("method_not_allowed", "Method not allowed.", 405);
    }
    if (!auth.includes("Bearer sess_")) {
      return envelope(
        "unauthorized",
        "Sign in with your WhatsApp number to see your messages to us.",
        401,
      );
    }
    if (scenario === "support-rate-limited") {
      return envelope("rate_limited", "Too many requests.", 429);
    }

    const all = [...supportRequests, ...SEEDED_SUPPORT_REQUESTS].map(
      publicSupportRequest,
    );
    const query = new URL(request.url).searchParams;
    const limit = Math.min(Number(query.get("limit")) || 20, 50);
    const cursor = query.get("cursor");
    const start = cursor ? Number(cursor.replace(/^sr_/, "")) : 0;
    if (cursor && (!Number.isInteger(start) || start < 0)) {
      return envelope("invalid_input", "That is not a cursor we issued.", 400);
    }
    const items = all.slice(start, start + limit);
    const end = start + items.length;
    const complete = end >= all.length;
    return HttpResponse.json(
      { items, complete, nextCursor: complete ? null : `sr_${end}` },
      { headers: mockHeaders(rid()) },
    );
  }),

  http.get(url("/support/requests/:reference"), async ({ request, params }) => {
    const auth = request.headers.get("authorization") ?? "";
    const scenario = scenarioOf(request);
    if (scenario === "support-read-missing") {
      return envelope("not_found", "No such route.", 404);
    }
    if (!auth) return envelope("unauthorized", "Sign in first.", 401);

    const wanted = String(params.reference).toUpperCase();
    const all = [...supportRequests, ...SEEDED_SUPPORT_REQUESTS];
    const found = all.find((r) => r.reference.toUpperCase() === wanted);

    const bySession = auth.includes("Bearer sess_");
    const record = bySession ? undefined : recordFor(request);
    if (!bySession && !record) {
      return envelope("unauthorized", "That link is not valid.", 401);
    }
    const booking = record
      ? (record.cashBookingReference ?? record.reference)
      : undefined;
    const visible =
      found &&
      (bySession ||
        found.viaToken === record?.token ||
        (booking !== undefined && found.bookingReference === booking));
    if (!visible) {
      return envelope("not_found", "We could not find that request.", 404);
    }
    return HttpResponse.json(publicSupportRequest(found), {
      headers: mockHeaders(rid()),
    });
  }),

  http.get(url("/me/interest-options"), async () =>
    HttpResponse.json({
      options: [
        { key: "scuba", label: "Scuba diving" },
        { key: "snorkelling", label: "Snorkelling" },
        { key: "kayaking", label: "Kayaking" },
        { key: "birdwatching", label: "Birdwatching" },
      ],
    }),
  ),

  http.get(url("/me/bookings"), async ({ request }) => {
    if (!request.headers.get("authorization")) {
      return envelope("unauthorized", "Sign in first.", 401);
    }
    // Reachable with `?__scenario=session-expired`, so the Trips tab's
    // "sign in again" branch is testable.
    if (scenarioOf(request) === "session-expired") {
      return envelope("token_expired", "That session has ended.", 401);
    }

    /*
      Every trip on the number, including ones this device has never seen —
      which is the whole point of signing in, and what a mock returning only
      this device's reservations could never exercise.

      `ANOTHER_PHONES_TRIP` is booked on another phone. It carries a real
      reference and a token of its own, so merging it in has something to
      claim onto the device.

      `WAITING_REQUEST` is the state yuvoy-api#172 added: `pending_request`
      with an EMPTY reference. It is here because a list that never contains
      one cannot prove that matching falls back to `reservationId` — and
      without that fallback every waiting request appears twice.
    */
    const own = [...reservations.values()]
      // The seeded rows are listed from `LISTED_TRIPS` below, with the tab and
      // the state the fixture declares. Listing them from here as well would
      // put every one of them in `upcoming` a second time.
      .filter((r) => r.listedState === undefined)
      .map((r) => ({
        reference: r.state === "pending_request" ? "" : r.reference,
        reservationId: r.reservationId,
        experience: "Try-dive at Nemo Reef",
        operator: "Sample Dive Operator",
        localDate: "2026-08-22",
        localTime: "07:00",
        state: r.state === "pending_request" ? "pending_request" : "confirmed",
        guests: r.guests,
        meetingPoint: "Jetty 2, Havelock",
        statusToken: r.token,
        tab: "upcoming" as const,
      }));

    /*
      `?tab=` is HONOURED — yuvoy-app, 19 September.

      This used to answer the identical list whatever tab was asked for, and
      the Trips screen deliberately does no filtering of its own: the API
      "has already put each one in the right tab", so the client renders the
      page it is given. A mock that ignores the parameter therefore makes all
      three tabs pass while proving only that one of them works, and the tab
      the owner reported — Past — had no row in it at all.

      The contract's guarantee is that the three "never overlap and together
      they are the whole list", so this partitions rather than filters, and an
      absent `tab` still means every trip.
    */
    const tab = new URL(request.url).searchParams.get("tab");
    /*
      `unreadCount` on every row (yuvoy-api#207), counted the way the API
      counts it: the business's messages past this booking's read marker,
      from the SAME conversation and the SAME marker `GET /bookings/messages`
      and `POST /bookings/messages/read` use below. A fixed number here would
      let the Trips row go on saying "2 new messages" after the thread was
      read, and a client that never refreshed the list would pass.

      "`0` when there is nothing new, no conversation yet, or no booking yet":
      a link with no booking behind it answers an empty conversation, so it
      counts nothing whatever the seeded thread holds.
    */
    const scenario = scenarioOf(request);
    const unreadFor = (reservationId: string): number => {
      const record = reservations.get(reservationId);
      if (!record || closedReasonFor(record, scenario) === "not_booked") {
        return 0;
      }
      return conversation(record, scenario).filter(
        (m) => m.from === "operator" && m.id > (record.readUpTo ?? ""),
      ).length;
    };
    const all = [...own, ...LISTED_TRIPS].map((row) => ({
      ...row,
      unreadCount: unreadFor(row.reservationId),
    }));
    const rows = tab ? all.filter((t) => t.tab === tab) : all;

    return HttpResponse.json({
      // `tab` is how this fixture files a row, not a field the API sends, so
      // it is dropped rather than shipped to a client that must not read it.
      bookings: rows.map((row) =>
        Object.fromEntries(Object.entries(row).filter(([k]) => k !== "tab")),
      ),
      nextCursor: null,
    });
  }),
];

/**
 * The code every demo number accepts.
 *
 * "There is no channel that delivers a traveller code yet (yuvoy-api#68);
 * until there is, only the demo numbers receive one." The real API returns it
 * as `devCode` in development, which is exactly what this mock does.
 */
const DEV_SIGN_IN_CODE = "123456";

/**
 * The invite codes the mock knows (yuvoy-api#195), normalised: no hyphen,
 * capitals. Each is eight characters of the real alphabet, which has no
 * 0, O, 1, I or L, so every one passes the client's own check and reaches
 * the handler.
 */
export const MOCK_INVITE_CODES = {
  valid: "K7QM4XRD",
  used: "USED2345",
  expired: "PAST6789",
} as const;

/**
 * Numbers admitted by a code redeemed here, keyed by the credential that
 * redeemed it (a session names its number). Module state, reset between tests
 * by `__resetBookingMocks` like everything else in this file.
 */
const admittedByCode = new Set<string>();

/** The scenarios whose number is NOT admitted until it redeems a code. */
const NOT_ADMITTED_SCENARIOS = new Set([
  "not-admitted",
  "invite-required",
  "invite-rate-limited",
]);

/**
 * Whether the number behind this request may book.
 *
 * Yes, unless a scenario says it is one of the numbers invitations left out,
 * in which case only a code redeemed through this mock lets it in. A guest
 * sends no credential and is never admitted.
 */
function isAdmitted(request: Request): boolean {
  if (!NOT_ADMITTED_SCENARIOS.has(scenarioOf(request))) return true;
  const auth = request.headers.get("authorization");
  return auth !== null && admittedByCode.has(auth);
}

/**
 * A trip somebody else booked and invited this number to.
 *
 * No price, no payment, no reference, and nothing about the booker. The
 * contract lists all of those as deliberately absent for a guest, so a fixture
 * that carried any of them would let a card render something a guest must
 * never see and no server would send.
 */
/**
 * The booker's guest list, in memory (yuvoy-app#38 item 6).
 *
 * Mutable on purpose. The panel invites, sees a row appear, removes it and
 * sees it go, and none of that is provable against a fixed fixture: a list
 * that never changes lets a panel that never refetches pass.
 *
 * Reset between tests by `__resetBookingMocks`, like the reservations store.
 */
type MockGuest = {
  id: string;
  phoneMasked?: string;
  name?: string;
  state: "invited" | "joined" | "declined";
  delivery: "not_sent_no_channel" | "queued" | "not_applicable";
  createdAt: string;
};
const mockGuests: MockGuest[] = [];
let guestSeq = 1;

/**
 * Help requests, in memory (yuvoy-api#196). Newest first, as the list is.
 *
 * `viaToken` is the mock's own bookkeeping, never sent: it is how a request
 * sent from a booking link is found again by that link.
 */
type SupportTopic = "booking" | "payment" | "cancellation" | "other";
type MockSupportRequest = {
  reference: string;
  status: "open" | "in_progress" | "resolved" | "closed";
  topic: SupportTopic;
  createdAt: string;
  updatedAt: string;
  message: string;
  bookingReference?: string;
  viaToken?: string;
};
const supportRequests: MockSupportRequest[] = [];

/**
 * Two older requests on the number, so the Help Center's list has a history
 * to draw in development: one somebody is on, and one dealt with.
 */
const SEEDED_SUPPORT_REQUESTS: readonly MockSupportRequest[] = [
  {
    reference: "SR-1B2C3D4E",
    status: "in_progress",
    topic: "payment",
    createdAt: "2026-08-17T09:12:00Z",
    updatedAt: "2026-08-18T04:30:00Z",
    message:
      "I paid for the snorkel trip but the booking page still says it is checking the payment.",
    bookingReference: "YV-OTHERPH",
  },
  {
    reference: "SR-0A9B8C7D",
    status: "resolved",
    topic: "other",
    createdAt: "2026-08-02T11:40:00Z",
    updatedAt: "2026-08-02T15:05:00Z",
    message: "How early should we reach the jetty for a 7am dive?",
  },
];

/** A request as the API sends it: the mock's own fields left out. */
function publicSupportRequest(request: MockSupportRequest) {
  return {
    reference: request.reference,
    status: request.status,
    topic: request.topic,
    createdAt: request.createdAt,
    updatedAt: request.updatedAt,
    message: request.message,
    ...(request.bookingReference
      ? { bookingReference: request.bookingReference }
      : {}),
  };
}

/**
 * A day that has not happened yet, under either clock.
 *
 * The mock's own clock starts at `FIXTURE_NOW` and the device's is whatever
 * the machine says, so a fixture date is only reliably in the future when it
 * is ahead of BOTH. A literal is ahead of neither for long: this trip was
 * written as `2026-09-22` and quietly moved itself into the Past tab on
 * 23 September, failing two tests that had nothing to do with whatever
 * anybody was changing that day.
 */
function daysAhead(days: number): string {
  const now = Math.max(Date.now(), mockNow());
  return new Date(now + days * 86_400_000).toISOString().slice(0, 10);
}

const INVITED_TRIP = {
  id: "inv_joined",
  role: "guest" as const,
  guestState: "invited" as const,
  experience: "Try-dive at Nemo Reef",
  experienceSlug: "try-dive-nemo-reef",
  operator: "Sample Dive Operator",
  // Upcoming, and it stays upcoming. See `daysAhead`.
  localDate: daysAhead(3),
  localTime: "07:00",
  meetingPoint: "Jetty 2, Havelock",
  landmark: "Beside the blue ticket hut",
  durationMinutes: 120,
  partySize: 3,
  status: "confirmed" as const,
  going: [{ name: "Asha Menon" }, { name: "Guest", you: true }],
};

/** The same, called off, so the Cancelled tab has something in it. */
const INVITED_CANCELLED = {
  ...INVITED_TRIP,
  id: "inv_called_off",
  guestState: "joined" as const,
  status: "called_off" as const,
  /*
    In the past, and that is the point of the pair: a called-off trip belongs
    in Cancelled whatever its date says, so this one has a date that would put
    it in Past if the status did not win.
  */
  localDate: daysAhead(-13),
};

/** A trip on this number that this device has never seen. */
const ANOTHER_PHONES_TRIP = {
  reference: "YV-OTHERPH",
  reservationId: "res_other_phone",
  experience: "Snorkel trip to Elephant Beach",
  operator: "Sample Boat Operator",
  localDate: "2026-08-24",
  localTime: "09:00",
  state: "confirmed",
  guests: 2,
  meetingPoint: "Jetty 2, Havelock",
  statusToken: "tok_other_phone",
  tab: "upcoming" as const,
};

/** A request the operator has not answered: no reference, only an id. */
const WAITING_REQUEST = {
  reference: "",
  reservationId: "res_waiting_request",
  experience: "Mangrove kayak at dawn",
  operator: "Sample New Operator",
  localDate: "2026-08-26",
  localTime: "06:30",
  state: "pending_request",
  guests: 1,
  meetingPoint: "Mangrove jetty",
  statusToken: "tok_waiting_request",
  tab: "upcoming" as const,
};

/**
 * A trip that HAPPENED, and one the traveller called off.
 *
 * The Past tab had no fixture at all, which is how the owner's report of
 * 19 September — tapping a past trip and being told the link was dead — was
 * structurally unreachable by the suite: there was nothing in that tab to tap.
 * `no_show` rather than `completed` on the second past row because the
 * contract files it under PAST, not cancelled, and that rule is only worth
 * anything if something exercises it.
 */
const PAST_TRIP = {
  reference: "YV-PASTONE",
  reservationId: "res_past_trip",
  experience: "Sunset cruise off Radhanagar",
  operator: "Sample Boat Operator",
  localDate: "2026-07-02",
  localTime: "16:30",
  state: "completed",
  guests: 2,
  meetingPoint: "Jetty 1, Havelock",
  statusToken: "tok_past_trip",
  tab: "past" as const,
};

const MISSED_TRIP = {
  reference: "YV-NOSHOW1",
  reservationId: "res_no_show",
  experience: "Dawn birdwatching at Chidiya Tapu",
  operator: "Sample New Operator",
  localDate: "2026-07-11",
  localTime: "05:15",
  state: "no_show",
  guests: 1,
  meetingPoint: "Chidiya Tapu gate",
  statusToken: "tok_no_show",
  tab: "past" as const,
};

const CANCELLED_TRIP = {
  reference: "YV-CALLOFF",
  reservationId: "res_cancelled_trip",
  experience: "Try-dive at Nemo Reef",
  operator: "Sample Dive Operator",
  localDate: "2026-08-01",
  localTime: "07:00",
  state: "cancelled",
  guests: 3,
  meetingPoint: "Jetty 2, Havelock",
  statusToken: "tok_cancelled_trip",
  tab: "cancelled" as const,
};

/**
 * A request the operator said no to, with the reason they picked
 * (yuvoy-api#225). No reference, because no booking ever existed; no payment
 * and no refund, because no money moved.
 *
 * Filed under Cancelled, AFTER the cancelled booking, so the first card in
 * that tab is still the one the booking-link suite opens.
 */
const DECLINED_REQUEST = {
  reference: "",
  reservationId: "res_declined_request",
  experience: "Mangrove kayak at dawn",
  operator: "Sample New Operator",
  localDate: "2026-08-28",
  localTime: "06:30",
  state: "declined",
  reasonCode: "no_capacity",
  guests: 2,
  meetingPoint: "Mangrove jetty",
  statusToken: "tok_declined_request",
  tab: "cancelled" as const,
};

/** Every row the API lists that this device did not create. */
const LISTED_TRIPS = [
  ANOTHER_PHONES_TRIP,
  WAITING_REQUEST,
  PAST_TRIP,
  MISSED_TRIP,
  CANCELLED_TRIP,
  DECLINED_REQUEST,
];

/**
 * Makes the listed trips OPENABLE.
 *
 * Every row of `listMyBookings` carries a `statusToken`, and the contract is
 * unambiguous that it opens that booking. The mock used to invent those
 * tokens in the list handler alone and register them nowhere, so
 * `GET /bookings/status` answered 401 for every one of them: tapping a trip
 * in Trips — the single most ordinary thing on the screen — could not be
 * tested end to end, and a client that mangled the token on the way was
 * indistinguishable from the mock's own refusal.
 *
 * That is the gap the 19 September defect hid in, so it is closed here rather
 * than worked around in a test.
 */
/** A request the operator refused: declined, and never a booking. */
function isDeclinedRequestRow(trip: { state: string; reference: string }) {
  return trip.state === "declined" && trip.reference === "";
}

function seedListedTrips(): void {
  for (const trip of LISTED_TRIPS) {
    reservations.set(trip.reservationId, {
      reservationId: trip.reservationId,
      slotId: `slot_${trip.reservationId}`,
      guests: trip.guests,
      contactName: "Sample Traveller",
      state: trip.state === "pending_request" ? "pending_request" : "active",
      holdExpiresAt: null,
      requestExpiresAt: null,
      token: trip.statusToken,
      reference: trip.reference || trip.reservationId,
      polls: 0,
      /*
        A declined REQUEST never took money, and its conversation is the empty
        one a link with no booking behind it answers.
      */
      paid:
        !isDeclinedRequestRow(trip) &&
        (trip.state === "confirmed" || trip.tab !== "upcoming"),
      /*
        And its booking link reads `released`, not `declined`: that is how the
        API projects an operator-declined request on `GET /bookings/status`,
        where `declined` means money was taken (yuvoy-api#225).
      */
      listedState: isDeclinedRequestRow(trip) ? "released" : trip.state,
    });
    byToken.set(trip.statusToken, trip.reservationId);
  }
}

seedListedTrips();

/** Test-only: forget every reservation between cases. */
export function __resetBookingMocks(): void {
  reservations.clear();
  byToken.clear();
  // The listed trips are fixtures, not a test's leftovers: they come back.
  seedListedTrips();
  idempotent.clear();
  // The guest list too, or one test's invitation is the next one's fixture.
  mockGuests.length = 0;
  guestSeq = 1;
  // And the help requests one test sent.
  supportRequests.length = 0;
  // And the numbers one test let in with a code.
  admittedByCode.clear();
}
