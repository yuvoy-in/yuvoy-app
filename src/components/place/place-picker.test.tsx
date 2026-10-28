import { describe, it, expect, vi, afterEach, beforeEach } from "vitest";
import { act, render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { PLACES } from "../../../mocks/fixtures";
import { renderWithQuery } from "@/test/render";
import type { PlaceList, PlaceMarket } from "@/lib/site/places";
import { PlacePicker, placesLine, PLACE_PICKER_WORDS } from "./place-picker";
import { PlaceButton, RememberPlace } from "./place-button";

/**
 * The place picker (yuvoy-app#179, R2-T4): two levels in the server's order,
 * the one-tap rows, Near you first, the loading and error rows, and the
 * focus moving in and coming back.
 */

const push = vi.fn();
vi.mock("next/navigation", () => ({
  useRouter: () => ({ push, replace: vi.fn(), back: vi.fn() }),
  usePathname: () => "/",
  useSearchParams: () => new URLSearchParams(),
}));

const captured: { name: string; properties?: Record<string, unknown> }[] = [];
vi.mock("@/lib/observability/report", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@/lib/observability/report")>()),
  captureEvent: (name: string, properties?: Record<string, unknown>) =>
    void captured.push({ name, properties }),
}));

const KARNATAKA: PlaceMarket = {
  key: "karnataka",
  name: "Karnataka",
  mode: "discover",
  timezone: "Asia/Kolkata",
  currency: "INR",
  destinations: [
    {
      key: "karnataka/bengaluru",
      name: "Bengaluru",
      kind: "local",
      visibleTo: "staff",
    },
    { key: "karnataka/coorg", name: "Coorg", kind: "travel", visibleTo: "staff" },
    { key: "karnataka/hampi", name: "Hampi", kind: "travel", visibleTo: "staff" },
    {
      key: "karnataka/gokarna",
      name: "Gokarna",
      kind: "travel",
      visibleTo: "staff",
    },
    { key: "karnataka/mysuru", name: "Mysuru", kind: "local", visibleTo: "staff" },
  ],
};

const TELANGANA: PlaceMarket = {
  key: "telangana",
  name: "Telangana",
  mode: "discover",
  timezone: "Asia/Kolkata",
  currency: "INR",
  destinations: [
    {
      key: "telangana/hyderabad",
      name: "Hyderabad",
      kind: "local",
      visibleTo: "staff",
    },
  ],
};

// Discover first on purpose: the picker keeps the server's order.
const LIST: PlaceList = {
  markets: [KARNATAKA, ...PLACES.markets, TELANGANA],
};

const ANDAMAN = PLACES.markets[0];

function picker(props: Partial<Parameters<typeof PlacePicker>[0]> = {}) {
  const onPick = vi.fn();
  const onClose = vi.fn();
  const onRetry = vi.fn();
  render(
    <PlacePicker
      onClose={onClose}
      list={LIST}
      loading={false}
      failed={false}
      onRetry={onRetry}
      currentKey={ANDAMAN.key}
      nearYou={null}
      onPick={onPick}
      {...props}
    />,
  );
  return { onPick, onClose, onRetry };
}

/** Every write to `document.cookie`, while the test runs. */
let cookies: string[] = [];

beforeEach(() => {
  push.mockReset();
  captured.length = 0;
  cookies = [];
  Object.defineProperty(document, "cookie", {
    configurable: true,
    get: () => "",
    set: (value: string) => void cookies.push(value),
  });
});

afterEach(() => {
  delete (document as { cookie?: string }).cookie;
});

describe("the place picker", () => {
  it("lists every region in the server's order, with its places and the bookable tag", () => {
    picker();
    const rows = within(screen.getByRole("list")).getAllByRole("button");
    expect(rows.map((r) => r.getAttribute("aria-label"))).toEqual([
      `Karnataka, ${placesLine(KARNATAKA.destinations)}`,
      `${ANDAMAN.name}, ${PLACE_PICKER_WORDS.bookable}, ${placesLine(ANDAMAN.destinations)}`,
      "Telangana, Hyderabad",
    ]);
    expect(screen.getByRole("dialog", { name: "Pick a place" })).toBeInTheDocument();
  });

  it("writes the region line as mobile's placesLine", () => {
    expect(placesLine(KARNATAKA.destinations)).toBe(
      "Bengaluru, Coorg, Hampi and 2 more",
    );
    expect(placesLine(TELANGANA.destinations)).toBe("Hyderabad");
    expect(placesLine(KARNATAKA.destinations.slice(0, 3))).toBe(
      "Bengaluru, Coorg, Hampi",
    );
  });

  it("chooses a bookable region at once", async () => {
    const { onPick } = picker({ currentKey: "karnataka/bengaluru" });
    await userEvent.click(screen.getByRole("button", { name: /^Andaman/ }));
    expect(onPick).toHaveBeenCalledWith(ANDAMAN.key, "list");
  });

  it("chooses a region with one place at once, as that place", async () => {
    const { onPick } = picker();
    await userEvent.click(screen.getByRole("button", { name: /^Telangana/ }));
    expect(onPick).toHaveBeenCalledWith("telangana/hyderabad", "list");
  });

  it("opens a region with more places, then picks a town", async () => {
    const { onPick } = picker();
    await userEvent.click(screen.getByRole("button", { name: /^Karnataka/ }));
    expect(screen.getByRole("heading", { name: "Karnataka" })).toBeInTheDocument();
    expect(
      screen.getByRole("button", {
        name: "Bengaluru, Every card checked by a person",
      }),
    ).toBeInTheDocument();
    await userEvent.click(
      screen.getByRole("button", { name: "Coorg, Found by Trigo, labelled" }),
    );
    expect(onPick).toHaveBeenCalledWith("karnataka/coorg", "list");
  });

  it("moves the focus to All places, and back to the region's row", async () => {
    picker();
    const region = screen.getByRole("button", { name: /^Karnataka/ });
    await userEvent.click(region);
    expect(screen.getByRole("button", { name: "All places" })).toHaveFocus();
    await userEvent.click(screen.getByRole("button", { name: "All places" }));
    expect(screen.getByRole("button", { name: /^Karnataka/ })).toHaveFocus();
  });

  it("works from the keyboard alone", async () => {
    const { onPick } = picker();
    screen.getByRole("button", { name: /^Karnataka/ }).focus();
    await userEvent.keyboard("{Enter}");
    expect(screen.getByRole("button", { name: "All places" })).toHaveFocus();
    await userEvent.tab();
    await userEvent.keyboard("{Enter}");
    expect(onPick).toHaveBeenCalledWith("karnataka/bengaluru", "list");
  });

  it("leads with Near you when the visitor's state has a local place", async () => {
    const { onPick } = picker({
      nearYou: { key: "karnataka/bengaluru", name: "Bengaluru" },
    });
    const rows = within(screen.getByRole("list")).getAllByRole("button");
    expect(rows[0]).toHaveAccessibleName("Near you · Bengaluru");
    await userEvent.click(rows[0]);
    expect(onPick).toHaveBeenCalledWith("karnataka/bengaluru", "near_you");
  });

  it("marks the place shown now", () => {
    picker({ currentKey: ANDAMAN.key });
    expect(screen.getByRole("button", { name: /^Andaman/ })).toHaveAttribute(
      "aria-current",
      "true",
    );
    expect(
      screen.getByRole("button", { name: /^Telangana/ }),
    ).not.toHaveAttribute("aria-current");
  });

  it("shows three skeleton rows while loading", () => {
    picker({ list: null, loading: true });
    expect(screen.getByRole("status", { name: "Loading the places" })).toBeInTheDocument();
    expect(
      screen.getByTestId("place-picker-loading").querySelectorAll("li"),
    ).toHaveLength(3);
  });

  it("says the places did not load, and tries again", async () => {
    const { onRetry } = picker({ list: null, failed: true });
    expect(screen.getByRole("alert")).toHaveTextContent(
      "We couldn't load the places.",
    );
    await userEvent.click(screen.getByRole("button", { name: "Try again" }));
    expect(onRetry).toHaveBeenCalledTimes(1);
  });
});

describe("the place button", () => {
  function button(current = { key: ANDAMAN.key, name: ANDAMAN.name }) {
    renderWithQuery(<PlaceButton list={LIST} current={current} />);
    return screen.getByRole("button", {
      name: `Change place. Now showing ${current.name}.`,
    });
  }

  it("names what it does and what is shown", () => {
    const trigger = button();
    expect(trigger).toHaveTextContent(ANDAMAN.name);
    expect(trigger).toHaveAttribute("aria-haspopup", "dialog");
  });

  it("opens the picker, and Escape gives the focus back to it", async () => {
    const trigger = button();
    await userEvent.click(trigger);
    const dialog = screen.getByRole("dialog", { name: "Pick a place" });
    // The browser's Escape is the dialog's `cancel`; jsdom sends none.
    const cancel = new Event("cancel", { cancelable: true });
    act(() => {
      dialog.dispatchEvent(cancel);
    });
    expect(screen.queryByRole("dialog")).toBeNull();
    expect(trigger).toHaveFocus();
  });

  it("remembers a pick, counts it once and opens the place", async () => {
    await userEvent.click(button());
    await userEvent.click(screen.getByRole("button", { name: /^Telangana/ }));
    expect(cookies).toHaveLength(1);
    expect(cookies[0].split("; ")[0]).toBe("yv_place=telangana/hyderabad");
    expect(captured).toEqual([
      { name: "place_picked", properties: { via: "list" } },
    ]);
    expect(push).toHaveBeenCalledWith("/?place=telangana/hyderabad");
  });

  it("does nothing but close when the place shown is picked again", async () => {
    await userEvent.click(button());
    await userEvent.click(screen.getByRole("button", { name: /^Andaman/ }));
    expect(cookies).toEqual([]);
    expect(captured).toEqual([]);
    expect(push).not.toHaveBeenCalled();
    expect(screen.queryByRole("dialog")).toBeNull();
  });
});

describe("remembering a link's place", () => {
  it("writes the key and counts a link", () => {
    render(<RememberPlace write="karnataka/coorg" clear={false} list={LIST} />);
    expect(cookies[0].split("; ")[0]).toBe("yv_place=karnataka/coorg");
    expect(captured).toEqual([
      { name: "place_picked", properties: { via: "link" } },
    ]);
  });

  it("forgets a gone place, and counts nothing", () => {
    render(<RememberPlace write={null} clear list={LIST} />);
    expect(cookies[0]).toMatch(/^yv_place=; Path=\/; Max-Age=0/);
    expect(captured).toEqual([]);
  });

  it("writes nothing the list does not have", () => {
    render(<RememberPlace write="karnataka/mysore" clear={false} list={LIST} />);
    expect(cookies).toEqual([]);
    expect(captured).toEqual([]);
  });
});
