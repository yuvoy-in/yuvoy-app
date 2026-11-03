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

/**
 * A request the OPERATOR turned down, said in words (yuvoy-api#225).
 *
 * The API now sends `cancellation.message` when the code on the page is the
 * decline's own, and `nextDeparture` when the listing has another date on sale
 * in the next 90 days.
 */
describe("a request the operator turned down", () => {
  const DECLINED = {
    state: "released",
    bookingReference: undefined,
    cancellation: {
      reasonCode: "no_capacity",
      message: "The operator is full on that departure. Nothing was charged.",
    },
  };

  it("says why in the API's words, offers the next date, and hedges nothing", async () => {
    server.use(
      http.get(`${BASE}/bookings/status`, () =>
        HttpResponse.json(
          statusBody({
            ...DECLINED,
            cancellation: {
              ...DECLINED.cancellation,
              nextDeparture: {
                date: "2026-09-24",
                // 09:00 in Port Blair.
                startsAt: "2026-09-24T03:30:00Z",
                timezone: "Asia/Kolkata",
                bookUrl: "https://yuvoy.in/e/try-dive-nemo-reef",
              },
            },
          }),
        ),
      ),
    );

    renderWithQuery(<BookingScreen />);
    expect(
      await screen.findByText("Your request was not accepted"),
    ).toBeInTheDocument();
    expect(screen.getByText("Not accepted")).toBeInTheDocument();
    expect(
      screen.getByText(
        "The operator is full on that departure. Nothing was charged.",
      ),
    ).toBeInTheDocument();
    // Neither the hedge nor the mapped cancellation code.
    expect(screen.queryByText(/Either you gave it up/)).toBeNull();
    expect(screen.queryByText("The operator or we called it off.")).toBeNull();
    expect(screen.queryByText("This booking was let go")).toBeNull();

    expect(
      screen.getByText("Thu, 24 Sep at 09:00", { exact: false }),
    ).toBeInTheDocument();
    // Into this app's own checkout on that date, with the same party.
    expect(
      screen.getByRole("link", { name: "Book that date" }),
    ).toHaveAttribute(
      "href",
      "/e/try-dive-nemo-reef/book?date=2026-09-24&guests=2",
    );
    expect(
      screen.getByRole("link", { name: "See other dates" }),
    ).toHaveAttribute("href", "/e/try-dive-nemo-reef/book");
    // `bookUrl` names yuvoy.in/e/..., a 404 while listings live on app.yuvoy.in.
    for (const link of screen.getAllByRole("link")) {
      expect(link.getAttribute("href") ?? "").not.toContain("yuvoy.in/e/");
    }
  });

  it("names the market's day for a dawn departure, which is the day before in UTC", async () => {
    server.use(
      http.get(`${BASE}/bookings/status`, () =>
        HttpResponse.json(
          statusBody({
            ...DECLINED,
            cancellation: {
              ...DECLINED.cancellation,
              nextDeparture: {
                date: "2026-09-25",
                // 06:00 on Fri 25 Sep in Port Blair is 00:30Z, still 25 Sep;
                // 05:00 is 23:30Z on the 24th.
                startsAt: "2026-09-24T23:30:00Z",
                timezone: "Asia/Kolkata",
                bookUrl: "https://yuvoy.in/e/try-dive-nemo-reef",
              },
            },
          }),
        ),
      ),
    );

    renderWithQuery(<BookingScreen />);
    expect(
      await screen.findByText("Fri, 25 Sep at 05:00", { exact: false }),
    ).toBeInTheDocument();
    expect(
      screen.getByRole("link", { name: "Book that date" }),
    ).toHaveAttribute(
      "href",
      "/e/try-dive-nemo-reef/book?date=2026-09-25&guests=2",
    );
  });

  it("says when nothing else is on sale, and points somewhere else instead of an empty calendar", async () => {
    server.use(
      http.get(`${BASE}/bookings/status`, () =>
        HttpResponse.json(statusBody(DECLINED)),
      ),
    );

    renderWithQuery(<BookingScreen />);
    expect(
      await screen.findByText(
        "Nothing else is on sale for this trip in the next 90 days.",
      ),
    ).toBeInTheDocument();
    expect(
      screen.getByRole("link", { name: "Find something else" }),
    ).toHaveAttribute("href", "/");
    expect(screen.queryByRole("link", { name: "See other dates" })).toBeNull();
    expect(screen.queryByRole("link", { name: "Book that date" })).toBeNull();
  });

  it("takes a long dash out of the API's sentence on the way in", async () => {
    server.use(
      http.get(`${BASE}/bookings/status`, () =>
        HttpResponse.json(
          statusBody({
            ...DECLINED,
            cancellation: {
              reasonCode: "weather",
              message:
                "The operator isn't running that date \u2014 the conditions. Nothing was charged.",
            },
          }),
        ),
      ),
    );

    renderWithQuery(<BookingScreen />);
    await screen.findByText("Your request was not accepted");
    expect(document.body.textContent ?? "").not.toMatch(/[\u2013\u2014\u2015]/);
  });

  it("says what it always said when the API sends no sentence", async () => {
    server.use(
      http.get(`${BASE}/bookings/status`, () =>
        HttpResponse.json(
          statusBody({
            state: "released",
            bookingReference: undefined,
            cancellation: { reasonCode: "no_capacity" },
          }),
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
  });
});

describe("the experience title", () => {
  it("links to the listing (#38 item 3)", async () => {
    /*
      Somebody on this page a week before their trip wants to re-read what they
      booked. None of it is here and all of it is one tap away; without the
      link the only route is searching for it again by name.
    */
    server.use(
      http.get(`${BASE}/bookings/status`, () =>
        HttpResponse.json(statusBody()),
      ),
    );

    renderWithQuery(<BookingScreen />);
    expect(
      await screen.findByRole("link", { name: "Try-dive at Nemo Reef" }),
    ).toHaveAttribute("href", "/e/try-dive-nemo-reef");
  });

  it("stays plain text rather than linking to /e/undefined", async () => {
    // A pinned contract states what an API WILL send, never what it does send.
    server.use(
      http.get(`${BASE}/bookings/status`, () =>
        HttpResponse.json(
          statusBody({
            experience: {
              title: "Try-dive at Nemo Reef",
              operator: "Sample Dive Operator",
            },
          }),
        ),
      ),
    );

    renderWithQuery(<BookingScreen />);
    expect(
      await screen.findByText("Try-dive at Nemo Reef"),
    ).toBeInTheDocument();
    expect(
      screen.queryByRole("link", { name: "Try-dive at Nemo Reef" }),
    ).toBeNull();
  });
});
