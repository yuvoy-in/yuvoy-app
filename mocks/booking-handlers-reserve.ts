import { http, HttpResponse, delay } from "msw";
import {
  EXPERIENCE_DETAIL,
  availabilityFor,
  mockHeaders,
  mockNow,
} from "./fixtures";
import {
  type MockReservation,
  byToken,
  envelope,
  idempotent,
  reservations,
  rid,
  scenarioOf,
  url,
} from "./booking-support";
import {
  answerContactRefusal,
  contactDetailIn,
  recordAnswers,
} from "./booking-answers";
import { isAdmitted } from "./booking-account";

/*
  The reservation handlers (hold, request and release), moved word for word
  from booking-handlers.ts (yuvoy-app#243), with the reference they mint.
  booking-handlers.ts lists them first, where they were.
*/
function reference(): string {
  const chars = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789";
  let out = "";
  for (let i = 0; i < 8; i++)
    out += chars[Math.floor(Math.random() * chars.length)];
  return `YV-${out}`;
}

export const reservationHandlers = [
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

    /*
      The one answer that is refused rather than dropped (yuvoy-api#282
      item 5): free text holding a phone number, an email address or a link,
      to any question, required or not. Before the required check, as the
      API runs it, with the question, the reason and the kind.
    */
    const refusedAnswers = (sentAnswers ?? []).flatMap((entry) => {
      const { questionId, answer } = (entry ?? {}) as {
        questionId?: unknown;
        answer?: unknown;
      };
      const question = questions.find((q) => q.id === questionId);
      if (question?.answerType !== "short_text") return [];
      if (typeof answer !== "string") return [];
      const kind = contactDetailIn(answer.trim());
      return kind
        ? [
            {
              questionId: question.id,
              text: question.text,
              reason: answerContactRefusal(kind),
              contactDetail: kind,
            },
          ]
        : [];
    });
    if (refusedAnswers.length > 0) {
      return envelope(
        "answers_required",
        "Some answers need another look before you can book.",
        409,
        { questions: refusedAnswers },
      );
    }

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
            questions: missing.map((q) => {
              /*
                Why, when an answer was sent for it and did not fit. The
                API's sentence for a choice: the one a listing that changed
                its options while the form was open produces.
              */
              const sent = sentAnswers.some(
                (entry) =>
                  (entry as { questionId?: unknown } | null)?.questionId ===
                  q.id,
              );
              return {
                questionId: q.id,
                text: q.text,
                ...(sent && q.answerType === "choice"
                  ? { reason: "that choice is no longer offered, pick again" }
                  : {}),
              };
            }),
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
];
