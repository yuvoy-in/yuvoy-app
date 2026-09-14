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
    const key = request.headers.get("idempotency-key");
    const body = (await request.json()) as {
      slotId: string;
      guests: number;
      contact: { name: string; whatsapp: string; email?: string };
      screening?: { declaredClear?: boolean; ageBands?: string[] };
      attribution?: Record<string, unknown>;
      answers?: unknown;
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

    // `verifying` resolves after a couple of polls, so the interrupted-payment
    // screen can be exercised without a real provider.
    let state: string =
      record.state === "pending_request" ? "awaiting_operator" : "holding";
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
    const own = [...reservations.values()].map((r) => ({
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
    }));

    return HttpResponse.json({
      bookings: [...own, ANOTHER_PHONES_TRIP, WAITING_REQUEST],
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
 * A trip somebody else booked and invited this number to.
 *
 * No price, no payment, no reference, and nothing about the booker. The
 * contract lists all of those as deliberately absent for a guest, so a fixture
 * that carried any of them would let a card render something a guest must
 * never see and no server would send.
 */
const INVITED_TRIP = {
  id: "inv_joined",
  role: "guest" as const,
  guestState: "invited" as const,
  experience: "Try-dive at Nemo Reef",
  experienceSlug: "try-dive-nemo-reef",
  operator: "Sample Dive Operator",
  localDate: "2026-09-22",
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
  localDate: "2026-09-10",
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
};

/** Test-only: forget every reservation between cases. */
export function __resetBookingMocks(): void {
  reservations.clear();
  byToken.clear();
  idempotent.clear();
}
