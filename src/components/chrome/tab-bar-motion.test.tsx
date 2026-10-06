import { describe, it, expect, vi, afterEach, beforeEach } from "vitest";
import { act } from "react";
import { screen, cleanup, fireEvent } from "@testing-library/react";
import { renderWithQuery } from "@/test/render";
import { NavList } from "./nav-items";
import { TabBar } from "./tab-bar";
import { ShareLink } from "@/components/ui/share-link";

const nav = vi.hoisted(() => ({ pathname: "/" }));
vi.mock("next/navigation", () => ({
  usePathname: () => nav.pathname,
  useSearchParams: () => new URLSearchParams(),
  useRouter: () => ({ push: vi.fn(), replace: vi.fn(), prefetch: vi.fn() }),
}));

vi.mock("@/lib/share", () => ({
  shareUrl: vi.fn(async () => "copied"),
}));

beforeEach(() => {
  nav.pathname = "/";
});
afterEach(() => {
  cleanup();
  vi.useRealTimers();
});

const link = (name: string) => screen.getByRole("link", { name });

/**
 * The bar answers the press, not the route (T04 B, approved 4 Oct 2026).
 * Two truths are kept apart: `aria-current` is where the traveller IS, and
 * `data-lit` is what the bar is showing. A screen reader must never be told
 * it has arrived before the route has.
 */
describe("the tab bar's press", () => {
  it("lights the pressed destination at once and leaves aria-current with the route", () => {
    renderWithQuery(<NavList orientation="bar" />);
    // A click on a Next link in jsdom would try to navigate; stop it there.
    const search = link("Search");
    search.addEventListener("click", (e) => e.preventDefault());

    fireEvent.pointerDown(search);
    expect(search).toHaveAttribute("data-pressed");
    fireEvent.pointerUp(search);
    fireEvent.click(search);

    expect(search).toHaveAttribute("data-lit");
    expect(search).not.toHaveAttribute("aria-current");
    expect(link("Feed")).toHaveAttribute("aria-current", "page");
    expect(link("Feed")).not.toHaveAttribute("data-lit");
  });

  it("hands over to the route when it arrives, and the press lapses", () => {
    const { rerender } = renderWithQuery(<NavList orientation="bar" />);
    const search = link("Search");
    search.addEventListener("click", (e) => e.preventDefault());
    fireEvent.click(search);

    nav.pathname = "/search";
    rerender(<NavList orientation="bar" />);
    expect(link("Search")).toHaveAttribute("aria-current", "page");
    expect(link("Search")).toHaveAttribute("data-lit");

    // Somewhere else entirely (a Back link to Trips): the old press is gone.
    nav.pathname = "/trips";
    rerender(<NavList orientation="bar" />);
    expect(link("Trips")).toHaveAttribute("data-lit");
    expect(link("Search")).not.toHaveAttribute("data-lit");
  });

  it("does nothing for a press on the destination already showing", () => {
    renderWithQuery(<NavList orientation="bar" />);
    const feed = link("Feed");
    feed.addEventListener("click", (e) => e.preventDefault());
    fireEvent.click(feed);
    expect(feed).toHaveAttribute("data-lit");
    expect(
      screen.getAllByRole("link").filter((a) => a.hasAttribute("data-lit")),
    ).toHaveLength(1);
  });
});

describe("the tab bar's lit layer", () => {
  it("is a drawing: hidden from assistive technology, inert, with no links and no text", () => {
    const { container } = renderWithQuery(<NavList orientation="bar" />);
    const layer = container.querySelector("[data-tab-lit]")!;
    expect(layer).toHaveAttribute("aria-hidden", "true");
    expect(layer.hasAttribute("inert")).toBe(true);
    expect(layer.querySelectorAll("a, button")).toHaveLength(0);
    // Names are drawn by CSS from data-label, so no text is found twice.
    expect(layer.textContent).toBe("");
    expect(screen.getAllByRole("link")).toHaveLength(4);
  });

  it("is not armed before it can measure, so the bar is drawn as it always was", () => {
    // jsdom lays nothing out, which is exactly the server's position too.
    const { container } = renderWithQuery(<NavList orientation="bar" />);
    expect(container.querySelector("[data-tab-glide]")).toHaveAttribute(
      "data-tab-glide",
      "off",
    );
    expect(link("Feed").className).toContain("bg-paper");
  });

  it("keeps the bar's surface on a ground the glide can stretch, not on the pill", () => {
    const { container } = renderWithQuery(<TabBar />);
    const pill = container.querySelector("[data-tabbar-pill]")!;
    const ground = pill.querySelector("[data-tabbar-ground]")!;
    expect(ground.className).toContain("tabbar-on-media");
    expect(ground).toHaveAttribute("aria-hidden", "true");
    expect(pill.className).not.toContain("tabbar-on-media");
    expect(pill.className).not.toContain("app-chrome");
  });

  it("is never drawn in the rail", () => {
    const { container } = renderWithQuery(<NavList orientation="rail" />);
    expect(container.querySelector("[data-tab-lit]")).toBeNull();
    expect(container.querySelector("[data-lit]")).toBeNull();
  });
});

/**
 * The well takes a tap while a screen change has the bar captured, and hands
 * it to the destination under the finger (stability audit, 6 Oct 2026).
 */
describe("the tab bar's well", () => {
  /** Lays the four out as the glide has them, and records which is opened. */
  function midGlide(boxes: Record<string, [left: number, right: number]>) {
    const { container } = renderWithQuery(<TabBar />);
    const opened: string[] = [];
    for (const [name, [left, right]] of Object.entries(boxes)) {
      const target = link(name);
      target.getBoundingClientRect = () =>
        DOMRect.fromRect({ x: left, y: 790, width: right - left, height: 44 });
      target.addEventListener("click", (e) => {
        e.preventDefault();
        opened.push(name);
      });
    }
    const well = container.querySelector<HTMLElement>("[data-tabbar-well]")!;
    return { well, opened };
  }

  it("opens the glyph under the finger when two destinations overlap mid-glide", () => {
    /*
      From Trips, Search pressed: Search is already its new, wide self, and
      Trips is still sliding out of its old place, over Search's right half.
      A tap on the Trips glyph there used to open Search, first in the row.
    */
    const { well, opened } = midGlide({
      Feed: [6, 50],
      Search: [54, 149],
      Trips: [111, 155],
      Account: [204, 248],
    });
    fireEvent.click(well, { clientX: 133, clientY: 812 });
    expect(opened).toEqual(["Trips"]);
  });

  it("opens the one destination under the finger at rest", () => {
    const { well, opened } = midGlide({
      Feed: [6, 50],
      Search: [54, 149],
      Trips: [153, 197],
      Account: [201, 245],
    });
    fireEvent.click(well, { clientX: 100, clientY: 812 });
    fireEvent.click(well, { clientX: 223, clientY: 812 });
    fireEvent.click(well, { clientX: 300, clientY: 812 });
    expect(opened).toEqual(["Search", "Account"]);
  });
});

/**
 * The share notice fades in and out (T13 A). It keeps its sentence for the
 * 150ms it takes to fade, so it leaves with its words rather than shrinking
 * to an empty capsule; and it is the live region, so it is never taken out of
 * the accessibility tree, only made transparent.
 */
describe("the share notice", () => {
  it("keeps its words while it fades, then clears", async () => {
    vi.useFakeTimers();
    renderWithQuery(
      <ShareLink
        path="/r/1"
        title="Try-dive"
        label="Share this reel"
        variant="onDark"
      />,
    );
    const status = screen.getByRole("status");
    expect(status).toHaveAttribute("data-shown", "false");

    await act(async () => {
      fireEvent.click(screen.getByRole("button", { name: "Share this reel" }));
    });
    expect(status).toHaveTextContent("Link copied");
    expect(status).toHaveAttribute("data-shown", "true");

    act(() => vi.advanceTimersByTime(2500));
    expect(status).toHaveAttribute("data-shown", "false");
    expect(status).toHaveTextContent("Link copied");

    act(() => vi.advanceTimersByTime(150));
    expect(status).toHaveTextContent("");
    expect(screen.getByRole("status")).toBe(status);
  });

  it("starts its 2.5 seconds again on a second share", async () => {
    vi.useFakeTimers();
    renderWithQuery(
      <ShareLink
        path="/r/1"
        title="Try-dive"
        label="Share this reel"
        variant="onDark"
      />,
    );
    const button = screen.getByRole("button", { name: "Share this reel" });
    const status = screen.getByRole("status");

    await act(async () => {
      fireEvent.click(button);
    });
    act(() => vi.advanceTimersByTime(2000));
    await act(async () => {
      fireEvent.click(button);
    });
    act(() => vi.advanceTimersByTime(2000));
    expect(status).toHaveAttribute("data-shown", "true");
    act(() => vi.advanceTimersByTime(650));
    expect(status).toHaveTextContent("");
  });
});
