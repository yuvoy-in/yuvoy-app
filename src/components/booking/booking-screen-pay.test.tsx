import { describe, it, expect, beforeEach, vi } from "vitest";
import { act, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { renderWithQuery } from "@/test/render";
import { BookingScreen } from "./booking-screen";
import { server } from "../../../mocks/server";
import { http, HttpResponse } from "msw";
import { registerPaymentAdapter } from "@/lib/booking/payment-handoff";
import { POLL_CEILING_MS } from "@/lib/booking/poll";

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

/* ------------------------------------------- a second link, same tab */

describe("a second booking link in the same tab", () => {
  it("starts afresh, not where the last booking's polling left off", async () => {
    /*
      The page follows a link pasted into the same tab, and kept the last
      booking's polling: one that had waited out the ceiling handed the next
      booking to a person on sight (stability audit, 6 Oct 2026).
    */
    const asked: string[] = [];
    server.use(
      http.get(`${BASE}/bookings/status`, ({ request }) => {
        asked.push(request.headers.get("authorization") ?? "");
        return HttpResponse.json(
          statusBody({ state: "verifying", final: false }),
        );
      }),
    );
    vi.useFakeTimers({ shouldAdvanceTime: true });
    try {
      renderWithQuery(<BookingScreen />);
      await screen.findByRole("heading", { level: 1 });
      await act(() => vi.advanceTimersByTimeAsync(POLL_CEILING_MS + 1_000));
      expect(
        await screen.findByText("This is taking longer than it should"),
      ).toBeInTheDocument();

      act(() => setHash("#t=tok_second"));
      await waitFor(() => expect(asked).toContain("Bearer tok_second"));
      await screen.findByRole("heading", { level: 1 });
      expect(
        screen.queryByText("This is taking longer than it should"),
      ).toBeNull();
    } finally {
      vi.useRealTimers();
    }
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

/* ---------------------------------------- what the operator asked (#46) */

describe("the listing's own questions", () => {
  const questions = [
    {
      questionId: "q_dived",
      text: "Has everyone dived before?",
      answerType: "yes_no",
      required: true,
      current: true,
      answered: false,
    },
  ];

  it("renders the panel when the booking carries questions", async () => {
    server.use(
      http.get(`${BASE}/bookings/status`, () =>
        HttpResponse.json(statusBody({ questions, answersOpen: true })),
      ),
    );

    renderWithQuery(<BookingScreen />);
    expect(
      await screen.findByText("What the operator asked"),
    ).toBeInTheDocument();
    expect(screen.getByText("Has everyone dived before?")).toBeInTheDocument();
  });

  /*
    The commoner case by far, and the one a new panel must not intrude on.
    `questions` is "absent when the listing asks nothing and nothing was
    answered", so its absence is the whole test.
  */
  it("draws nothing at all for a booking that was asked nothing", async () => {
    server.use(
      http.get(`${BASE}/bookings/status`, () =>
        HttpResponse.json(statusBody()),
      ),
    );

    renderWithQuery(<BookingScreen />);
    await screen.findByText("You are going");
    expect(
      screen.queryByText("What the operator asked"),
    ).not.toBeInTheDocument();
  });

  /*
    `answersOpen` is read as TOLD. A booking whose questions arrive without it
    must not be offered a form: the contract sends it "so a form is never
    offered that would be refused", and inferring it from `state` and
    `slot.startsAt` would be two clocks disagreeing across a timezone.
  */
  it("offers no form when answersOpen is absent", async () => {
    server.use(
      http.get(`${BASE}/bookings/status`, () =>
        HttpResponse.json(statusBody({ questions })),
      ),
    );

    renderWithQuery(<BookingScreen />);
    await screen.findByText("What the operator asked");
    expect(
      screen.queryByRole("button", { name: /save answers/i }),
    ).not.toBeInTheDocument();
  });

  /*
    An answer holding a phone number, an email address or a link is refused,
    never dropped (yuvoy-api#282 item 5), and the API names it only by its
    place in the list sent. The reason goes beside that answer, and the line
    under the form says what happened instead of "Something went wrong".
  */
  it("says beside an answer why it was refused for holding a link", async () => {
    const hotel = {
      questionId: "q_hotel",
      text: "Which hotel should we collect you from?",
      answerType: "short_text",
      required: false,
      current: true,
      answered: false,
    };
    let sent: unknown = null;
    server.use(
      http.get(`${BASE}/bookings/status`, () =>
        HttpResponse.json(
          statusBody({ questions: [hotel], answersOpen: true }),
        ),
      ),
      http.post(`${BASE}/bookings/answers`, async ({ request }) => {
        sent = await request.json();
        return HttpResponse.json(
          {
            error: {
              code: "invalid_input",
              message: "some of these answers need fixing",
              details: {
                "answers[0].answer":
                  "an answer cannot include a phone number, an email address or a link, and this one looks like it has a link. Write it another way",
                "answers[0].contactDetail": "link",
              },
            },
          },
          { status: 400 },
        );
      }),
    );

    const user = userEvent.setup();
    renderWithQuery(<BookingScreen />);
    await user.type(
      await screen.findByLabelText(
        "Which hotel should we collect you from? (optional)",
      ),
      "Sea Shell, see seashell.in",
    );
    await user.click(screen.getByRole("button", { name: "Save answers" }));

    expect(
      await screen.findByText(
        "An answer cannot include a phone number, an email address or a link, and this one looks like it has a link. Write it another way.",
      ),
    ).toBeInTheDocument();
    expect(
      screen.getByText(
        "Answers cannot include a phone number, an email address or a link. Change the marked answer and save again.",
      ),
    ).toBeInTheDocument();
    expect(document.body.textContent).not.toMatch(/Something went wrong/);
    expect(sent).toEqual({
      answers: [
        { questionId: "q_hotel", answer: "Sea Shell, see seashell.in" },
      ],
    });
  });
});
