import { test, expect, type Page } from "@playwright/test";
import AxeBuilder from "@axe-core/playwright";

/**
 * The chrome retracts, and the layout follows it — in a real browser.
 *
 * The unit tests drive the store and a stubbed observer, which proves the
 * rule and the wiring. What they cannot see is the part a traveller actually
 * experiences: whether the bar is off the SCREEN, whether the caption really
 * takes the room back, whether a horizontal drag survives a scroller that is
 * entitled to claim it. Those are layout and compositor questions, and jsdom
 * has neither.
 */

const FEED = '[role="feed"]';
const STAGE = "[data-chrome]";
const MASTHEAD = ".feed-masthead";
const BAR = 'nav[aria-label="Primary"] >> visible=true';

/** Moves the feed as a thumb would, then waits for the chrome to settle. */
async function toReel(page: Page, index: number, chrome: "shown" | "hidden") {
  await page.locator(FEED).evaluate((el, i) => {
    el.scrollTo({ top: el.clientHeight * i, behavior: "instant" });
  }, index);
  await expect(page.locator(STAGE)).toHaveAttribute("data-chrome", chrome);
  // The slide is 460ms; nothing below should measure a bar mid-flight.
  await page.waitForTimeout(600);
}

/** One real touch drag, through the browser's own input pipeline. */
async function swipe(
  page: Page,
  from: { x: number; y: number },
  to: { x: number; y: number },
  steps = 12,
) {
  const cdp = await page.context().newCDPSession(page);
  await cdp.send("Input.dispatchTouchEvent", {
    type: "touchStart",
    touchPoints: [{ x: from.x, y: from.y }],
  });
  for (let i = 1; i <= steps; i++) {
    await cdp.send("Input.dispatchTouchEvent", {
      type: "touchMove",
      touchPoints: [
        {
          x: from.x + ((to.x - from.x) * i) / steps,
          y: from.y + ((to.y - from.y) * i) / steps,
        },
      ],
    });
  }
  await cdp.send("Input.dispatchTouchEvent", {
    type: "touchEnd",
    touchPoints: [],
  });
  await cdp.detach();
}

test.describe("the feed's chrome", () => {
  test.beforeEach(async ({ page }) => {
    await page.goto("/");
    await page.waitForSelector('article[aria-posinset="1"]');
  });

  test("the bar is on the first reel, off the second, and back on the way up", async ({
    page,
    isMobile,
  }) => {
    test.skip(!isMobile, "the rail replaces the floating bar above lg");

    const bar = page.locator(BAR);
    await expect(bar).toBeInViewport();

    await toReel(page, 1, "hidden");
    await expect(bar).not.toBeInViewport();

    /*
      Back UP one reel, not back to the top. This is the half of the rule that
      keeps navigation one swipe away from anywhere in the feed — the other
      candidate ("visible on the first reel only") would leave a traveller
      eleven reels down with eleven swipes between them and Search.
    */
    await toReel(page, 2, "hidden");
    await toReel(page, 1, "shown");
    await expect(bar).toBeInViewport();
  });

  test("the mark goes with it", async ({ page, isMobile }) => {
    test.skip(!isMobile, "the rail carries the mark above lg");

    const masthead = page.locator(MASTHEAD);
    await expect(masthead).toHaveCSS("opacity", "1");

    await toReel(page, 1, "hidden");
    await expect(masthead).toHaveCSS("opacity", "0");

    await toReel(page, 0, "shown");
    await expect(masthead).toHaveCSS("opacity", "1");
  });

  test("the masthead is a centred mark and nothing else", async ({
    page,
    isMobile,
  }) => {
    test.skip(!isMobile, "no masthead above lg");

    // The Search disc that used to sit up here is gone; the bar below already
    // carried the same destination.
    await expect(page.locator(`${MASTHEAD} a, ${MASTHEAD} button`)).toHaveCount(
      0,
    );
    /*
      One visible way to Search, not two. `:visible` is load-bearing — the
      desktop rail is in the document at every width and merely `hidden` below
      `lg`, so an unfiltered count is 2 on a phone and says nothing about what
      a traveller can see.
    */
    await expect(page.locator('a[href="/search"]:visible')).toHaveCount(1);

    const viewport = page.viewportSize();
    const mark = await page.locator(`${MASTHEAD} img`).boundingBox();
    if (!viewport || !mark) throw new Error("no mark");
    const markCentre = mark.x + mark.width / 2;
    expect(Math.abs(markCentre - viewport.width / 2)).toBeLessThan(2);
  });

  test("the caption takes back the room the bar was using", async ({
    page,
    isMobile,
  }) => {
    test.skip(!isMobile, "nothing floats over the well above lg");

    /*
      The half of this change that is easy to forget. Hiding the bar without
      moving the caption leaves 60px of dead space under the button on every
      reel but the first — a layout that is correct for a bar that is not
      there any more.

      Measured as the gap between the button's foot and the card's, which is
      the padding and nothing else, so a longer title cannot move it.
    */
    const gap = async (posinset: number) => {
      const card = page.locator(`article[aria-posinset="${posinset}"]`);
      const button = card.getByRole("link", {
        name: /See dates|Have a look/,
      });
      const [cardBox, buttonBox] = await Promise.all([
        card.boundingBox(),
        button.boundingBox(),
      ]);
      if (!cardBox || !buttonBox) throw new Error("no boxes");
      return cardBox.y + cardBox.height - (buttonBox.y + buttonBox.height);
    };

    // With the bar in place: its 68px object plus 24px of air.
    expect(await gap(1)).toBeGreaterThan(80);

    await toReel(page, 1, "hidden");
    // With it gone: the caption's own 32px foot.
    const closed = await gap(2);
    expect(closed).toBeLessThan(45);
    expect(closed).toBeGreaterThan(20);
  });

  test("a keyboard traveller can still reach the navigation", async ({
    page,
    isMobile,
  }) => {
    test.skip(!isMobile, "the rail is always there above lg");

    /*
      The reason the bar is TRANSLATED rather than hidden, made into a test.

      A swipe is not the only way to move through this feed — arrow keys and a
      screen reader's own navigation both change the active card, and both
      retract the chrome. Somebody driving the app from a keyboard would then
      have no way to bring it back, because the gesture that restores it is one
      they cannot make. `visibility: hidden`, `inert` or `display: none` would
      each have taken the app's navigation away from exactly those people.

      `:focus-within` is the whole answer: focus lands on the first
      destination and the bar comes back with it.
    */
    await toReel(page, 2, "hidden");
    const bar = page.locator(BAR);
    await expect(bar).not.toBeInViewport();

    await bar.getByRole("link").first().focus();
    await expect(bar).toBeInViewport();

    // …and every destination is genuinely reachable from there.
    await expect(bar.getByRole("link")).toHaveCount(4);
  });

  test("the immersive state is accessible too", async ({ page, isMobile }) => {
    test.skip(!isMobile, "the retract is a phone behaviour");

    /*
      `shell.spec.ts` runs axe on `/` at the top of the feed, which is now only
      one of the two states this screen has. The retracted one has different
      contrast (no top scrim over the clip) and a navigation that has moved off
      screen while staying in the document, and neither is reachable from that
      test.
    */
    await toReel(page, 2, "hidden");

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

  test("right to left opens the experience the button points at", async ({
    page,
    isMobile,
  }) => {
    test.skip(!isMobile, "a swipe needs a touchscreen");

    const href = await page
      .locator('article[aria-posinset="1"]')
      .getByRole("link", { name: /See dates|Have a look/ })
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

    await expect(page.locator(STAGE)).toHaveAttribute("data-chrome", "hidden");
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
