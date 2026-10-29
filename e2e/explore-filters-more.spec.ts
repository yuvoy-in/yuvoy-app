import { test, expect } from "@playwright/test";
import { BENGALURU, COORG, FOUND_IDS } from "../mocks/found-fixtures";
import {
  CHECKED_IDS,
  CHECKED_TITLES as T,
} from "../mocks/found-checked-fixtures";
import {
  UI,
  expectAccessible,
  openFeed,
  cards,
  card,
  chip,
  searchBox,
  filtersButton,
  filterSheet,
  option,
  pick,
  applyFilters,
  removeChip,
  emptyState,
  expectCards,
  expectAddress,
  eventsAsked,
  expectAsked,
  search,
  WHOLE_WEEK,
  openSignedIn,
} from "./support/explore-filters";

/**
 * The filter sheet, the empty states and the keyboard on the found feed
 * (yuvoy-app#180, R3-T2): the issue's cases 7 to 9, and the card page's
 * footnote on a free card. Cases 1 to 6, and how the worlds and the clock
 * are set up, are in `explore-filters.spec.ts`; what both share is in
 * `support/explore-filters.ts`.
 */

test.beforeEach(async ({ page }) => {
  await openSignedIn(page);
});

/** Every choice in the sheet, Budget's and Time of day's. */
const CHOICES: [string, string][] = [
  [UI.budget, "Free"],
  [UI.budget, UI.under500],
  [UI.budget, "Under ₹1,500"],
  [UI.budget, "Any"],
  [UI.timeOfDay, UI.morning],
  [UI.timeOfDay, UI.afternoon],
  [UI.timeOfDay, "Evening"],
];

async function expectNoneChosen(page: Parameters<typeof option>[0]) {
  for (const [row, name] of CHOICES) {
    await expect(option(page, row, name)).not.toBeChecked();
  }
}

/* ---------------------------------------------------------------- case 7 */

test("Budget and Time of day narrow on Show results; no stated price is never under ₹500, and a date-only item is never Morning", async ({
  page,
}) => {
  await openFeed(page, BENGALURU, "found-checked");
  const asked = eventsAsked(page);

  await filtersButton(page).click();
  await expect(filterSheet(page)).toBeVisible();
  // One choice per row: radios, with no pressed state of their own.
  await expect(filterSheet(page).getByRole("radio")).toHaveCount(
    CHOICES.length,
  );
  await expect(filterSheet(page).locator("[aria-pressed]")).toHaveCount(0);
  await expectNoneChosen(page);

  // A second tap on the checked choice clears its row.
  await pick(page, UI.timeOfDay, UI.afternoon);
  await option(page, UI.timeOfDay, UI.afternoon).click();
  await expectNoneChosen(page);
  await expectAccessible(page);

  await pick(page, UI.budget, UI.under500);
  // Nothing is asked until Show results.
  expect(asked.filter((p) => p.has("budget"))).toEqual([]);
  await applyFilters(page);
  await expectAsked(
    asked,
    (p) => p.get("budget") === "under_500",
    "Under ₹500 never sent budget=under_500",
  );
  await expectAddress(
    page,
    (p) => p.get("budget") === "under_500",
    "Under ₹500 never reached the address",
  );
  await expect(filtersButton(page)).toHaveAccessibleName(UI.filtersOn(1));
  // Free counts; the theatre states no price, so it fits no budget.
  await expectCards(page, [
    T.fair,
    T.jazz,
    T.flea,
    T.yoga,
    T.diveClub,
    T.comedy,
    T.birds,
    T.craft,
  ]);
  await expect(card(page, T.theatre)).toHaveCount(0);

  // The sheet opens on what is applied.
  await filtersButton(page).click();
  await expect(option(page, UI.budget, UI.under500)).toBeChecked();
  await pick(page, UI.timeOfDay, UI.morning);
  await applyFilters(page);
  await expectAsked(
    asked,
    (p) => p.get("budget") === "under_500" && p.get("timeOfDay") === "morning",
    "Morning never sent timeOfDay=morning beside the budget",
  );
  await expect(filtersButton(page)).toHaveAccessibleName(UI.filtersOn(2));
  // The flea market is under ₹500 and has no time, so it is no time of day.
  await expectCards(page, [T.yoga, T.diveClub, T.birds, T.craft]);
  await expect(card(page, T.flea)).toHaveCount(0);
  await expectAccessible(page);

  await filtersButton(page).click();
  await filterSheet(page)
    .getByRole("button", { name: UI.clearFilters, exact: true })
    .click();
  await expectNoneChosen(page);
  await applyFilters(page);
  await expect(filtersButton(page)).toHaveAccessibleName(UI.filtersOn(0));
  await expectAddress(
    page,
    (p) => !p.has("budget") && !p.has("timeOfDay"),
    "Clear filters left a row in the address",
  );
  await expectCards(page, WHOLE_WEEK);
});

test("Free on the chip and in the sheet is one choice, and never goes with an under budget", async ({
  page,
}) => {
  // The API answers free=true with under_500 or under_1500 with a 400.
  await openFeed(page, BENGALURU, "found-checked");
  const asked = eventsAsked(page);
  await chip(page, UI.free).click();
  await expect(chip(page, UI.free)).toHaveAttribute("aria-pressed", "true");
  await expectAsked(
    asked,
    (p) => p.get("free") === "true" && !p.has("budget"),
    "the Free chip never sent free=true",
  );
  await expectAddress(
    page,
    (p) => p.get("free") === "1",
    "the Free chip never wrote free=1",
  );

  // The sheet's Free is the chip's.
  await filtersButton(page).click();
  await expect(option(page, UI.budget, "Free")).toBeChecked();
  // An under budget replaces it.
  await pick(page, UI.budget, UI.under500);
  await expect(option(page, UI.budget, "Free")).not.toBeChecked();
  await applyFilters(page);
  await expect(chip(page, UI.free)).toHaveAttribute("aria-pressed", "false");
  await expectAsked(
    asked,
    (p) => p.get("budget") === "under_500" && !p.has("free"),
    "Under ₹500 never replaced Free",
  );
  await expectAddress(
    page,
    (p) => p.get("budget") === "under_500" && !p.has("free"),
    "the address kept Free beside Under ₹500",
  );

  // And the chip replaces the budget again. The free=true page is still in the
  // feed's cache from the first tap, so this one need not be asked again.
  await chip(page, UI.free).click();
  await expect(chip(page, UI.free)).toHaveAttribute("aria-pressed", "true");
  await expectAddress(
    page,
    (p) => p.get("free") === "1" && !p.has("budget"),
    "Free never replaced Under ₹500 in the address",
  );
  await expectCards(page, [T.yoga, T.diveClub, T.birds]);

  const both = (p: URLSearchParams) =>
    p.get("free") === "true" && /^under_/.test(p.get("budget") ?? "");
  expect(asked.filter(both), "free=true went with an under budget").toEqual([]);
  expect(
    asked.filter((p) => p.get("budget") === "any"),
    "budget=any was sent",
  ).toEqual([]);
  // No refusal reached the page (`main`: Next's route announcer is an alert too).
  await expect(page.locator("main").getByRole("alert")).toHaveCount(0);
});

/* ---------------------------------------------------------------- case 8 */

test("each empty state says what it is and offers its way back", async ({
  page,
}) => {
  await test.step("a day with nothing checked", async () => {
    // Coorg's cards start on Saturday, so its today is empty.
    await openFeed(page, COORG, "found-checked");
    await chip(page, UI.today).click();
    const line = UI.emptyDay("today", "Coorg");
    await expect(page.getByText(line, { exact: true })).toBeVisible();
    await expect(cards(page)).toHaveCount(0);
    await expectAccessible(page);

    await emptyState(page, line)
      .getByRole("button", { name: UI.showEverything, exact: true })
      .click();
    await expect(
      card(page, "White water rafting on the Barapole"),
    ).toBeVisible();
    await expect(chip(page, UI.today)).toHaveAttribute("aria-pressed", "false");
  });

  await test.step("nothing free", async () => {
    await openFeed(page, BENGALURU, "found-free-empty");
    await chip(page, UI.free).click();
    const line = UI.emptyFree("Bengaluru");
    await expect(page.getByText(line, { exact: true })).toBeVisible();
    await expect(cards(page)).toHaveCount(0);
    await expectAccessible(page);

    await emptyState(page, line)
      .getByRole("button", { name: UI.showEverything, exact: true })
      .click();
    await expect(card(page, T.pottery)).toBeVisible();
    await expect(chip(page, UI.free)).toHaveAttribute("aria-pressed", "false");
  });

  await test.step("filters that match nothing", async () => {
    // Every free card is a morning one.
    await openFeed(page, BENGALURU, "found-checked");
    await filtersButton(page).click();
    await pick(page, UI.budget, "Free");
    await pick(page, UI.timeOfDay, UI.afternoon);
    await applyFilters(page);
    const line = UI.emptyFilters("Bengaluru");
    await expect(page.getByText(line, { exact: true })).toBeVisible();
    await expect(cards(page)).toHaveCount(0);
    await expectAccessible(page);

    await emptyState(page, line)
      .getByRole("button", { name: UI.clearFilters, exact: true })
      .click();
    await expectCards(page, WHOLE_WEEK);
    await expect(chip(page, UI.free)).toHaveAttribute("aria-pressed", "false");
    await expect(filtersButton(page)).toHaveAccessibleName(UI.filtersOn(0));
  });

  await test.step("a search that finds nothing", async () => {
    await openFeed(page, BENGALURU, "found-search-empty");
    await search(page, "Bengaluru", "jazz");
    const line = UI.emptySearch("Bengaluru", "jazz");
    await expect(page.getByText(line, { exact: true })).toBeVisible();
    await expect(cards(page)).toHaveCount(0);
    // The field's Clear search and the empty state's.
    await expect(
      page.getByRole("button", { name: UI.clearSearch, exact: true }),
    ).toHaveCount(2);
    await expectAccessible(page);

    await emptyState(page, line)
      .getByRole("button", { name: UI.clearSearch, exact: true })
      .click();
    await expect(searchBox(page, "Bengaluru")).toHaveValue("");
    await expect(card(page, T.jazz)).toBeVisible();
  });
});

/* ---------------------------------------------------------------- case 9 */

test("the chips, a remove control and Filters work from the keyboard", async ({
  page,
}) => {
  await openFeed(page, BENGALURU, "found-checked");
  const today = chip(page, UI.today);
  const tomorrow = chip(page, UI.tomorrow);
  const free = chip(page, UI.free);

  await today.focus();
  await page.keyboard.press("Enter");
  await expect(today).toHaveAttribute("aria-pressed", "true");
  // The press keeps the focus where it was, through the new answer.
  await expectCards(page, [T.fair, T.pottery, T.jazz]);
  await expect(today).toBeFocused();

  await page.keyboard.press("Tab");
  await expect(tomorrow).toBeFocused();
  await page.keyboard.press("Space");
  await expect(tomorrow).toHaveAttribute("aria-pressed", "true");
  await expect(today).toHaveAttribute("aria-pressed", "false");

  await free.focus();
  await page.keyboard.press("Space");
  await expect(free).toHaveAttribute("aria-pressed", "true");
  await expectCards(page, [T.yoga]);
  await expectAccessible(page);

  // Filters opens on Enter; Escape closes it, applies nothing and gives the focus back.
  const filters = filtersButton(page);
  await filters.focus();
  await page.keyboard.press("Enter");
  await expect(filterSheet(page)).toBeVisible();
  await expectAccessible(page);
  await pick(page, UI.timeOfDay, UI.morning);
  await page.keyboard.press("Escape");
  await expect(filterSheet(page)).toBeHidden();
  await expect(filters).toBeFocused();
  await expect(filters).toHaveAccessibleName(UI.filtersOn(0));
  await expectAddress(
    page,
    (p) => !p.has("timeOfDay"),
    "Escape applied the sheet's choice",
  );
  await expectCards(page, [T.yoga]);

  // And the next opening starts from what is applied.
  await page.keyboard.press("Enter");
  await expect(option(page, UI.timeOfDay, UI.morning)).not.toBeChecked();
  await page.keyboard.press("Escape");
  await expect(filterSheet(page)).toBeHidden();

  // A remove control is a button like any other.
  await openFeed(page, BENGALURU, "found-checked");
  await search(page, "Bengaluru", "dive saturday");
  const saturday = removeChip(page, "Saturday");
  await saturday.focus();
  await page.keyboard.press("Enter");
  await expect(saturday).toHaveCount(0);
  await expectCards(page, [T.diveClub]);
  await expectAccessible(page);
});

/* ------------------------------------------------------------ the card page */

test("a free card's page says what Free means, and a paid one does not", async ({
  page,
}) => {
  for (const id of [CHECKED_IDS.yoga, FOUND_IDS.free]) {
    await page.goto(`/f/${id}?__scenario=found-checked`);
    await expect(page.getByRole("heading", { level: 1 })).toBeVisible();
    await expect(
      page.getByText(UI.freeFootnote, { exact: true }),
    ).toBeVisible();
    await expectAccessible(page);
  }

  await page.goto(`/f/${CHECKED_IDS.jazz}?__scenario=found-checked`);
  await expect(
    page.getByRole("heading", { level: 1, name: T.jazz, exact: true }),
  ).toBeVisible();
  await expect(page.getByText(UI.freeFootnote, { exact: true })).toHaveCount(0);
});
