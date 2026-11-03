import { describe, it, expect, beforeEach } from "vitest";
import { act, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { renderWithQuery } from "@/test/render";
import { BookingScreen } from "./booking-screen";
import { server } from "../../../mocks/server";
import { http, HttpResponse } from "msw";
import { registerPaymentAdapter } from "@/lib/booking/payment-handoff";

const BASE = process.env.NEXT_PUBLIC_API_URL ?? "http://localhost:8099/v1";

function setHash(hash: string) {
  window.location.hash = hash;
}

function statusBody(over: Record<string, unknown> = {}) {
  return {
    reservationId: "res_1",
    state: "confirmed",
    final: true,
    guests: 2,
    contactName: "Asha Menon",
    bookingReference: "YV-4K2M9P7Q",
    experience: {
      slug: "try-dive-nemo-reef",
      title: "Try-dive at Nemo Reef",
      operator: "Sample Dive Operator",
    },
    slot: { startsAt: "2026-08-22T01:30:00Z", timezone: "Asia/Kolkata" },
    price: { totalPaise: 900000, currency: "INR" },
    ...over,
  };
}

beforeEach(() => setHash("#t=tok_test"));

/*
  PAYING THE OPERATOR IN CASH — yuvoy-app#29.

  Until a processor is live this is the ONLY way a booking can be finished.
  Before it, checkout reached the payment step, rendered "payment is coming
  soon" and stopped, and the held seats lapsed fifteen minutes later — so
  nothing in the app could be booked to completion at all.
*/
describe("finishing a booking in cash", () => {
  const payAtCounter = {
    available: true,
    confirmAt: "/v1/reservations/res_1/cash-booking",
  };

  function holding(over: Record<string, unknown> = {}) {
    return statusBody({
      state: "holding",
      final: false,
      holdExpiresAt: new Date(Date.now() + 600_000).toISOString(),
      bookingReference: undefined,
      ...over,
    });
  }

  /*
    CASH LEADS (the approved redesign, 3 Oct 2026). The ways to pay used to be
    in the answer to a "Pay" button, so cash, the only way that finishes, came
    second, after a button that could not take the money. The page asks on
    arrival now and offers what works, in the order it works.
  */
  const ready = (over: Record<string, unknown> = {}) => ({
    state: "ready",
    orderId: "ord_1",
    providerOrderId: "p_1",
    provider: "razorpay",
    amountPaise: 900000,
    currency: "INR",
    expiresAt: new Date(Date.now() + 600_000).toISOString(),
    payAtCounter,
    ...over,
  });

  it("leads with cash, and offers no Pay button this build cannot open", async () => {
    // Production's shape: `ready`, for a provider this build has no adapter for.
    server.use(
      http.get(`${BASE}/bookings/status`, () => HttpResponse.json(holding())),
      http.post(`${BASE}/reservations/res_1/payment-order`, () =>
        HttpResponse.json(ready(), { status: 201 }),
      ),
    );
    renderWithQuery(<BookingScreen />);

    expect(
      await screen.findByRole("button", { name: /Book now, pay ₹9,000 cash/i }),
    ).toBeEnabled();
    expect(screen.queryByRole("button", { name: /^Pay/ })).toBeNull();
    expect(
      screen.getByText(/Paying by card or UPI is not open in this version/),
    ).toBeInTheDocument();
  });

  it("asks how it can be paid once, on arrival, without a tap", async () => {
    let asked = 0;
    server.use(
      http.get(`${BASE}/bookings/status`, () => HttpResponse.json(holding())),
      http.post(`${BASE}/reservations/res_1/payment-order`, () => {
        asked += 1;
        return HttpResponse.json(ready(), { status: 201 });
      }),
    );
    renderWithQuery(<BookingScreen />);
    await screen.findByRole("button", { name: /Book now, pay/i });
    await new Promise((r) => setTimeout(r, 50));
    // Idempotent per reservation, so asking is safe; once is still enough.
    expect(asked).toBe(1);
  });

  it("offers card beside cash where this build can open the provider", async () => {
    const opened: unknown[] = [];
    const unregister = registerPaymentAdapter("mockpay", async (order) => {
      opened.push(order);
    });
    try {
      let asked = 0;
      server.use(
        http.get(`${BASE}/bookings/status`, () => HttpResponse.json(holding())),
        http.post(`${BASE}/reservations/res_1/payment-order`, () => {
          asked += 1;
          return HttpResponse.json(ready({ provider: "mockpay" }), {
            status: 201,
          });
        }),
      );
      const user = userEvent.setup();
      renderWithQuery(<BookingScreen />);

      const cashButton = await screen.findByRole("button", {
        name: /Book now, pay ₹9,000 cash/i,
      });
      const cardButton = screen.getByRole("button", { name: "Pay ₹9,000 now" });
      // Cash first, in the order that works.
      expect(
        cashButton.compareDocumentPosition(cardButton) &
          Node.DOCUMENT_POSITION_FOLLOWING,
      ).toBeTruthy();

      // The tap asks again, so a lapsed order is never the one opened.
      await user.click(cardButton);
      await waitFor(() => expect(opened).toHaveLength(1));
      expect(asked).toBe(2);
    } finally {
      unregister();
    }
  });

  it("lets the cash label take two lines rather than run off the pill", async () => {
    server.use(
      http.get(`${BASE}/bookings/status`, () => HttpResponse.json(holding())),
      http.post(`${BASE}/reservations/res_1/payment-order`, () =>
        HttpResponse.json(ready(), { status: 201 }),
      ),
    );
    renderWithQuery(<BookingScreen />);
    const cashButton = await screen.findByRole("button", {
      name: /Book now, pay/i,
    });
    expect(cashButton.className).toMatch(/\bwhitespace-normal\b/);
    expect(cashButton.className).not.toMatch(/\bwhitespace-nowrap\b/);
  });

  it("offers cash on the `coming_soon` answer, with the amount in the button", async () => {
    server.use(
      http.get(`${BASE}/bookings/status`, () => HttpResponse.json(holding())),
      http.post(`${BASE}/reservations/res_1/payment-order`, () =>
        HttpResponse.json({
          state: "coming_soon",
          message: "Card and UPI are opening shortly.",
          holdStillActive: true,
          payAtCounter,
        }),
      ),
    );

    renderWithQuery(<BookingScreen />);

    /*
      The amount is in the button on purpose: "a traveller deciding whether to
      commit wants to know what they are committing to, and 'pay on the day'
      without a number reads as a trap."
    */
    expect(
      await screen.findByRole("button", { name: /Book now, pay ₹9,000 cash/i }),
    ).toBeInTheDocument();
  });

  it("offers cash on the `ready` answer too — production returns that one", async () => {
    /*
      The correction on the issue: branching on `state === "coming_soon"` would
      have hidden the option exactly where a processor is configured, which is
      production. The test is that presence, not state, is what decides.
    */
    server.use(
      http.get(`${BASE}/bookings/status`, () => HttpResponse.json(holding())),
      http.post(`${BASE}/reservations/res_1/payment-order`, () =>
        HttpResponse.json(
          {
            state: "ready",
            orderId: "ord_1",
            providerOrderId: "p_1",
            provider: "mock",
            amountPaise: 900000,
            currency: "INR",
            expiresAt: new Date(Date.now() + 600_000).toISOString(),
            payAtCounter,
          },
          { status: 201 },
        ),
      ),
    );

    renderWithQuery(<BookingScreen />);

    expect(
      await screen.findByRole("button", { name: /Book now, pay ₹9,000 cash/i }),
    ).toBeInTheDocument();
  });

  it("does not offer cash when the API does not — that is the off switch", async () => {
    server.use(
      http.get(`${BASE}/bookings/status`, () => HttpResponse.json(holding())),
      http.post(`${BASE}/reservations/res_1/payment-order`, () =>
        HttpResponse.json({
          state: "coming_soon",
          message: "Payment opens shortly.",
          holdStillActive: true,
        }),
      ),
    );

    renderWithQuery(<BookingScreen />);

    await screen.findByText(/Payment opens shortly/);
    expect(
      screen.queryByRole("button", { name: /Book now, pay/i }),
    ).not.toBeInTheDocument();
  });

  it("gives the reference, the amount to bring, and where — in the operator's favour", async () => {
    const sentWith: string[] = [];
    server.use(
      http.get(`${BASE}/bookings/status`, () =>
        HttpResponse.json(
          holding({
            meetingPoint: { text: "Havelock Jetty, gate 2" },
          }),
        ),
      ),
      http.post(`${BASE}/reservations/res_1/payment-order`, ({ request }) => {
        sentWith.push(`order ${request.headers.get("authorization")}`);
        return HttpResponse.json({
          state: "coming_soon",
          message: "Card and UPI are opening shortly.",
          holdStillActive: true,
          payAtCounter,
        });
      }),
      http.post(`${BASE}/reservations/res_1/cash-booking`, ({ request }) => {
        sentWith.push(`cash ${request.headers.get("authorization")}`);
        return HttpResponse.json(
          {
            bookingReference: "YV-8F3K2A",
            state: "paid_pending_ops",
            payAtCounterPaise: 900000,
            currency: "INR",
          },
          { status: 201 },
        );
      }),
    );

    const user = userEvent.setup();
    renderWithQuery(<BookingScreen />);
    await user.click(
      await screen.findByRole("button", { name: /Book now, pay/i }),
    );

    // The reference is what gets said out loud at a jetty.
    const booked = (await screen.findByText("YV-8F3K2A")).closest("div")!;
    // An instruction, not a balance.
    expect(
      within(booked).getByText(/Bring ₹9,000 in cash/),
    ).toBeInTheDocument();
    /*
      Scoped to the success panel: the meeting point also renders in the
      details below, and asserting on the page would pass whether or not this
      panel carried it — which is the half that matters at a jetty.
    */
    expect(
      within(booked).getByText(/Havelock Jetty, gate 2/),
    ).toBeInTheDocument();

    /*
      "Pay the operator", never "pay Yuvoy" or "amount due" — the money never
      reaches us. And never "unpaid" or "pending payment": it is a confirmed
      seat on a boat.
    */
    expect(within(booked).getByText(/Pay the operator/i)).toBeInTheDocument();
    expect(screen.queryByText(/pay Yuvoy|amount due/i)).not.toBeInTheDocument();
    expect(
      screen.queryByText(/unpaid|pending payment/i),
    ).not.toBeInTheDocument();
    // The question on arrival and the booking, each with the page's link (yuvoy-api#369).
    expect(sentWith).toEqual(["order Bearer tok_test", "cash Bearer tok_test"]);
  });

  it("sends each hold its own link: a second hold opened in the same tab", async () => {
    const orders: string[] = [];
    server.use(
      http.get(`${BASE}/bookings/status`, ({ request }) => {
        const second =
          request.headers.get("authorization") === "Bearer tok_second";
        return HttpResponse.json(
          holding({ reservationId: second ? "res_2" : "res_1" }),
        );
      }),
      http.post(
        `${BASE}/reservations/:id/payment-order`,
        ({ params, request }) => {
          orders.push(`${params.id} ${request.headers.get("authorization")}`);
          return HttpResponse.json(ready(), { status: 201 });
        },
      ),
    );
    renderWithQuery(<BookingScreen />);
    await waitFor(() => expect(orders).toEqual(["res_1 Bearer tok_test"]));
    act(() => setHash("#t=tok_second"));
    await waitFor(() =>
      expect(orders).toEqual([
        "res_1 Bearer tok_test",
        "res_2 Bearer tok_second",
      ]),
    );
  });

  it("renders a 200 retry exactly like the 201 — the same booking", async () => {
    /*
      "A phone loses signal mid-request and the traveller taps again. That is
      the correct instinct and must not be punished." Same booking, not a new
      one, and not an error.
    */
    server.use(
      http.get(`${BASE}/bookings/status`, () => HttpResponse.json(holding())),
      http.post(`${BASE}/reservations/res_1/payment-order`, () =>
        HttpResponse.json({
          state: "coming_soon",
          message: "…",
          holdStillActive: true,
          payAtCounter,
        }),
      ),
      http.post(`${BASE}/reservations/res_1/cash-booking`, () =>
        HttpResponse.json(
          {
            bookingReference: "YV-8F3K2A",
            state: "paid_pending_ops",
            payAtCounterPaise: 900000,
            currency: "INR",
          },
          { status: 200 },
        ),
      ),
    );

    const user = userEvent.setup();
    renderWithQuery(<BookingScreen />);
    await user.click(
      await screen.findByRole("button", { name: /Book now, pay/i }),
    );

    expect(await screen.findByText("YV-8F3K2A")).toBeInTheDocument();
    expect(screen.getByText(/You.{1,3}re booked/)).toBeInTheDocument();
    expect(screen.queryByRole("alert")).not.toBeInTheDocument();
  });

  it("says start again on a 409, rather than a dead button", async () => {
    server.use(
      http.get(`${BASE}/bookings/status`, () => HttpResponse.json(holding())),
      http.post(`${BASE}/reservations/res_1/payment-order`, () =>
        HttpResponse.json({
          state: "coming_soon",
          message: "…",
          holdStillActive: true,
          payAtCounter,
        }),
      ),
      http.post(`${BASE}/reservations/res_1/cash-booking`, () =>
        HttpResponse.json(
          {
            error: {
              code: "reservation_not_payable",
              message: "That hold has ended. Pick a departure again.",
            },
          },
          { status: 409 },
        ),
      ),
    );

    const user = userEvent.setup();
    renderWithQuery(<BookingScreen />);
    await user.click(
      await screen.findByRole("button", { name: /Book now, pay/i }),
    );

    expect(await screen.findByRole("alert")).toBeInTheDocument();
    expect(screen.queryByText("YV-8F3K2A")).not.toBeInTheDocument();
  });
});
