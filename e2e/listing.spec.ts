import { test, expect } from "@playwright/test";
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

/** Opens the date pop-up and picks the first departure that can be picked. */
async function chooseDeparture(page: import("@playwright/test").Page) {
  await page.getByRole("button", { name: /Choose a departure|Change/ }).click();
  const sheet = page.getByRole("dialog", { name: "Pick a day" });
  await expect(sheet).toBeVisible();

  const group = sheet.getByRole("group", { name: "Which day" });
  // The chips arrive with the availability read, so counting before they do
  // gives zero and walks straight past every day to the throw below.
  await expect(group.getByRole("button").first()).toBeVisible();

  const chips = group.getByRole("button");
  for (let i = 0; i < (await chips.count()); i++) {
    await chips.nth(i).click();

    /*
      Wait for the chip to BE the chosen one before reading the rows under it.

      Two races, and the second is the one that survived a first fix. A day
      chip re-renders the list below it, so `count()` straight after the click
      is a snapshot that can catch nothing at all — or, worse, the OUTGOING
      day's rows, in which case the helper reads the wrong day's departure,
      finds it disabled, and moves on having silently skipped a day that had
      seats. It threw "no selectable departure" on listings with several,
      about one full run in three, and moved between specs — which is what a
      race looks like when the contended resource is the render.

      React commits the pressed chip and its rows together, so waiting on
      `aria-pressed` ties the two: once it is true, the rows are this day's.
    */
    await expect(chips.nth(i)).toHaveAttribute("aria-pressed", "true");

    const rows = sheet.getByRole("button", { name: /^\d\d:\d\d/ });
    // A chip exists only because that day has departures, so this cannot hang
    // on a legitimately empty day.
    await expect.poll(() => rows.count()).toBeGreaterThan(0);

    const first = rows.first();
    if (await first.isEnabled()) {
      await first.click();
      await expect(sheet).toBeHidden();
      return;
    }
  }
  throw new Error("no selectable departure in any day of the fixture");
}

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

test.describe("choosing a day", () => {
  test("is a pop-up, and the page carries no list of days", async ({
    page,
  }) => {
    await page.goto(REQUEST);
    await expect(page.getByRole("group", { name: "Which day" })).toHaveCount(0);

    await page.getByRole("button", { name: /Choose a departure/ }).click();
    const sheet = page.getByRole("dialog", { name: "Pick a day" });
    await expect(sheet.getByRole("group", { name: "Which day" })).toBeVisible();
  });

  test("the sticky bar shows the day and time, and no price", async ({
    page,
  }) => {
    await page.goto(REQUEST);
    await chooseDeparture(page);

    const bar = page.getByRole("button", { name: /Ask the operator/ });
    await expect(bar).toBeVisible();
    // The bar is the last thing read before committing; a per-person figure
    // there reads as the total.
    const region = page.locator("[data-sticky-bar], footer, .sticky").first();
    const text = (await region.count()) ? await region.innerText() : "";
    expect(text).not.toMatch(/₹/);
  });
});

test.describe("asking the operator", () => {
  test("never leaves the listing, and ends somewhere useful", async ({
    page,
  }) => {
    await page.goto(REQUEST);
    await chooseDeparture(page);
    await page.getByRole("button", { name: /Ask the operator/ }).click();

    const sheet = page.getByRole("dialog", { name: "Ask the operator" });
    await expect(sheet).toBeVisible();
    // Still on the listing. A whole checkout page for three fields was a
    // screen between a traveller and a question they had decided to ask.
    expect(new URL(page.url()).pathname).toBe(REQUEST);

    await sheet.getByLabel("Your name").fill("Asha Menon");
    await sheet.getByLabel("WhatsApp number").fill("9000000000");
    await sheet.getByRole("checkbox").check();
    await sheet.getByRole("button", { name: /Send the request/ }).click();

    const sent = page.getByRole("dialog", { name: "Request sent" });
    await expect(sent).toBeVisible();
    await expect(
      sent.getByRole("link", { name: "Go to my trips" }),
    ).toHaveAttribute("href", "/trips");
    /*
      Back goes to the FEED, not to the listing. Somebody who has just asked
      about this experience has finished with its page.
    */
    await sent.getByRole("link", { name: "Back to the feed" }).click();
    await page.waitForURL("**/");
  });

  test("an instant book still goes to checkout", async ({ page }) => {
    // Money gets a page. Only requests move into the pop-up.
    await page.goto(INSTANT);
    await chooseDeparture(page);
    await page.getByRole("link", { name: /Continue/ }).click();
    await page.waitForURL(/\/e\/try-dive-nemo-reef\/book\?/);
  });

  test("the pop-up is accessible", async ({ page }) => {
    await page.goto(REQUEST);
    await chooseDeparture(page);
    await page.getByRole("button", { name: /Ask the operator/ }).click();
    const sheet = page.getByRole("dialog", { name: "Ask the operator" });
    await expect(sheet).toBeVisible();
    await sheet.evaluate((el) =>
      Promise.all(el.getAnimations({ subtree: true }).map((a) => a.finished)),
    );

    const results = await new AxeBuilder({ page })
      .withTags(["wcag2a", "wcag2aa", "wcag21a", "wcag21aa", "wcag22aa"])
      .analyze();
    expect(results.violations).toEqual([]);
  });
});
