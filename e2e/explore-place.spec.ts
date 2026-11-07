// This file was split in three (yuvoy-app#243): this one keeps explore off,
// the picker, a remembered place, Near you and what a card says;
// explore-place-report.spec.ts has See details and reports;
// explore-place-ending.spec.ts has the feed's foot and the card page.
import { test, expect, type Locator, type Page } from "@playwright/test";
import AxeBuilder from "@axe-core/playwright";
import { COORG, FOUND_IDS } from "../mocks/found-fixtures";

/**
 * Explore any place (yuvoy-app#179, R2-T4): the place picker on `/`, the
 * found feed, the card page at `/f/{id}`, the report sheet and the leaving
 * sheet, in a real browser against the mocks.
 *
 * The unit tests hold each part's rules. What only a browser answers is how
 * the parts meet: that a pick reaches the server as `?place=` and comes back
 * as a cookie, that a header Vercel writes reaches the picker's first row,
 * that See details really opens the stored address in a new tab and nothing
 * else, that a report's body is exactly what the contract allows, and that
 * the feed's foot tells the truth about what the server said.
 *
 * ## Which world each test runs in
 *
 * With no scenario, `explore` is `off`, as on dev and production today, and
 * `/` must be the reels exactly as before. Two kinds of scenario open it:
 *
 *   - `explore-all` opens it to everybody, so a signed-out visitor sees
 *     Karnataka in the public list and reads and reports its cards. Most of
 *     this file runs there, because signing in costs four steps a test.
 *   - every `found-*`, `report-*` and `item-*` scenario opens it at `staff`
 *     only, where `GET /events` answers a stranger 404. Those tests sign in
 *     first (any number is staff under them), and the page then reads
 *     `/me/places` and every page of cards with the session.
 *
 * The words asserted are copied from `found-words.ts`, `place-picker.tsx`,
 * `see-details.tsx` and `report-sheet.tsx`, as no spec here imports app code.
 * The mock's own ids and receipts come from `mocks/found-fixtures.ts`, so a
 * fixture edit cannot leave this file naming a card that is gone.
 */

const TAGS = ["wcag2a", "wcag2aa", "wcag21a", "wcag21aa", "wcag22aa"];

/** The same check `redesign-axe.spec.ts` runs, for the same reasons. */
async function expectAccessible(page: Page) {
  /*
    Let entrances finish: axe measuring a sheet mid-rise reads a colour nobody
    sees. Settled, not all, and never an infinite one (a skeleton's shimmer)
    or one on a scroll timeline: see `redesign-axe.spec.ts`.
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

/** Coorg's found feed, under a scenario. */
const coorg = (scenario: string, extra = "") =>
  `/?place=${COORG}${extra}&__scenario=${scenario}`;

/* Coorg's cards the tests name, by title (`mocks/found-fixture-cards.ts`). */
const RAFTING = "White water rafting on the Barapole"; // FOUND_IDS.found
const ESTATE = "Coffee estate walk and tasting"; // FOUND_IDS.checked
const SUNSET = "Sunset walk at Raja's Seat"; // FOUND_IDS.lapsed

/**
 * The rafting card's link as the API stored it. `www.` on the link and not on
 * the source, so "Opens {host}" dropping it is visible too.
 */
const RAFTING_HOST = "coorgrafting.example";

/* The picker's rows, by the name each button carries (`Row` in place-picker). */
const ANDAMAN_ROW =
  "Andaman Islands, Book on Yuvoy, Havelock (Swaraj Dweep), Neil (Shaheed Dweep), Port Blair";
const KARNATAKA_ROW = "Karnataka, Bengaluru, Coorg";
const BENGALURU_ROW = "Bengaluru, Every card checked by a person";
const COORG_ROW = "Coorg, Found by Trigo, labelled";

const placeButton = (page: Page, name: string) =>
  page.getByRole("button", {
    name: `Change place. Now showing ${name}.`,
    exact: true,
  });

const picker = (page: Page) =>
  page.getByRole("dialog", { name: "Pick a place" });

const card = (page: Page, title: string) =>
  page.getByRole("article", { name: title, exact: true });

const heading = (page: Page, place: string) =>
  page.getByRole("heading", {
    level: 1,
    name: `Things to do in ${place}`,
    exact: true,
  });

/** What `yv_place` holds now, or null. */
async function rememberedPlace(page: Page): Promise<string | null> {
  const cookies = await page.context().cookies();
  return cookies.find((c) => c.name === "yv_place")?.value ?? null;
}

/**
 * Presses Tab until the focus is on the button named `name`, failing if the
 * focus ever leaves the dialog on the way. A modal picker that let the focus
 * walk onto the page behind it would be a trap for a keyboard, not a sheet.
 */
async function tabTo(page: Page, dialog: Locator, name: string) {
  for (let i = 0; i < 20; i++) {
    await page.keyboard.press("Tab");
    const inside = await dialog.evaluate((d) =>
      d.contains(document.activeElement),
    );
    expect(inside, "the focus left the open picker").toBe(true);
    const focused = await page.evaluate(
      () =>
        document.activeElement?.getAttribute("aria-label") ??
        document.activeElement?.textContent?.trim() ??
        "",
    );
    if (focused === name) return;
  }
  throw new Error(`Tab never reached "${name}" in the picker`);
}

/* ---------------------------------------------------------------- case 1 */

test("with explore off, / is the reels and has no place button", async ({
  page,
}) => {
  /*
    The rest of case 1 is every other spec passing unedited. This is the one
    thing they would not notice: a place button drawn over the reels for
    everybody. A `?place=` link to a found place changes nothing either while
    the list does not hold it.
  */
  for (const path of ["/", `/?place=${COORG}`]) {
    await page.goto(path);
    await page.waitForSelector('article[aria-posinset="1"]');
    await expect(
      page.getByRole("button", { name: /^Change place/ }),
      `a place button on ${path}`,
    ).toHaveCount(0);
    await expect(
      page.getByRole("heading", { name: /^Things to do in/ }),
    ).toHaveCount(0);
  }
});

/* ---------------------------------------------------------------- case 2 */

test("the picker lists regions, then the places in one, from the keyboard alone", async ({
  page,
}) => {
  await page.goto("/?__scenario=explore-all");
  const trigger = placeButton(page, "Andaman Islands");
  await expect(trigger).toBeVisible();

  await trigger.focus();
  await page.keyboard.press("Enter");
  const sheet = picker(page);
  await expect(sheet).toBeVisible();

  // Level one: a row per region, in the server's order, the bookable one tagged.
  const rows = sheet.getByRole("list").getByRole("button");
  await expect(rows).toHaveCount(2);
  await expect(rows.nth(0)).toHaveAccessibleName(ANDAMAN_ROW);
  await expect(rows.nth(1)).toHaveAccessibleName(KARNATAKA_ROW);
  await expectAccessible(page);

  // Karnataka has two places, so it opens them, and the focus goes to the way back.
  await tabTo(page, sheet, KARNATAKA_ROW);
  await page.keyboard.press("Enter");
  const back = sheet.getByRole("button", { name: "All places", exact: true });
  await expect(back).toBeFocused();
  await expect(
    sheet.getByRole("heading", { name: "Karnataka", exact: true }),
  ).toBeVisible();
  await expect(
    sheet.getByRole("button", { name: BENGALURU_ROW, exact: true }),
  ).toBeVisible();
  await expect(
    sheet.getByRole("button", { name: COORG_ROW, exact: true }),
  ).toBeVisible();
  await expectAccessible(page);

  // Back, and the focus is on the region it left from, not the top of the sheet.
  await page.keyboard.press("Enter");
  await expect(
    sheet.getByRole("button", { name: KARNATAKA_ROW, exact: true }),
  ).toBeFocused();

  // Escape closes it, and the focus is back where the picker was opened.
  await page.keyboard.press("Escape");
  await expect(sheet).toBeHidden();
  await expect(trigger).toBeFocused();

  // And a whole pick, without a pointer.
  await page.keyboard.press("Enter");
  await expect(sheet).toBeVisible();
  await tabTo(page, sheet, KARNATAKA_ROW);
  await page.keyboard.press("Enter");
  await expect(back).toBeFocused();
  await tabTo(page, sheet, COORG_ROW);
  await page.keyboard.press("Enter");

  await page.waitForURL(/[?&]place=karnataka\/coorg/);
  await expect(heading(page, "Coorg")).toBeVisible();
  await expect(placeButton(page, "Coorg")).toBeVisible();
});

/* ---------------------------------------------------------------- case 3 */

test("a picked place is remembered, and a ?place= link becomes the remembered one", async ({
  page,
}) => {
  await page.goto("/?__scenario=explore-all");
  await placeButton(page, "Andaman Islands").click();
  const sheet = picker(page);
  await sheet.getByRole("button", { name: KARNATAKA_ROW, exact: true }).click();
  await sheet.getByRole("button", { name: COORG_ROW, exact: true }).click();
  await page.waitForURL(/[?&]place=karnataka\/coorg/);
  await expect(heading(page, "Coorg")).toBeVisible();
  // The key alone: the cookie is a preference, never anything about the person.
  await expect.poll(() => rememberedPlace(page)).toBe(COORG);

  // The next visit, with no place in the address, opens where they left off.
  await page.goto("/?__scenario=explore-all");
  await expect(heading(page, "Coorg")).toBeVisible();

  /*
    A shared link opens its place, and is then the place remembered. Written
    by the browser once the page is up (`RememberPlace`), so it is polled.
  */
  await page.goto("/?place=karnataka/bengaluru&__scenario=explore-all");
  await expect(heading(page, "Bengaluru")).toBeVisible();
  await expect.poll(() => rememberedPlace(page)).toBe("karnataka/bengaluru");

  await page.goto("/?__scenario=explore-all");
  await expect(heading(page, "Bengaluru")).toBeVisible();
});

/* ---------------------------------------------------------------- case 4 */

test("Near you: a visitor from Karnataka is offered Bengaluru first", async ({
  page,
}) => {
  /*
    The two headers Vercel writes from the connection, as `near-you.ts` reads
    them: the region alone is not enough, because region codes repeat across
    countries and DEC-14 A meant the Indian states.
  */
  await page.setExtraHTTPHeaders({
    "x-vercel-ip-country": "IN",
    "x-vercel-ip-country-region": "KA",
  });
  await page.goto("/?__scenario=explore-all");
  await placeButton(page, "Andaman Islands").click();

  const rows = picker(page).getByRole("list").getByRole("button");
  await expect(rows.first()).toHaveAccessibleName("Near you · Bengaluru");
  await expect(rows).toHaveCount(3);

  await rows.first().click();
  await page.waitForURL(/[?&]place=karnataka\/bengaluru/);
  await expect(heading(page, "Bengaluru")).toBeVisible();
  await expect(
    page.getByText("Every card here was checked by a person at Yuvoy.", {
      exact: true,
    }),
  ).toBeVisible();
});

test("Near you: no region header, no Near you row", async ({ page }) => {
  await page.goto("/?__scenario=explore-all");
  await placeButton(page, "Andaman Islands").click();

  const sheet = picker(page);
  // The list is drawn first, so the row's absence is not the list loading.
  await expect(
    sheet.getByRole("button", { name: KARNATAKA_ROW, exact: true }),
  ).toBeVisible();
  await expect(sheet.getByRole("button", { name: /^Near you/ })).toHaveCount(0);
  await expect(sheet.getByRole("list").getByRole("button")).toHaveCount(2);
});

/* ---------------------------------------------------------------- case 5 */

test("a card Trigo found says so and names its source; a checked one says who checked it and when", async ({
  page,
}) => {
  await page.goto(coorg("explore-all"));
  await expect(heading(page, "Coorg")).toBeVisible();
  await expect(
    page.getByText(
      "Found by Trigo on organisers' and venues' own pages. Each card says whether a person has checked it.",
      { exact: true },
    ),
  ).toBeVisible();

  // The trust line is the API's `check.label`, shown word for word.
  await expect(
    card(page, RAFTING).getByText(
      `Found by Trigo · not checked yet · source: ${RAFTING_HOST}`,
      { exact: true },
    ),
  ).toBeVisible();
  // The day is the mock clock's, so it is matched by shape.
  await expect(
    card(page, ESTATE).getByText(
      /^Checked by Yuvoy · [A-Z][a-z]{2}, \d{1,2} [A-Z][a-z]{2} · organiser's page$/,
    ),
  ).toBeVisible();
  // A check that has lapsed is not shown as a check.
  await expect(
    card(page, SUNSET).getByText("Last checked by Yuvoy 12 days ago", {
      exact: true,
    }),
  ).toBeVisible();
  await expectAccessible(page);

  // The card page says it in a sentence: the API's `check.sentence`.
  await page.goto(`/f/${FOUND_IDS.found}?__scenario=explore-all`);
  await expect(page.getByTestId("found-sentence")).toHaveText(
    `Trigo found this on ${RAFTING_HOST}. Nobody at Yuvoy has checked it yet, so check the details on their page before you go.`,
  );

  await page.goto(`/f/${FOUND_IDS.checked}?__scenario=explore-all`);
  await expect(page.getByTestId("found-sentence")).toHaveText(
    /^A person at Yuvoy checked the date, time, place and price on the organiser's page on [A-Z][a-z]{2}, \d{1,2} [A-Z][a-z]{2}\.$/,
  );
});
