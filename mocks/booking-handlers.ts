import { http, HttpResponse, delay } from "msw";
import { EXPERIENCE_DETAIL, availabilityFor } from "./fixtures";

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
    { status, headers: { "x-request-id": rid() } },
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
        headers: { "Idempotent-Replay": "true", "x-request-id": rid() },
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
        : new Date(Date.now() + 10 * 60_000).toISOString(),
      requestExpiresAt: isRequest
        ? new Date(Date.now() + 2 * 60 * 60_000).toISOString()
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
      headers: { "x-request-id": rid() },
    });
  }),

  http.post(url("/reservations/:id/release"), async ({ params }) => {
    reservations.delete(String(params.id));
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

      // The default in development, and what production answers today: no
      // processor is chosen yet.
      if (scenario !== "payments-ready") {
        return envelope(
          "payments_unavailable",
          "No payment processor is configured.",
          503,
        );
      }

      return HttpResponse.json(
        {
          state: "ready",
          orderId: `ord_${record.reservationId}`,
          providerOrderId: `provider_${record.reservationId}`,
          provider: "mock",
          amountPaise: 450000 * record.guests,
          currency: "INR",
          // The HOLD's deadline, not a separate payment clock.
          expiresAt: record.holdExpiresAt,
        },
        { status: 201, headers: { "x-request-id": rid() } },
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
        bookingReference: record.reference,
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
      { headers: { "x-request-id": rid() } },
    );
  }),
  /* --------------------------------------------------------- recovery */

  // 202 for EVERY number, whether or not it booked. A different answer would
  // turn this into a way to test whether a phone number has a Yuvoy booking.
  http.post(url("/bookings/recovery/request"), async () =>
    HttpResponse.json(
      { devCode: "123456" },
      { status: 202, headers: { "x-request-id": rid() } },
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
      { headers: { "x-request-id": rid() } },
    );
  }),
];

/** Test-only: forget every reservation between cases. */
export function __resetBookingMocks(): void {
  reservations.clear();
  byToken.clear();
  idempotent.clear();
}
