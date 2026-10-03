import { describe, it, expect, afterEach, beforeEach, vi } from "vitest";
import { screen, cleanup, within, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { http, HttpResponse } from "msw";
import { renderWithQuery } from "@/test/render";
import { ReelDetails } from "./reel-details";
import { EXPERIENCES } from "../../../mocks/fixtures";
import { server } from "../../../mocks/server";
import { __resetClockOffset } from "@/lib/booking/clock";
import { marketDayOf } from "@/lib/booking/availability-window";
import type { components } from "@/lib/api/schema.gen";

type Slot = components["schemas"]["Slot"];

const BASE = process.env.NEXT_PUBLIC_API_URL ?? "http://localhost:8099/v1";

/*
  jsdom has no ResizeObserver, and the panel uses one to mark when its body
  overflows (the fade). Nothing here measures layout, so a no-op stands in.
*/
class NoResizeObserver {
  observe() {}
  unobserve() {}
  disconnect() {}
}
vi.stubGlobal("ResizeObserver", NoResizeObserver);

/**
 * The reel's details panel, since the redesign (traveller A, 3 Oct 2026): it
 * lists the next open departures, read once on the first open, and books the
 * first of them from its action. Every state of that read is pinned here,
 * because each one used to be a way for a panel to spin, lie or dead-end.
 */

const DIVE = EXPERIENCES[0]; // try-dive-nemo-reef, allotment, on sale
const SNORKEL = EXPERIENCES[1]; // a request-mode listing

const DAY = 86_400_000;
/** A market date `n` days from the real now, so the read is never in the past. */
const day = (n: number) => marketDayOf(Date.now() + n * DAY);

const slot = (over: Partial<Slot>): Slot =>
  ({
    id: "s",
    status: "open",
    soldOut: false,
    remainingDisplay: "Available",
    localDate: day(1),
    localStartTime: "07:00:00",
    ...over,
  }) as Slot;

/** Serves these slots for every availability read, and counts the reads. */
function serve(slots: Slot[] | "fail") {
  const calls = { n: 0 };
  server.use(
    http.get(`${BASE}/experiences/:slug/availability`, () => {
      calls.n += 1;
      if (slots === "fail") {
        // A 404, not a 500: the client retries a 5xx itself, and the test
        // must reach the FAILED state rather than wait in the loading one.
        return HttpResponse.json(
          { error: { code: "not_found", message: "No such experience." } },
          { status: 404 },
        );
      }
      return HttpResponse.json({
        bookable: true,
        slots,
        availabilityAsOf: new Date().toISOString(),
        marketTimezone: "Asia/Kolkata",
        staleSlotsSuppressed: 0,
      });
    }),
  );
  return calls;
}

function panel(experience = DIVE, open = true) {
  return renderWithQuery(
    <ReelDetails
      experience={experience}
      href={`/e/${experience.slug}`}
      open={open}
      onClose={() => {}}
      id="details"
    />,
  );
}

beforeEach(() => __resetClockOffset());
afterEach(cleanup);

describe("the panel's departures", () => {
  it("asks for nothing until the panel has been opened", async () => {
    const calls = serve([slot({})]);
    panel(DIVE, false);
    // Give a read every chance to have happened.
    await new Promise((r) => setTimeout(r, 30));
    expect(calls.n).toBe(0);
    expect(screen.queryByText("Coming up")).toBeNull();
  });

  it("lists the next open departures, each a way into checkout on it", async () => {
    serve([
      slot({ id: "a", remainingDisplay: "3 seats left" }),
      slot({ id: "b", localStartTime: "11:30:00", soldOut: true }),
      slot({ id: "c", localDate: day(2), localStartTime: "09:00:00" }),
    ]);
    panel();

    const list = await screen.findByRole("list");
    const rows = within(list).getAllByRole("link");
    // The sold-out departure is never offered: checkout would refuse it.
    expect(rows).toHaveLength(2);
    expect(rows[0]).toHaveAccessibleName("Book Tomorrow 07:00 3 seats left");
    expect(rows[0]).toHaveAttribute(
      "href",
      `/e/${DIVE.slug}/book?date=${day(1)}&slot=a`,
    );
    expect(rows[1]).toHaveAttribute(
      "href",
      `/e/${DIVE.slug}/book?date=${day(2)}&slot=c`,
    );
    expect(screen.getByText("Tap one to book it")).toBeInTheDocument();
  });

  it("books the first departure from its action once it knows it", async () => {
    serve([slot({ id: "a" })]);
    panel();
    const action = await screen.findByRole("link", {
      name: "Book tomorrow at 07:00",
    });
    expect(action).toHaveAttribute(
      "href",
      `/e/${DIVE.slug}/book?date=${day(1)}&slot=a`,
    );
  });

  it("opens the listing from its action while it is still asking", () => {
    serve([slot({})]);
    panel();
    // The action never waits on the read.
    expect(screen.getByRole("link", { name: "See dates" })).toHaveAttribute(
      "href",
      `/e/${DIVE.slug}`,
    );
    expect(
      screen.getByRole("status", { name: "Loading departures" }),
    ).toBeInTheDocument();
  });

  it("asks, rather than books, for a listing the operator confirms", async () => {
    serve([slot({ id: "r", remainingDisplay: "Ask the operator" })]);
    panel(SNORKEL);
    expect(
      await screen.findByRole("link", { name: "Ask for tomorrow at 07:00" }),
    ).toBeInTheDocument();
    expect(screen.getByText("Tap one to ask")).toBeInTheDocument();
    expect(screen.getByText(/Operator confirms first/)).toBeInTheDocument();
  });

  it("says a failed read failed, offers it again, and still opens the listing", async () => {
    const calls = serve("fail");
    panel();
    expect(
      await screen.findByText(/The departures did not load/),
    ).toBeInTheDocument();
    expect(screen.getByRole("link", { name: "See dates" })).toHaveAttribute(
      "href",
      `/e/${DIVE.slug}`,
    );

    serve([slot({ id: "a" })]);
    await userEvent.click(screen.getByRole("button", { name: "Try again" }));
    expect(
      await screen.findByRole("link", { name: "Book tomorrow at 07:00" }),
    ).toBeInTheDocument();
    expect(calls.n).toBe(1);
  });

  it("says so in words when nothing is open to book", async () => {
    serve([slot({ soldOut: true })]);
    panel();
    expect(
      await screen.findByText("Nothing open to book right now."),
    ).toBeInTheDocument();
    expect(screen.getByRole("link", { name: "See dates" })).toBeInTheDocument();
  });

  it("asks nothing for a listing with nothing on sale, and says why", async () => {
    const calls = serve([slot({})]);
    panel({ ...DIVE, nextAvailable: undefined });
    expect(
      screen.getByText("No dates in the next 90 days"),
    ).toBeInTheDocument();
    expect(
      screen.getByRole("link", { name: "Have a look" }),
    ).toBeInTheDocument();
    await new Promise((r) => setTimeout(r, 30));
    expect(calls.n).toBe(0);
  });
});

describe("the panel's focus", () => {
  it("takes focus when it opens, so the next Tab starts inside it", async () => {
    serve([slot({})]);
    const { rerender } = panel(DIVE, false);
    rerender(
      <ReelDetails
        experience={DIVE}
        href={`/e/${DIVE.slug}`}
        open
        onClose={() => {}}
        id="details"
      />,
    );
    await waitFor(() =>
      expect(document.activeElement).toBe(
        screen.getByRole("group", { name: `Details, ${DIVE.title}` }),
      ),
    );
  });
});
