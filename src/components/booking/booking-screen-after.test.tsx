import { describe, it, expect, beforeEach } from "vitest";
import { screen, cleanup } from "@testing-library/react";
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

/**
 * Whether to offer "how was it" is the SERVER's answer (#38 item 3).
 *
 * This screen used to read `state === "completed"`, which is the client
 * deriving a rule the API owns, and it was wrong in both directions.
 * `leaveReview` also refuses a trip already reviewed and one whose 30 day
 * window has closed, so a completed trip could show a button that could never
 * succeed. That is the trap yuvoy-app#53 was filed about, rebuilt.
 */
describe("the review offer", () => {
  it("offers the form when the server says it will accept one", async () => {
    server.use(
      http.get(`${BASE}/bookings/status`, () =>
        HttpResponse.json(
          statusBody({
            state: "completed",
            review: { reviewed: false, canReview: true },
          }),
        ),
      ),
    );

    renderWithQuery(<BookingScreen />);
    expect(await screen.findByText("How was it?")).toBeInTheDocument();
    expect(
      screen.getByRole("button", { name: /leave this review/i }),
    ).toBeInTheDocument();
  });

  it("offers NOTHING on a completed trip the server will refuse", async () => {
    /*
      The case the old check got wrong: completed, so the state test passed,
      but outside the window, so the POST could only ever 409. A button that
      cannot succeed is worse than no button.
    */
    server.use(
      http.get(`${BASE}/bookings/status`, () =>
        HttpResponse.json(
          statusBody({
            state: "completed",
            review: { reviewed: false, canReview: false },
          }),
        ),
      ),
    );

    renderWithQuery(<BookingScreen />);
    await screen.findByText(/Try-dive at Nemo Reef/);
    expect(
      screen.queryByRole("button", { name: /leave this review/i }),
    ).toBeNull();
  });

  it("says the rating back once one is recorded", async () => {
    // A traveller returning to this page wants to know their rating landed.
    // An absent form alone is indistinguishable from a broken one.
    server.use(
      http.get(`${BASE}/bookings/status`, () =>
        HttpResponse.json(
          statusBody({
            state: "completed",
            review: { reviewed: true, canReview: false, rating: 5 },
          }),
        ),
      ),
    );

    renderWithQuery(<BookingScreen />);
    expect(
      await screen.findByText(/Thanks, you rated this 5 stars/),
    ).toBeInTheDocument();
    expect(
      screen.queryByRole("button", { name: /leave this review/i }),
    ).toBeNull();
  });

  it("says star, not stars, for one", async () => {
    server.use(
      http.get(`${BASE}/bookings/status`, () =>
        HttpResponse.json(
          statusBody({
            state: "completed",
            review: { reviewed: true, canReview: false, rating: 1 },
          }),
        ),
      ),
    );

    renderWithQuery(<BookingScreen />);
    expect(
      await screen.findByText(/Thanks, you rated this 1 star\./),
    ).toBeInTheDocument();
  });

  it("offers nothing at all when the server sends no review block", async () => {
    /*
      `review` is required on the response and is read defensively anyway: the
      standing rule here is that a pinned contract states what an API WILL
      send, never what it does send today. Absent means offer nothing, which is
      the only safe reading of "we do not know".
    */
    server.use(
      http.get(`${BASE}/bookings/status`, () =>
        HttpResponse.json(statusBody({ state: "completed" })),
      ),
    );

    renderWithQuery(<BookingScreen />);
    await screen.findByText(/Try-dive at Nemo Reef/);
    expect(
      screen.queryByRole("button", { name: /leave this review/i }),
    ).toBeNull();
    expect(screen.queryByText(/Thanks, you rated/)).toBeNull();
  });
});

/**
 * Add to calendar (#38 item 5).
 *
 * The file itself is pinned line by line in `lib/booking/calendar.test.ts`.
 * What is asserted here is the half that file cannot see: when the button is
 * offered at all, and what the screen hands it.
 */
describe("add to calendar", () => {
  it("is offered on a booking that is going ahead", async () => {
    server.use(
      http.get(`${BASE}/bookings/status`, () =>
        HttpResponse.json(statusBody()),
      ),
    );

    renderWithQuery(<BookingScreen />);
    expect(
      await screen.findByRole("button", { name: /Add to calendar/ }),
    ).toBeInTheDocument();
  });

  it("is not offered before there is a booking to put in it", async () => {
    /*
      A request nobody has answered, and a hold not yet paid for: an entry now
      claims the trip is on before anybody has said so, and outlives a "no"
      (cited in the redesign's before page, 3 Oct 2026).
    */
    for (const state of ["awaiting_operator", "holding"]) {
      cleanup();
      server.use(
        http.get(`${BASE}/bookings/status`, () =>
          HttpResponse.json(
            statusBody({ state, final: false, bookingReference: undefined }),
          ),
        ),
      );

      renderWithQuery(<BookingScreen />);
      await screen.findByText(/Try-dive at Nemo Reef/);
      expect(
        screen.queryByRole("button", { name: /Add to calendar/ }),
        state,
      ).toBeNull();
    }
  });

  it("is hidden on a trip that is not happening", async () => {
    /*
      A calendar entry for a cancelled trip is worse than none: it survives in
      the traveller's phone long after this page is closed, and nothing here
      will ever remove it.
    */
    for (const state of ["cancelled", "declined", "expired"]) {
      cleanup();
      server.use(
        http.get(`${BASE}/bookings/status`, () =>
          HttpResponse.json(statusBody({ state })),
        ),
      );

      renderWithQuery(<BookingScreen />);
      await screen.findByText(/Try-dive at Nemo Reef/);
      expect(
        screen.queryByRole("button", { name: /Add to calendar/ }),
        state,
      ).toBeNull();
    }
  });
});

/**
 * The way on from a request that was let go (yuvoy-api#225).
 *
 * An operator-declined request reaches this page as `released`, and so does
 * one the traveller gave up. The page cannot tell which, because the API does
 * not say on this endpoint yet, so it invents no reason and offers the one
 * step that is true either way: the listing's dates.
 */
describe("a released request", () => {
  it("offers the listing's dates, straight into its calendar", async () => {
    server.use(
      http.get(`${BASE}/bookings/status`, () =>
        HttpResponse.json(
          statusBody({ state: "released", bookingReference: undefined }),
        ),
      ),
    );

    renderWithQuery(<BookingScreen />);
    expect(
      await screen.findByText("This booking was let go"),
    ).toBeInTheDocument();
    expect(
      screen.getByRole("link", { name: "See other dates" }),
    ).toHaveAttribute("href", "/e/try-dive-nemo-reef/book");
    // No reason is invented: the sentence that covers both causes stays.
    expect(
      screen.getByText(
        /Either you gave it up or the operator could not take it/,
      ),
    ).toBeInTheDocument();
    expect(screen.queryByText(/no seats left|weather/i)).toBeNull();
  });

  it("offers nothing on a booking that is going ahead", async () => {
    server.use(
      http.get(`${BASE}/bookings/status`, () =>
        HttpResponse.json(statusBody()),
      ),
    );

    renderWithQuery(<BookingScreen />);
    await screen.findByText("You are going");
    expect(screen.queryByRole("link", { name: "See other dates" })).toBeNull();
  });

  it("draws no link at all rather than one to /e/undefined/book", async () => {
    server.use(
      http.get(`${BASE}/bookings/status`, () =>
        HttpResponse.json(
          statusBody({
            state: "released",
            bookingReference: undefined,
            experience: {
              title: "Try-dive at Nemo Reef",
              operator: "Sample Dive Operator",
            },
          }),
        ),
      ),
    );

    renderWithQuery(<BookingScreen />);
    await screen.findByText("This booking was let go");
    expect(screen.queryByRole("link", { name: "See other dates" })).toBeNull();
  });
});
