import { describe, it, expect } from "vitest";
import { screen, waitFor } from "@testing-library/react";
import { renderWithQuery } from "@/test/render";
import { AvailabilityPicker } from "./availability-picker";
import { server } from "../../../mocks/server";
import { http, HttpResponse } from "msw";

import { availabilityFor, mockHeaders, mockNow } from "../../../mocks/fixtures";

const BASE = process.env.NEXT_PUBLIC_API_URL ?? "http://localhost:8099/v1";
const SLUG = "try-dive-nemo-reef";

/**
 * T4's four rules, each with a real cost if broken. These are the tests that
 * would have caught the bug the contract's own comment says already happened
 * once ("re-deriving makes the two disagree the moment the rule changes").
 */
describe("AvailabilityPicker", () => {
  it("renders remainingDisplay verbatim and never re-derives it", async () => {
    renderWithQuery(
      <AvailabilityPicker
        slug={SLUG}
        bookingMode="allotment"
        selectedId={null}
        onSelect={() => {}}
      />,
    );

    // The fixture's exact strings, straight from the server.
    expect(await screen.findByText("4 seats left")).toBeInTheDocument();
    expect(screen.getByText("Full")).toBeInTheDocument();

    // The "Available" bucket: remainingSeats is 11, and the UI must NOT
    // print 11. A counter reading 23, then 21, then 22 as holds expire
    // teaches the traveller the number is noise.
    expect(screen.getAllByText("Available").length).toBeGreaterThan(0);
    expect(screen.queryByText(/11 seats/)).not.toBeInTheDocument();
  });

  it("shows a closed slot disabled rather than hiding it", async () => {
    renderWithQuery(
      <AvailabilityPicker
        slug={SLUG}
        bookingMode="allotment"
        selectedId={null}
        onSelect={() => {}}
      />,
    );

    // Hide it and the traveller concludes the day does not exist. More than
    // one row may say so — a full departure whose cutoff has also passed is
    // closed too — and every one of them must be disabled, not hidden.
    const closed = await screen.findAllByText(
      "Booking for this departure has closed.",
    );
    expect(closed.length).toBeGreaterThan(0);
    for (const line of closed) {
      expect(line.closest("button")).toBeDisabled();
    }
  });

  it("says when a stale count was last checked, and by what", async () => {
    renderWithQuery(
      <AvailabilityPicker
        slug={SLUG}
        bookingMode="allotment"
        selectedId={null}
        onSelect={() => {}}
      />,
    );
    // Showing less than yesterday, silently, is the wrong move — asOf and
    // verifiedVia are on the response for exactly this.
    expect(
      await screen.findByText(/Seat count last confirmed .* \(by message\)/),
    ).toBeInTheDocument();
  });

  it("publishes no seat count at all in request mode", async () => {
    renderWithQuery(
      <AvailabilityPicker
        slug="snorkel-elephant-beach"
        bookingMode="request"
        selectedId={null}
        onSelect={() => {}}
      />,
    );

    expect(await screen.findAllByText("Ask the operator")).toHaveLength(3);
    // A number here would be a promise we cannot keep.
    expect(screen.queryByText(/seats left/)).not.toBeInTheDocument();
    expect(
      screen.getByText(/nothing is held until they say yes/),
    ).toBeInTheDocument();
  });

  it("distinguishes an empty day from an unverified one", async () => {
    server.use(
      http.get(`${BASE}/experiences/:slug/availability`, () =>
        HttpResponse.json({
          slots: [],
          availabilityAsOf: new Date().toISOString(),
          marketTimezone: "Asia/Kolkata",
          staleSlotsSuppressed: 3,
        }),
      ),
    );

    renderWithQuery(
      <AvailabilityPicker
        slug={SLUG}
        bookingMode="allotment"
        selectedId={null}
        onSelect={() => {}}
      />,
    );

    expect(
      await screen.findByText(/holding back 3 departures/),
    ).toBeInTheDocument();
  });

  it("renders a deliberate 503 as calm copy, not as a crash", async () => {
    server.use(
      http.get(`${BASE}/experiences/:slug/availability`, () =>
        HttpResponse.json(
          {
            error: {
              code: "operator_not_bookable",
              message: "server copy that must not be rendered",
              requestId: "01JREQ",
            },
          },
          { status: 503 },
        ),
      ),
    );

    renderWithQuery(
      <AvailabilityPicker
        slug={SLUG}
        bookingMode="allotment"
        selectedId={null}
        onSelect={() => {}}
      />,
    );

    expect(
      await screen.findByText("This operator is paused"),
    ).toBeInTheDocument();
    // Branch on code, never on message: the server's wording is not shown.
    expect(
      screen.queryByText("server copy that must not be rendered"),
    ).not.toBeInTheDocument();
    // requestId always visible, small and grey.
    expect(screen.getByText("01JREQ")).toBeInTheDocument();
    // A deliberate stop offers no retry — retrying asks a human's decision again.
    expect(
      screen.queryByRole("button", { name: "Try again" }),
    ).not.toBeInTheDocument();
  });

  it("offers a retry on a genuine fault", async () => {
    server.use(
      http.get(`${BASE}/experiences/:slug/availability`, () =>
        HttpResponse.json(
          {
            error: {
              code: "internal_error",
              message: "boom",
              requestId: "01JERR",
            },
          },
          { status: 500 },
        ),
      ),
    );

    renderWithQuery(
      <AvailabilityPicker
        slug={SLUG}
        bookingMode="allotment"
        selectedId={null}
        onSelect={() => {}}
      />,
    );

    await waitFor(() =>
      expect(screen.getByText("Something went wrong")).toBeInTheDocument(),
    );
    expect(
      screen.getByRole("button", { name: "Try again" }),
    ).toBeInTheDocument();
  });
});

describe("AvailabilityPicker — the booking cutoff", () => {
  it("disables an open slot whose cutoff has passed, without hiding it", async () => {
    // The server still says `open`; the clock says otherwise. "After this
    // instant the slot cannot be booked. Shown disabled, never hidden."
    const [first, ...rest] = availabilityFor(SLUG);
    const passed = {
      ...first,
      status: "open" as const,
      remainingDisplay: "4 seats left",
      // A minute ago in the MOCK's clock — the one every response announces.
      bookingCutoffAt: new Date(mockNow() - 60_000).toISOString(),
    };
    server.use(
      http.get(`${BASE}/experiences/:slug/availability`, () =>
        HttpResponse.json(
          {
            availabilityAsOf: new Date(mockNow()).toISOString(),
            staleSlotsSuppressed: 0,
            slots: [passed, ...rest],
          },
          { headers: mockHeaders("01JCUTOFF") },
        ),
      ),
    );

    renderWithQuery(
      <AvailabilityPicker
        slug={SLUG}
        bookingMode="allotment"
        selectedId={null}
        onSelect={() => {}}
      />,
    );

    const row = (await screen.findByText("4 seats left")).closest("button");
    expect(row).toBeDisabled();
    expect(row).toHaveTextContent("Booking for this departure has closed.");
  });
});

describe("a listing that is not on sale", () => {
  /*
    yuvoy-app#19 §2. `bookable: false` always arrives with `slots: []`, so
    without its own branch it falls into "this operator has not put any
    departures on sale yet" — a different claim, and a false one. One sends a
    traveller looking at another month; the other says not this listing, now.
  */
  it("does not call it a gap in the calendar", async () => {
    server.use(
      http.get(`${BASE}/experiences/:slug/availability`, () =>
        HttpResponse.json({
          bookable: false,
          slots: [],
          availabilityAsOf: new Date().toISOString(),
          marketTimezone: "Asia/Kolkata",
          staleSlotsSuppressed: 0,
        }),
      ),
    );

    renderWithQuery(
      <AvailabilityPicker
        slug={SLUG}
        bookingMode="allotment"
        selectedId={null}
        onSelect={() => {}}
      />,
    );

    expect(
      await screen.findByText("Not available to book right now"),
    ).toBeInTheDocument();
    expect(
      screen.queryByText("No dates on sale right now"),
    ).not.toBeInTheDocument();
  });

  it("names no reason, because the endpoint carries none", async () => {
    /*
      "The response carries no reason, and will not. Why a business has stopped
      selling is a supply judgement about them and does not belong on a
      traveller endpoint." A screen inventing one would be inventing it about a
      real business.
    */
    server.use(
      http.get(`${BASE}/experiences/:slug/availability`, () =>
        HttpResponse.json({
          bookable: false,
          slots: [],
          availabilityAsOf: new Date().toISOString(),
          marketTimezone: "Asia/Kolkata",
          staleSlotsSuppressed: 0,
        }),
      ),
    );

    renderWithQuery(
      <AvailabilityPicker
        slug={SLUG}
        bookingMode="allotment"
        selectedId={null}
        onSelect={() => {}}
      />,
    );

    await screen.findByText("Not available to book right now");
    const text = document.body.textContent?.toLowerCase() ?? "";
    for (const guess of [
      "licence",
      "license",
      "insurance",
      "suspend",
      "expired",
      "closed down",
    ]) {
      expect(text, guess).not.toContain(guess);
    }
  });

  it("still distinguishes a genuinely empty window", async () => {
    // The pre-existing branch must survive: bookable, but nothing in range.
    server.use(
      http.get(`${BASE}/experiences/:slug/availability`, () =>
        HttpResponse.json({
          bookable: true,
          slots: [],
          availabilityAsOf: new Date().toISOString(),
          marketTimezone: "Asia/Kolkata",
          staleSlotsSuppressed: 0,
        }),
      ),
    );

    renderWithQuery(
      <AvailabilityPicker
        slug={SLUG}
        bookingMode="allotment"
        selectedId={null}
        onSelect={() => {}}
      />,
    );

    expect(
      await screen.findByText("No dates on sale right now"),
    ).toBeInTheDocument();
  });
});
