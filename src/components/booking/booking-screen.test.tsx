import { describe, it, expect, beforeEach } from "vitest";
import { screen, waitFor, within } from "@testing-library/react";
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

describe("BookingScreen", () => {
  it("renders a confirmed booking with everything needed for the day", async () => {
    server.use(
      http.get(`${BASE}/bookings/status`, () =>
        HttpResponse.json(statusBody()),
      ),
    );

    renderWithQuery(<BookingScreen />);

    expect(await screen.findByText("You are going")).toBeInTheDocument();
    // The reference is what gets read aloud on a jetty.
    expect(screen.getByText("YV-4K2M9P7Q")).toBeInTheDocument();
    // Rendered in the MARKET's zone: 01:30Z is 07:00 IST.
    expect(
      screen.getByText(/07:00 on Saturday, 22 August/),
    ).toBeInTheDocument();
    expect(screen.getByText("₹9,000")).toBeInTheDocument();
  });

  it("NEVER renders verifying as a failure", async () => {
    server.use(
      http.get(`${BASE}/bookings/status`, () =>
        HttpResponse.json(
          statusBody({
            state: "verifying",
            final: false,
            bookingReference: undefined,
          }),
        ),
      ),
    );

    renderWithQuery(<BookingScreen />);

    // "If money left your account it is safe" is the only honest copy here.
    expect(
      await screen.findByText("Confirming your payment"),
    ).toBeInTheDocument();
    expect(screen.getByText(/it is safe/i)).toBeInTheDocument();
    /*
      No number and no countdown. yuvoy-api#53 confirmed `verifying` is a race
      window of milliseconds to seconds, not a waiting room — nothing in the
      system bounds it, so publishing a figure would publish a promise nothing
      keeps.
    */
    expect(screen.queryByRole("timer")).not.toBeInTheDocument();
    // Nothing that reads as an error.
    expect(screen.queryByRole("alert")).not.toBeInTheDocument();
    expect(screen.queryByText(/failed|error|wrong/i)).not.toBeInTheDocument();
  });

  it("shows a countdown ONLY while holding", async () => {
    server.use(
      http.get(`${BASE}/bookings/status`, () =>
        HttpResponse.json(
          statusBody({
            state: "holding",
            final: false,
            bookingReference: undefined,
            holdExpiresAt: new Date(Date.now() + 300_000).toISOString(),
          }),
        ),
      ),
    );

    renderWithQuery(<BookingScreen />);
    expect(await screen.findByRole("timer")).toBeInTheDocument();
  });

  it("shows no countdown beside a dead booking", async () => {
    // holdExpiresAt is absent in every state but `holding`, precisely so a
    // clock is never rendered next to an expired one.
    server.use(
      http.get(`${BASE}/bookings/status`, () =>
        HttpResponse.json(
          statusBody({ state: "expired", final: true, holdExpiresAt: null }),
        ),
      ),
    );

    renderWithQuery(<BookingScreen />);
    expect(await screen.findByText("The hold ran out")).toBeInTheDocument();
    expect(screen.queryByRole("timer")).not.toBeInTheDocument();
  });

  it("treats payments_unavailable as calm and truthful, not a crash", async () => {
    server.use(
      http.get(`${BASE}/bookings/status`, () =>
        HttpResponse.json(
          statusBody({
            state: "holding",
            final: false,
            bookingReference: undefined,
            holdExpiresAt: new Date(Date.now() + 300_000).toISOString(),
          }),
        ),
      ),
      http.post(`${BASE}/reservations/:id/payment-order`, () =>
        HttpResponse.json(
          {
            error: {
              code: "payments_unavailable",
              message: "raw",
              requestId: "01JPAY",
            },
          },
          { status: 503 },
        ),
      ),
    );

    renderWithQuery(<BookingScreen />);
    (await screen.findByRole("button", { name: /^Pay/ })).click();

    await waitFor(() =>
      expect(
        screen.getByText("Payment is not available yet"),
      ).toBeInTheDocument(),
    );
    // Says explicitly that nothing was charged — the traveller's real question.
    expect(screen.getByText(/Nothing has been charged/i)).toBeInTheDocument();
    expect(screen.getByText("01JPAY")).toBeInTheDocument();
    expect(screen.queryByText("raw")).not.toBeInTheDocument();
  });

  it("shows refund progress on a declined booking without being asked", async () => {
    server.use(
      http.get(`${BASE}/bookings/status`, () =>
        HttpResponse.json(
          statusBody({
            state: "declined",
            final: true,
            refund: {
              state: "pending",
              amountPaise: 900000,
              message: "Your refund is with your bank.",
            },
          }),
        ),
      ),
    );

    renderWithQuery(<BookingScreen />);

    expect(
      await screen.findByText("We could not get you the seat"),
    ).toBeInTheDocument();
    expect(screen.getByText("Your refund")).toBeInTheDocument();
    // Prefer the server's ready-to-render copy over ours.
    expect(
      screen.getByText("Your refund is with your bank."),
    ).toBeInTheDocument();
    expect(
      screen.getByText(/You do not need to ask for it/i),
    ).toBeInTheDocument();
  });

  it("tells the truth when a refund has failed, and promises a human", async () => {
    server.use(
      http.get(`${BASE}/bookings/status`, () =>
        HttpResponse.json(
          statusBody({
            state: "cancelled",
            final: true,
            refund: { state: "failed", amountPaise: 900000 },
          }),
        ),
      ),
    );

    renderWithQuery(<BookingScreen />);
    expect(
      await screen.findByText(/someone is on it and will message you/i),
    ).toBeInTheDocument();
  });

  it("explains itself when there is no token in the link", async () => {
    setHash("");
    renderWithQuery(<BookingScreen />);
    expect(
      await screen.findByText("We need your booking link"),
    ).toBeInTheDocument();
  });
});

/* ------------------------------------------------------------ T8 · Pay */

/**
 * Both answers the contract gives are rendered. The first version read only
 * `order.error`: a `200 coming_soon` — what production answers today, with a
 * message the screen is told to render — produced nothing, and the mock hid
 * it by answering an uncontracted 503.
 */
describe("PayButton — both contract answers", () => {
  const holding = () =>
    statusBody({
      state: "holding",
      final: false,
      bookingReference: undefined,
      holdExpiresAt: new Date(Date.now() + 300_000).toISOString(),
    });

  it("renders coming_soon calmly, message and all, with the countdown still running", async () => {
    server.use(
      http.get(`${BASE}/bookings/status`, () => HttpResponse.json(holding())),
      http.post(`${BASE}/reservations/:id/payment-order`, () =>
        HttpResponse.json(
          {
            state: "coming_soon",
            message: "Payment opens shortly. Your seats are held.",
            holdStillActive: true,
          },
          { status: 200 },
        ),
      ),
    );

    renderWithQuery(<BookingScreen />);
    (await screen.findByRole("button", { name: /^Pay/ })).click();

    expect(
      await screen.findByText("Payment opens shortly. Your seats are held."),
    ).toBeInTheDocument();
    expect(screen.getByText("Payment is not open yet")).toBeInTheDocument();
    // "Do not treat this as an error": nothing red, the hold clock stays.
    expect(screen.queryByRole("alert")).not.toBeInTheDocument();
    expect(screen.getByRole("timer")).toBeInTheDocument();
    expect(screen.getByText(/Nothing has been charged/)).toBeInTheDocument();
  });

  /*
    A checkout that cannot be finished, and whether the traveller can get out
    of it (yuvoy-app#19 §3).

    Both codes end the same way — the seat is gone and the only move is picking
    a departure again — and the Pay button is the only control on this screen.
    Copy that says "pick a departure again" with nothing to tap is a dead end
    with instructions written on it.
  */
  for (const [code, why] of [
    ["operator_not_bookable", "the operator stopped selling mid-checkout"],
    ["reservation_not_payable", "the hold lapsed"],
  ] as const) {
    it(`offers the way back to dates when ${why}`, async () => {
      server.use(
        http.get(`${BASE}/bookings/status`, () => HttpResponse.json(holding())),
        http.post(`${BASE}/reservations/:id/payment-order`, () =>
          HttpResponse.json(
            {
              error: { code, message: "raw server copy", requestId: "01JPAY" },
            },
            { status: code === "operator_not_bookable" ? 503 : 409 },
          ),
        ),
      );

      renderWithQuery(<BookingScreen />);
      (await screen.findByRole("button", { name: /^Pay/ })).click();

      const back = await screen.findByRole("link", { name: "See other dates" });
      // Straight to the listing's own dates, not to a generic browse.
      expect(back).toHaveAttribute("href", "/e/try-dive-nemo-reef");
      // Branch on code, never on message.
      expect(screen.queryByText("raw server copy")).not.toBeInTheDocument();
      // requestId always visible.
      expect(screen.getByText("01JPAY")).toBeInTheDocument();
    });
  }

  it("does not offer other dates for a failure that is not a dead end", async () => {
    /*
      `payments_unavailable` is a deliberate stop that says nothing about the
      hold — the seats are still held and the clock is still running. Sending
      that traveller back to the dates would throw away a live reservation.
    */
    server.use(
      http.get(`${BASE}/bookings/status`, () => HttpResponse.json(holding())),
      http.post(`${BASE}/reservations/:id/payment-order`, () =>
        HttpResponse.json(
          {
            error: {
              code: "payments_unavailable",
              message: "no processor",
              requestId: "01JPAY2",
            },
          },
          { status: 503 },
        ),
      ),
    );

    renderWithQuery(<BookingScreen />);
    (await screen.findByRole("button", { name: /^Pay/ })).click();

    expect(
      await screen.findByText("Payment is not available yet"),
    ).toBeInTheDocument();
    expect(
      screen.queryByRole("link", { name: "See other dates" }),
    ).not.toBeInTheDocument();
    // The hold is untouched, so the clock stays on screen.
    expect(screen.getByRole("timer")).toBeInTheDocument();
  });

  it("hands a ready order to the provider's adapter", async () => {
    const opened: unknown[] = [];
    const unregister = registerPaymentAdapter("mockpay", async (order) => {
      opened.push(order);
    });
    try {
      server.use(
        http.get(`${BASE}/bookings/status`, () => HttpResponse.json(holding())),
        http.post(`${BASE}/reservations/:id/payment-order`, () =>
          HttpResponse.json(
            {
              state: "ready",
              orderId: "ord_1",
              providerOrderId: "p_1",
              provider: "mockpay",
              amountPaise: 900000,
              currency: "INR",
              expiresAt: new Date(Date.now() + 300_000).toISOString(),
            },
            { status: 201 },
          ),
        ),
      );

      renderWithQuery(<BookingScreen />);
      (await screen.findByRole("button", { name: /^Pay/ })).click();

      await waitFor(() => expect(opened).toHaveLength(1));
      expect(opened[0]).toMatchObject({
        orderId: "ord_1",
        provider: "mockpay",
      });
      expect(
        await screen.findByText(/Opening payment with mockpay/),
      ).toBeInTheDocument();
    } finally {
      unregister();
    }
  });

  it("says plainly when this build cannot open a ready order, and that nothing was charged", async () => {
    server.use(
      http.get(`${BASE}/bookings/status`, () => HttpResponse.json(holding())),
      http.post(`${BASE}/reservations/:id/payment-order`, () =>
        HttpResponse.json(
          {
            state: "ready",
            orderId: "ord_2",
            providerOrderId: "p_2",
            provider: "razorpay",
            amountPaise: 900000,
            currency: "INR",
            expiresAt: new Date(Date.now() + 300_000).toISOString(),
          },
          { status: 201 },
        ),
      ),
    );

    renderWithQuery(<BookingScreen />);
    (await screen.findByRole("button", { name: /^Pay/ })).click();

    expect(
      await screen.findByText(/Your order is ready: ₹9,000/),
    ).toBeInTheDocument();
    expect(
      screen.getByText(/cannot open the razorpay payment page yet/),
    ).toBeInTheDocument();
    expect(screen.getByText(/Nothing has been charged/)).toBeInTheDocument();
    // Still not an error — the hold is real and the clock is honest.
    expect(screen.queryByRole("alert")).not.toBeInTheDocument();
  });
});

/* ------------------------------------------------------ a dead link */

describe("a dead link", () => {
  it("offers a new link instead of a retry that can never work", async () => {
    server.use(
      http.get(`${BASE}/bookings/status`, () =>
        HttpResponse.json(
          {
            error: {
              code: "token_expired",
              message: "raw",
              requestId: "01JEXP",
            },
          },
          { status: 401 },
        ),
      ),
    );

    renderWithQuery(<BookingScreen />);

    expect(
      await screen.findByText("This link has expired"),
    ).toBeInTheDocument();
    expect(
      screen.getByRole("link", { name: "Get a new link" }),
    ).toHaveAttribute("href", "/trips/recover");
    expect(
      screen.queryByRole("button", { name: "Try again" }),
    ).not.toBeInTheDocument();
    // A 401 while online is not "offline": no saved booking is dressed up as one.
    expect(screen.queryByText(/You are offline/)).not.toBeInTheDocument();
    expect(screen.getByText("01JEXP")).toBeInTheDocument();
  });

  it("treats a plain 401 the same way — a revoked link looks unknown on purpose", async () => {
    server.use(
      http.get(`${BASE}/bookings/status`, () =>
        HttpResponse.json(
          { error: { code: "unauthorized", message: "raw" } },
          { status: 401 },
        ),
      ),
    );

    renderWithQuery(<BookingScreen />);

    expect(
      await screen.findByText("This link no longer opens anything"),
    ).toBeInTheDocument();
    expect(
      screen.getByRole("link", { name: "Get a new link" }),
    ).toBeInTheDocument();
  });
});

/* ------------------------------------------ what the operator said */

describe("operator updates", () => {
  it("renders operatorUpdates — where a relay note lands, and nowhere else", async () => {
    server.use(
      http.get(`${BASE}/bookings/status`, () =>
        HttpResponse.json(
          statusBody({
            operatorUpdates: [
              {
                intent: "meeting_point_change",
                detail: "Jetty 2, not Jetty 1",
                note: "The usual spot is under repair this week.",
                sentAt: "2026-08-21T10:15:00Z",
              },
              {
                intent: "bring_item",
                detail: "A towel",
                sentAt: "2026-08-21T10:16:00Z",
              },
            ],
          }),
        ),
      ),
    );

    renderWithQuery(<BookingScreen />);

    expect(await screen.findByText("From the operator")).toBeInTheDocument();
    expect(
      screen.getByText("Meeting point changed: Jetty 2, not Jetty 1"),
    ).toBeInTheDocument();
    expect(
      screen.getByText("The usual spot is under repair this week."),
    ).toBeInTheDocument();
    expect(screen.getByText("Bring: A towel")).toBeInTheDocument();
    // Sent 10:15Z = 15:45 IST, in the market's zone.
    expect(screen.getByText(/15:45/)).toBeInTheDocument();
  });
});

/* ----------------------------------------------------- giving it back */

describe("giving the seats back", () => {
  it("releases a hold in two taps and lands on what the server says", async () => {
    let released = false;
    server.use(
      http.get(`${BASE}/bookings/status`, () =>
        HttpResponse.json(
          released
            ? statusBody({ state: "released", final: true })
            : statusBody({
                state: "holding",
                final: false,
                bookingReference: undefined,
                holdExpiresAt: new Date(Date.now() + 300_000).toISOString(),
              }),
        ),
      ),
      http.post(`${BASE}/reservations/:id/release`, () => {
        released = true;
        return new HttpResponse(null, { status: 204 });
      }),
    );

    renderWithQuery(<BookingScreen />);
    (
      await screen.findByRole("button", { name: "Give these seats back" })
    ).click();
    // The first tap only asks.
    expect(
      await screen.findByText("Give these seats back?"),
    ).toBeInTheDocument();
    expect(released).toBe(false);

    screen.getByRole("button", { name: "Yes, let them go" }).click();
    expect(
      await screen.findByText("This booking was let go"),
    ).toBeInTheDocument();
    expect(released).toBe(true);
  });

  it("withdraws a request with its own words", async () => {
    server.use(
      http.get(`${BASE}/bookings/status`, () =>
        HttpResponse.json(
          statusBody({
            state: "awaiting_operator",
            final: false,
            bookingReference: undefined,
          }),
        ),
      ),
    );

    renderWithQuery(<BookingScreen />);
    (
      await screen.findByRole("button", { name: "Withdraw the request" })
    ).click();
    expect(
      await screen.findByText("Withdraw this request?"),
    ).toBeInTheDocument();
    expect(
      screen.getByText(/Nothing has been charged, and you can ask again/),
    ).toBeInTheDocument();
  });
});

/*
  yuvoy-app#22 — three fields that have been on `GET /bookings/status` and
  rendered nowhere. This is the screen somebody opens at 5:40am on the morning
  of a trip, and the screen they refresh while an operator decides.
*/
describe("BookingScreen — the day's facts", () => {
  it("says where to meet", async () => {
    server.use(
      http.get(`${BASE}/bookings/status`, () =>
        HttpResponse.json(
          statusBody({
            meetingPoint: {
              text: "Jetty 2, Havelock",
              landmark: "Beside the dive shop",
            },
          }),
        ),
      ),
    );

    renderWithQuery(<BookingScreen />);

    expect(await screen.findByText("Jetty 2, Havelock")).toBeInTheDocument();
    expect(screen.getByText("Beside the dive shop")).toBeInTheDocument();
  });

  it("renders no row at all when the meeting point is empty", async () => {
    // The read path coerces a NULL column to "", so the key is present and
    // useless — the one shape optional chaining does not catch (yuvoy-app#25).
    server.use(
      http.get(`${BASE}/bookings/status`, () =>
        HttpResponse.json(statusBody({ meetingPoint: { text: "  " } })),
      ),
    );

    renderWithQuery(<BookingScreen />);

    expect(await screen.findByText("You are going")).toBeInTheDocument();
    expect(screen.queryByText("Where you meet")).toBeNull();
  });

  describe("a cancelled trip says why", () => {
    function cancelled(reasonCode?: string) {
      return statusBody({
        state: "cancelled",
        final: true,
        cancellation: reasonCode ? { reasonCode } : undefined,
      });
    }

    it("names the actual reason instead of guessing at the weather", async () => {
      server.use(
        http.get(`${BASE}/bookings/status`, () =>
          HttpResponse.json(cancelled("CREDENTIAL_LAPSE")),
        ),
      );

      renderWithQuery(<BookingScreen />);

      expect(
        await screen.findByText("The operator's paperwork was not current."),
      ).toBeInTheDocument();
    });

    it("never prints the raw code at a traveller", async () => {
      server.use(
        http.get(`${BASE}/bookings/status`, () =>
          HttpResponse.json(cancelled("CREDENTIAL_LAPSE")),
        ),
      );

      renderWithQuery(<BookingScreen />);
      await screen.findByText("This trip was called off");
      expect(document.body.textContent).not.toMatch(/CREDENTIAL_LAPSE/);
    });

    it("drops the 'if the sea called it off' hedge", async () => {
      server.use(
        http.get(`${BASE}/bookings/status`, () =>
          HttpResponse.json(cancelled("OPERATOR_CANCELLED")),
        ),
      );

      renderWithQuery(<BookingScreen />);
      await screen.findByText("This trip was called off");
      expect(document.body.textContent).not.toMatch(
        /if the sea called it off/i,
      );
      // The refund fact beside it is true whatever the reason was, and stays.
      expect(
        screen.getByText(/refund has already started/i),
      ).toBeInTheDocument();
    });

    it("treats the two names for a traveller cancellation as one event", async () => {
      // `TRAVELLER_REQUEST` and `CUSTOMER_REQUEST` are the same thing under
      // two names in the backend's own table. Neither may fall through.
      for (const code of ["TRAVELLER_REQUEST", "CUSTOMER_REQUEST"]) {
        server.use(
          http.get(`${BASE}/bookings/status`, () =>
            HttpResponse.json(cancelled(code)),
          ),
        );
        const { unmount } = renderWithQuery(<BookingScreen />);
        expect(
          await screen.findByText("You asked us to cancel."),
        ).toBeInTheDocument();
        unmount();
      }
    });

    it("has a sentence for a code it has never seen", async () => {
      // The set grows by INSERT on the server with no deploy here, so an
      // unmapped code is the expected steady state after any addition — not
      // an edge case. It must not render blank and must not render the token.
      server.use(
        http.get(`${BASE}/bookings/status`, () =>
          HttpResponse.json(cancelled("VOLCANO")),
        ),
      );

      renderWithQuery(<BookingScreen />);

      expect(
        await screen.findByText("The operator or we called it off."),
      ).toBeInTheDocument();
      expect(document.body.textContent).not.toMatch(/VOLCANO/);
    });

    it("says nothing at all when no reason came back", async () => {
      server.use(
        http.get(`${BASE}/bookings/status`, () =>
          HttpResponse.json(cancelled()),
        ),
      );

      renderWithQuery(<BookingScreen />);
      await screen.findByText("This trip was called off");
      expect(screen.queryByText(/called it off\./)).toBeNull();
    });
  });

  it("tells a waiting traveller how long the operator has", async () => {
    server.use(
      http.get(`${BASE}/bookings/status`, () =>
        HttpResponse.json(
          statusBody({
            state: "awaiting_operator",
            final: false,
            bookingReference: undefined,
            // 04:30Z is 10:00 IST — stated in the market's zone, like every
            // other time on this screen.
            requestExpiresAt: "2026-08-21T04:30:00Z",
          }),
        ),
      ),
    );

    renderWithQuery(<BookingScreen />);

    expect(
      await screen.findByText("The operator has until"),
    ).toBeInTheDocument();
    expect(screen.getByText(/10:00/)).toBeInTheDocument();
  });

  it("shows no deadline on a booking nobody is waiting on", async () => {
    // The API drops `requestExpiresAt` once the booking is final, so the key
    // being absent is already the answer — no state check needed here.
    server.use(
      http.get(`${BASE}/bookings/status`, () =>
        HttpResponse.json(statusBody()),
      ),
    );

    renderWithQuery(<BookingScreen />);

    expect(await screen.findByText("You are going")).toBeInTheDocument();
    expect(screen.queryByText("The operator has until")).toBeNull();
  });
});

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

    const user = userEvent.setup();
    renderWithQuery(<BookingScreen />);
    await user.click(await screen.findByRole("button", { name: /^Pay / }));

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

    const user = userEvent.setup();
    renderWithQuery(<BookingScreen />);
    await user.click(await screen.findByRole("button", { name: /^Pay / }));

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

    const user = userEvent.setup();
    renderWithQuery(<BookingScreen />);
    await user.click(await screen.findByRole("button", { name: /^Pay / }));

    await screen.findByText(/Payment opens shortly/);
    expect(
      screen.queryByRole("button", { name: /Book now, pay/i }),
    ).not.toBeInTheDocument();
  });

  it("gives the reference, the amount to bring, and where — in the operator's favour", async () => {
    server.use(
      http.get(`${BASE}/bookings/status`, () =>
        HttpResponse.json(
          holding({
            meetingPoint: { text: "Havelock Jetty, gate 2" },
          }),
        ),
      ),
      http.post(`${BASE}/reservations/res_1/payment-order`, () =>
        HttpResponse.json({
          state: "coming_soon",
          message: "Card and UPI are opening shortly.",
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
          { status: 201 },
        ),
      ),
    );

    const user = userEvent.setup();
    renderWithQuery(<BookingScreen />);
    await user.click(await screen.findByRole("button", { name: /^Pay / }));
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
    await user.click(await screen.findByRole("button", { name: /^Pay / }));
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
    await user.click(await screen.findByRole("button", { name: /^Pay / }));
    await user.click(
      await screen.findByRole("button", { name: /Book now, pay/i }),
    );

    expect(await screen.findByRole("alert")).toBeInTheDocument();
    expect(screen.queryByText("YV-8F3K2A")).not.toBeInTheDocument();
  });

  it("reads a cash booking as BOOKED, never as pending payment", async () => {
    /*
      `paid_pending_ops` is not in `BookingStatus.state`'s enum — the contract
      declares it only on `CashBooking` — and the API used to return it here.
      The screen dereferenced its state map unguarded, so this state took the
      whole page to the error boundary for somebody who had just committed
      money.

      Kept as a REGRESSION test even though D-034 stopped this endpoint sending
      it. The projection can move again, `/me/bookings` still carries the raw
      value, and the guard being exercised is "an undeclared state does not
      crash the page", which is true of every state and not only this one.

      "Both should read as booked to the traveller — the difference is our
      bookkeeping, not their standing."
    */
    server.use(
      http.get(`${BASE}/bookings/status`, () =>
        HttpResponse.json(
          statusBody({ state: "paid_pending_ops", final: false }),
        ),
      ),
    );

    renderWithQuery(<BookingScreen />);

    expect(await screen.findByText(/You.{1,3}re booked/)).toBeInTheDocument();
    expect(screen.getByText("YV-4K2M9P7Q")).toBeInTheDocument();
    expect(
      screen.queryByText(/unpaid|pending payment/i),
    ).not.toBeInTheDocument();
  });

  /**
   * What a cash booking still owes, after D-034 — yuvoy-app#29.
   *
   * `GET /bookings/status` now answers `confirmed` for a cash booking from the
   * moment it is made, and puts what is owed in `payment`. The app keyed on
   * `state === "paid_pending_ops"`, which is not in the enum and simply
   * stopped matching — so the screen said **"Paid ₹9,000"** to somebody who
   * had not handed over a rupee, and dropped the standing "Bring ₹9,000 in
   * cash" line that exists for the traveller reloading on the morning of the
   * trip.
   *
   * Nothing failed to compile and no test failed. These four are the ones that
   * would have.
   */
  describe("a cash booking that is confirmed but not collected", () => {
    const cashStatus = (collected: boolean) =>
      statusBody({
        state: "confirmed",
        final: true,
        payment: { method: "cash", collected, amountPaise: 900000 },
      });

    it("says what to bring, and does not call it paid", async () => {
      server.use(
        http.get(`${BASE}/bookings/status`, () =>
          HttpResponse.json(cashStatus(false)),
        ),
      );
      renderWithQuery(<BookingScreen />);

      expect(
        await screen.findByText(/Bring ₹9,000 in cash/),
      ).toBeInTheDocument();
      expect(screen.getByText("To pay on the day")).toBeInTheDocument();
      expect(screen.queryByText("Paid")).not.toBeInTheDocument();
    });

    it("keeps the wording the issue rules out", async () => {
      // Never "pay Yuvoy", never "amount due", never "unpaid" or "pending
      // payment": the money never reaches us and the seat is confirmed.
      server.use(
        http.get(`${BASE}/bookings/status`, () =>
          HttpResponse.json(cashStatus(false)),
        ),
      );
      renderWithQuery(<BookingScreen />);
      await screen.findByText(/Bring ₹9,000 in cash/);

      expect(
        screen.queryByText(/pay Yuvoy|amount due|unpaid|pending payment/i),
      ).not.toBeInTheDocument();
      expect(screen.getByText(/Pay the operator/i)).toBeInTheDocument();
    });

    it("stops saying it once the operator records taking the cash", async () => {
      /*
        The half that keying on the object's mere presence would get wrong,
        pointing the other way: "Bring ₹9,000 in cash" left on the screen of
        somebody who has already paid is the same class of untruth.
      */
      server.use(
        http.get(`${BASE}/bookings/status`, () =>
          HttpResponse.json(cashStatus(true)),
        ),
      );
      renderWithQuery(<BookingScreen />);

      expect(await screen.findByText("Paid")).toBeInTheDocument();
      expect(screen.queryByText(/Bring ₹/)).not.toBeInTheDocument();
      expect(screen.queryByText("To pay on the day")).not.toBeInTheDocument();
    });

    it("leaves a CARD booking alone, which carries no payment at all", async () => {
      // The distinction the screen now reads. A card booking is `confirmed`
      // too, and has genuinely been paid.
      server.use(
        http.get(`${BASE}/bookings/status`, () =>
          HttpResponse.json(statusBody({ state: "confirmed", final: true })),
        ),
      );
      renderWithQuery(<BookingScreen />);

      expect(await screen.findByText("Paid")).toBeInTheDocument();
      expect(screen.queryByText(/Bring ₹/)).not.toBeInTheDocument();
    });
  });

  it("does not crash on a state this build has never heard of", async () => {
    // The general form of the bug above. A booking screen that throws is the
    // worst outcome in the product: the person may have just handed over money.
    server.use(
      http.get(`${BASE}/bookings/status`, () =>
        HttpResponse.json(statusBody({ state: "some_new_state_from_2027" })),
      ),
    );

    renderWithQuery(<BookingScreen />);
    expect(await screen.findByText("YV-4K2M9P7Q")).toBeInTheDocument();
  });
});
