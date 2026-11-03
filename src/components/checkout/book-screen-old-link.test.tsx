import { describe, it, expect, afterEach, vi } from "vitest";
import { screen, cleanup, waitFor } from "@testing-library/react";
import { http, HttpResponse } from "msw";
import { renderWithQuery } from "@/test/render";
import { BookScreen } from "./book-screen";
import { server } from "../../../mocks/server";

const BASE = process.env.NEXT_PUBLIC_API_URL ?? "http://localhost:8099/v1";

/**
 * A checkout link that names the departure and not the day (yuvoy-app#245).
 *
 * The listing's own booking control linked to `?slot=&guests=` from 24 Aug to
 * 15 Sep 2026, before checkout chose its own day, and those links are still in
 * bookmarks, chats and history. The day is the departure's own `localDate`,
 * read once the seats are; a departure that is gone, full or past its cutoff
 * leaves the calendar as a link with nothing on it would.
 *
 * Its own file because `book-screen.test.tsx` is over 500 lines; the mocks
 * are repeated here since vitest mocks are per file.
 */

const nav = vi.hoisted(() => ({ search: "" }));
vi.mock("next/navigation", () => ({
  useRouter: () => ({ push: vi.fn(), replace: vi.fn() }),
  usePathname: () => "/e/try-dive-nemo-reef/book",
  useSearchParams: () => new URLSearchParams(nav.search),
}));

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

const october = slot({
  id: "sl_oct_15",
  localDate: "2026-10-15",
  startsAt: "2026-10-15T01:30:00Z",
  endsAt: "2026-10-15T04:30:00Z",
  bookingCutoffAt: "2026-10-15T00:00:00Z",
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

const query = () => new URLSearchParams(window.location.search);

afterEach(() => {
  cleanup();
  nav.search = "";
  // The screen writes its choices into the real address bar (jsdom's).
  window.history.replaceState(null, "", "/");
});

describe("an old ?slot= link with no day", () => {
  it("opens with that departure chosen, its day read from the departure", async () => {
    nav.search = "slot=sl_20_0700&guests=2";
    server.use(availability([slot()]));
    renderWithQuery(<BookScreen slug="try-dive-nemo-reef" />);

    expect(
      await screen.findByRole("button", { name: "07:00" }),
    ).toHaveAttribute("aria-pressed", "true");
    expect(
      screen.getByRole("heading", { level: 1, name: /Sun, 20 Sep · 07:00/ }),
    ).toBeInTheDocument();
    // And the party came with it.
    expect(await screen.findByText(/2 people/)).toBeInTheDocument();
  });

  it("writes the day into the address, so the link copied next names it", async () => {
    nav.search = "slot=sl_20_0700&guests=2";
    server.use(availability([slot()]));
    renderWithQuery(<BookScreen slug="try-dive-nemo-reef" />);

    await waitFor(() => expect(query().get("date")).toBe("2026-09-20"));
    expect(query().get("slot")).toBe("sl_20_0700");
    expect(query().get("guests")).toBe("2");
  });

  it("chooses the departure named, not the day's only open one", async () => {
    nav.search = "slot=sl_20_1400";
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
    renderWithQuery(<BookScreen slug="try-dive-nemo-reef" />);

    expect(
      await screen.findByRole("button", { name: "14:00" }),
    ).toHaveAttribute("aria-pressed", "true");
    expect(screen.getByRole("button", { name: "07:00" })).toHaveAttribute(
      "aria-pressed",
      "false",
    );
  });

  it("opens the calendar on the departure's month, not the first open one", async () => {
    nav.search = "slot=sl_oct_15";
    server.use(availability([slot(), october]));
    renderWithQuery(<BookScreen slug="try-dive-nemo-reef" />);

    expect(await screen.findByText("October 2026")).toBeInTheDocument();
    expect(screen.queryByText("September 2026")).toBeNull();
    expect(screen.getByRole("button", { name: "07:00" })).toHaveAttribute(
      "aria-pressed",
      "true",
    );
    await waitFor(() => expect(query().get("date")).toBe("2026-10-15"));
  });
});

describe("an old ?slot= link whose departure cannot be booked", () => {
  /*
    The calendar, as a link with nothing on it opens, and the dead `slot=`
    leaves the address rather than riding along into the next copied link.
  */
  async function opensOnTheCalendar() {
    // The dates have been read, and no day is chosen.
    expect(
      await screen.findByRole("button", { name: /Sun 20 Sep/ }),
    ).toHaveAttribute("aria-pressed", "false");
    expect(
      screen.getByRole("heading", {
        level: 1,
        name: /When would you like to go\?/,
      }),
    ).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: /^07:00/ })).toBeNull();
    await waitFor(() => expect(query().get("slot")).toBeNull());
    expect(query().get("date")).toBeNull();
  }

  it("falls back to the calendar when the departure is gone", async () => {
    nav.search = "slot=sl_gone&guests=2";
    server.use(availability([slot()]));
    renderWithQuery(<BookScreen slug="try-dive-nemo-reef" />);

    await opensOnTheCalendar();
    // The party size is still the link's.
    expect(query().get("guests")).toBe("2");
  });

  it("falls back to the calendar when the departure is full", async () => {
    nav.search = "slot=sl_20_0700";
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
    renderWithQuery(<BookScreen slug="try-dive-nemo-reef" />);

    await opensOnTheCalendar();
  });

  it("falls back to the calendar when the departure is past its cutoff", async () => {
    nav.search = "slot=sl_20_0700";
    server.use(
      availability([
        slot({ bookingCutoffAt: "2026-08-01T00:00:00Z" }),
        slot({
          id: "sl_20_1400",
          localStartTime: "14:00:00",
          startsAt: "2026-09-20T08:30:00Z",
        }),
      ]),
    );
    renderWithQuery(<BookScreen slug="try-dive-nemo-reef" />);

    await opensOnTheCalendar();
  });
});
