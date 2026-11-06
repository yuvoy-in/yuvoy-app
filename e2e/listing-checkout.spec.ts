import { test, expect, type Page } from "@playwright/test";
import { chooseDeparture } from "./support/checkout";
import AxeBuilder from "@axe-core/playwright";

/**
 * Checkout opened from the listing page (yuvoy-app#32): choosing a departure,
 * and the heading that holds its height while one is chosen.
 *
 * Its own file because `listing.spec.ts` is over 500 lines.
 */

const REQUEST = "/e/snorkel-elephant-beach";
const INSTANT = "/e/try-dive-nemo-reef";

test.describe("choosing a departure on checkout", () => {
  test("picks a day and a time, and keeps both in the URL", async ({
    page,
  }) => {
    await page.goto(INSTANT);
    await chooseDeparture(page);

    await expect(page).toHaveURL(/\/book\?date=\d{4}-\d{2}-\d{2}&slot=/);
    // And the whole choice on one line, above the action.
    await expect(page.getByText(/· 1 person ·/)).toBeVisible();
  });

  test("a request-mode listing sends a request from the same page", async ({
    page,
  }) => {
    await page.goto(REQUEST);
    await chooseDeparture(page);

    await page.getByLabel(/Your name/i).fill("Asha Menon");
    await page.getByLabel(/WhatsApp number/i).fill("9000000000");
    await expect(
      page.getByRole("button", { name: /Send request/ }),
    ).toBeVisible();
  });

  test("the form fits a 375px phone, and every tick is a real target", async ({
    page,
  }) => {
    /*
      Two cited production defects (the redesign's before page, 3 Oct 2026).
      The screener's age select could not shrink, so checkout scrolled
      sideways on a 375px phone; and every tick and radio was 16px.
    */
    await page.setViewportSize({ width: 375, height: 740 });
    await page.goto(INSTANT);
    await chooseDeparture(page);
    await expect(page.getByLabel("Your age range")).toBeVisible();

    const sideways = await page.evaluate(
      () =>
        document.documentElement.scrollWidth >
        document.documentElement.clientWidth,
    );
    expect(sideways, "checkout scrolls sideways").toBe(false);

    const ticks = page.locator('input[type="checkbox"], input[type="radio"]');
    expect(await ticks.count()).toBeGreaterThan(2);
    for (const tick of await ticks.all()) {
      const box = (await tick.boundingBox())!;
      expect(Math.min(box.width, box.height)).toBeGreaterThanOrEqual(24);
    }
  });

  test("opens on the next two weeks, with the month one tap away", async ({
    page,
  }) => {
    // The approved redesign (traveller A, 3 Oct 2026).
    await page.goto(INSTANT);
    await page.getByRole("link", { name: /^Pick a day/ }).click();
    await page.waitForURL(/\/book(\?|$)/);
    const days = page.getByRole("group", { name: "The next two weeks" });
    await expect(days.getByRole("button")).toHaveCount(14);

    await page.getByRole("button", { name: "More dates" }).click();
    await expect(page.getByText("August 2026")).toBeVisible();
    await expect(days).toHaveCount(0);
    await page.getByRole("button", { name: "Next two weeks" }).click();
    await expect(days).toBeVisible();
  });

  test("the calendar is accessible", async ({ page }) => {
    await page.goto(INSTANT);
    await page.getByRole("link", { name: /^Pick a day/ }).click();
    await page.waitForURL(/\/book(\?|$)/);
    await expect(
      page.getByRole("region", { name: "Pick a day" }),
    ).toBeVisible();

    const results = await new AxeBuilder({ page })
      .withTags(["wcag2a", "wcag2aa", "wcag21a", "wcag21aa", "wcag22aa"])
      .analyze();
    expect(results.violations).toEqual([]);
  });
});

test.describe("checkout's heading holds its height", () => {
  /*
    The heading is the question in the display cut until a departure is
    chosen, then the day and the hour on the board, and the two are not one
    height: the question is one line from 375px up and two below, the answer
    one board line. Swapping them moved everything under the heading, 5px from
    375px up and 27px at 360px, as the dates landed and again on a tap
    (stability audit, 6 Oct 2026). Measured on both sides of the wrap.
  */
  const firstOpenDay = (page: Page) =>
    page
      .getByRole("group", { name: "The next two weeks" })
      .locator("button[aria-pressed]:not([disabled])")
      .first();

  for (const width of [360, 412]) {
    test(`as the dates land, at ${width}px`, async ({ page }) => {
      // Checkout's own read is held, so the heading is seen before and after.
      await page.addInitScript(() => {
        const fetchOf = window.fetch.bind(window);
        window.fetch = async (input, init) => {
          const url =
            typeof input === "string"
              ? input
              : input instanceof Request
                ? input.url
                : String(input);
          if (
            location.pathname.endsWith("/book") &&
            /\/availability\?/.test(url)
          ) {
            await new Promise((resolve) => setTimeout(resolve, 1200));
          }
          return fetchOf(input, init);
        };
      });
      await page.setViewportSize({ width, height: 800 });
      await page.goto(INSTANT);
      // The bar names the next open day, so checkout opens on it.
      const pick = page.getByRole("link", { name: /^Pick a day/ });
      await expect(pick).toHaveAttribute("href", /\?date=/);
      await pick.click();
      await page.waitForURL(/\/book\?date=/);

      const heading = page.getByRole("heading", { level: 1 });
      await expect(heading).toHaveAccessibleName("When would you like to go?");
      const pay = page.getByText("Pay at the counter on the day");
      const before = (await pay.boundingBox())!.y;
      // That day has one departure, so the dates landing choose it.
      await expect(heading).toHaveAccessibleName(/ · \d{2}:\d{2}$/, {
        timeout: 6000,
      });
      const after = (await pay.boundingBox())!.y;
      expect(Math.abs(after - before)).toBeLessThan(1);
    });

    test(`as a tap chooses a departure, at ${width}px`, async ({ page }) => {
      await page.setViewportSize({ width, height: 800 });
      await page.goto(`${INSTANT}/book`);
      const day = firstOpenDay(page);
      await expect(day).toBeVisible();

      const heading = page.getByRole("heading", { level: 1 });
      await expect(heading).toHaveAccessibleName("When would you like to go?");
      const pay = page.getByText("Pay at the counter on the day");
      const before = (await pay.boundingBox())!.y;
      // The first open day has one departure, so the tap chooses it.
      await day.click();
      await expect(heading).toHaveAccessibleName(/ · \d{2}:\d{2}$/);
      const after = (await pay.boundingBox())!.y;
      expect(Math.abs(after - before)).toBeLessThan(1);
    });
  }
});
