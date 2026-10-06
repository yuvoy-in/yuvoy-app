import { describe, it, expect, afterEach } from "vitest";
import { screen, cleanup } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { http, HttpResponse } from "msw";
import { renderWithQuery } from "@/test/render";
import { NextDays } from "./next-days";
import { server } from "../../../mocks/server";

const BASE = process.env.NEXT_PUBLIC_API_URL ?? "http://localhost:8099/v1";
const SLUG = "try-dive-nemo-reef";

/**
 * The next open days in the listing's price panel (the approved redesign,
 * traveller A, 3 Oct 2026). The rule is `openDaysOf`, tested there; these pin
 * what the panel says in each state of the read.
 */

afterEach(cleanup);

describe("the next open days", () => {
  it("names the first day in words, its seats, and the days after it", async () => {
    /*
      The mock's clock is Wed 19 Aug. That morning's departure is past its
      cutoff, so the first day is tomorrow, where one boat of two is full, so
      its seat sentence is unambiguous. Friday has two open boats, so it is
      named and no seat count is given for it.
    */
    renderWithQuery(<NextDays slug={SLUG} bookable />);
    const first = await screen.findByText(/^Next open:/);
    expect(first).toHaveTextContent(
      "Next open: Tomorrow, Thu 20 Aug · 4 seats left",
    );
    expect(screen.getByText("Tomorrow, Thu 20 Aug").tagName).toBe("STRONG");
    expect(screen.getByText(/^Then /)).toHaveTextContent("Then Fri 21 Aug");
    expect(screen.queryByText(/and more/)).toBeNull();
  });

  it("holds the space while it asks, and claims nothing yet", () => {
    const { container } = renderWithQuery(<NextDays slug={SLUG} bookable />);
    expect(container.querySelectorAll(".skeleton")).toHaveLength(2);
    expect(screen.queryByText(/No dates|Next open/)).toBeNull();
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
    renderWithQuery(<NextDays slug={SLUG} bookable />);
    expect(
      await screen.findByText("No dates in the next 90 days"),
    ).toBeInTheDocument();
  });

  it("says a failed read failed, claims nothing about the dates, and asks again", async () => {
    /*
      It used to say nothing at all, and the panel shrank by the block's
      height under everything below it. A 404, so the read settles as failed
      rather than retrying (see the bar's own test of this); the second ask
      is answered.
    */
    let asked = 0;
    server.use(
      http.get(`${BASE}/experiences/:slug/availability`, () => {
        asked += 1;
        if (asked > 1) return undefined;
        return HttpResponse.json(
          { error: { code: "not_found", message: "Not found." } },
          { status: 404 },
        );
      }),
    );
    const user = userEvent.setup();
    renderWithQuery(<NextDays slug={SLUG} bookable />);
    expect(
      await screen.findByText(/^The open days did not load\./),
    ).toBeInTheDocument();
    expect(screen.queryByText(/No dates|Next open/)).toBeNull();

    await user.click(screen.getByRole("button", { name: "Try again" }));
    expect(await screen.findByText(/^Next open:/)).toBeInTheDocument();
    expect(screen.queryByText(/did not load/)).toBeNull();
    expect(asked).toBe(2);
  });

  it("is one block of the same two lines in every state", async () => {
    /*
      jsdom lays nothing out, so this pins the reservation itself: the block
      is at least two of its own lines in every state, and the wait is drawn
      as two of those lines, not as bars of a fixed height. The e2e measures
      the page around it.
    */
    const { container } = renderWithQuery(<NextDays slug={SLUG} bookable />);
    const block = container.firstElementChild as HTMLElement;
    expect(block.className).toContain("min-h-[calc(2lh+0.125rem)]");
    expect(block.className).toContain("text-sm");
    const lines = block.querySelectorAll(":scope > div");
    expect(lines).toHaveLength(2);
    lines.forEach((line) => expect(line.className).toContain("h-[1lh]"));
    await screen.findByText(/^Next open:/);
    expect(container.firstElementChild).toBe(block);
  });

  it("is absent on a listing that is not on sale, and asks for nothing", async () => {
    let asked = 0;
    server.use(
      http.get(`${BASE}/experiences/:slug/availability`, () => {
        asked += 1;
        return HttpResponse.json({ slots: [] });
      }),
    );
    const { container } = renderWithQuery(
      <NextDays slug={SLUG} bookable={false} />,
    );
    await new Promise((r) => setTimeout(r, 50));
    expect(asked).toBe(0);
    expect(container).toBeEmptyDOMElement();
  });
});
