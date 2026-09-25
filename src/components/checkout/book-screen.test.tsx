import { describe, it, expect, afterEach, vi } from "vitest";
import { screen, cleanup, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { http, HttpResponse } from "msw";
import { renderWithQuery } from "@/test/render";
import { BookScreen } from "./book-screen";
import { server } from "../../../mocks/server";

const BASE = process.env.NEXT_PUBLIC_API_URL ?? "http://localhost:8099/v1";

/**
 * Checkout choosing its own day, time and party (yuvoy-app#62).
 *
 * The screen used to REFUSE to render without `?slot=`, because the listing
 * page made that choice and handed it over. Everything here is a consequence
 * of moving it: the page has to open with nothing chosen, find the first month
 * that has anything, and keep what the traveller picks in the URL.
 */

const nav = vi.hoisted(() => ({ replaced: [] as string[], search: "" }));
vi.mock("next/navigation", () => ({
  useRouter: () => ({
    push: vi.fn(),
    replace: (href: string) => nav.replaced.push(href),
  }),
  usePathname: () => "/e/try-dive-nemo-reef/book",
  useSearchParams: () => new URLSearchParams(nav.search),
}));

/**
 * A fixed today, so a calendar test is not a different test every day.
 *
 * `marketToday` reads the real clock in the market's zone, and every day state
 * below is relative to it. Without this the "first open month" assertions
 * would drift into the past and start passing vacuously.
 */
vi.mock("@/lib/booking/availability-window", async (original) => {
  const actual =
    await original<typeof import("@/lib/booking/availability-window")>();
  return {
    ...actual,
    marketToday: () => "2026-09-14",
    marketDateRange: () => ({ from: "2026-09-14", to: "2026-12-12" }),
  };
});

const slot = (over: Record<string, unknown> = {}) => ({
  id: "sl_20_0700",
  startsAt: "2026-09-20T01:30:00Z",
  endsAt: "2026-09-20T04:30:00Z",
  marketTimezone: "Asia/Kolkata",
  localDate: "2026-09-20",
  localStartTime: "07:00:00",
  bookingCutoffAt: "2026-09-20T00:00:00Z",
  status: "open",
  bookingMode: "allotment",
  soldOut: false,
  maxPartySize: 8,
  price: { amountMinor: 450000, currency: "INR" },
  remainingDisplay: "Available",
  ...over,
});

function availability(slots: Record<string, unknown>[]) {
  return http.get(`${BASE}/experiences/:slug/availability`, () =>
    HttpResponse.json({
      slots,
      bookable: true,
      availabilityAsOf: "2026-09-14T04:00:00Z",
      marketTimezone: "Asia/Kolkata",
      staleSlotsSuppressed: 0,
    }),
  );
}

afterEach(() => {
  cleanup();
  nav.replaced = [];
  nav.search = "";
});

describe("opening with nothing chosen", () => {
  it("renders a calendar rather than refusing without a departure", async () => {
    /*
      The whole premise. This screen used to answer "No departure chosen" and
      send the traveller back to the listing to pick one.
    */
    server.use(availability([slot()]));
    renderWithQuery(<BookScreen slug="try-dive-nemo-reef" />);

    expect(await screen.findByText("Pick a day")).toBeInTheDocument();
    expect(screen.queryByText(/No departure chosen/)).toBeNull();
  });

  it("says how it is paid for before a day is chosen", async () => {
    /*
      yuvoy-app#110. A traveller used to learn that the counter was the only
      way to finish at the pay step, after choosing a day, a time, a party and
      typing their details.
    */
    server.use(availability([slot()]));
    renderWithQuery(<BookScreen slug="try-dive-nemo-reef" />);

    const line = await screen.findByText("Pay at the counter on the day");
    const heading = screen.getByRole("heading", { level: 1 });
    expect(
      heading.compareDocumentPosition(line) & Node.DOCUMENT_POSITION_FOLLOWING,
    ).toBeTruthy();
    expect(
      line.compareDocumentPosition(screen.getByText("Pick a day")) &
        Node.DOCUMENT_POSITION_FOLLOWING,
    ).toBeTruthy();
  });

  it("opens on the month of the first open day, not on today", async () => {
    /*
      A calendar that opens on today for a listing whose next departure is
      seven weeks out shows a month of grey and asks the traveller to work out
      that they should press the arrow.
    */
    server.use(
      availability([
        slot({
          id: "sl_nov",
          localDate: "2026-11-03",
          startsAt: "2026-11-03T01:30:00Z",
          bookingCutoffAt: "2026-11-03T00:00:00Z",
        }),
      ]),
    );
    renderWithQuery(<BookScreen slug="try-dive-nemo-reef" />);

    expect(await screen.findByText("November 2026")).toBeInTheDocument();
  });

  it("shows only the days with a bookable departure, with their price", async () => {
    server.use(
      availability([
        slot(),
        slot({
          id: "sl_21",
          localDate: "2026-09-21",
          startsAt: "2026-09-21T01:30:00Z",
          bookingCutoffAt: "2026-09-21T00:00:00Z",
          soldOut: true,
          remainingDisplay: "Full",
        }),
      ]),
    );
    renderWithQuery(<BookScreen slug="try-dive-nemo-reef" />);

    const open = await screen.findByRole("button", { name: /Sun 20 Sep/ });
    expect(open).toBeEnabled();
    expect(open).toHaveAccessibleName(/from ₹4,500/);

    const full = screen.getByRole("button", { name: /Mon 21 Sep/ });
    expect(full).toBeDisabled();
    expect(full).toHaveAccessibleName(/full/);

    // A day with no departure at all is neither, and says nothing.
    const empty = screen.getByRole("button", { name: /Tue 22 Sep/ });
    expect(empty).toBeDisabled();
    expect(empty).toHaveAccessibleName("Tue 22 Sep");
  });
});

describe("choosing", () => {
  it("shows the times for the day, and picks a lone departure itself", async () => {
    /*
      "If the day has exactly one open departure, select it automatically." The
      commonest listing shape, and one fewer tap for it.
    */
    server.use(availability([slot()]));
    const user = userEvent.setup();
    renderWithQuery(<BookScreen slug="try-dive-nemo-reef" />);

    await user.click(await screen.findByRole("button", { name: /Sun 20 Sep/ }));

    const time = await screen.findByRole("button", { name: "07:00" });
    expect(time).toHaveAttribute("aria-pressed", "true");
  });

  it("does not choose for them when the day has two", async () => {
    server.use(
      availability([
        slot(),
        slot({
          id: "sl_20_1400",
          localStartTime: "14:00:00",
          startsAt: "2026-09-20T08:30:00Z",
        }),
      ]),
    );
    const user = userEvent.setup();
    renderWithQuery(<BookScreen slug="try-dive-nemo-reef" />);

    await user.click(await screen.findByRole("button", { name: /Sun 20 Sep/ }));

    const early = await screen.findByRole("button", { name: "07:00" });
    expect(early).toHaveAttribute("aria-pressed", "false");
    expect(screen.getByRole("button", { name: "14:00" })).toHaveAttribute(
      "aria-pressed",
      "false",
    );
  });

  it("shows a sold-out departure, disabled, rather than hiding it", async () => {
    /*
      A traveller who knows the 07:00 exists and is taken will look for another
      day. One who sees only the 14:00 assumes that is all there ever is.
    */
    server.use(
      availability([
        slot({ soldOut: true, remainingDisplay: "Full" }),
        slot({
          id: "sl_20_1400",
          localStartTime: "14:00:00",
          startsAt: "2026-09-20T08:30:00Z",
        }),
      ]),
    );
    const user = userEvent.setup();
    renderWithQuery(<BookScreen slug="try-dive-nemo-reef" />);

    await user.click(await screen.findByRole("button", { name: /Sun 20 Sep/ }));
    expect(
      await screen.findByRole("button", { name: /07:00, full/ }),
    ).toBeDisabled();
  });

  it("keeps the choices in the URL, and replaces rather than pushes", async () => {
    /*
      A `push` would put every tap of a calendar square in the history, so Back
      would walk a traveller through their own deliberation instead of
      returning to the listing.
    */
    server.use(availability([slot()]));
    const user = userEvent.setup();
    renderWithQuery(<BookScreen slug="try-dive-nemo-reef" />);

    await user.click(await screen.findByRole("button", { name: /Sun 20 Sep/ }));

    await waitFor(() =>
      expect(nav.replaced.at(-1)).toContain("date=2026-09-20"),
    );
    expect(nav.replaced.at(-1)).toContain("slot=sl_20_0700");
  });
});

describe("arriving with choices already made", () => {
  it("opens an old ?slot= link with that departure chosen", async () => {
    /*
      Every link in the wild from before this change carries `?slot=&guests=`,
      and they all still have to work: a URL survives a bookmark and a message.
    */
    nav.search = "date=2026-09-20&slot=sl_20_0700&guests=2";
    server.use(availability([slot()]));
    renderWithQuery(<BookScreen slug="try-dive-nemo-reef" />);

    expect(
      await screen.findByRole("button", { name: "07:00" }),
    ).toHaveAttribute("aria-pressed", "true");
    // And the party came with it.
    expect(await screen.findByText(/2 people/)).toBeInTheDocument();
  });
});

describe("when the calendar is out of date", () => {
  it("shows the API's own sentence above the calendar", async () => {
    /*
      Seats gone and a moved price are both "the availability this page was
      drawn from is stale", so the message goes where the traveller looks next
      rather than beside the button they just pressed.
    */
    nav.search = "date=2026-09-20&slot=sl_20_0700";
    server.use(
      availability([slot()]),
      http.post(`${BASE}/reservations`, () =>
        HttpResponse.json(
          {
            error: {
              code: "capacity_unavailable",
              message: "Those seats went while you were deciding.",
            },
          },
          { status: 409 },
        ),
      ),
    );

    /*
      The kayak rather than the dive. The dive listing carries age bands, a
      health check and four operator questions, so filling it in here would
      make a test about a 409 into a test about a form. The kayak asks for a
      name, a number and the policy, which is the shortest true path to a
      submitted reservation.
    */
    const user = userEvent.setup();
    renderWithQuery(<BookScreen slug="mangrove-kayak-at-dawn" />);

    await user.type(await screen.findByLabelText(/Your name/i), "Asha Menon");
    await user.type(screen.getByLabelText(/WhatsApp number/i), "9000000000");
    await user.click(screen.getByRole("checkbox", { name: /called off/i }));
    await user.click(screen.getByRole("button", { name: /Hold these seats/i }));

    expect(
      await screen.findByText("Those seats went while you were deciding."),
    ).toBeInTheDocument();
  });

  it("books at the new price after a moved price, with a fresh key", async () => {
    /*
      yuvoy-api#193 asked for the changed-price checkout path to be confirmed
      from the app, and until this test nothing here had ever produced a
      `price_moved`: the mock ignored the agreed total entirely, which is how
      the app sent it under a name the API does not read (`expectedTotalMinor`
      rather than `expectTotalPaise`) without a single test noticing.

      The whole loop, because each step is a separate way to strand somebody:
        1. the first attempt, at the old total, is refused;
        2. the panel beside the button says what happened, not "it is us";
        3. the dates are refetched and the bar shows the NEW total;
        4. the next attempt sends the new total under a NEW idempotency key.
           The total is part of the body, so reusing the key would be refused
           as `idempotency_key_reuse` and the traveller could never book.
    */
    nav.search = "date=2026-09-20&slot=sl_20_0700";
    let price = 450000;
    const sent: { total: unknown; misnamed: unknown; key: string | null }[] =
      [];
    server.use(
      http.get(`${BASE}/experiences/:slug/availability`, () =>
        HttpResponse.json({
          slots: [slot({ price: { amountMinor: price, currency: "INR" } })],
          bookable: true,
          availabilityAsOf: "2026-09-14T04:00:00Z",
          marketTimezone: "Asia/Kolkata",
          staleSlotsSuppressed: 0,
        }),
      ),
      http.post(`${BASE}/reservations`, async ({ request }) => {
        const body = (await request.json()) as {
          expectTotalPaise?: number;
          expectedTotalMinor?: unknown;
        };
        sent.push({
          total: body.expectTotalPaise,
          misnamed: body.expectedTotalMinor,
          key: request.headers.get("idempotency-key"),
        });
        if (body.expectTotalPaise !== 500000) {
          // The operator raised the price while the form was open.
          price = 500000;
          return HttpResponse.json(
            {
              error: {
                code: "price_moved",
                message: "The price of this departure changed.",
                requestId: "01JPRICE",
              },
            },
            { status: 409 },
          );
        }
        return HttpResponse.json(
          {
            reservationId: "res_new",
            state: "active",
            guests: 1,
            holdExpiresAt: "2026-09-14T04:10:00Z",
            requestExpiresAt: null,
            statusToken: "tok_after_price_moved",
          },
          { status: 201 },
        );
      }),
    );

    const user = userEvent.setup();
    renderWithQuery(<BookScreen slug="mangrove-kayak-at-dawn" />);

    await user.type(await screen.findByLabelText(/Your name/i), "Asha Menon");
    await user.type(screen.getByLabelText(/WhatsApp number/i), "9000000000");
    await user.click(screen.getByRole("checkbox", { name: /called off/i }));
    await user.click(
      screen.getByRole("button", { name: /Hold these seats · ₹4,500/i }),
    );

    // 1 and 2: refused, and told the truth about it, above and beside.
    expect(
      await screen.findByText("The price of this departure changed."),
    ).toBeInTheDocument();
    expect(screen.getByText("The price has changed")).toBeInTheDocument();
    expect(screen.queryByText(/trying again often fixes it/)).toBeNull();

    // 3: the refetch lands and the bar carries the new total.
    const pay = await screen.findByRole("button", {
      name: /Hold these seats · ₹5,000/i,
    });

    // 4: the new agreement goes through, under its own key.
    await user.click(pay);
    await waitFor(() => expect(sent).toHaveLength(2));
    // Under the contract's name, and never the old misspelling: the API
    // ignores any key it does not know, so a wrong name checks nothing.
    expect(sent[0].total).toBe(450000);
    expect(sent[1].total).toBe(500000);
    expect(sent[0].misnamed).toBeUndefined();
    expect(sent[1].key).toBeTruthy();
    expect(sent[1].key).not.toBe(sent[0].key);
    await waitFor(() =>
      expect(
        nav.replaced.some((h) => h.includes("tok_after_price_moved")),
      ).toBe(true),
    );
  });
});

describe("the summary in the bar", () => {
  it("puts the day, the time, the party and the total on one line", async () => {
    /*
      It is the last thing read before committing, and on a page where each of
      those was chosen several scrolls apart it is the only place they appear
      together.
    */
    nav.search = "date=2026-09-20&slot=sl_20_0700&guests=2";
    server.use(availability([slot()]));
    renderWithQuery(<BookScreen slug="try-dive-nemo-reef" />);

    const bar = await screen.findByText(
      /Sun, 20 Sep · 07:00 · 2 people · ₹9,000/,
    );
    expect(bar).toBeInTheDocument();
  });

  it("says person, not people, for one", async () => {
    nav.search = "date=2026-09-20&slot=sl_20_0700";
    server.use(availability([slot()]));
    renderWithQuery(<BookScreen slug="try-dive-nemo-reef" />);

    expect(
      await screen.findByText(/Sun, 20 Sep · 07:00 · 1 person · ₹4,500/),
    ).toBeInTheDocument();
  });
});

describe("dates that will not load", () => {
  it("says so, and offers a retry", async () => {
    server.use(
      http.get(`${BASE}/experiences/:slug/availability`, () =>
        HttpResponse.json(
          { error: { code: "service_unavailable", message: "later" } },
          { status: 503 },
        ),
      ),
    );
    renderWithQuery(<BookScreen slug="try-dive-nemo-reef" />);

    expect(await screen.findByText("Dates did not load.")).toBeInTheDocument();
    expect(
      screen.getByRole("button", { name: "Try again" }),
    ).toBeInTheDocument();
  });
});
