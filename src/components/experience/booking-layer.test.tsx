import { describe, it, expect, afterEach } from "vitest";
import { screen, cleanup, waitFor } from "@testing-library/react";
import { http, HttpResponse } from "msw";
import { renderWithQuery } from "@/test/render";
import { BookingLayer } from "./booking-layer";
import { server } from "../../../mocks/server";
import type { components } from "@/lib/api/schema.gen";

type Experience = components["schemas"]["Experience"];

const BASE = process.env.NEXT_PUBLIC_API_URL ?? "http://localhost:8099/v1";

/**
 * The listing page's one action (yuvoy-app#62 item 1).
 *
 * This file used to be four times this length, because the listing page held
 * a date pop-up, a party stepper and an "Ask the operator" sheet. All three
 * are gone, and so are their tests: the owner moved every one of those
 * decisions onto checkout on 14 September.
 *
 * What is left to defend is small and worth defending exactly: one button, no
 * query string on it, the price and the next open day beside it
 * (yuvoy-app#111), and a truthful label when there is nothing to book.
 */

const experience = (over: Partial<Experience> = {}): Experience =>
  ({
    slug: "try-dive-nemo-reef",
    title: "Try-dive at Nemo Reef",
    bookingMode: "allotment",
    maxPartySize: 8,
    ...over,
  }) as Experience;

afterEach(cleanup);

describe("the sticky bar", () => {
  it("is one button, and it opens checkout with nothing chosen yet", async () => {
    /*
      "Tapping it opens no date pop-up. It goes straight to the checkout page."
      No query string: the day, the time and the party are all decided there
      now, so a `?slot=` here would be this page making a choice again.
    */
    renderWithQuery(<BookingLayer experience={experience()} bookable />);

    const button = screen.getByRole("link", { name: /Pick a day/ });
    expect(button).toHaveAttribute("href", "/e/try-dive-nemo-reef/book");
  });

  it("goes to checkout for a request-mode listing too", async () => {
    /*
      The divergence this issue ended. Request mode used to answer in a sheet on
      this page while allotment mode went to checkout, so the two modes had
      different flows, different validation and different copy for the same act.
    */
    renderWithQuery(
      <BookingLayer
        experience={experience({ bookingMode: "request" })}
        bookable
      />,
    );
    expect(screen.getByRole("link", { name: /Pick a day/ })).toHaveAttribute(
      "href",
      "/e/try-dive-nemo-reef/book",
    );
  });

  it("carries the price, with the server's unit phrase beside it", async () => {
    /*
      yuvoy-app#111 reverses an earlier owner call, with the owner's approval
      (25 Sep). The price was removed because a bare per-person figure read as
      the total; the unit phrase, verbatim from the API, is what answers that.
    */
    renderWithQuery(
      <BookingLayer
        experience={experience({
          fromPrice: { amountMinor: 450000, currency: "INR" },
          pricingUnit: "per_person",
          pricingUnitLabel: "per person",
        })}
        bookable
      />,
    );
    expect(screen.getByText("₹4,500")).toBeInTheDocument();
    expect(screen.getByText("per person")).toBeInTheDocument();
    await screen.findByText(/^Next open:/);
  });

  it("names the day checkout will open on, from live availability", async () => {
    /*
      The mock's clock is 19 Aug. That morning's departure is past its cutoff,
      so the first day a traveller could book is Thursday the 20th: the same
      rule and the same server clock checkout uses, which is why the two agree.
    */
    renderWithQuery(<BookingLayer experience={experience()} bookable />);
    expect(
      await screen.findByText("Next open: Thu, 20 Aug"),
    ).toBeInTheDocument();
  });

  it("says nothing about dates while it is still asking", () => {
    // "No dates" is a claim, and a read still in flight has not earned it.
    renderWithQuery(<BookingLayer experience={experience()} bookable />);
    expect(screen.queryByText(/No dates/)).toBeNull();
    expect(screen.queryByText(/Next open/)).toBeNull();
  });

  it("says so plainly when nothing is open in the window", async () => {
    server.use(
      http.get(`${BASE}/experiences/:slug/availability`, () =>
        HttpResponse.json({
          slots: [],
          bookable: true,
          availabilityAsOf: "2026-08-19T02:00:00Z",
          marketTimezone: "Asia/Kolkata",
          staleSlotsSuppressed: 0,
        }),
      ),
    );
    renderWithQuery(<BookingLayer experience={experience()} bookable />);
    expect(
      await screen.findByText("No dates in the next 90 days"),
    ).toBeInTheDocument();
  });

  it("claims nothing about dates when the read fails", async () => {
    /*
      A 404 rather than a 500: the client retries a failed GET with backoff,
      and the test must reach the FAILED state, not sit in the loading one
      where "no date text" would pass for the wrong reason. The placeholder
      going away is what proves the read has settled.
    */
    server.use(
      http.get(`${BASE}/experiences/:slug/availability`, () =>
        HttpResponse.json(
          { error: { code: "not_found", message: "Not found." } },
          { status: 404 },
        ),
      ),
    );
    const { container } = renderWithQuery(
      <BookingLayer experience={experience()} bookable />,
    );
    expect(container.querySelector(".skeleton")).not.toBeNull();
    await waitFor(() =>
      expect(container.querySelector(".skeleton")).toBeNull(),
    );
    expect(screen.queryByText(/No dates/)).toBeNull();
    expect(screen.queryByText(/Next open/)).toBeNull();
    // And the way in is still there.
    expect(screen.getByRole("link", { name: /Pick a day/ })).toBeVisible();
  });

  it("asks for no date and no party size on this page", () => {
    // All three controls moved to checkout. This is the assertion that would
    // catch somebody putting one of them back.
    renderWithQuery(<BookingLayer experience={experience()} bookable />);
    expect(screen.queryByText(/How many of you/i)).toBeNull();
    expect(screen.queryByRole("button", { name: /See days/i })).toBeNull();
    expect(
      screen.queryByRole("button", { name: /Ask the operator/i }),
    ).toBeNull();
  });
});

describe("a listing that is not on sale", () => {
  it("says so on a disabled button rather than sending somebody to an empty calendar", () => {
    /*
      `bookable: false` always comes with `slots: []`, so checkout would show a
      calendar with nothing in it and a traveller would page through months
      looking for a departure that does not exist in any of them.
    */
    renderWithQuery(
      <BookingLayer experience={experience()} bookable={false} />,
    );

    const button = screen.getByRole("button", { name: "No dates open" });
    expect(button).toBeDisabled();
    expect(screen.queryByRole("link", { name: /Pick a day/ })).toBeNull();
  });

  it("does not ask for availability it could never sell", async () => {
    // `bookable: false` always comes with empty availability, so the read
    // would be a request for an answer already known.
    let asked = 0;
    server.use(
      http.get(`${BASE}/experiences/:slug/availability`, () => {
        asked += 1;
        return HttpResponse.json({ slots: [] });
      }),
    );
    renderWithQuery(
      <BookingLayer experience={experience()} bookable={false} />,
    );
    await new Promise((r) => setTimeout(r, 50));
    expect(asked).toBe(0);
  });

  it("says it in the body too, and gives no reason", () => {
    /*
      Why a business stopped selling is a supply judgement about them and does
      not belong on a traveller screen. It must also not imply the operator is
      gone: the page is a 200 precisely because somebody arrived by a link.
    */
    renderWithQuery(
      <BookingLayer experience={experience()} bookable={false} />,
    );
    expect(
      screen.getByText(/not available to book right now/),
    ).toBeInTheDocument();
    expect(document.body.textContent).not.toMatch(
      /credential|expired|licence/i,
    );
  });
});

describe("what surrounds it", () => {
  it("renders the server's own sections around the bar", () => {
    // `before` and `after` are server-rendered and pass through untouched. The
    // bar has to belong to a box that reaches the end of the page, or a sticky
    // element stops sticking partway down.
    renderWithQuery(
      <BookingLayer
        experience={experience()}
        bookable
        before={<p>What you will see</p>}
        after={<p>Where you meet</p>}
      />,
    );
    expect(screen.getByText("What you will see")).toBeInTheDocument();
    expect(screen.getByText("Where you meet")).toBeInTheDocument();
  });
});
