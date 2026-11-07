import { test, expect, type Page } from "@playwright/test";
import {
  CALLIGRAPHY_INCLUDED,
  KAYAK_STATED,
  STATED_IDS,
  STATED_SOURCES,
  STATED_TITLES as S,
} from "../mocks/found-stated-fixtures";
import { expectAccessible, openSignedIn } from "./support/explore-filters";
import { STATED, STATED_CLOSED, WORDS } from "./support/explore-stated";

/**
 * "As listed" on a card's page (yuvoy-app#195, R3-T6): what the event's own
 * page states, under the when, where and price, and What's included and Good
 * to know below it. The issue's cases 9 to 12, and the page's half of case 1.
 * The filter sheet's rows are in `explore-stated.spec.ts`; the worlds and the
 * words in `support/explore-stated.ts`.
 *
 * The page shows what `GET /events/{id}` sends in `stated`. The mock sends
 * how hard and the note as null on a card no person checked, as the API
 * does, so the unchecked card's page proves the app never works them out
 * from the tier.
 */

test.beforeEach(async ({ page }) => {
  await openSignedIn(page);
});

/** A card's page, under a scenario, once its title is drawn. */
async function openCard(
  page: Page,
  id: string,
  title: string,
  scenario = STATED,
) {
  await page.goto(`/f/${id}?__scenario=${scenario}`);
  await expect(
    page.getByRole("heading", { level: 1, name: title, exact: true }),
  ).toBeVisible();
}

const section = (page: Page, name: string) =>
  page.getByRole("heading", { level: 2, name, exact: true });

const text = (page: Page, words: string) =>
  page.getByText(words, { exact: true });

/** Any of As listed's rows, by its words. */
const anyRow = (page: Page) =>
  page.getByText(
    /^(Ends \d{2}:\d{2}|Venue: .+|Suits: .+|Indoors|Outdoors|Indoors and outdoors|Difficulty: .+)$/,
  );

/** No block and no sections: nothing of `stated` is on the page. */
async function expectNothingStated(page: Page) {
  await expect(section(page, WORDS.asListed)).toHaveCount(0);
  await expect(section(page, WORDS.included)).toHaveCount(0);
  await expect(section(page, WORDS.goodToKnow)).toHaveCount(0);
  await expect(anyRow(page)).toHaveCount(0);
}

/* ---------------------------------------------------------------- case 1 */

test("with checkedCities off, a page that states all seven shows none of them", async ({
  page,
}) => {
  // `stated` is in the answer; the release is what keeps it off the page.
  await openCard(page, STATED_IDS.kayak, S.kayak, STATED_CLOSED);
  await expectNothingStated(page);
  await expect(text(page, KAYAK_STATED.included!)).toHaveCount(0);
  await expect(text(page, KAYAK_STATED.goodToKnow!)).toHaveCount(0);
  await expectAccessible(page);
});

/* ---------------------------------------------------------------- case 9 */

test("a checked card stating all seven shows every row, both sections and the checked line", async ({
  page,
}) => {
  await openCard(page, STATED_IDS.kayak, S.kayak);
  const source = STATED_SOURCES.kayak;

  await expect(section(page, WORDS.asListed)).toBeVisible();
  await expect(text(page, WORDS.checkedLine(source))).toBeVisible();
  for (const row of [
    WORDS.ends("11:30"),
    WORDS.venue("lake"),
    // In the order sent, capitalised.
    WORDS.suitsRow("Friends, Families"),
    WORDS.outdoors,
    WORDS.difficultyRow("Easy"),
  ]) {
    await expect(text(page, row)).toBeVisible();
  }
  await expect(anyRow(page)).toHaveCount(5);

  await expect(section(page, WORDS.included)).toBeVisible();
  await expect(text(page, KAYAK_STATED.included!)).toBeVisible();
  await expect(section(page, WORDS.goodToKnow)).toBeVisible();
  await expect(text(page, KAYAK_STATED.goodToKnow!)).toBeVisible();
  // Each section ends with where it is from.
  await expect(text(page, WORDS.from(source))).toHaveCount(2);
  await expectAccessible(page);
});

/* --------------------------------------------------------------- case 10 */

test("the same facts on a card nobody checked: no difficulty, no Good to know, and the not-checked line", async ({
  page,
}) => {
  await openCard(page, STATED_IDS.riverKayak, S.riverKayak);
  const source = STATED_SOURCES.riverKayak;

  await expect(section(page, WORDS.asListed)).toBeVisible();
  await expect(text(page, WORDS.foundLine(source))).toBeVisible();
  for (const row of [
    WORDS.ends("11:30"),
    WORDS.venue("lake"),
    WORDS.suitsRow("Friends, Families"),
    WORDS.outdoors,
  ]) {
    await expect(text(page, row)).toBeVisible();
  }
  await expect(text(page, WORDS.difficultyRow("Easy"))).toHaveCount(0);
  await expect(anyRow(page)).toHaveCount(4);

  await expect(section(page, WORDS.included)).toBeVisible();
  await expect(section(page, WORDS.goodToKnow)).toHaveCount(0);
  await expect(text(page, KAYAK_STATED.goodToKnow!)).toHaveCount(0);
  await expect(text(page, WORDS.from(source))).toHaveCount(1);
  await expectAccessible(page);
});

test("a card whose check ran out names only its source, and shows no difficulty or note", async ({
  page,
}) => {
  await openCard(page, STATED_IDS.climbing, S.climbing);
  await expect(section(page, WORDS.asListed)).toBeVisible();
  // The line alone: neither "a person checked" nor "nobody has checked it".
  await expect(text(page, WORDS.from(STATED_SOURCES.climbing))).toBeVisible();
  await expect(
    page.getByText(/Nobody at Yuvoy has checked it yet\./),
  ).toHaveCount(0);
  await expect(
    page.getByText(/checked the date, time, place and price, not these/),
  ).toHaveCount(0);
  await expect(text(page, WORDS.venue("boulders"))).toBeVisible();
  await expect(text(page, WORDS.outdoors)).toBeVisible();
  await expect(anyRow(page)).toHaveCount(2);
  await expect(section(page, WORDS.goodToKnow)).toHaveCount(0);
  await expect(section(page, WORDS.included)).toHaveCount(0);
  await expectAccessible(page);
});

/* --------------------------------------------------------------- case 11 */

test("a card stating none has no block, no sections and no empty space", async ({
  page,
}) => {
  await openCard(page, STATED_IDS.walk, S.walk);
  await expectNothingStated(page);
  await expect(page.getByText(/^From gardenwalks\.example\./)).toHaveCount(0);
  await expectAccessible(page);
});

/* --------------------------------------------------------------- case 12 */

test("a card stating only what is included has no block, only What's included", async ({
  page,
}) => {
  await openCard(page, STATED_IDS.calligraphy, S.calligraphy);
  await expect(section(page, WORDS.asListed)).toHaveCount(0);
  await expect(anyRow(page)).toHaveCount(0);
  await expect(section(page, WORDS.included)).toBeVisible();
  await expect(text(page, CALLIGRAPHY_INCLUDED)).toBeVisible();
  await expect(text(page, WORDS.from(STATED_SOURCES.calligraphy))).toHaveCount(
    1,
  );
  await expect(section(page, WORDS.goodToKnow)).toHaveCount(0);
  await expectAccessible(page);
});
