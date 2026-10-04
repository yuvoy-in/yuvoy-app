import { test, expect, type Page } from "@playwright/test";
import AxeBuilder from "@axe-core/playwright";
import { chooseDeparture } from "./support/checkout";
import { expectSaveStored } from "./support/saved";

/**
 * Traveller QA for the approved redesign (traveller A, 3 Oct 2026): WCAG 2.2
 * AA on the states the redesign made, which the per-route sweep in
 * `shell.spec.ts` never reaches because each needs something done first: a
 * search typed, a save made, a booking made, days set.
 */

const TAGS = ["wcag2a", "wcag2aa", "wcag21a", "wcag21aa", "wcag22aa"];

async function expectAccessible(page: Page) {
  /*
    Let entrances finish: axe measuring a fading element reads a colour nobody
    sees. Settled, not all: an animation cancelled mid-swap rejects its
    `finished` with an AbortError, and that is not a failure of the page. An
    infinite one (a skeleton's shimmer) never finishes, so it is not waited
    on, and nor is one on a scroll timeline (the far side's recede, T15 A):
    it rests where the scroll has it, with nothing to finish.
  */
  await page.evaluate(() =>
    Promise.allSettled(
      document
        .getAnimations()
        .filter(
          (a) =>
            a.timeline === document.timeline &&
            a.effect?.getTiming().iterations !== Infinity,
        )
        .map((a) => a.finished),
    ),
  );
  const results = await new AxeBuilder({ page }).withTags(TAGS).analyze();
  expect(results.violations).toEqual([]);
}

async function bookCharter(page: Page) {
  await page.goto("/e/private-boat-charter");
  await page.waitForLoadState("networkidle");
  await chooseDeparture(page);
  await page.getByLabel(/Your name/i).fill("Asha Menon");
  await page.getByLabel(/WhatsApp number/i).fill("+919000000000");
  await page.getByRole("checkbox", { name: /called off/i }).check();
  await page.getByRole("button", { name: /^Book now/i }).click();
  await expect(page).toHaveURL(/\/booking#t=/);
  await expect(page.getByText("You are going")).toBeVisible();
}

test("search results that say what they are", async ({ page }) => {
  await page.goto("/search?q=dive");
  await expect(
    page
      .getByRole("list", { name: "Search results" })
      .getByRole("link")
      .first(),
  ).toBeVisible();
  await expectAccessible(page);
});

test("saves, as a grid and as a reel", async ({ page }) => {
  await page.goto("/");
  const save = page.getByRole("button", { name: /^Save / }).first();
  const title = ((await save.getAttribute("aria-label")) ?? "").replace(
    /^Save /,
    "",
  );
  await save.click();
  // The heart flips at once and the write lands after: wait on the write
  // itself, or /saved can open on nothing (see `savesOnDevice`).
  await expect(
    page.getByRole("button", { name: `Saved. Remove ${title}` }).first(),
  ).toBeVisible();
  await expectSaveStored(page);
  await page.goto("/saved");
  await expect(page.getByRole("link", { name: "Play them" })).toBeVisible();
  await expectAccessible(page);

  await page.getByRole("link", { name: "Play them" }).click();
  await page.waitForURL(/\/saved\/r\//);
  await expect(page.getByRole("heading", { level: 1 })).toBeAttached();
  await expectAccessible(page);
});

test("a trip booked in one tap, under its picture", async ({ page }) => {
  await bookCharter(page);
  await expectAccessible(page);
});

test("a hold that cash cannot finish yet", async ({ page }) => {
  // The unpriced kayak: the API takes no money against it, so it stays held.
  await page.goto("/e/mangrove-kayak-at-dawn");
  await page.waitForLoadState("networkidle");
  await chooseDeparture(page);
  await page.getByLabel(/Your name/i).fill("Asha Menon");
  await page.getByLabel(/WhatsApp number/i).fill("+919000000000");
  await page.getByRole("checkbox", { name: /called off/i }).check();
  await page.getByRole("button", { name: /^Book now/i }).click();
  await expect(page.getByText("Your seats are held")).toBeVisible();
  await expectAccessible(page);
});

test("checkout's two weeks, and the month behind them", async ({ page }) => {
  await page.goto("/e/try-dive-nemo-reef");
  await page.getByRole("link", { name: /^Pick a day/ }).click();
  await page.waitForURL(/\/book(\?|$)/);
  await expect(
    page.getByRole("group", { name: "The next two weeks" }),
  ).toBeVisible();
  await expectAccessible(page);
  await page.getByRole("button", { name: "More dates" }).click();
  await expectAccessible(page);
});

test("signed in Trips, with the days set", async ({ page }) => {
  await page.goto("/account");
  await page.getByLabel("Your WhatsApp number").fill("9111111111");
  await page.getByRole("button", { name: "Send me a code" }).click();
  await page.getByLabel("The code we sent").fill("123456");
  await page.getByRole("button", { name: "Show me my trips" }).click();
  await expect(
    page.getByRole("button", { name: "Sign out on this device" }),
  ).toBeVisible();

  await page.goto("/trips");
  // The settled section, not its arrival.
  await expect(
    page
      .getByRole("region", { name: "Your island days" })
      .getByRole("button", { name: "Set your days" }),
  ).toBeVisible();
  await expectAccessible(page);

  await page.getByRole("button", { name: "Set your days" }).click();
  await expectAccessible(page);
});
