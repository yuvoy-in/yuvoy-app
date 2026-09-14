import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { act, screen, within, cleanup } from "@testing-library/react";
import { renderWithQuery } from "@/test/render";
import { Feed } from "./feed";
import { TabBar } from "@/components/chrome/tab-bar";
import { useFeedStore } from "@/lib/feed/store";

/**
 * The reel is the product, and the overlay gets out of its way — yuvoy-app#36.
 *
 * The owner walked the feed on an iPhone on 13 September: "I'm unable to see
 * reel fully, it is covered by lot of things." What was over every clip was
 * the operator's name, a Verified tag, the activity type, the next departure,
 * the price and its unit, an instant-or-request chip and a full-width call to
 * action — plus a wordmark carrying the strapline across the top, and a tab
 * bar that slid away as soon as anybody scrolled.
 *
 * Each removal is asserted BY NAME rather than by counting what is left. A
 * count passes for the wrong reason the moment somebody adds one thing and
 * removes another, and these were removed for a reason a count does not carry.
 */

const nav = vi.hoisted(() => ({ pathname: "/" }));
vi.mock("next/navigation", () => ({
  useRouter: () => ({ push: vi.fn(), replace: vi.fn() }),
  usePathname: () => nav.pathname,
}));

/** Moves the strip as the IntersectionObserver would, without jsdom layout. */
const scrollTo = (index: number) =>
  act(() => useFeedStore.getState().setActiveIndex(index));

beforeEach(() => {
  nav.pathname = "/";
  act(() => useFeedStore.getState().resetFeed());
});
afterEach(cleanup);

/** Renders the feed and hands back the first reel's card. */
async function firstCard() {
  renderWithQuery(<Feed />);
  const cards = await screen.findAllByRole("article");
  return cards[0];
}

describe("what is left on a reel", () => {
  it("keeps the name, and tapping it opens the listing", async () => {
    /*
      The `<h2>` was plain text with the real route on a button below it. A
      traveller who taps the title of the thing they are watching means to open
      it, and did nothing.
    */
    const card = await firstCard();
    const heading = within(card).getByRole("heading", { level: 2 });
    const link = within(heading).getByRole("link");
    expect(link).toHaveAttribute("href", "/e/try-dive-nemo-reef");
  });

  it("keeps an arrow to the listing, above sound and share", async () => {
    const card = await firstCard();
    const rail = within(card).getByLabelText(/^Open /);
    expect(rail).toHaveAttribute("href", "/e/try-dive-nemo-reef");

    /*
      The ORDER is the ask, in the issue's own words: "a right-arrow button
      above sound and share". Asserted through document position rather than by
      reading classes, because a flex column's order is what a thumb meets.
    */
    const share = within(card).getByLabelText(/^Share/);
    expect(
      rail.compareDocumentPosition(share) & Node.DOCUMENT_POSITION_FOLLOWING,
    ).toBeTruthy();
  });

  it("shares the REEL rather than the listing", async () => {
    /*
      Somebody sharing a clip means the clip. Share used to build `/e/{slug}`,
      so a reel passed to a friend arrived as a page about the listing; it now
      builds `/r/{media.id}`, backed by `GET /reels/{id}` (api#173).
    */
    const card = await firstCard();
    expect(within(card).getByLabelText("Share this reel")).toBeTruthy();
    expect(within(card).queryByLabelText("Share this experience")).toBeNull();
  });

  it("draws no mute disc while there is nothing to play", async () => {
    /*
      Unchanged behaviour, pinned here because the rail was rebuilt around it.
      The player reports whether a clip can play at all; jsdom cannot play one,
      so this is the poster-only case, and a dead mute control on a still image
      is a button that lies. The arrow and share are drawn regardless, because
      both work on a poster.
    */
    const card = await firstCard();
    expect(within(card).queryByLabelText(/^(Unmute|Mute)$/)).toBeNull();
    expect(within(card).getByLabelText(/^Open /)).toBeTruthy();
  });
});

describe("what a reel no longer carries", () => {
  it("does not name the operator or claim they are verified", async () => {
    const card = await firstCard();
    expect(within(card).queryByText("Verified")).toBeNull();
    expect(within(card).queryByText(/Reef Divers|HC Diving/)).toBeNull();
  });

  it("does not print the activity type, the date or the seats", async () => {
    const card = await firstCard();
    expect(within(card).queryByText(/Scuba diving/)).toBeNull();
    expect(within(card).queryByText(/^Next /)).toBeNull();
    expect(within(card).queryByText(/No dates in the next 90 days/)).toBeNull();
  });

  it("does not print a price", async () => {
    // A price on the card was a second copy of a number the listing owns, and
    // the thing most likely to be read as a promise about a seat.
    const card = await firstCard();
    expect(within(card).queryByText(/₹/)).toBeNull();
    expect(within(card).queryByText(/Price on request/)).toBeNull();
  });

  it("does not carry the instant-or-request chip", async () => {
    const card = await firstCard();
    expect(within(card).queryByText("Instant book")).toBeNull();
    expect(within(card).queryByText("Ask the operator")).toBeNull();
  });

  it("does not carry a full-width call to action, only the arrow", async () => {
    const card = await firstCard();
    expect(within(card).queryByText("See dates")).toBeNull();
    expect(within(card).queryByText("Have a look")).toBeNull();
  });
});

describe("the masthead", () => {
  it("shows the mark without the tagline", async () => {
    /*
      The strapline is BAKED INTO the delivered lockup SVG, so this is a
      different file rather than a different class — see
      scripts/generate-feed-lockup.mjs. Asserted on the source, because jsdom
      cannot see inside an SVG and the whole point is which drawing is used.
    */
    const { container } = renderWithQuery(<Feed />);
    await screen.findAllByRole("article");
    const mark = container.querySelector("img[alt='Yuvoy']");
    expect(mark).not.toBeNull();
    expect(mark!.getAttribute("src")).toContain("mark-compact");
    expect(mark!.getAttribute("src")).not.toContain("lockup-on-dark");
  });

  it("puts it top left, not centred", async () => {
    // jsdom has no layout, so the claim is checked where it is made.
    const { container } = renderWithQuery(<Feed />);
    await screen.findAllByRole("article");
    const masthead = container.querySelector(".feed-scrim-top")!;
    expect(masthead.className).not.toContain("justify-center");
  });

  it("does not swallow taps meant for the reel behind it", async () => {
    const { container } = renderWithQuery(<Feed />);
    await screen.findAllByRole("article");
    expect(container.querySelector(".feed-scrim-top")!.className).toContain(
      "pointer-events-none",
    );
  });
});

describe("the tab bar stays on every reel", () => {
  it("is in place on the first reel", () => {
    const { container } = renderWithQuery(<TabBar />);
    expect(container.querySelector("nav")).not.toBeNull();
    expect(screen.getAllByRole("link")).toHaveLength(4);
  });

  it("is still in place nine reels down", () => {
    /*
      The behaviour the owner asked for, and the one this issue changed. The
      bar used to translate off the bottom of the window on any downward move;
      it now does not move at all, so there is nothing to wait for.
    */
    const { container } = renderWithQuery(<TabBar />);
    scrollTo(9);
    expect(container.querySelector("nav")).not.toBeNull();
    expect(screen.getAllByRole("link")).toHaveLength(4);
  });

  it("carries no retract attribute at all", () => {
    // Removed rather than pinned to "false". A flag nothing writes is a flag
    // somebody re-wires.
    const { container } = renderWithQuery(<TabBar />);
    scrollTo(3);
    expect(container.querySelector("nav")!.hasAttribute("data-retracted")).toBe(
      false,
    );
    expect(container.querySelector("nav")!.className).not.toContain(
      "tabbar-slide",
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

describe("the caption leaves room for the bar", () => {
  it("clears it on every reel, with the same number every screen uses", async () => {
    /*
      The bar no longer retracts, so the caption no longer animates out of its
      way and back. `--feed-lift` was 60px and the caption's own foot was 32px;
      the sum is the 92px `tabbar-clearance` already leaves everywhere else.
      One number, seen from one end now instead of two.
    */
    const { container } = renderWithQuery(<Feed />);
    await screen.findAllByRole("article");

    const captions = container.querySelectorAll(".tabbar-clearance");
    expect(captions.length).toBeGreaterThan(1);
    expect(container.querySelector(".feed-caption")).toBeNull();
    expect(container.querySelector("[data-chrome]")).toBeNull();
  });
});
