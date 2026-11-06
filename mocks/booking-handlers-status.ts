import { http, HttpResponse } from "msw";
import { EXPERIENCE_DETAIL, mockHeaders, mockNow } from "./fixtures";
import type { components } from "../src/lib/api/schema.gen";
import {
  ANSWERS_SHUT_STATES,
  SLOT_STARTS_AT,
  byToken,
  envelope,
  reservations,
  rid,
  scenarioOf,
  url,
} from "./booking-support";
import { partyQuestions } from "./booking-answers";
import { declineSentence, marketDayFromNow } from "./booking-trips";
import { mockCheckIn } from "./check-in";

/*
  The booking status and recovery handlers, moved word for word from
  booking-handlers.ts (yuvoy-app#243). booking-handlers.ts lists them in
  their old place.
*/
type OperatorUpdates = NonNullable<
  components["schemas"]["BookingStatus"]["operatorUpdates"]
>;

export const statusHandlers = [
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

    /*
      A request the operator turned down (yuvoy-api#225, #229): the decline's
      code, the API's own sentence for it, and the listing's next bookable
      departure, a few days out so it moves with the clock. `bookUrl` is what
      the API sends, `https://yuvoy.in/e/<slug>`, dead link and all: the app
      must not follow it, and a mock that sent a working one would hide that.
    */
    const declined =
      state === "released" && record.declineReasonCode
        ? {
            cancellation: {
              reasonCode: record.declineReasonCode,
              message: declineSentence(record.declineReasonCode),
              nextDeparture: {
                ...marketDayFromNow(3, "09:00"),
                timezone: "Asia/Kolkata",
                bookUrl: "https://yuvoy.in/e/try-dive-nemo-reef",
              },
            },
          }
        : {};

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
          /*
            Both required by the contract and both absent here until the
            redesign put the listing's picture on this page (3 Oct 2026): a
            field the mock never sends is a screen the suite never draws.
          */
          operatorSlug: "sample-dive-operator",
          heroImageUrl:
            EXPERIENCE_DETAIL["try-dive-nemo-reef"]?.heroMedia?.posterUrl ??
            null,
        },
        slot: {
          startsAt: SLOT_STARTS_AT,
          timezone: "Asia/Kolkata",
        },
        price: { totalPaise: 450000 * record.guests, currency: "INR" },
        ...declined,
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
        ...mockCheckIn(
          scenario,
          state,
          record.cashBookingReference ?? record.reference,
        ),
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
    // As sign-in: a closed account, refused once the code checks out.
    if (scenarioOf(request) === "account-deletion-pending") {
      return envelope(
        "account_deletion_pending",
        // The API's own words (yuvoy-api handler/account_deletion.go).
        "Your account is being deleted, so you cannot sign in. If you did not mean to close it, contact support.",
        403,
      );
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
];
