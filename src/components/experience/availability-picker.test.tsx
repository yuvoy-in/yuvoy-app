import { describe, it, expect } from "vitest";
import { useState } from "react";
import { screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { renderWithQuery } from "@/test/render";
import { AvailabilityPicker } from "./availability-picker";
import { server } from "../../../mocks/server";
import { http, HttpResponse } from "msw";
import type { components } from "@/lib/api/schema.gen";

import { availabilityFor, mockHeaders, mockNow } from "../../../mocks/fixtures";

type Slot = components["schemas"]["Slot"];

const BASE = process.env.NEXT_PUBLIC_API_URL ?? "http://localhost:8099/v1";
const SLUG = "try-dive-nemo-reef";

/**
 * T4's four rules, each with a real cost if broken. These are the tests that
 * would have caught the bug the contract's own comment says already happened
 * once ("re-deriving makes the two disagree the moment the rule changes").
 *
 * ## The picker shows ONE day now — yuvoy-app#32
 *
 * Every day in the window used to be stacked; the owner called it an endless
 * scroll. So the day is a chip row and the caller owns which one is open,
 * which means these tests need a stateful host rather than a bare render.
 * `openDay` is what a thumb does.
 */
function Picker(props: {
  slug?: string;
  bookingMode?: "allotment" | "request";
  onSelect?: (slot: Slot | null) => void;
}) {
  const [selected, setSelected] = useState<Slot | null>(null);
  const [day, setDay] = useState<string | null>(null);
  return (
    <AvailabilityPicker
      slug={props.slug ?? SLUG}
      bookingMode={props.bookingMode ?? "allotment"}
      selectedId={selected?.id ?? null}
      onSelect={(slot) => {
        setSelected(slot);
        props.onSelect?.(slot);
      }}
      day={day}
      onDay={setDay}
    />
  );
}

/** Taps the nth day chip, once the chips have arrived. */
async function openDay(
  user: ReturnType<typeof userEvent.setup>,
  index: number,
) {
  const chips = await screen.findByRole("group", { name: "Which day" });
  const buttons = within(chips).getAllByRole("button");
  await user.click(buttons[index]);
}
describe("AvailabilityPicker", () => {
  it("renders remainingDisplay verbatim and never re-derives it", async () => {
    const user = userEvent.setup();
    renderWithQuery(<Picker />);

    // Day one carries the exact-count and the full departure.
    await openDay(user, 1);
    expect(await screen.findByText("4 seats left")).toBeInTheDocument();
    expect(screen.getByText("Full")).toBeInTheDocument();

    // Day two carries the "Available" bucket: remainingSeats is 11, and the
    // UI must NOT print 11. A counter reading 23, then 21, then 22 as holds
    // expire teaches the traveller the number is noise.
    await openDay(user, 2);
    expect(screen.getAllByText("Available").length).toBeGreaterThan(0);
    expect(screen.queryByText(/11 seats/)).not.toBeInTheDocument();
  });

  it("greys a full departure out on soldOut, not on the display string", async () => {
    /*
      yuvoy-app#32 and the `Slot.soldOut` field (api#171). This used to sniff
      `remainingDisplay === "Full"`, which is a string the server owns matched
      exactly in a client: the day "Full" becomes "Fully booked", every
      sold-out departure silently becomes bookable again.

      The fixture's full departure keeps its display string and loses the
      flag, so only a picker reading the flag still disables it.
    */
    const slots = availabilityFor(SLUG).map((slot) =>
      slot.remainingDisplay === "Full" ? { ...slot, soldOut: false } : slot,
    );
    server.use(
      http.get(`${BASE}/experiences/:slug/availability`, () =>
        HttpResponse.json(
          {
            slots,
            availabilityAsOf: new Date(mockNow()).toISOString(),
            marketTimezone: "Asia/Kolkata",
            staleSlotsSuppressed: 0,
          },
          /*
            `mockHeaders` carries the API's own `Date`, which is what teaches
            the client its clock offset. Without it the picker measures the
            fixture's departures against real wall-clock time and calls every
            one of them closed — so the row would be disabled for the wrong
            reason and this test would pass while proving nothing.
          */
          { headers: mockHeaders("01JSOLDOUT") },
        ),
      ),
    );

    const user = userEvent.setup();
    renderWithQuery(<Picker />);
    await openDay(user, 1);

    // Still says Full, because the server said so — and is selectable, because
    // the server says it is not sold out. The two are independent facts.
    const row = (await screen.findByText("Full")).closest("button")!;
    expect(row).not.toBeDisabled();
  });

  it("greys a sold-out REQUEST departure out, where there is no seat count", async () => {
    /*
      The half that could not work before. Request mode withholds counts on
      purpose, so its display string is "Ask the operator" whatever the state
      — a departure the operator had already granted out looked exactly like
      an open one, and the traveller asked for a seat that could not be given.
      `soldOut` is published in both modes and is the only signal this one gets.

      The fixture's third request day is granted out.
    */
    const user = userEvent.setup();
    renderWithQuery(
      <Picker slug="snorkel-elephant-beach" bookingMode="request" />,
    );
    await openDay(user, 2);

    const row = (await screen.findByText("Fully booked")).closest("button")!;
    expect(row).toBeDisabled();
    // And it says why, in words a request-mode traveller can act on.
    expect(screen.getByText(/promised out this departure/)).toBeInTheDocument();
    // Still no number, ever.
    expect(screen.queryByText(/seats left/)).not.toBeInTheDocument();
  });

  it("shows a closed slot disabled rather than hiding it", async () => {
    renderWithQuery(<Picker />);

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
    const user = userEvent.setup();
    renderWithQuery(<Picker />);
    // The stale departure is on day two.
    await openDay(user, 2);
    // Showing less than yesterday, silently, is the wrong move — asOf and
    // verifiedVia are on the response for exactly this.
    expect(
      await screen.findByText(/Seat count last confirmed .* \(by message\)/),
    ).toBeInTheDocument();
  });

  it("publishes no seat count at all in request mode", async () => {
    renderWithQuery(
      <Picker slug="snorkel-elephant-beach" bookingMode="request" />,
    );

    // One departure per day, and the picker shows one day — so one row.
    expect(await screen.findAllByText("Ask the operator")).toHaveLength(1);
    // A number here would be a promise we cannot keep.
    expect(screen.queryByText(/seats left/)).not.toBeInTheDocument();
    expect(
      screen.getByText(/nothing is held until they say yes/),
    ).toBeInTheDocument();
  });

  it("offers every day, including one with nothing left on it", async () => {
    /*
      Hiding a full day tells a traveller the day does not exist, which is the
      same mistake the contract forbids for a single departure. It is offered
      and marked.
    */
    renderWithQuery(<Picker />);
    const chips = await screen.findByRole("group", { name: "Which day" });
    const days = within(chips).getAllByRole("button");
    expect(days.length).toBeGreaterThan(1);
    // Day zero is the closed-past-cutoff departure and nothing else.
    expect(days[0].textContent).toMatch(/Full/);
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

    renderWithQuery(<Picker />);

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

    renderWithQuery(<Picker />);

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

    renderWithQuery(<Picker />);

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

    const user = userEvent.setup();
    renderWithQuery(<Picker />);
    // The departure the cutoff was moved on is the first one, which is day one.
    await openDay(user, 1);

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

    renderWithQuery(<Picker />);

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

    renderWithQuery(<Picker />);

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

    renderWithQuery(<Picker />);

    expect(
      await screen.findByText("No dates on sale right now"),
    ).toBeInTheDocument();
  });
});
