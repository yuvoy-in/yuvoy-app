import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { act, screen, waitFor, cleanup } from "@testing-library/react";
import { http, HttpResponse } from "msw";
import { renderWithQuery } from "@/test/render";
import { Feed } from "./feed";
import { TabBar } from "@/components/chrome/tab-bar";
import { useFeedStore } from "@/lib/feed/store";
import { server } from "../../../mocks/server";

/**
 * The chrome retracts with the feed, and comes back with everything else.
 *
 * The RULE — down hides, up restores — is proved on the store, where it is
 * arithmetic. What is proved here is the part that can silently rot: that the
 * feed publishes the state, that the shell's bar reads it, and above all that
 * NOTHING outside a scrolling feed can inherit it. The store is a module and
 * outlives every component in the app; a `true` left behind by a feed is a
 * phone with no navigation on it.
 */

const BASE = process.env.NEXT_PUBLIC_API_URL ?? "http://localhost:8099/v1";

const nav = vi.hoisted(() => ({ pathname: "/" }));
vi.mock("next/navigation", () => ({
  useRouter: () => ({ push: vi.fn(), replace: vi.fn() }),
  usePathname: () => nav.pathname,
}));

/** Moves the feed as the IntersectionObserver would, without jsdom layout. */
const scrollTo = (index: number) =>
  act(() => useFeedStore.getState().setActiveIndex(index));

const chromeState = (container: HTMLElement) =>
  container.querySelector("[data-chrome]")?.getAttribute("data-chrome");

beforeEach(() => {
  nav.pathname = "/";
  act(() => useFeedStore.getState().resetFeed());
});
afterEach(cleanup);

describe("the feed's masthead", () => {
  it("carries the mark and nothing else", async () => {
    /*
      There used to be a Search disc up here, with Search also sitting in the
      floating bar two inches below it — two controls for one screen on the
      smallest surface in the product. The one that went is the one that was
      competing with the picture.
    */
    const { container } = renderWithQuery(<Feed />);
    await screen.findAllByRole("article");

    const masthead = container.querySelector(".feed-masthead");
    expect(masthead).not.toBeNull();
    expect(masthead!.querySelectorAll("a")).toHaveLength(0);
    expect(masthead!.querySelectorAll("button")).toHaveLength(0);
  });

  it("centres the mark", async () => {
    const { container } = renderWithQuery(<Feed />);
    await screen.findAllByRole("article");

    // jsdom has no layout, so the claim is checked where it is made. The mark
    // is the masthead's only child, so centring the row centres the mark.
    const masthead = container.querySelector(".feed-masthead")!;
    expect(masthead.className).toContain("justify-center");
    expect(masthead.className).not.toContain("justify-between");
  });

  it("does not swallow taps meant for the reel behind it", async () => {
    // With nothing to press, the whole strip goes back to being feed. It was
    // not: the disc's own hit area sat on top of the clip.
    const { container } = renderWithQuery(<Feed />);
    await screen.findAllByRole("article");
    expect(container.querySelector(".feed-masthead")!.className).toContain(
      "pointer-events-none",
    );
  });
});

describe("the feed publishes its chrome state", () => {
  it("starts with the chrome out, on the first reel", async () => {
    const { container } = renderWithQuery(<Feed />);
    await screen.findAllByRole("article");
    expect(chromeState(container)).toBe("shown");
  });

  it("retracts when the traveller moves down a reel", async () => {
    const { container } = renderWithQuery(<Feed />);
    await screen.findAllByRole("article");
    scrollTo(1);
    expect(chromeState(container)).toBe("hidden");
  });

  it("puts it back when they move up one", async () => {
    const { container } = renderWithQuery(<Feed />);
    await screen.findAllByRole("article");
    scrollTo(3);
    expect(chromeState(container)).toBe("hidden");
    scrollTo(2);
    expect(chromeState(container)).toBe("shown");
  });

  it("arrives at the top of the feed however the last visit ended", async () => {
    /*
      The store is a module. A traveller nine reels down who opens an
      experience and comes back gets a NEW scroller at scrollTop 0 — and would
      otherwise get the old index with it, so the first reel would render with
      no bar under a feed that had not moved.
    */
    scrollTo(9);
    const { container } = renderWithQuery(<Feed />);
    await screen.findAllByRole("article");
    expect(chromeState(container)).toBe("shown");
    expect(useFeedStore.getState().activeIndex).toBe(0);
  });

  it("hands the chrome back when it unmounts", async () => {
    const { unmount } = renderWithQuery(<Feed />);
    await screen.findAllByRole("article");
    scrollTo(4);
    expect(useFeedStore.getState().chromeRetracted).toBe(true);

    unmount();
    expect(useFeedStore.getState().chromeRetracted).toBe(false);
  });

  it("hands it back when the feed empties under the traveller", async () => {
    /*
      The case that makes this a defect rather than a theory. A refetch comes
      back with nothing — an operator pulled the last listing, a kill switch
      went on — the cards vanish, the empty state appears, and there is no
      scroller left that could ever report a card again. Without this the bar
      stays off the bottom of the window for good.
    */
    const { client } = renderWithQuery(<Feed />);
    await screen.findAllByRole("article");
    scrollTo(4);
    expect(useFeedStore.getState().chromeRetracted).toBe(true);

    // A real refetch against a server that now has nothing — not a rerender,
    // which would hand back the cards already in the cache and prove nothing.
    server.use(
      http.get(`${BASE}/reels`, () =>
        HttpResponse.json({ items: [], complete: true }),
      ),
    );
    await act(async () => {
      await client.refetchQueries();
    });
    await screen.findByText(/Nothing bookable here yet/);

    expect(useFeedStore.getState().chromeRetracted).toBe(false);
  });
});

describe("the caption and the tail move with the chrome", () => {
  it("gives the caption a foot that follows the bar, not a fixed one", async () => {
    /*
      `tabbar-clearance` is 92px whatever is happening — right when the bar is
      there and 60px of dead space when it is not. The caption's own class
      carries both numbers and interpolates between them, which is the whole
      of "the layout changes with the bar".
    */
    const { container } = renderWithQuery(<Feed />);
    await screen.findAllByRole("article");

    const captions = container.querySelectorAll(".feed-caption");
    expect(captions.length).toBeGreaterThan(1);
    for (const caption of captions) {
      expect(caption.className).not.toContain("tabbar-clearance");
    }
  });

  it("gives the tail one too, so the end of the feed closes up", async () => {
    const { container } = renderWithQuery(<Feed />);
    await screen.findAllByRole("article");

    const tail = container.querySelector(".feed-tail");
    expect(tail).not.toBeNull();
    expect(tail!.className).not.toContain("tabbar-clearance");
  });
});

describe("the shell's tab bar", () => {
  it("is in place on the feed's first reel", () => {
    const { container } = renderWithQuery(<TabBar />);
    expect(container.querySelector("nav")?.getAttribute("data-retracted")).toBe(
      "false",
    );
  });

  it("retracts when the feed says so", async () => {
    const { container } = renderWithQuery(<TabBar />);
    scrollTo(2);
    await waitFor(() =>
      expect(
        container.querySelector("nav")?.getAttribute("data-retracted"),
      ).toBe("true"),
    );
  });

  it("keeps its four destinations while it is out of the way", async () => {
    // Translated, never unmounted and never hidden. A keyboard traveller tabs
    // straight to it and `:focus-within` brings it back — which cannot work if
    // the links are not in the document.
    const { container } = renderWithQuery(<TabBar />);
    scrollTo(2);
    await waitFor(() =>
      expect(
        container.querySelector("nav")?.getAttribute("data-retracted"),
      ).toBe("true"),
    );
    expect(screen.getAllByRole("link")).toHaveLength(4);
  });

  it("never retracts on a screen that is not the feed", () => {
    /*
      The guard that matters. `chromeRetracted` is module state, so without a
      route check a value the feed left behind would take the navigation off
      Search, Trips and Account as well.
    */
    act(() => useFeedStore.getState().setActiveIndex(5));
    nav.pathname = "/search";
    const { container } = renderWithQuery(<TabBar />);
    expect(container.querySelector("nav")?.getAttribute("data-retracted")).toBe(
      "false",
    );
  });

  it("is still absent altogether on a focused screen", () => {
    // Unchanged, and worth pinning beside the new state: a detail screen
    // carries its own way back and its own action bar.
    nav.pathname = "/e/try-dive-nemo-reef";
    const { container } = renderWithQuery(<TabBar />);
    expect(container.querySelector("nav")).toBeNull();
  });
});
