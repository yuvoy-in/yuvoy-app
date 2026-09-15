import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { act, screen, within, cleanup } from "@testing-library/react";
import { renderWithQuery } from "@/test/render";
import { Feed } from "./feed";
import { ExperienceCard } from "./experience-card";
import { EXPERIENCES } from "../../../mocks/fixtures";
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
  /*
    `LoginButton` sits in every logo header and in the feed masthead
    (yuvoy-app#56), and it reads both of these. A mock missing either
    fails the whole file with "No export is defined", which reads as a
    broken screen rather than an incomplete mock.
  */
  useSearchParams: () => new URLSearchParams(),
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

  it("leads out of the feed with a word, not a glyph", async () => {
    /*
      The arrow became "Book" (owner, 14 Sep). It had been carrying two meanings
      at once: it opened the listing, and before that it opened a details panel,
      and a right-pointing glyph cannot say which. The word says one thing.

      "View", not "Book", when nothing is bookable in the next ninety days. A
      button offering to book a listing with no departures is a promise the
      product cannot keep, and the tap that ends in "no dates" is the one this
      whole screen exists to prevent.
    */
    const card = await firstCard();
    const out = within(card).getByRole("link", { name: "Book" });
    expect(out).toHaveAttribute("href", "/e/try-dive-nemo-reef");
  });

  it("puts save between sound and share, and it is a save and not a like", async () => {
    /*
      The ORDER is what a thumb meets, so it is asserted through document
      position rather than by reading classes. Book is last, nearest the thumb,
      because it is the control used most.

      The NAME matters as much as the order. This is a private wishlist:
      nothing it records is counted, published or shown to an operator, which is
      why the glyph is a bookmark and the word is "Save". A heart would say
      "like", and a like is a gesture this product does not have.
    */
    const card = await firstCard();
    const save = within(card).getByRole("button", { name: /^Save / });
    const share = within(card).getByLabelText(/^Share/);
    const out = within(card).getByRole("link", { name: /^(Book|View)$/ });

    expect(save).toHaveAttribute("aria-pressed", "false");
    expect(
      save.compareDocumentPosition(share) & Node.DOCUMENT_POSITION_FOLLOWING,
    ).toBeTruthy();
    expect(
      share.compareDocumentPosition(out) & Node.DOCUMENT_POSITION_FOLLOWING,
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
    expect(
      within(card).getByRole("link", { name: /^(Book|View)$/ }),
    ).toBeTruthy();
  });
});

describe("what a reel no longer carries", () => {
  it("does not name the operator or claim they are verified", async () => {
    const card = await firstCard();
    expect(within(card).queryByText("Verified")).toBeNull();
    expect(within(card).queryByText(/Reef Divers|HC Diving/)).toBeNull();
  });

  it("says what the thing is, and whether it can be done", async () => {
    /*
      This test asserted the OPPOSITE until 15 September, and the reversal is
      the point of the change rather than a relaxation of it.

      The 13 September cutback removed the activity type and the departure along
      with seven other things, on a complaint that was spatial: "I'm unable to
      see reel fully, it is covered by lot of things". Deleting the two facts
      that decide a swipe answered the complaint at the cost of the screen's
      job. `nextAvailable` is the field the contract defines as "absent means
      nothing is bookable in the next 90 days, not we did not check", and
      between the cutback and this the feed sent travellers to listings with no
      departures and gave them no way to know.

      What was NOT brought back is everything else: no operator, no verified
      tag, no price, no chip, no full-width call to action. Those are asserted
      absent below and in the tests around this one.
    */
    const card = await firstCard();
    expect(within(card).getByText(/Scuba diving/)).toBeTruthy();
    expect(within(card).getByText(/Havelock/)).toBeTruthy();
    /* "Thu, 20 Aug": the weekday and the date, in the MARKET's zone. The
       fixture's departures are in August, and the month is asserted rather than
       a whole string so this does not break the day the fixtures move. */
    expect(within(card).getByText(/\d{1,2} Aug/)).toBeTruthy();
  });

  it("states the absence of dates rather than staying quiet about it", async () => {
    /*
      The losing tap, named. A card that says nothing about availability makes
      the traveller tap through to find out, and the tap that ends in "no dates"
      is the one that loses them.

      Rendered directly rather than through the feed, because the fixture with
      no `nextAvailable` deliberately has no clip either, so `playableReels`
      drops it and it can never reach a reel. That is correct of the feed and
      would have made this assertion quietly vacuous: it would have found no
      card and passed a `queryBy`. The card is the unit under test here.
    */
    const closed = EXPERIENCES.find((e) => !e.nextAvailable);
    expect(closed, "no fixture without a departure").toBeTruthy();

    renderWithQuery(
      <ExperienceCard
        experience={closed!}
        index={0}
        total={1}
        active
        mounted={false}
        muted
        autoplayAllowed={false}
      />,
    );

    expect(screen.getByText("No dates in the next 90 days")).toBeTruthy();
    /* "View", never "Book": there is nothing to book. */
    expect(screen.getByRole("link", { name: "View" })).toBeTruthy();
    expect(screen.queryByRole("link", { name: "Book" })).toBeNull();
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

  it("does not carry a full-width call to action on the reel itself", async () => {
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
