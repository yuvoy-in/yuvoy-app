import { describe, it, expect, beforeEach } from "vitest";
import { screen } from "@testing-library/react";
import { renderWithQuery } from "@/test/render";
import { BookingScreen } from "./booking-screen";
import { server } from "../../../mocks/server";
import { http, HttpResponse } from "msw";

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

/* ------------------------------------------ what the operator said */

describe("operator updates", () => {
  it("renders operatorUpdates — where a relay note lands, and nowhere else", async () => {
    server.use(
      http.get(`${BASE}/bookings/status`, () =>
        HttpResponse.json(
          statusBody({
            /*
              `kind`, which is what the server sends. This test fed `intent`
              and asserted the labels, so it passed while the deployed screen
              read a field the API "never emitted" and labelled every update
              "A note". Feeding the shape the server actually sends is the
              whole value of the assertion.
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

  /*
    The deprecated name, honoured second.

    `intent` is declared and never emitted. It costs one `??` to keep reading
    it, and this is what says so out loud — so that deleting the fallback is a
    decision somebody makes rather than a line somebody tidies away.
  */
  it("still labels an update that arrives under the deprecated intent", async () => {
    server.use(
      http.get(`${BASE}/bookings/status`, () =>
        HttpResponse.json(
          statusBody({
            operatorUpdates: [
              {
                intent: "time_change",
                detail: "06:30, not 07:00",
                sentAt: "2026-08-21T10:15:00Z",
              },
            ],
          }),
        ),
      ),
    );

    renderWithQuery(<BookingScreen />);
    expect(
      await screen.findByText("Time changed: 06:30, not 07:00"),
    ).toBeInTheDocument();
  });
});

/* ----------------------------------------------------- giving it back */

describe("giving the seats back", () => {
  it("releases a hold in two taps and lands on what the server says", async () => {
    let released = false;
    let releasedWith: string | null = null;
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
      http.post(`${BASE}/reservations/:id/release`, ({ request }) => {
        released = true;
        releasedWith = request.headers.get("authorization");
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
    // With the link the page was opened with, whose hold it is (yuvoy-api#369).
    expect(releasedWith).toBe("Bearer tok_test");
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
describe("the trip screen does not say things twice", () => {
  it("offers Save or share ONCE, not once per variant", async () => {
    /*
      THE DEFECT THIS PINS, and the revamp brief named it by this exact
      heading: "remove unnecessary elements such as repetitive 'Save or share
      this booking'".

      `KeepBooking` took a `variant` and this screen passed BOTH, about forty
      lines apart. The panel hid itself once dismissed; the row never did. So
      until somebody pressed Skip the page offered the same three actions
      twice. It is one component now and the prompt BECOMES the row, which
      keeps yuvoy-app#61's "after Skip too" without the overlap.
    */
    server.use(
      http.get(`${BASE}/bookings/status`, () =>
        HttpResponse.json(statusBody()),
      ),
    );

    renderWithQuery(<BookingScreen />);
    await screen.findByText("You are going");

    expect(
      screen.queryAllByText(/^(Keep your booking|Save or share this booking)$/),
    ).toHaveLength(1);
  });

  it("gathers the trip's actions under one heading", async () => {
    /*
      Share, invite, calendar, keep and cancel were five siblings in a stack of
      about twenty-two surfaces, each as loud as the meeting point above them.
      Everything was level one, which is the IA problem the brief describes.
    */
    server.use(
      http.get(`${BASE}/bookings/status`, () =>
        HttpResponse.json(statusBody()),
      ),
    );

    renderWithQuery(<BookingScreen />);
    await screen.findByText("You are going");

    expect(
      screen.getByRole("heading", { name: "Manage this trip" }),
    ).toBeInTheDocument();
  });

  it.each(["cancelled", "declined", "expired"])(
    "draws no empty Manage heading on a %s trip",
    async (state) => {
      /*
        THE DEFECT THIS PINS, found reviewing the grouping above rather than
        by a report.

        The region was drawn unconditionally while every control inside it
        is gated. On a trip that is over or never happened, all five decline
        to render: the calendar and KeepBooking both exclude these states,
        and share, invite and cancel all need a trip that is still ahead. So
        the heading stood alone over nothing, which reads as a broken page.
      */
      server.use(
        http.get(`${BASE}/bookings/status`, () =>
          HttpResponse.json(statusBody({ state })),
        ),
      );

      renderWithQuery(<BookingScreen />);
      await screen.findByRole("heading", { level: 1 });

      expect(
        screen.queryByRole("heading", { name: "Manage this trip" }),
      ).toBeNull();
    },
  );
});
