import { test, expect } from "@playwright/test";
import AxeBuilder from "@axe-core/playwright";

/**
 * A shared reel opens the reel — `/r/{media.id}`, yuvoy-app#36.
 *
 * Share on a card used to build `/e/{slug}`, so a clip somebody chose to pass
 * on arrived as a page about the listing. This is the address that opens the
 * clip, and the only place that can prove the whole chain: the share control
 * builds it, the route resolves it, and the reel that comes back is the one
 * that was shared.
 *
 * `med_dive` is the fixture reel with a real clip attached.
 */

const SHARED = "/r/med_dive";

test.describe("a shared reel", () => {
  test("opens the reel that was shared, not the listing", async ({ page }) => {
    await page.goto(SHARED);

    const first = page.locator('article[aria-posinset="1"]');
    await expect(first).toBeVisible();
    await expect(first).toHaveAttribute("aria-label", /Try-dive at Nemo Reef/);

    // A reel, not a page about one: the listing's own furniture is absent.
    await expect(page.getByRole("link", { name: /^Back to/ })).toHaveCount(0);
  });

  test("swipes on into the feed, without repeating the shared reel", async ({
    page,
  }) => {
    /*
      The contract's own instruction: "This returns the reel alone. To swipe on
      from it, page `GET /reels` as usual." The feed's rotation knows nothing
      about the shared reel, so its own copy is in those pages — and two cards
      with one React key hands one clip's player state to another.
    */
    await page.goto(SHARED);
    await expect(page.locator('article[aria-posinset="1"]')).toBeVisible();

    await expect
      .poll(async () => page.locator("article").count(), {
        message: "the feed never paged in underneath the shared reel",
      })
      .toBeGreaterThan(1);

    const labels = await page
      .locator("article")
      .evaluateAll((els) => els.map((el) => el.getAttribute("aria-label")));
    const dive = labels.filter((l) => l?.includes("Try-dive at Nemo Reef"));
    /*
      The dive has three reels in the fixture, so it legitimately appears
      three times — what must never happen is a FOURTH from the pinned copy
      being counted twice. Asserted on the count the fixture actually has.
    */
    expect(dive).toHaveLength(3);
  });

  test("gives somebody arriving from a message a way into the app", async ({
    page,
    isMobile,
  }) => {
    test.skip(!isMobile, "the rail carries the mark above lg");

    await page.goto(SHARED);
    await expect(page.locator('article[aria-posinset="1"]')).toBeVisible();

    // The feed's masthead is inert; this one is the way in, because there is
    // no history behind a link opened from WhatsApp.
    await page.getByLabel("Yuvoy home").click();
    await page.waitForURL("**/");
  });

  test("Book still opens the listing", async ({ page }) => {
    /* The arrow became a word on 15 September. A shared reel is the surface
       where it matters most: whoever opened this has no context at all. */
    await page.goto(SHARED);
    const first = page.locator('article[aria-posinset="1"]');
    await expect(first).toBeVisible();
    await expect(
      first.getByRole("link", { name: /^(Book|View)$/ }),
    ).toHaveAttribute("href", "/e/try-dive-nemo-reef");
  });

  test("a reel the feed would not show is not found", async ({ page }) => {
    /*
      A withdrawn clip, a listing that stopped being sellable, and an id that
      never existed are ONE answer on purpose — telling them apart confirms
      that a hidden reel exists. The page must not distinguish them either.
    */
    const res = await page.goto("/r/med_does_not_exist");
    expect(res?.status()).toBe(404);
  });

  test("is never offered to a crawler", async ({ page }) => {
    /*
      Two independent reasons, both in PRIVATE_ROUTES: the address dies when a
      listing pauses, and `/e/{slug}` is the indexable page about the same
      experience.
    */
    await page.goto(SHARED);
    await expect(page.locator('meta[name="robots"]')).toHaveAttribute(
      "content",
      /noindex/,
    );

    /*
      robots.txt has two shapes and both are correct. Before the app is
      indexable it blanket-disallows everything, which is what a local build
      and every preview serve; once `INDEXABLE` flips it allows the site and
      names PRIVATE_ROUTES. The assertion has to hold across the launch flip,
      or this test starts failing on the day the app goes live for a reason
      that has nothing to do with reels.
    */
    const robots = await (await page.request.get("/robots.txt")).text();
    expect(
      robots.includes("Disallow: /\n") || robots.includes("/r/"),
      `robots.txt neither blanket-disallows nor names /r/:\n${robots}`,
    ).toBe(true);
  });

  test("is accessible", async ({ page }) => {
    await page.goto(SHARED);
    await expect(page.locator('article[aria-posinset="1"]')).toBeVisible();

    const results = await new AxeBuilder({ page })
      .withTags(["wcag2a", "wcag2aa", "wcag21a", "wcag21aa", "wcag22aa"])
      .analyze();

    expect(results.violations).toEqual([]);
  });
});
