import { test, expect } from "@playwright/test";
import { BENGALURU, COORG, FOUND_IDS } from "../mocks/found-fixtures";
import {
  CHECKED_IDS,
  CHECKED_TITLES as T,
} from "../mocks/found-checked-fixtures";
import {
  UI,
  closeFilters,
  expectAccessible,
  feedOf,
  cards,
  card,
  chip,
  searchBox,
  filtersButton,
  expectCards,
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

/* ---------------------------------------------------------------- case 7 */

test("Budget and Time of day narrow; no stated price is never under ₹500, and a date-only item is never Morning", async ({
  page,
}) => {
  await page.goto(feedOf(BENGALURU, "checked-staff"));
  const asked = eventsAsked(page);

  await filtersButton(page).click();
  const sheet = page.getByRole("dialog", { name: UI.filterSheet });
  await expect(sheet).toBeVisible();
  await expect(
    sheet.getByRole(UI.groupRole, { name: UI.budget }),
  ).toBeVisible();
  await expect(
    sheet.getByRole(UI.groupRole, { name: UI.timeOfDay }),
  ).toBeVisible();
  // Nothing chosen to begin with.
  for (const option of await sheet.getByRole(UI.optionRole).all()) {
    await expect(option).not.toBeChecked();
  }
  await expectAccessible(page);

  await sheet
    .getByRole(UI.groupRole, { name: UI.budget })
    .getByRole(UI.optionRole, { name: UI.under500, exact: true })
    .check();
  await closeFilters(page);
  await expectAsked(
    page,
    asked,
    (p) => p.get("budget") === "under_500",
    "Under ₹500 never sent budget=under_500",
  );
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

  await filtersButton(page).click();
  await sheet
    .getByRole(UI.groupRole, { name: UI.timeOfDay })
    .getByRole(UI.optionRole, { name: UI.morning, exact: true })
    .check();
  await closeFilters(page);
  await expectAsked(
    page,
    asked,
    (p) => p.get("budget") === "under_500" && p.get("timeOfDay") === "morning",
    "Morning never sent timeOfDay=morning beside the budget",
  );
  // The flea market is under ₹500 and has no time, so it is no time of day.
  await expectCards(page, [T.yoga, T.diveClub, T.birds, T.craft]);
  await expect(card(page, T.flea)).toHaveCount(0);
  await expectAccessible(page);

  await filtersButton(page).click();
  await sheet
    .getByRole("button", { name: UI.clearFilters, exact: true })
    .click();
  for (const option of await sheet.getByRole(UI.optionRole).all()) {
    await expect(option).not.toBeChecked();
  }
  await closeFilters(page);
  await expectCards(page, WHOLE_WEEK);
});

test("Free and an under budget never go in one request", async ({ page }) => {
  // The API answers free=true with under_500 or under_1500 with a 400.
  await page.goto(feedOf(BENGALURU, "checked-staff"));
  const asked = eventsAsked(page);
  await chip(page, UI.free).click();
  await expect(chip(page, UI.free)).toHaveAttribute("aria-pressed", "true");

  await filtersButton(page).click();
  const sheet = page.getByRole("dialog", { name: UI.filterSheet });
  const under500 = sheet
    .getByRole(UI.groupRole, { name: UI.budget })
    .getByRole(UI.optionRole, { name: UI.under500, exact: true });
  // Held while Free is on is one honest answer; choosing it and dropping Free is another.
  if (await under500.isEnabled()) await under500.check();
  await closeFilters(page);

  const both = (p: URLSearchParams) =>
    p.get("free") === "true" && /^under_/.test(p.get("budget") ?? "");
  await expect(cards(page).first()).toBeVisible();
  expect(asked.filter(both), "free=true went with an under budget").toEqual([]);
  // No refusal reached the page (`main`: Next's route announcer is an alert too).
  await expect(page.locator("main").getByRole("alert")).toHaveCount(0);
});

/* ---------------------------------------------------------------- case 8 */

test("each empty state says what it is and offers its way back", async ({
  page,
}) => {
  await test.step("a day with nothing checked", async () => {
    // Coorg's cards start on Saturday, so its today is empty.
    await page.goto(feedOf(COORG, "checked-staff"));
    await chip(page, UI.today).click();
    await expect(
      page.getByText(UI.emptyDay("today", "Coorg"), { exact: true }),
    ).toBeVisible();
    await expect(cards(page)).toHaveCount(0);
    await expectAccessible(page);

    await page
      .getByRole("button", { name: UI.showEverything, exact: true })
      .click();
    await expect(
      card(page, "White water rafting on the Barapole"),
    ).toBeVisible();
    await expect(chip(page, UI.today)).toHaveAttribute("aria-pressed", "false");
  });

  await test.step("nothing free", async () => {
    await page.goto(feedOf(BENGALURU, "found-free-empty"));
    await chip(page, UI.free).click();
    await expect(
      page.getByText(UI.emptyFree("Bengaluru"), { exact: true }),
    ).toBeVisible();
    await expect(cards(page)).toHaveCount(0);
    await expectAccessible(page);

    await page
      .getByRole("button", { name: UI.showEverything, exact: true })
      .click();
    await expect(card(page, T.pottery)).toBeVisible();
    await expect(chip(page, UI.free)).toHaveAttribute("aria-pressed", "false");
  });

  await test.step("a search that finds nothing", async () => {
    await page.goto(feedOf(BENGALURU, "found-search-empty"));
    await search(page, "Bengaluru", "jazz");
    await expect(
      page.getByText(UI.emptySearch("Bengaluru", "jazz")),
    ).toBeVisible();
    await expect(cards(page)).toHaveCount(0);
    await expectAccessible(page);

    // The empty state's own Clear search, after the field's.
    await page
      .getByRole("button", { name: UI.clearSearch, exact: true })
      .last()
      .click();
    await expect(searchBox(page, "Bengaluru")).toHaveValue("");
    await expect(card(page, T.jazz)).toBeVisible();
  });
});

/* ---------------------------------------------------------------- case 9 */

test("the chips, a remove control and Filters work from the keyboard", async ({
  page,
}) => {
  await page.goto(feedOf(BENGALURU, "checked-staff"));
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

  // Filters opens on Enter, and Escape gives the focus back to it.
  const filters = filtersButton(page);
  await filters.focus();
  await page.keyboard.press("Enter");
  await expect(
    page.getByRole("dialog", { name: UI.filterSheet }),
  ).toBeVisible();
  await expectAccessible(page);
  await closeFilters(page);
  await expect(filters).toBeFocused();

  // A remove control is a button like any other.
  await page.goto(feedOf(BENGALURU, "checked-staff"));
  await search(page, "Bengaluru", "dive saturday");
  const saturday = page.getByRole("button", {
    name: UI.remove("Saturday"),
    exact: true,
  });
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
    await page.goto(`/f/${id}?__scenario=checked-staff`);
    await expect(page.getByRole("heading", { level: 1 })).toBeVisible();
    await expect(page.getByText(UI.freeFootnote)).toBeVisible();
    await expectAccessible(page);
  }

  await page.goto(`/f/${CHECKED_IDS.jazz}?__scenario=checked-staff`);
  await expect(
    page.getByRole("heading", { level: 1, name: T.jazz, exact: true }),
  ).toBeVisible();
  await expect(page.getByText(UI.freeFootnote)).toHaveCount(0);
});
