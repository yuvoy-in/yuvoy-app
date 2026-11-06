import { http, HttpResponse } from "msw";
import { EXPERIENCE_DETAIL, mockHeaders, mockNow } from "./fixtures";
import {
  ANSWERS_SHUT_STATES,
  SLOT_STARTS_AT,
  byToken,
  envelope,
  messageKeys,
  recordFor,
  reservations,
  rid,
  scenarioOf,
  url,
} from "./booking-support";
import {
  answerProblems,
  closedReasonFor,
  closedSentence,
  contactDetailIn,
  conversation,
  partyQuestions,
  recordAnswers,
} from "./booking-answers";

/*
  The handlers for a booking's conversation, its questions, and cancel,
  share and review, moved word for word from booking-handlers.ts
  (yuvoy-app#243). booking-handlers.ts lists them in their old place.
*/
export const messageHandlers = [
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

    /*
      Optional, and checked before the text, as the API checks it, with the
      API's own sentences below (yuvoy-api#282 item 4).
    */
    const key = request.headers.get("idempotency-key");
    if (key !== null && !/^[A-Za-z0-9_.:-]{16,128}$/.test(key)) {
      return envelope(
        "idempotency_key_malformed",
        "Idempotency-Key must be 16-128 characters of A-Z a-z 0-9 _ . : -",
        400,
      );
    }

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

    /*
      A resend under a key already used: the message that send wrote, with
      nothing new posted, or a refusal when the text is not the same. Answered
      before the closed check, as the API answers it, so a message that landed
      just before the conversation closed still comes back as sent.
    */
    const stored = key ? `${record.reservationId}:${key}` : null;
    const prior = stored ? messageKeys.get(stored) : undefined;
    if (prior) {
      if (prior.text !== text.trim()) {
        return envelope(
          "idempotency_key_reuse",
          "that Idempotency-Key was already used for a different request",
          409,
        );
      }
      return HttpResponse.json(prior.message, {
        status: 201,
        headers: { "Idempotent-Replay": "true", ...mockHeaders(rid()) },
      });
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
    if (stored) messageKeys.set(stored, { text: message.text, message });
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
    // All or nothing: one that did not fit means nothing is saved.
    const problems = answerProblems(questions, sent);
    if (Object.keys(problems).length > 0) {
      return envelope(
        "invalid_input",
        "some of these answers need fixing",
        400,
        problems,
      );
    }
    const accepted = recordAnswers(questions, sent);

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
];
