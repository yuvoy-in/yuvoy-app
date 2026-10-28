import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { act, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { renderWithQuery } from "@/test/render";
import { SeeDetails, __resetSeeDetails } from "./see-details";
import type { components } from "@/lib/api/schema.gen";

/**
 * See details and the leaving sheet (yuvoy-app#179, case 6 of the issue):
 * the notice comes first, then the stored link opens in a new tab with
 * nothing added, and `link_out` is counted on the tap that opens it.
 */

const store = vi.hoisted(() => ({ off: false, set: [] as boolean[] }));
vi.mock("@/lib/found/device-store", () => ({
  leaveNoticeOff: vi.fn(async () => store.off),
  setLeaveNoticeOff: vi.fn(async (off: boolean) => {
    store.set.push(off);
  }),
  hideCard: vi.fn(async () => {}),
  hiddenCardIds: vi.fn(async () => new Set()),
  HIDDEN_CARDS_CHANGED: "yv:hidden-cards-changed",
}));

const outcomes = vi.hoisted(() => ({ recorded: [] as unknown[][] }));
vi.mock("@/lib/found/found-outcomes", () => ({
  recordFound: vi.fn((...args: unknown[]) => {
    outcomes.recorded.push(args);
  }),
}));

const URL_AS_STORED = "https://www.venue.example.in:443/night?utm_source=x";

const item = (seeDetailsUrl?: string): components["schemas"]["FoundItem"] => ({
  id: "card_1",
  kind: "event",
  department: null,
  title: "A night market",
  when: { startsOn: null, startTime: null, endsOn: null, repeats: null },
  where: { placeText: null, town: "Bengaluru" },
  price: { kind: "unknown", from: null, text: "Price on their page" },
  status: "scheduled",
  check: {
    tier: "found",
    label: "Found by Trigo · not checked yet",
    checkedAt: null,
    lapsed: false,
    sourceName: "venue.example.in",
    sourceUrl: URL_AS_STORED,
  },
  ...(seeDetailsUrl ? { seeDetailsUrl } : {}),
});

/** jsdom cannot open a tab; the click is stopped once React has seen it. */
const stopLeaving = (e: Event) => e.preventDefault();

beforeEach(() => {
  store.off = false;
  store.set = [];
  outcomes.recorded = [];
  __resetSeeDetails();
  window.addEventListener("click", stopLeaving);
});
afterEach(() => window.removeEventListener("click", stopLeaving));

describe("See details", () => {
  it("draws nothing without a safe address", () => {
    for (const url of [undefined, "javascript:alert(1)", "data:text/html,x"]) {
      const { container, unmount } = renderWithQuery(
        <SeeDetails item={item(url)} surface="found_feed" />,
      );
      expect(container).toBeEmptyDOMElement();
      unmount();
    }
  });

  it("is a link to the address as stored, saying the host it opens", () => {
    renderWithQuery(
      <SeeDetails item={item(URL_AS_STORED)} surface="found_feed" />,
    );
    const link = screen.getByRole("link", { name: "See details" });
    expect(link).toHaveAttribute("href", URL_AS_STORED);
    expect(link).toHaveAttribute("target", "_blank");
    // `noopener`, and not `noreferrer` (R2-T4).
    expect(link).toHaveAttribute("rel", "noopener");
    expect(link).toHaveAccessibleDescription("Opens venue.example.in");
  });

  it("warns first, and Stay on Yuvoy opens nothing and counts nothing", async () => {
    const user = userEvent.setup();
    renderWithQuery(
      <SeeDetails item={item(URL_AS_STORED)} surface="found_feed" />,
    );

    await user.click(screen.getByRole("link", { name: "See details" }));

    expect(screen.getByText("You're leaving Yuvoy")).toBeInTheDocument();
    expect(
      screen.getByText(
        "This opens venue.example.in in a new tab. Check the date, price and tickets on their page. Yuvoy doesn't sell these tickets.",
      ),
    ).toBeInTheDocument();
    expect(outcomes.recorded).toEqual([]);

    await user.click(screen.getByRole("button", { name: "Stay on Yuvoy" }));
    await waitFor(() =>
      expect(screen.queryByText("You're leaving Yuvoy")).toBeNull(),
    );
    expect(outcomes.recorded).toEqual([]);
  });

  it("opens the same link from the sheet and counts link_out there", async () => {
    const user = userEvent.setup();
    renderWithQuery(
      <SeeDetails
        item={item(URL_AS_STORED)}
        surface="found_feed"
        position={3}
      />,
    );

    await user.click(screen.getByRole("link", { name: "See details" }));
    const open = screen.getByRole("link", { name: "Open venue.example.in" });
    expect(open).toHaveAttribute("href", URL_AS_STORED);
    expect(open).toHaveAttribute("target", "_blank");
    expect(open).toHaveAttribute("rel", "noopener");

    await user.click(open);
    expect(outcomes.recorded).toEqual([
      ["link_out", "card_1", "found_feed", 3],
    ]);
    // The box was not ticked: the device keeps asking.
    expect(store.set).toEqual([]);
  });

  it("goes straight there once the box is ticked", async () => {
    const user = userEvent.setup();
    renderWithQuery(
      <SeeDetails item={item(URL_AS_STORED)} surface="found_detail" />,
    );

    await user.click(screen.getByRole("link", { name: "See details" }));
    await user.click(
      screen.getByRole("checkbox", {
        name: "Don't show this again on this device",
      }),
    );
    await user.click(
      screen.getByRole("link", { name: "Open venue.example.in" }),
    );
    expect(store.set).toEqual([true]);
    await waitFor(() =>
      expect(screen.queryByText("You're leaving Yuvoy")).toBeNull(),
    );

    await user.click(screen.getByRole("link", { name: "See details" }));
    expect(screen.queryByText("You're leaving Yuvoy")).toBeNull();
    expect(outcomes.recorded).toEqual([
      ["link_out", "card_1", "found_detail", undefined],
      ["link_out", "card_1", "found_detail", undefined],
    ]);
  });

  it("does not ask a device that already said not to", async () => {
    store.off = true;
    const user = userEvent.setup();
    renderWithQuery(
      <SeeDetails item={item(URL_AS_STORED)} surface="found_feed" />,
    );

    // The answer is read as the control mounts; let it land.
    await act(async () => {
      await Promise.resolve();
    });
    await user.click(screen.getByRole("link", { name: "See details" }));

    expect(screen.queryByText("You're leaving Yuvoy")).toBeNull();
    expect(outcomes.recorded).toEqual([
      ["link_out", "card_1", "found_feed", undefined],
    ]);
  });
});
