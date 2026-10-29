import { test, expect } from "@playwright/test";
import { BENGALURU, COORG } from "../mocks/found-fixtures";
import { STATED_TITLES as S } from "../mocks/found-stated-fixtures";
import {
  UI,
  expectAccessible,
  feedOf,
  openFeed,
  cards,
  card,
  heading,
  filtersButton,
  filterSheet,
  option,
  pick,
  applyFilters,
  expectCards,
  expectAddress,
  eventsAsked,
  expectAsked,
  openSignedIn,
} from "./support/explore-filters";
import {
  STATED,
  STATED_CLOSED,
  WORDS,
  FOUR,
  SIX,
  PAGE_ONE,
  BENGALURU_ALL,
  COORG_ALL,
  LISTS,
  ROW,
  sheetRow,
  chooseOnly,
} from "./support/explore-stated";

/**
 * The filter sheet's four more rows on the found feed (yuvoy-app#195,
 * R3-T6): How long, Indoors or out, Who it suits and How hard, in a real
 * browser against the mocks. The issue's cases 1 to 8 and 13; the card
 * page's "As listed", cases 9 to 12, is in `explore-stated-page.spec.ts`.
 *
 * The worlds, the clock and the words are in `support/explore-stated.ts`;
 * what each choice lists, and why, in `LISTS` there and in
 * `mocks/found-stated-fixtures.ts`.
 *
 * The feed keeps each filter set it has read for 30 minutes, so going back to
 * one already seen asks nothing new: there the address and the cards are
 * asserted, never a request.
 */

test.beforeEach(async ({ page }) => {
  await openSignedIn(page);
});

/* ---------------------------------------------------------------- case 1 */

test("with checkedCities off, there are no new rows, and a link carrying them narrows nothing", async ({
  page,
}) => {
  const extra = "&duration=longer&setting=indoor&suits=kids&difficulty=hard";
  await page.goto(feedOf(BENGALURU, STATED_CLOSED, extra));
  await expect(heading(page, "Bengaluru")).toBeVisible();
  await expect(cards(page)).toHaveCount(PAGE_ONE);
  await expect(card(page, S.walk)).toBeVisible();
  await expect(filtersButton(page)).toHaveCount(0);
  for (const title of Object.values(ROW)) {
    await expect(
      page.getByRole("group", { name: title, exact: true }),
    ).toHaveCount(0);
  }
  await expectAccessible(page);
});

/* ------------------------------------------------------- cases 2 and 4 */

test("How long narrows by the stated start and end: 90 minutes is under 2 hours, 120 and 300 are half a day, more and multi-day are longer", async ({
  page,
}) => {
  await openFeed(page, BENGALURU, STATED);
  const asked = eventsAsked(page);

  await filtersButton(page).click();
  // Single choice, nothing chosen.
  await expect(sheetRow(page, WORDS.howLong).getByRole("radio")).toHaveCount(3);
  for (const { name } of LISTS.duration) {
    await expect(option(page, WORDS.howLong, name)).not.toBeChecked();
  }
  await expectAccessible(page);
  await page.keyboard.press("Escape");
  await expect(filterSheet(page)).toBeHidden();

  for (const { name, value, titles } of LISTS.duration) {
    await chooseOnly(page, WORDS.howLong, name);
    await expectAsked(
      asked,
      (p) => p.get("duration") === value,
      `${name} never sent duration=${value}`,
    );
    await expectAddress(
      page,
      (p) => p.get("duration") === value,
      `${name} never reached the address`,
    );
    await expect(filtersButton(page)).toHaveAccessibleName(UI.filtersOn(1));
    await expectCards(page, titles);
    // Start time only: no length, so in no list.
    await expect(card(page, S.planetarium)).toHaveCount(0);
    await expect(card(page, S.museum)).toHaveCount(0);
    await expect(card(page, S.walk)).toHaveCount(0);
  }
  await expectAccessible(page);
});

/* ------------------------------------------------------- cases 2 and 3 */

test("Indoors and Outdoors each list what states them, and both list an item stated as indoors and outdoors", async ({
  page,
}) => {
  await openFeed(page, BENGALURU, STATED);
  const asked = eventsAsked(page);

  await filtersButton(page).click();
  // Two choices and no "both": `setting=both` is a 400.
  await expect(sheetRow(page, WORDS.setting).getByRole("radio")).toHaveCount(2);
  await page.keyboard.press("Escape");

  for (const { name, value, titles } of LISTS.setting) {
    await chooseOnly(page, WORDS.setting, name);
    await expectAsked(
      asked,
      (p) => p.get("setting") === value,
      `${name} never sent setting=${value}`,
    );
    await expectCards(page, titles);
    await expect(card(page, S.planetarium)).toBeVisible();
    await expect(card(page, S.walk)).toHaveCount(0);
  }
  expect(
    asked.filter((p) => p.get("setting") === "both"),
    "setting=both was sent",
  ).toEqual([]);
  await expectAccessible(page);
});

/* ---------------------------------------------------------------- case 2 */

test("each Who it suits choice lists only what states that group", async ({
  page,
}) => {
  await openFeed(page, BENGALURU, STATED);
  const asked = eventsAsked(page);

  for (const { name, value, titles } of LISTS.suits) {
    await chooseOnly(page, WORDS.suits, name);
    await expectAsked(
      asked,
      (p) => p.get("suits") === value,
      `${name} never sent suits=${value}`,
    );
    await expectCards(page, titles);
    await expect(card(page, S.walk)).toHaveCount(0);
  }
  // One at a time: never two groups in one request.
  expect(asked.filter((p) => p.getAll("suits").length > 1)).toEqual([]);

  await filtersButton(page).click();
  await expect(option(page, WORDS.suits, "Kids")).toBeChecked();
  await pick(page, WORDS.suits, "Solo");
  await expect(option(page, WORDS.suits, "Kids")).not.toBeChecked();
  await expectAccessible(page);
});

/* ------------------------------------------------------- cases 2 and 5 */

test("How hard shows in a local place and lists checked cards only", async ({
  page,
}) => {
  await openFeed(page, BENGALURU, STATED);
  const asked = eventsAsked(page);

  await filtersButton(page).click();
  await expect(sheetRow(page, WORDS.howHard)).toBeVisible();
  await expect(sheetRow(page, WORDS.howHard).getByRole("radio")).toHaveCount(3);
  await page.keyboard.press("Escape");

  for (const { name, value, titles } of LISTS.difficulty) {
    await chooseOnly(page, WORDS.howHard, name);
    await expectAsked(
      asked,
      (p) => p.get("difficulty") === value,
      `${name} never sent difficulty=${value}`,
    );
    await expectCards(page, titles);
    await expect(card(page, S.walk)).toHaveCount(0);
  }
  await expectAccessible(page);
});

test("How hard is absent in a travel place, and never sent from there", async ({
  page,
}) => {
  // Were `difficulty=hard` sent for Coorg, nothing there would match it.
  await openFeed(page, COORG, STATED, "&difficulty=hard");
  const asked = eventsAsked(page);
  await expect(heading(page, "Coorg")).toBeVisible();
  await expect(cards(page)).toHaveCount(COORG_ALL);
  await expect(filtersButton(page)).toHaveAccessibleName(UI.filtersOn(0));

  await filtersButton(page).click();
  for (const title of [WORDS.howLong, WORDS.setting, WORDS.suits]) {
    await expect(sheetRow(page, title)).toBeVisible();
  }
  await expect(sheetRow(page, WORDS.howHard)).toHaveCount(0);
  await expectAccessible(page);

  await pick(page, WORDS.setting, WORDS.outdoors);
  await applyFilters(page);
  await expectAsked(
    asked,
    (p) => p.get("setting") === "outdoor",
    "Outdoors never sent setting=outdoor in Coorg",
  );
  await expectAddress(
    page,
    (p) => p.get("setting") === "outdoor" && !p.has("difficulty"),
    "a travel place's address kept difficulty",
  );
  // The climbing card's check ran out; Coorg, a trip place, still lists it.
  await expectCards(page, [S.riverKayak, S.climbing]);
  expect(
    asked.filter((p) => p.has("difficulty")),
    "difficulty was sent for a travel place",
  ).toEqual([]);
});

/* ---------------------------------------------------------------- case 6 */

test("Kids and Indoors together list only items stating both", async ({
  page,
}) => {
  await openFeed(page, BENGALURU, STATED);
  const asked = eventsAsked(page);

  await filtersButton(page).click();
  await pick(page, WORDS.suits, "Kids");
  await pick(page, WORDS.setting, WORDS.indoors);
  await applyFilters(page);
  await expectAsked(
    asked,
    (p) => p.get("suits") === "kids" && p.get("setting") === "indoor",
    "Kids and Indoors were never sent together",
  );
  await expect(filtersButton(page)).toHaveAccessibleName(UI.filtersOn(2));
  // The festival suits kids and is outdoors; the pottery is indoors and suits no kids.
  await expectCards(page, [S.planetarium, S.museum]);
  await expect(card(page, S.kites)).toHaveCount(0);
  await expect(card(page, S.pottery)).toHaveCount(0);
  await expectAccessible(page);
});

/* ---------------------------------------------------------------- case 7 */

test("a new filter starts again at page one, and an old cursor is never sent with it", async ({
  page,
}) => {
  await openFeed(page, BENGALURU, STATED);
  const asked = eventsAsked(page);
  await expect(cards(page)).toHaveCount(PAGE_ONE);

  // Page two, read with the cursor page one was given.
  await page.locator("[data-tail]").scrollIntoViewIfNeeded();
  await expect(cards(page)).toHaveCount(BENGALURU_ALL, { timeout: 15_000 });
  await expectAsked(
    asked,
    (p) => p.has("cursor") && FOUR.every((k) => !p.has(k)),
    "page two was never read with a cursor",
  );

  const from = asked.length;
  await filtersButton(page).click();
  await pick(page, WORDS.setting, WORDS.outdoors);
  await applyFilters(page);
  await expectAsked(
    asked,
    (p) => p.get("setting") === "outdoor" && !p.has("cursor"),
    "Outdoors was never read from page one",
    from,
  );
  await expectCards(page, LISTS.setting[1].titles);
  expect(
    asked.filter((p) => p.has("cursor") && FOUR.some((k) => p.has(k))),
    "a cursor went with the new filters",
  ).toEqual([]);
  // No 400 for a cursor of other filters reached the page.
  await expect(page.locator("main").getByRole("alert")).toHaveCount(0);
});

/* ---------------------------------------------------------------- case 8 */

test("Clear filters clears the four with Budget and Time of day", async ({
  page,
}) => {
  await openFeed(page, BENGALURU, STATED);

  await filtersButton(page).click();
  await pick(page, UI.budget, "Under ₹1,500");
  await pick(page, UI.timeOfDay, UI.morning);
  await pick(page, WORDS.howLong, WORDS.under2h);
  await pick(page, WORDS.setting, WORDS.outdoors);
  await pick(page, WORDS.suits, "Friends");
  await pick(page, WORDS.howHard, "Easy");
  await applyFilters(page);
  await expect(filtersButton(page)).toHaveAccessibleName(UI.filtersOn(6));
  await expectAddress(
    page,
    (p) => SIX.every((k) => p.has(k)),
    "the six rows never all reached the address",
  );
  // 10:00 to 11:30, ₹1,200, outdoors, friends, easy.
  await expectCards(page, [S.kayak]);

  await filtersButton(page).click();
  await filterSheet(page)
    .getByRole("button", { name: UI.clearFilters, exact: true })
    .click();
  await expect(
    filterSheet(page).getByRole("radio", { checked: true }),
  ).toHaveCount(0);
  await applyFilters(page);
  await expect(filtersButton(page)).toHaveAccessibleName(UI.filtersOn(0));
  await expectAddress(
    page,
    (p) => SIX.every((k) => !p.has(k)),
    "Clear filters left a row in the address",
  );
  await expect(cards(page)).toHaveCount(PAGE_ONE);
  await expectAccessible(page);
});

/* --------------------------------------------------------------- case 13 */

test("a reload keeps the four in the address and the same list", async ({
  page,
}) => {
  await openFeed(page, BENGALURU, STATED);

  await filtersButton(page).click();
  await pick(page, WORDS.howLong, WORDS.halfDay);
  await pick(page, WORDS.setting, WORDS.indoors);
  await pick(page, WORDS.suits, "Couples");
  await pick(page, WORDS.howHard, "Moderate");
  await applyFilters(page);
  const four = (p: URLSearchParams) =>
    p.get("duration") === "half_day" &&
    p.get("setting") === "indoor" &&
    p.get("suits") === "couples" &&
    p.get("difficulty") === "moderate";
  await expectAddress(page, four, "the four never reached the address");
  await expectCards(page, [S.pottery]);

  // A reload is read on the server from the address alone.
  await page.reload();
  await expectAddress(page, four, "the reload lost a row");
  await expect(filtersButton(page)).toHaveAccessibleName(UI.filtersOn(4));
  await expectCards(page, [S.pottery]);

  await filtersButton(page).click();
  await expect(option(page, WORDS.howLong, WORDS.halfDay)).toBeChecked();
  await expect(option(page, WORDS.setting, WORDS.indoors)).toBeChecked();
  await expect(option(page, WORDS.suits, "Couples")).toBeChecked();
  await expect(option(page, WORDS.howHard, "Moderate")).toBeChecked();
  await expectAccessible(page);
});
