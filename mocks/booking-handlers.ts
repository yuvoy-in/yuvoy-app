import { http, HttpResponse, delay } from "msw";
import {
  EXPERIENCE_DETAIL,
  availabilityFor,
  mockHeaders,
  mockNow,
} from "./fixtures";
import type { components, paths } from "../src/lib/api/schema.gen";

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
          startsAt: "2026-08-22T01:30:00Z",
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
