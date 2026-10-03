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
  /*
    The lightbox tests use the REQUEST listing, whose frame is a poster: the
    instant listing's is a clip with a stream, which plays where it is rather
    than opening full screen (below).
  */
  test("swipes, and opens full screen", async ({ page }) => {
    await page.goto(REQUEST);
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
    await page.goto(REQUEST);
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

test.describe("clips in the gallery", () => {
  /*
    The approved redesign (traveller A, 3 Oct 2026): a clip with a stream plays
    where it is, through the feed's player. The fixture's stream does not
    resolve, so what this can prove is the shape, not playback: the frame is a
    slide holding the player, and never a button that opens a still of it.
  */
  test("a clip with a stream is a slide that plays, not a poster to open", async ({
    page,
  }) => {
    await page.goto(INSTANT);
    const gallery = page.getByRole("group", {
      name: /Photographs and clips of/,
    });
    await expect(
      gallery.getByRole("group", { name: "1 of 1, a clip" }),
    ).toBeVisible();
    await expect(
      gallery.getByRole("button", { name: /^Open 1 of/ }),
    ).toHaveCount(0);
  });

  test("what a frame draws at its foot is never under the sheet", async ({
    page,
  }) => {
    /*
      On a phone the sheet rises 32px over the picture, and the dots and the
      Clip badge used to sit 12px from the picture's foot: under the sheet's
      rounded top, where nobody could see them. `--hero-overlap` lifts them.
    */
    await page.goto(REQUEST);
    const badge = page
      .getByRole("group", { name: /Photographs and clips of/ })
      .getByText("Clip", { exact: true });
    await expect(badge).toBeVisible();
    const sheet = (await page.locator(".sheet").first().boundingBox())!;
    const box = (await badge.boundingBox())!;
    expect(box.y + box.height).toBeLessThanOrEqual(sheet.y);
  });
});

test.describe("the far side", () => {
  /*
    The approved redesign (traveller A, 3 Oct 2026): on a phone the picture
    stays where it is and the sheet scrolls up over it, with Back and Share
    floating above both. From `lg` up nothing slides and the page scrolls as
    one, as it always did.
  */
  test("the picture stays put on a phone, and Back stays in reach", async ({
    page,
  }) => {
    await page.goto(INSTANT);
    const gallery = page.getByRole("group", {
      name: /Photographs and clips of/,
    });
    await expect(gallery).toBeVisible();
    const back = page.getByRole("link", { name: "Back to the feed" });
    const phone = (page.viewportSize()?.width ?? 0) < 1024;

    await page.evaluate(() => window.scrollTo(0, 400));
    await expect
      .poll(() => page.evaluate(() => window.scrollY))
      .toBeGreaterThan(300);

    const picture = await gallery.boundingBox();
    if (!phone) {
      expect(picture!.y).toBeLessThan(-300);
      await expect(back).not.toBeInViewport();
      return;
    }

    expect(Math.round(picture!.y)).toBe(0);
    // The sheet has risen over it.
    const heading = page.getByRole("heading", { level: 1 });
    expect((await heading.boundingBox())!.y).toBeLessThan(picture!.height);

    // Back is on screen AND is what a tap there lands on, not the sheet.
    await expect(back).toBeInViewport();
    const box = (await back.boundingBox())!;
    const hit = await page.evaluate(
      ([x, y]) =>
        document.elementFromPoint(x, y)?.closest("a")?.getAttribute("href"),
      [box.x + box.width / 2, box.y + box.height / 2],
    );
    expect(hit).toBe("/");
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

  test("opens checkout on the day it names, for both booking modes", async ({
    page,
  }) => {
    /*
      The divergence this issue ended. Request mode used to answer in a sheet on
      this page while allotment mode went to checkout, so the two had different
      flows, different validation and different copy for the same act.

      It carries the day the bar names and nothing else (the approved redesign,
      3 Oct 2026). Checkout then chooses the departure itself when only one is
      open that day, which is why the URL may grow a `slot` after it lands.
    */
    for (const listing of [REQUEST, INSTANT]) {
      await page.goto(listing);
      const bar = page.locator("div.sticky", {
        has: page.getByRole("link", { name: /^Pick a day/ }),
      });
      await expect(bar).toContainText("Next open: Thu, 20 Aug");
      await page.getByRole("link", { name: /^Pick a day/ }).click();
      await page.waitForURL(new RegExp(`${listing}/book\\?date=2026-08-20`));
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
    await page.waitForURL(/\/book\?date=2026-08-20/);
    const firstOpen = page
      .getByRole("region", { name: "Pick a day" })
      .locator("button[aria-pressed]:not([disabled])")
      .first();
    await expect(firstOpen).toHaveAttribute("aria-label", /^Thu 20 Aug/);
    // And it is the day already chosen: the traveller does not find it twice.
    await expect(firstOpen).toHaveAttribute("aria-pressed", "true");
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
      await page.waitForURL(/\/book(\?|$)/);
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
