import { test, expect, type Page } from "@playwright/test";
import AxeBuilder from "@axe-core/playwright";
import { COORG, FOUND_IDS } from "../mocks/found-fixtures";
import { TAGS, expectAccessible, signIn } from "./support/explore-filters";

/**
 * Explore any place (yuvoy-app#179), case 12: every state passes axe. The
 * other explore specs run axe on the feed, its ends, the card page and the
 * sheets. This file holds the states they do not reach: the loading
 * skeletons, the offline line, the stale line, an ended card page, and what
 * `/` shows when the places list fails.
 *
 * Every scenario here opens `explore` at `staff`, so each test signs in
 * first (any number is staff under them). The words are copied from
 * `found-words.ts` and `states/index.tsx`, as no spec imports app code.
 */

/** Coorg's found feed, under a scenario. */
const coorg = (scenario: string) => `/?place=${COORG}&__scenario=${scenario}`;

const cards = (page: Page) => page.locator('[role="feed"] article');

const departments = (page: Page) =>
  page
    .getByRole("group", { name: "Kinds of things to do", exact: true })
    .getByRole("button");

/** Waits until React has claimed the department chips, so a press counts. */
async function chipsReady(page: Page) {
  await expect(departments(page).nth(3)).toBeVisible();
  await page.waitForFunction(() => {
    const chip = document.querySelector(
      '[aria-label="Kinds of things to do"] button',
    );
    return (
      !!chip && Object.keys(chip).some((k) => k.startsWith("__reactProps$"))
    );
  });
}

test("the loading skeletons pass axe", async ({ page }) => {
  /*
    `found-slow` answers `GET /events` 1.5 s late. The server render waits
    for it, so the page arrives with cards; a department chip then asks
    again in the browser, and the feed draws its skeletons until the answer
    lands. Nothing holds them longer, so the check counts only when the
    skeletons were still there after axe ran. A new department each try,
    since one already read is answered from the cache with no skeletons.
  */
  await signIn(page);
  await page.goto(coorg("found-slow"));
  await expect(cards(page).first()).toBeVisible();
  await chipsReady(page);

  const loading = page.getByRole("status", {
    name: "Loading things to do in Coorg",
    exact: true,
  });
  let measured = false;
  for (const n of [1, 2, 3]) {
    await departments(page).nth(n).click();
    await expect(loading).toBeVisible();
    const results = await new AxeBuilder({ page }).withTags(TAGS).analyze();
    expect(results.violations).toEqual([]);
    if (await loading.isVisible()) {
      measured = true;
      break;
    }
    await expect(loading).toBeHidden();
  }
  expect(measured, "the skeletons never outlasted an axe run").toBe(true);
});

test("the offline line passes axe", async ({ page, context }) => {
  await signIn(page);
  await page.goto(coorg("explore-staff"));
  await expect(cards(page).first()).toBeVisible();

  await context.setOffline(true);
  await expect(
    page.getByRole("status").filter({
      hasText: "You are offline. This is what we saved on your device.",
    }),
  ).toBeVisible();
  await expect(cards(page).first()).toBeVisible();
  await expectAccessible(page);
  await context.setOffline(false);
});

test("the stale line passes axe", async ({ page }) => {
  /*
    The line appears 30 minutes after the list was read, by a timer the
    feed sets when it mounts. The fake clock is installed before the feed
    loads, so that timer is the clock's, and jumping 31 minutes fires it.
  */
  await signIn(page);
  await page.clock.install();
  await page.goto(coorg("explore-staff"));
  await expect(cards(page).first()).toBeVisible();

  const stale = page.getByRole("status").filter({
    hasText: /This list is from .+\. Refresh for the latest\./,
  });
  await expect(stale).toHaveCount(0);
  await page.clock.fastForward("31:00");
  await expect(stale).toBeVisible();
  await expect(
    stale.getByRole("button", { name: "Refresh", exact: true }),
  ).toBeVisible();
  await expectAccessible(page);
});

test("an ended card page passes axe", async ({ page }) => {
  await signIn(page);
  await page.goto(`/f/${FOUND_IDS.found}?__scenario=item-ended`);
  await expect(page.getByTestId("found-ended")).toHaveText("This has ended.");
  await expectAccessible(page);
});

test("a failed places list leaves the reels, and they pass axe", async ({
  page,
}) => {
  /*
    `places-error` fails `GET /places` and `GET /me/places`. With no list the
    page cannot choose a place, so `/` shows the reels with no place button.
    The picker's own "We couldn't load the
    places." panel is never drawn from here: the button that opens it is
    only there when the server read a list. `place-picker.test.tsx` holds it.
  */
  await signIn(page);
  await page.goto(coorg("places-error"));
  await expect(cards(page).first()).toBeVisible();
  await expect(
    page.getByRole("heading", { level: 1, name: /^Things to do in / }),
  ).toHaveCount(0);
  await expect(
    page.getByRole("button", { name: /^Change place\./ }),
  ).toHaveCount(0);
  await expectAccessible(page);
});
