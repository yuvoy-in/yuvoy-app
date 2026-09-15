import { describe, it, expect, afterEach } from "vitest";
import { screen, cleanup } from "@testing-library/react";
import { renderWithQuery } from "@/test/render";
import { BookingLayer } from "./booking-layer";
import type { components } from "@/lib/api/schema.gen";

type Experience = components["schemas"]["Experience"];

/**
 * The listing page's one action (yuvoy-app#62 item 1).
 *
 * This file used to be four times this length, because the listing page held
 * a date pop-up, a party stepper and an "Ask the operator" sheet. All three
 * are gone, and so are their tests: the owner moved every one of those
 * decisions onto checkout on 14 September.
 *
 * What is left to defend is small and worth defending exactly: one button, no
 * query string on it, no price beside it, and a truthful label when there is
 * nothing to book.
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

  it("carries no price", () => {
    /*
      Removed by the owner and kept removed. The bar is the last thing read
      before committing, and a per-person figure there reads as the total.
    */
    renderWithQuery(<BookingLayer experience={experience()} bookable />);
    expect(document.body.textContent).not.toMatch(/₹/);
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
