import { test, expect, type Page } from "@playwright/test";
import AxeBuilder from "@axe-core/playwright";
import { swipe } from "./support/touch";

/**
 * The reel keeps the screen, and the bar keeps its place — in a real browser.
 *
 * The unit tests prove which elements are on a card. What they cannot see is
 * the part a traveller actually experiences: whether the bar is on SCREEN nine
 * reels down, whether the caption really clears it, whether a horizontal drag
 * survives a scroller that is entitled to claim it. Those are layout and
 * compositor questions, and jsdom has neither.
 *
 * ## What this file used to assert
 *
 * That the bar slid off the bottom of the window on any downward move and came
 * back on any upward one. The owner ruled against it on 13 September
 * (yuvoy-app#36) — "the tab bar must stay visible on every reel" — so the
 * tests are inverted rather than deleted: the bar staying put is now the
 * property worth defending, and it is the one somebody would break by
 * re-introducing the retract.
 */

const FEED = '[role="feed"]';
const MASTHEAD = ".feed-scrim-top";
const BAR = 'nav[aria-label="Primary"] >> visible=true';

/** Moves the feed as a thumb would, and lets the scroll settle. */
async function toReel(page: Page, index: number) {
  await page.locator(FEED).evaluate((el, i) => {
    el.scrollTo({ top: el.clientHeight * i, behavior: "instant" });
  }, index);
  await expect(
    page.locator(`article[aria-posinset="${index + 1}"]`),
  ).toBeInViewport();
}

test.describe("the reel keeps the screen", () => {
  test.beforeEach(async ({ page }) => {
    await page.goto("/");
    await page.waitForSelector('article[aria-posinset="1"]');
  });

  test("the bar stays on screen however far down the feed a traveller goes", async ({
    page,
    isMobile,
  }) => {
    test.skip(!isMobile, "the rail replaces the floating bar above lg");

    /*
      The behaviour this issue changed. The bar used to translate off the
      bottom of the window on the first downward move; five reels down there
      was no navigation at all until the traveller swiped back up.
    */
    const bar = page.locator(BAR);
    await expect(bar).toBeInViewport();

    for (const i of [1, 2, 3, 4]) {
      await toReel(page, i);
      await expect(bar).toBeInViewport();
    }

    await toReel(page, 0);
    await expect(bar).toBeInViewport();
  });

  test("the mark stays too, and keeps its place", async ({
    page,
    isMobile,
  }) => {
    test.skip(!isMobile, "the rail carries the mark above lg");

    const masthead = page.locator(MASTHEAD);
    await expect(masthead).toHaveCSS("opacity", "1");

    await toReel(page, 2);
    await expect(masthead).toHaveCSS("opacity", "1");
  });

  test("the masthead is a mark, top left, with a tagline-free drawing", async ({
    page,
    isMobile,
  }) => {
    test.skip(!isMobile, "no masthead above lg");

    /*
      This used to assert NOTHING to press. The Search disc that sat up here
      was gone and the bar below already carried that destination, so the whole
      top of a reel was feed.

      Exactly one thing may be pressed now: Login (yuvoy-app#56, owner, 14 Sep).
      The rule the old assertion was protecting is unchanged and is asserted
      instead: one control, it is Login, and nothing else has crept back. The
      strip stays `pointer-events-none` across its full width, which
      `login-button.spec.ts` proves with a real touch drag that starts inside
      it.
    */
    const pressable = page.locator(`${MASTHEAD} a, ${MASTHEAD} button`);
    await expect(pressable).toHaveCount(1);
    await expect(pressable).toHaveAccessibleName("Login");
    /*
      One visible way to Search, not two. `:visible` is load-bearing — the
      desktop rail is in the document at every width and merely `hidden` below
      `lg`, so an unfiltered count is 2 on a phone and says nothing about what
      a traveller can see.
    */
    await expect(page.locator('a[href="/search"]:visible')).toHaveCount(1);

    // The tagline is a different FILE, not a class — it is baked into the
    // delivered lockup. This is the only place that can tell which drawing
    // actually reached the browser.
    await expect(page.locator(`${MASTHEAD} img`)).toHaveAttribute(
      "src",
      /mark-compact/,
    );

    // Top left, not centred. Measured against the viewport, because a mark
    // that merely has the class could still be centred by its parent.
    const viewport = page.viewportSize();
    const mark = await page.locator(`${MASTHEAD} img`).boundingBox();
    if (!viewport || !mark) throw new Error("no mark");
    expect(mark.x).toBeLessThan(viewport.width / 4);
  });

  test("the overlay says what it is and when, and nothing it cannot keep", async ({
    page,
  }) => {
    /*
      The owner's complaint, as an assertion: "I'm unable to see reel fully, it
      is covered by lot of things." Nine things went on 13 September.

      Two of them came back on the 15th, and this test now pins BOTH halves,
      because the interesting claim is not "less" but "the right less". What is
      on the picture is what decides the next swipe: what the thing is, and
      whether it could be done at all. What is still gone is everything that
      belongs on the listing, and the price most of all, which was the thing
      most likely to be read as a promise about a seat.
    */
    const card = page.locator('article[aria-posinset="1"]');

    // Still gone.
    await expect(card.getByText("Verified")).toHaveCount(0);
    await expect(card.getByText("Instant book")).toHaveCount(0);
    await expect(card.getByText("Ask the operator")).toHaveCount(0);
    await expect(card.getByText(/₹/)).toHaveCount(0);
    await expect(card.getByText(/Sample .* Operator/)).toHaveCount(0);

    // Back, and deliberately.
    await expect(card.getByText(/Scuba diving/)).toBeVisible();
    await expect(
      card.getByRole("button", { name: /Aug|No dates/ }),
    ).toBeVisible();

    // And the rest of what is left really is there.
    await expect(
      card.getByRole("link", { name: /^(Book|View)$/ }),
    ).toBeVisible();
    await expect(card.getByLabel("Share this reel")).toBeVisible();
    await expect(card.getByRole("button", { name: /^Save / })).toBeVisible();
    await expect(card.getByRole("heading", { level: 2 })).toBeVisible();
  });

  test("the price and the operator are one tap away, not on the picture", async ({
    page,
  }) => {
    /*
      The middle this screen was missing. A feed that prices every card invites
      comparison before understanding; a feed that never prices anything makes
      every tap a coin flip. The panel is the answer and it costs no request:
      every field in it came down with the reel.
    */
    const card = page.locator('article[aria-posinset="1"]');

    await card.getByRole("button", { name: /Aug|No dates/ }).click();

    const panel = card.getByRole("group", { name: /^Details, / });
    await expect(panel).toBeVisible();
    await expect(panel.getByText(/₹/)).toBeVisible();
    await expect(panel.getByText(/Sample Dive Operator/)).toBeVisible();
    await expect(
      panel.getByRole("link", { name: /See dates|Have a look/ }),
    ).toBeVisible();

    /* The clip is still playing above it: the panel may not take the screen. */
    const cardBox = (await card.boundingBox())!;
    const panelBox = (await panel.boundingBox())!;
    const covered = (cardBox.y + cardBox.height - panelBox.y) / cardBox.height;
    expect(
      covered,
      "the panel covers more than its 54% ceiling",
    ).toBeLessThanOrEqual(0.55);

    // Tapping the picture puts it away.
    await page.mouse.click(cardBox.x + cardBox.width / 2, cardBox.y + 80);
    await expect(panel).not.toBeVisible();
  });

  test("the caption clears the bar rather than sitting under it", async ({
    page,
    isMobile,
  }) => {
    test.skip(!isMobile, "nothing floats over the well above lg");

    /*
      The caption used to animate up and down as the bar left and returned.
      With the bar permanent it simply clears it, on every reel — and "every"
      is the assertion, because the old behaviour differed between the first
      reel and the rest, which is exactly the shape a half-finished revert
      would take.

      Measured as the gap between the title's foot and the card's, which is the
      padding and nothing else, so a longer title cannot move it.
    */
    const gap = async (posinset: number) => {
      const card = page.locator(`article[aria-posinset="${posinset}"]`);
      const title = card.getByRole("heading", { level: 2 });
      const [cardBox, titleBox] = await Promise.all([
        card.boundingBox(),
        title.boundingBox(),
      ]);
      if (!cardBox || !titleBox) throw new Error("no boxes");
      return cardBox.y + cardBox.height - (titleBox.y + titleBox.height);
    };

    // `tabbar-clearance` is the bar's 68px object plus 24px of air.
    expect(await gap(1)).toBeGreaterThan(80);

    await toReel(page, 1);
    expect(await gap(2)).toBeGreaterThan(80);
  });

  test("the bar and the reel under it are both accessible", async ({
    page,
    isMobile,
  }) => {
    test.skip(!isMobile, "the floating bar is a phone behaviour");

    /*
      `shell.spec.ts` runs axe on `/` at the top of the feed. This runs it
      several reels in, where the scrim over the clip is the only thing behind
      the bar and the caption — the contrast case that only exists once a
      traveller has scrolled.
    */
    await toReel(page, 2);

    const results = await new AxeBuilder({ page })
      .withTags(["wcag2a", "wcag2aa", "wcag21a", "wcag21aa", "wcag22aa"])
      .analyze();

    expect(results.violations).toEqual([]);
  });
});

test.describe("swiping a reel open", () => {
  test.beforeEach(async ({ page }) => {
    await page.goto("/");
    await page.waitForSelector('article[aria-posinset="1"]');
  });

  test("right to left opens the experience Book points at", async ({
    page,
    isMobile,
  }) => {
    test.skip(!isMobile, "a swipe needs a touchscreen");

    /* The arrow became the word "Book" on 15 September, or "View" when nothing
       is bookable in ninety days. Same href, and the swipe must still agree
       with it: they are built from one string for exactly this reason. */
    const href = await page
      .locator('article[aria-posinset="1"]')
      .getByRole("link", { name: /^(Book|View)$/ })
      .getAttribute("href");

    const viewport = page.viewportSize()!;
    const y = viewport.height / 2;
    await swipe(page, { x: viewport.width - 80, y }, { x: 60, y });

    await page.waitForURL(`**${href}`);
    // …and it is the real screen, not just a URL.
    await expect(page.getByRole("link", { name: /^Back to/ })).toBeVisible();
  });

  test("a vertical swipe still scrolls the feed and opens nothing", async ({
    page,
    isMobile,
  }) => {
    test.skip(!isMobile, "a swipe needs a touchscreen");

    /*
      The gesture the whole product is built on. `touch-action: pan-y` hands
      the vertical axis to the browser, and the axis lock refuses to take it
      back part-way through — a thumb arcs, and at a bias of 1.0 those arcs
      would open experiences nobody asked for.
    */
    const viewport = page.viewportSize()!;
    const x = viewport.width / 2;
    await swipe(
      page,
      { x, y: viewport.height * 0.8 },
      { x: x - 40, y: viewport.height * 0.2 },
    );

    /*
      The feed really moved — asserted on the card rather than on a chrome
      attribute, which is what this used to read and which no longer exists
      (the bar does not retract any more, yuvoy-app#36). Without this the test
      would pass on a swipe that did nothing at all.
    */
    await expect(
      page.locator('article[aria-posinset="1"]'),
    ).not.toBeInViewport();
    expect(new URL(page.url()).pathname).toBe("/");
  });

  test("a drag the other way opens nothing", async ({ page, isMobile }) => {
    test.skip(!isMobile, "a swipe needs a touchscreen");

    const viewport = page.viewportSize()!;
    const y = viewport.height / 2;
    await swipe(page, { x: 60, y }, { x: viewport.width - 80, y });

    await page.waitForTimeout(400);
    expect(new URL(page.url()).pathname).toBe("/");
  });
});
