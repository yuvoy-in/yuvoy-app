import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import { act, screen, waitFor } from "@testing-library/react";
import { renderWithQuery } from "@/test/render";
import { BookingScreen } from "./booking-screen";
import { server } from "../../../mocks/server";
import { http, HttpResponse } from "msw";
import { tripWhen } from "./trip-copy";
import { mockHeaders, mockNow } from "../../../mocks/fixtures";

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

/**
 * The trip page's head (the approved redesign, traveller A, 3 Oct 2026): the
 * listing's picture over the top, and the hour as the headline for a trip
 * still ahead. `tripWhen`'s own rules are in `trip-copy.test.ts`; these pin
 * that the screen uses them.
 */
describe("the trip page's head", () => {
  it("says the hour as the headline for a trip still ahead", async () => {
    const slot = {
      startsAt: new Date(Date.now() + 3 * 3_600_000).toISOString(),
      timezone: "Asia/Kolkata",
    };
    server.use(
      http.get(`${BASE}/bookings/status`, () =>
        HttpResponse.json(statusBody({ slot, final: false })),
      ),
    );
    renderWithQuery(<BookingScreen />);

    const heading = await screen.findByRole("heading", { level: 1 });
    expect(heading).toHaveTextContent(tripWhen(slot, Date.now())!);
    // The state's own words lead the line under it.
    expect(screen.getByText(/^You are going\. /)).toBeInTheDocument();
  });

  it("keeps the day current while the page stays open", async () => {
    /*
      The clock was read once, so a page left open overnight said "Tomorrow,
      07:00" on the morning itself (stability audit, 6 Oct 2026). 23:58 in
      the islands by the SERVER's clock, which the mocks' `Date` header sets
      apart from this device's; a trip at 07:00; and three minutes pass with
      nothing read again.
    */
    vi.useFakeTimers({ toFake: ["Date", "setInterval", "clearInterval"] });
    try {
      const skew = mockNow() - Date.now();
      vi.setSystemTime(Date.parse("2026-09-21T18:28:00Z") - skew);
      const slot = {
        startsAt: "2026-09-22T01:30:00Z",
        timezone: "Asia/Kolkata",
      };
      server.use(
        http.get(`${BASE}/bookings/status`, () =>
          HttpResponse.json(statusBody({ slot, final: false }), {
            headers: mockHeaders("req_clock"),
          }),
        ),
      );
      renderWithQuery(<BookingScreen />);

      const heading = await screen.findByRole("heading", { level: 1 });
      expect(heading).toHaveTextContent(/^Tomorrow, 07:00/);
      act(() => vi.advanceTimersByTime(3 * 60_000));
      expect(heading).toHaveTextContent(/^Today, 07:00/);
    } finally {
      vi.useRealTimers();
    }
  });

  it("keeps its words for a trip that has already left", async () => {
    server.use(
      http.get(`${BASE}/bookings/status`, () =>
        HttpResponse.json(statusBody()),
      ),
    );
    renderWithQuery(<BookingScreen />);
    expect(
      await screen.findByRole("heading", { level: 1, name: "You are going" }),
    ).toBeInTheDocument();
  });

  it("draws the listing's picture over the top, and nothing when it has none", async () => {
    server.use(
      http.get(`${BASE}/bookings/status`, () =>
        HttpResponse.json(
          statusBody({
            experience: {
              slug: "try-dive-nemo-reef",
              title: "Try-dive at Nemo Reef",
              operator: "Sample Dive Operator",
              operatorSlug: "sample-dive-operator",
              heroImageUrl:
                "https://videodelivery.net/abc/thumbnails/thumbnail.jpg",
            },
          }),
        ),
      ),
    );
    const { container, unmount } = renderWithQuery(<BookingScreen />);
    await screen.findByText(/Try-dive at Nemo Reef/);
    expect(
      container.querySelector('img[src*="videodelivery.net"]'),
    ).not.toBeNull();
    unmount();

    server.use(
      http.get(`${BASE}/bookings/status`, () =>
        HttpResponse.json(
          statusBody({
            experience: {
              slug: "try-dive-nemo-reef",
              title: "Try-dive at Nemo Reef",
              operator: "Sample Dive Operator",
              operatorSlug: "sample-dive-operator",
              heroImageUrl: null,
            },
          }),
        ),
      ),
    );
    const again = renderWithQuery(<BookingScreen />);
    await screen.findByText(/Try-dive at Nemo Reef/);
    expect(again.container.querySelector("img")).toBeNull();
  });
});

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

  it("keeps the booking on screen when one poll does not come back", async () => {
    /*
      The status polls. One poll dropped on a ferry used to swap the booking
      a traveller was reading for an error page, the page the token now
      lives on included (6 Oct 2026). The next poll brings it up to date.
    */
    server.use(
      http.get(`${BASE}/bookings/status`, () =>
        HttpResponse.json(statusBody({ final: false })),
      ),
    );
    const { client } = renderWithQuery(<BookingScreen />);
    expect(await screen.findByText("You are going")).toBeInTheDocument();

    server.use(
      http.get(`${BASE}/bookings/status`, () =>
        HttpResponse.json(
          { error: { code: "bad_request", message: "no" } },
          { status: 400 },
        ),
      ),
    );
    await act(async () => {
      await client.refetchQueries();
      // React Query tells the screen on the next task, not in this one.
      await new Promise((resolve) => setTimeout(resolve, 20));
    });

    expect(screen.getByText("You are going")).toBeInTheDocument();
    expect(screen.getByText("YV-4K2M9P7Q")).toBeInTheDocument();
  });

  it("gives the screen to a link the server has finished with, even mid-visit", async () => {
    server.use(
      http.get(`${BASE}/bookings/status`, () =>
        HttpResponse.json(statusBody({ final: false })),
      ),
    );
    const { client } = renderWithQuery(<BookingScreen />);
    expect(await screen.findByText("You are going")).toBeInTheDocument();

    server.use(
      http.get(`${BASE}/bookings/status`, () =>
        HttpResponse.json(
          {
            error: { code: "token_expired", message: "This link has expired." },
          },
          { status: 401 },
        ),
      ),
    );
    await act(async () => {
      await client.refetchQueries();
      await new Promise((resolve) => setTimeout(resolve, 20));
    });

    expect(screen.queryByText("You are going")).toBeNull();
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

  /*
    AN ACCEPTED REQUEST HOLDS FOR TWELVE HOURS (yuvoy-app#97, yuvoy-api#203).

    A countdown to tomorrow morning is "1080:00" ticking once a second. The
    contract now says to show a deadline that far off as a time with its day,
    in the trip's market, and the ten-minute checkout hold keeps its count.
    Date is pinned so the day is known: 08:30Z on Monday 21 Sep is 14:00 in
    the Andamans.
  */
  describe("a hold that is hours away", () => {
    const holdUntil = (holdExpiresAt: string, headers?: HeadersInit) =>
      server.use(
        http.get(`${BASE}/bookings/status`, () =>
          HttpResponse.json(
            statusBody({
              state: "holding",
              final: false,
              bookingReference: undefined,
              holdExpiresAt,
            }),
            { headers },
          ),
        ),
      );

    beforeEach(() => {
      vi.useFakeTimers({ toFake: ["Date"] });
      vi.setSystemTime(new Date("2026-09-21T08:30:00Z"));
    });
    afterEach(() => vi.useRealTimers());

    it("says when to pay by, with the day, rather than counting down", async () => {
      holdUntil("2026-09-22T02:30:00Z");
      renderWithQuery(<BookingScreen />);

      const timer = await screen.findByRole("timer");
      expect(timer).toHaveTextContent("Pay by");
      expect(timer).toHaveTextContent("08:00 on Tue 22 Sep");
      expect(timer).not.toHaveTextContent("Time left to pay");
    });

    it("keeps the countdown for the ten-minute hold at checkout", async () => {
      holdUntil("2026-09-21T08:40:00Z");
      renderWithQuery(<BookingScreen />);

      const timer = await screen.findByRole("timer");
      expect(timer).toHaveTextContent("Time left to pay");
      expect(timer).toHaveTextContent("10:00");
    });

    it("decides by the SERVER's clock, not a phone that is an hour out", async () => {
      /*
        The phone thinks it is 08:30Z; the API's Date says 09:40Z. The hold
        ends at 10:00Z: twenty minutes by the server, ninety by the phone. The
        phone alone would have drawn a calm "Pay by 15:30 today" over a hold
        with twenty minutes left.
      */
      holdUntil("2026-09-21T10:00:00Z", {
        date: new Date("2026-09-21T09:40:00Z").toUTCString(),
      });
      renderWithQuery(<BookingScreen />);

      const timer = await screen.findByRole("timer");
      expect(timer).toHaveTextContent("Time left to pay");
      expect(timer).toHaveTextContent("20:00");
    });
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
