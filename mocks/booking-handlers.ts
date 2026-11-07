import { http, HttpResponse } from "msw";
import { mockHeaders, mockNow } from "./fixtures";
import {
  envelope,
  paymentHandlers,
  recordFor,
  reservations,
  rid,
  scenarioOf,
  url,
} from "./booking-support";
import { closedReasonFor, conversation } from "./booking-answers";
import {
  SEEDED_SUPPORT_REQUESTS,
  type SupportTopic,
  publicSupportRequest,
  supportRequests,
} from "./booking-account";
import { LISTED_TRIPS } from "./booking-trips";
import { reservationHandlers } from "./booking-handlers-reserve";
import { statusHandlers } from "./booking-handlers-status";
import { messageHandlers } from "./booking-handlers-messages";
import { authHandlers } from "./booking-handlers-auth";
import { inviteHandlers } from "./booking-handlers-invites";

export { MOCK_INVITE_CODES } from "./booking-account";
export { __resetBookingMocks } from "./booking-handlers-invites";

/**
 * The money loop, mocked.
 *
 * This file carries more scenario switches than the catalog one because the
 * states that matter here are the ones that only happen when something goes
 * wrong — a hold expiring mid-payment, a declared medical condition, a
 * duplicate submit, a payment app that never comes back. None of them is
 * reachable on demand against a real backend.
 */

export const bookingHandlers = [
  ...reservationHandlers,
  ...paymentHandlers,
  ...statusHandlers,
  ...messageHandlers,
  ...authHandlers,
  ...inviteHandlers,

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
        experienceId: "exp_try_dive",
        experienceSlug: "try-dive-nemo-reef",
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
