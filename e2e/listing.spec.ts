import { test, expect } from "@playwright/test";
import { chooseDeparture } from "./support/checkout";
import AxeBuilder from "@axe-core/playwright";

/**
 * The listing page, after the owner's walk — yuvoy-app#32.
 *
 * The parts that only a real browser can answer: whether the gallery actually
 * swipes, whether the pop-ups are modal, and whether a request can be sent
 * without leaving the page.
 */

const REQUEST = "/e/snorkel-elephant-beach";
const INSTANT = "/e/try-dive-nemo-reef";

test.describe("the gallery", () => {
  test("swipes, and opens full screen", async ({ page }) => {
    await page.goto(INSTANT);
    const gallery = page.getByRole("group", {
      name: /Photographs and clips of/,
    });
    await expect(gallery).toBeVisible();

    // The strip it replaced is gone, not merely moved further down.
    await expect(
      page.getByRole("region", { name: "More from this experience" }),
    ).toHaveCount(0);

    await gallery.getByRole("button", { name: /^Open 1 of/ }).click();
    const lightbox = page.getByRole("dialog", { name: /1 of/ });
    await expect(lightbox).toBeVisible();

    /*
      Escape closes it. It is a `<dialog>` for exactly this: the trap, Escape,
      inertness and the top layer are the browser's, and a hand-rolled version
      is the one that gets three of the four right.
    */
    await page.keyboard.press("Escape");
    await expect(lightbox).toBeHidden();
  });

  test("the full-screen view is accessible", async ({ page }) => {
    await page.goto(INSTANT);
    await page
      .getByRole("group", { name: /Photographs and clips of/ })
      .getByRole("button", { name: /^Open 1 of/ })
      .click();
    const lightbox = page.getByRole("dialog", { name: /1 of/ });
    await expect(lightbox).toBeVisible();
    // Wait out the entrance: axe measuring a fading element reads a colour
    // nobody sees. See the same note on the search filter sheet.
    await lightbox.evaluate((el) =>
      Promise.all(el.getAnimations({ subtree: true }).map((a) => a.finished)),
    );

    const results = await new AxeBuilder({ page })
      .withTags(["wcag2a", "wcag2aa", "wcag21a", "wcag21aa", "wcag22aa"])
      .analyze();
    expect(results.violations).toEqual([]);
  });
});

test.describe("one button, and it opens checkout", () => {
  /*
    yuvoy-app#62 deleted three things from this page: a "Pick a day" pop-up
    with a day strip, a party stepper, and an "Ask the operator" sheet. The
    tests for all three went with them. What is asserted now is that none of
    them came back, and that the one button goes where it says.
  */

  test("carries no date or party control of its own", async ({ page }) => {
    await page.goto(REQUEST);
    await expect(page.getByRole("group", { name: "Which day" })).toHaveCount(0);
    await expect(
      page.getByRole("button", { name: /Choose a departure/ }),
    ).toHaveCount(0);
    await expect(page.getByText(/How many of you/i)).toHaveCount(0);
  });

  test("opens checkout with nothing chosen, for both booking modes", async ({
    page,
  }) => {
    /*
      The divergence this issue ended. Request mode used to answer in a sheet on
      this page while allotment mode went to checkout, so the two had different
      flows, different validation and different copy for the same act.
    */
    for (const listing of [REQUEST, INSTANT]) {
      await page.goto(listing);
      await page.getByRole("link", { name: /^Pick a day/ }).click();
      await page.waitForURL(new RegExp(`${listing}/book$`));
    }
  });

  test("the bar carries the price, and the day checkout opens on", async ({
    page,
  }) => {
    /*
      yuvoy-app#111, reversing an earlier owner call with the owner's approval
      (25 Sep). The price comes back WITH the server's unit phrase, which is
      what answers the old objection that a bare figure read as the total.

      The mock's clock is 19 Aug and that morning's dive is past its cutoff,
      so the first day anybody could book is Thursday the 20th. The bar names
      it from a live availability read, by checkout's own rule, and checkout's
      calendar must then open with that same day as its first open square.
    */
    await page.goto(INSTANT);
    const bar = page.locator("div.sticky", {
      has: page.getByRole("link", { name: /^Pick a day/ }),
    });
    await expect(bar).toContainText("₹4,500");
    await expect(bar).toContainText("per person");
    await expect(bar).toContainText("Next open: Thu, 20 Aug");

    await page.getByRole("link", { name: /^Pick a day/ }).click();
    await page.waitForURL(/\/book$/);
    const firstOpen = page
      .getByRole("region", { name: "Pick a day" })
      .locator("button[aria-pressed]:not([disabled])")
      .first();
    await expect(firstOpen).toHaveAttribute("aria-label", /^Thu 20 Aug/);
  });

  test("a request listing's bar carries them too", async ({ page }) => {
    await page.goto(REQUEST);
    const bar = page.locator("div.sticky", {
      has: page.getByRole("link", { name: /^Pick a day/ }),
    });
    await expect(bar).toContainText("₹2,200");
    await expect(bar).toContainText("Next open: Thu, 20 Aug");
  });
});

test.describe("how it is paid for", () => {
  /*
    yuvoy-app#110. Paying at the counter on the day is the only way a booking
    can be finished today, and a traveller used to learn that at the pay step.
    It is said beside the price and again at the top of checkout, for both
    booking modes.
  */
  for (const listing of [INSTANT, REQUEST]) {
    test(`is said on the listing and at the top of checkout (${listing})`, async ({
      page,
    }) => {
      await page.goto(listing);
      await expect(
        page.getByText("Pay at the counter on the day"),
      ).toBeVisible();

      await page.getByRole("link", { name: /^Pick a day/ }).click();
      await page.waitForURL(/\/book$/);
      await expect(
        page.getByText("Pay at the counter on the day"),
      ).toBeVisible();
    });
  }
});

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

  test("the calendar is accessible", async ({ page }) => {
    await page.goto(INSTANT);
    await page.getByRole("link", { name: /^Pick a day/ }).click();
    await page.waitForURL(/\/book$/);
    await expect(
      page.getByRole("region", { name: "Pick a day" }),
    ).toBeVisible();

    const results = await new AxeBuilder({ page })
      .withTags(["wcag2a", "wcag2aa", "wcag21a", "wcag21aa", "wcag22aa"])
      .analyze();
    expect(results.violations).toEqual([]);
  });
});
