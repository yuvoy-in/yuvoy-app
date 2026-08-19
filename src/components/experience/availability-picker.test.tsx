import { describe, it, expect } from "vitest";
import { screen, waitFor } from "@testing-library/react";
import { renderWithQuery } from "@/test/render";
import { AvailabilityPicker } from "./availability-picker";
import { server } from "../../../mocks/server";
import { http, HttpResponse } from "msw";

const BASE = process.env.NEXT_PUBLIC_API_URL ?? "http://localhost:8099/v1";
const SLUG = "try-dive-nemo-reef";

/**
 * T4's four rules, each with a real cost if broken. These are the tests that
 * would have caught the bug the contract's own comment says already happened
 * once ("re-deriving makes the two disagree the moment the rule changes").
 */
describe("AvailabilityPicker", () => {
  it("renders remainingDisplay verbatim and never re-derives it", async () => {
    renderWithQuery(<AvailabilityPicker slug={SLUG} bookingMode="allotment" />);

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
    renderWithQuery(<AvailabilityPicker slug={SLUG} bookingMode="allotment" />);

    // Hide it and the traveller concludes the day does not exist.
    const closed = await screen.findByText(
      "Booking for this departure has closed.",
    );
    expect(closed).toBeInTheDocument();

    const row = closed.closest("button");
    expect(row).toBeDisabled();
  });

  it("says when a stale count was last checked, and by what", async () => {
    renderWithQuery(<AvailabilityPicker slug={SLUG} bookingMode="allotment" />);
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

    renderWithQuery(<AvailabilityPicker slug={SLUG} bookingMode="allotment" />);

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

    renderWithQuery(<AvailabilityPicker slug={SLUG} bookingMode="allotment" />);

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

    renderWithQuery(<AvailabilityPicker slug={SLUG} bookingMode="allotment" />);

    await waitFor(() =>
      expect(screen.getByText("Something went wrong")).toBeInTheDocument(),
    );
    expect(
      screen.getByRole("button", { name: "Try again" }),
    ).toBeInTheDocument();
  });
});
