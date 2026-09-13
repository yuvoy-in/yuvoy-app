import { test, expect } from "@playwright/test";

/**
 * reel → listing → operator — yuvoy-app#30.
 *
 * The operator page shipped a day before `OperatorSummary.slug` did, so it was
 * reachable by URL and from nowhere a traveller actually was. These walk both
 * ways in, and what the page says about a business that has written something
 * and about one that has not (yuvoy-operator#41).
 */

test("a reel no longer names the operator, and that is deliberate", async ({
  page,
}) => {
  /*
    This used to walk reel → operator by clicking the business's name on a feed
    card. yuvoy-app#36 removed the name and its Verified tag from the overlay:
    they were the first two of nine things over the clip, and the owner's
    complaint was the pile rather than any one of them.

    The route is not orphaned — the test below walks listing → operator, which
    is the path that survives and the one `/o/{slug}` was built for. This one
    is inverted rather than deleted so the removal stays a decision on the
    record instead of coverage that quietly went missing.
  */
  await page.goto("/");
  const card = page.getByRole("article").first();
  await expect(card).toBeVisible();
  await expect(
    card.getByRole("link", { name: "Sample Dive Operator" }),
  ).toHaveCount(0);
  await expect(card.getByText("Verified")).toHaveCount(0);
});

test("Who runs this, on a listing, opens the business's page too", async ({
  page,
}) => {
  await page.goto("/e/snorkel-elephant-beach");
  await page.getByRole("link", { name: "Sample Boat Operator" }).click();
  await page.waitForURL("**/o/sample-boat-operator");
  await expect(
    page.getByRole("heading", { level: 1, name: /Sample Boat Operator/ }),
  ).toBeVisible();
});

test("the page carries what a business wrote, and nothing for what it did not", async ({
  page,
}) => {
  await page.goto("/o/sample-boat-operator");
  await expect(
    page.getByRole("heading", { name: "About", exact: true }),
  ).toBeVisible();
  await expect(page.getByText("Running since 2014")).toBeVisible();
  await expect(
    page.getByRole("heading", { name: "Photos", exact: true }),
  ).toBeVisible();

  // Written nothing yet: no empty headings, and no year nobody reviewed.
  await page.goto("/o/sample-new-operator");
  await expect(
    page.getByRole("heading", { level: 1, name: /Sample New Operator/ }),
  ).toBeVisible();
  await expect(
    page.getByRole("heading", { name: "About", exact: true }),
  ).toHaveCount(0);
  await expect(
    page.getByRole("heading", { name: "Photos", exact: true }),
  ).toHaveCount(0);
  await expect(page.getByText(/Running since/)).toHaveCount(0);
});

/**
 * What they run, and reels that play in place — yuvoy-app#33.
 *
 * The owner liked `/o/{slug}` and asked for exactly two changes to it. Both
 * are about where a tap goes, which is the one thing a unit test cannot prove
 * end to end.
 */
test.describe("the owner's two changes to the business page", () => {
  test("What they run is a door to its own page, not a list on the profile", async ({
    page,
  }) => {
    await page.goto("/o/sample-boat-operator");

    // The rows are not on the profile any more.
    await expect(page.getByText("Snorkel trip to Elephant Beach")).toHaveCount(
      0,
    );

    await page.getByRole("link", { name: /What they run/ }).click();
    await page.waitForURL("**/o/sample-boat-operator/listings");
    await expect(
      page.getByRole("heading", { level: 1, name: "What they run" }),
    ).toBeVisible();
    await expect(
      page.getByText("Snorkel trip to Elephant Beach"),
    ).toBeVisible();
  });

  test("the listings page is focused: a way back, and no tab bar", async ({
    page,
    isMobile,
  }) => {
    test.skip(!isMobile, "the rail replaces the bar above lg");

    await page.goto("/o/sample-boat-operator/listings");
    await expect(
      page.getByRole("heading", { level: 1, name: "What they run" }),
    ).toBeVisible();

    await expect(page.locator('nav[aria-label="Primary"]:visible')).toHaveCount(
      0,
    );
    await page.getByRole("link", { name: /^Back to/ }).click();
    await page.waitForURL("**/o/sample-boat-operator");
  });

  test("tapping a reel plays it, and swiping stays inside this business", async ({
    page,
  }) => {
    await page.goto("/o/sample-dive-operator");

    const tiles = page.getByRole("link", { name: /^Play / });
    await expect(tiles.first()).toBeVisible();

    // The second tile, so "opens on the one that was tapped" is a real claim
    // rather than one the first index satisfies by accident.
    const second = tiles.nth(1);
    const label = await second.getAttribute("aria-label");
    await second.click();
    await page.waitForURL(/\/o\/sample-dive-operator\/r\//);

    /*
      The opened reel is the one that was tapped AND it is at its own place in
      the sequence — position two, not pinned to the front. That is the
      difference between this and a shared reel, and it is what makes swiping
      on continue rather than restart.
    */
    const opened = page.locator('article[aria-posinset="2"]');
    await expect(opened).toHaveAttribute(
      "aria-label",
      label!.replace(/^Play /, ""),
    );

    // Every reel here is this business's. The general feed has not leaked in.
    const titles = await page
      .locator("article")
      .evaluateAll((els) => els.map((el) => el.getAttribute("aria-label")));
    for (const title of titles) {
      expect(title).toMatch(/Try-dive at Nemo Reef|Mangrove kayak at dawn/);
    }
  });

  test("back from a reel returns to the grid", async ({ page }) => {
    await page.goto("/o/sample-dive-operator");
    await page
      .getByRole("link", { name: /^Play / })
      .first()
      .click();
    await page.waitForURL(/\/o\/sample-dive-operator\/r\//);

    await page
      .getByRole("link", { name: /^Back to/ })
      .first()
      .click();
    await page.waitForURL("**/o/sample-dive-operator");
    await expect(
      page.getByRole("link", { name: /^Play / }).first(),
    ).toBeVisible();
  });

  test("a reel that is not this business's says so instead of crashing", async ({
    page,
  }) => {
    await page.goto("/o/sample-dive-operator/r/med_not_theirs");
    await expect(
      page.getByText(/This reel is not here any more/),
    ).toBeVisible();
    await expect(page.getByRole("link", { name: /^Back to/ })).toBeVisible();
  });

  test("a reel is never offered to a crawler", async ({ page }) => {
    /*
      Only the private half is assertable here. Before launch the whole app
      carries a site-wide `noindex, nofollow`, so a rendered page cannot show
      the difference between "private for its own reasons" and "the site is not
      live yet" — the listings page's indexability is pinned in
      `indexing.test.ts` against the route lists instead, which is where the
      distinction actually lives.
    */
    await page.goto("/o/sample-dive-operator/r/med_dive");
    await expect(page.locator('meta[name="robots"]')).toHaveAttribute(
      "content",
      /noindex/,
    );
  });
});
