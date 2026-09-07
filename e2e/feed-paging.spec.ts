import { test, expect } from "@playwright/test";
import AxeBuilder from "@axe-core/playwright";

/**
 * Infinite scroll over a real cursor, in a real browser.
 *
 * The unit tests drive an IntersectionObserver stub, which is the only way to
 * exercise the branches — but a stub cannot tell you whether the sentinel is
 * reachable, whether the scroller is the observer's root, or whether the
 * rootMargin fires before a traveller hits the bottom. Those are layout
 * questions and jsdom has no layout.
 *
 * `?__scenario=long-feed` is forty reels, three-and-a-bit pages at the app's
 * page size. The fixture itself stays six, because its job is to make the
 * operator rotation legible and six across three rounds is what does that.
 *
 * Everything here runs against MSW, so no network flake and no dependence on
 * how much footage operators have actually uploaded.
 */

/** The scroller is the element the observer roots on. */
const FEED = '[role="feed"]';

test("the feed loads a second page when the traveller nears the end", async ({
  page,
}) => {
  const reelRequests: string[] = [];
  page.on("request", (req) => {
    const url = new URL(req.url());
    if (url.pathname.endsWith("/reels")) reelRequests.push(url.search);
  });

  await page.goto("/?__scenario=long-feed");
  await page.waitForSelector('article[aria-posinset="1"]');

  const firstPage = await page.locator(`${FEED} article`).count();
  expect(firstPage, "the first page should be a page, not the whole feed").toBe(
    12,
  );

  // Scroll to the bottom of the scroller — the sentinel fires two screens
  // early, so this is well past the trigger.
  await page.locator(FEED).evaluate((el) => {
    el.scrollTop = el.scrollHeight;
  });

  await expect
    .poll(async () => page.locator(`${FEED} article`).count(), {
      message: "a second page never arrived",
    })
    .toBeGreaterThan(firstPage);

  /*
    The cursor came from the server and was passed back verbatim. A client that
    constructed one — from a timestamp, from the last item's id — would restart
    the rotation, and one business's second reel would arrive before another's
    first. That is the property the endpoint exists to protect, and it is the
    reason the cursor is opaque.

    Note that the BROWSER's first `/reels` request already carries one, and
    that is correct rather than a bug: page one is fetched in a Server
    Component and handed over as `initialData`, so the first request the
    browser makes is for page TWO. "The first request carries no cursor" is a
    real rule and is pinned in the unit tests, where the query starts cold —
    asserting it here would only be asserting that the server prefetch failed.
  */
  const paged = reelRequests.filter((s) => s.includes("cursor="));
  expect(
    paged.length,
    "the next page was fetched without a cursor",
  ).toBeGreaterThan(0);

  /*
    And no page is fetched twice. A client that re-sent a cursor it had already
    used would re-request rows it already holds — the exact waste that made
    client-side paging over the unpaged endpoint the wrong answer, reappearing
    over a real one.
  */
  expect(new Set(paged).size, "the same cursor was sent more than once").toBe(
    paged.length,
  );
});

test("the feed reaches its real end and says so", async ({ page }) => {
  await page.goto("/?__scenario=long-feed");
  await page.waitForSelector('article[aria-posinset="1"]');

  /*
    Walked to the end rather than jumped to it: each page has to arrive before
    the next boundary is reachable, so this fails if the sentinel stops firing
    after the first page — the stall that an IntersectionObserver reporting
    only CHANGES produces when the tail never leaves the viewport.

    Bounded so a feed that pages forever fails rather than hangs.
  */
  for (let i = 0; i < 10; i++) {
    const end = page.getByText("That is everything on sale right now.");
    if (await end.isVisible().catch(() => false)) break;

    const before = await page.locator(`${FEED} article`).count();
    await page.locator(FEED).evaluate((el) => {
      el.scrollTop = el.scrollHeight;
    });
    await expect
      .poll(async () => {
        const end = page.getByText("That is everything on sale right now.");
        if (await end.isVisible().catch(() => false)) return before + 1;
        return page.locator(`${FEED} article`).count();
      })
      .toBeGreaterThan(before);
  }

  await expect(
    page.getByText("That is everything on sale right now."),
  ).toBeVisible();
  await expect(page.locator(`${FEED} article`)).toHaveCount(40);
});

test("a feed the server stopped is never called an ending", async ({
  page,
}) => {
  /*
    `complete: false` with no `nextCursor`. The contract is explicit that this
    is "a different thing from the feed having ended" — so the screen offers a
    reload and does not tell a traveller they have seen everything on sale.
  */
  await page.goto("/?__scenario=feed-stopped");
  await page.waitForSelector('article[aria-posinset="1"]');

  await expect(
    page.getByText(/That is as far as we can load right now/),
  ).toBeVisible();
  await expect(
    page.getByText("That is everything on sale right now."),
  ).toBeHidden();
  /*
    A statement, not a control. `role="feed"` may not contain a button — axe
    calls that a critical `aria-required-children` violation, and this file's
    own history records the same trap with an `<h1>`. So the action lives in
    the sentence.
  */
  await expect(page.getByText(/Reload to try again/)).toBeVisible();
  await expect(page.getByRole("button", { name: /Reload/ })).toHaveCount(0);
});

test("the tail's failure states are accessible too", async ({ page }) => {
  /*
    `shell.spec.ts` runs axe on `/`, where the fixture is complete and the tail
    is one sentence. The states that put a BUTTON inside `role="feed"` — a page
    that failed, and a server that stopped — are unreachable from that route,
    so nothing was checking the only markup in this feed that is interactive
    and not an article.
  */
  await page.goto("/?__scenario=feed-stopped");
  await page.getByText(/Reload to try again/).waitFor();

  const results = await new AxeBuilder({ page })
    .withTags(["wcag2a", "wcag2aa", "wcag21a", "wcag21aa", "wcag22aa"])
    .analyze();

  expect(results.violations).toEqual([]);
});
