import { test, expect } from "@playwright/test";
import { BENGALURU, COORG } from "../mocks/found-fixtures";
import { CHECKED_TITLES as T } from "../mocks/found-checked-fixtures";
import {
  UI,
  expectAccessible,
  feedOf,
  openFeed,
  cards,
  card,
  heading,
  chip,
  searchBox,
  filtersButton,
  understood,
  removeChip,
  windowHeading,
  emptyState,
  comingUp,
  expectCards,
  expectAddress,
  eventsAsked,
  expectAsked,
  search,
  WHOLE_WEEK,
  openSignedIn,
} from "./support/explore-filters";

/**
 * Day chips, Free, search and the understood row on the found feed
 * (yuvoy-app#180, R3-T2), in a real browser against the mocks: the issue's
 * cases 1 to 6. Cases 7 to 9 and the card page's footnote are in
 * `explore-filters-more.spec.ts`; what both share, the words included, is in
 * `support/explore-filters.ts`.
 *
 * ## Which world each test runs in
 *
 * `checkedCities` is `off` with no scenario, as on dev and production. Four
 * scenarios open it at `staff`, with `explore` (`mocks/found-handlers.ts`):
 * `checked-staff`, and that plus one shape of answer each in
 * `found-weekend-thin`, `found-free-empty` and `found-search-empty`. At
 * `staff` it is open to a signed-in caller only, so every test signs in.
 *
 * ## The clock
 *
 * Under those scenarios the found routes stand at Friday 21 August 2026,
 * 17:30 in Kolkata (`CHECKED_NOW`), and say so in their `Date` header, and
 * the browser is put on the same instant, so whatever the page counts on the
 * device agrees with the API. The cards and what each is for are in
 * `mocks/found-checked-fixtures.ts`.
 */

test.beforeEach(async ({ page }) => {
  await openSignedIn(page);
});

/** True when the address or a request carries none of the sheet's rows. */
const noFilters = (p: URLSearchParams) =>
  ["when", "free", "budget", "timeOfDay"].every((key) => !p.has(key));

/* ---------------------------------------------------------------- case 1 */

test("with checkedCities off, there are no chips, search or Filters, and the feed is R2's", async ({
  page,
}) => {
  /*
    `explore-staff` opens the feed and leaves `checkedCities` off. A link
    carrying R3's state changes nothing either: the API ignores it unread.
  */
  for (const extra of ["", "&when=weekend&free=1&q=dive"]) {
    await page.goto(feedOf(BENGALURU, "explore-staff", extra));
    await expect(heading(page, "Bengaluru")).toBeVisible();
    // R2's three Bengaluru cards (`mocks/found-fixtures.ts`).
    await expectCards(page, [
      "Morning cycle ride round Cubbon Park",
      "Filter coffee tasting in Basavanagudi",
      "Open mic poetry night",
    ]);
    await expect(page.getByRole("group", { name: UI.chipGroup })).toHaveCount(
      0,
    );
    await expect(
      page.getByRole("searchbox", { name: UI.search("Bengaluru") }),
    ).toHaveCount(0);
    await expect(filtersButton(page)).toHaveCount(0);
    await expect(understood(page)).toHaveCount(0);
    await expect(windowHeading(page)).toHaveCount(0);
  }
  await expectAccessible(page);
});

/* ---------------------------------------------------------------- case 2 */

test("one day chip at a time, Free beside it, and the address keeps both", async ({
  page,
}) => {
  await openFeed(page, BENGALURU, "checked-staff");
  await expectCards(page, WHOLE_WEEK);
  for (const name of [UI.today, UI.tomorrow, UI.weekend, UI.free]) {
    await expect(chip(page, name)).toHaveAttribute("aria-pressed", "false");
  }
  // Filters is outside the group, a button that opens a dialog.
  await expect(filtersButton(page)).toHaveAccessibleName(UI.filtersOn(0));
  await expect(filtersButton(page)).toHaveAttribute("aria-haspopup", "dialog");
  await expect(searchBox(page, "Bengaluru")).toBeVisible();
  await expect(windowHeading(page)).toHaveCount(0);
  await expectAccessible(page);

  await chip(page, UI.today).click();
  await expect(chip(page, UI.today)).toHaveAttribute("aria-pressed", "true");
  await expectAddress(
    page,
    (p) => p.get("when") === "today",
    "Today never reached the address",
  );
  await expect(windowHeading(page)).toHaveText(
    UI.dayHeading(UI.today, "Fri, 21 Aug"),
  );
  await expectCards(page, [T.fair, T.pottery, T.jazz]);

  // Tomorrow replaces Today: one day at a time.
  await chip(page, UI.tomorrow).click();
  await expect(chip(page, UI.tomorrow)).toHaveAttribute("aria-pressed", "true");
  await expect(chip(page, UI.today)).toHaveAttribute("aria-pressed", "false");
  await expectAddress(
    page,
    (p) => p.get("when") === "tomorrow",
    "Tomorrow never replaced Today in the address",
  );
  await expect(windowHeading(page)).toHaveText(
    UI.dayHeading(UI.tomorrow, "Sat, 22 Aug"),
  );
  await expectCards(page, [T.fair, T.tryDive, T.flea, T.yoga]);

  // Free combines with the day.
  await chip(page, UI.free).click();
  await expect(chip(page, UI.free)).toHaveAttribute("aria-pressed", "true");
  await expect(chip(page, UI.tomorrow)).toHaveAttribute("aria-pressed", "true");
  await expectAddress(
    page,
    (p) => p.get("when") === "tomorrow" && p.get("free") === "1",
    "Free never joined the day in the address",
  );
  await expectCards(page, [T.yoga]);
  // Free is the chip's to say, so Filters counts nothing.
  await expect(filtersButton(page)).toHaveAccessibleName(UI.filtersOn(0));
  await expectAccessible(page);

  // A reload is read on the server from the address alone.
  await page.reload();
  await expect(chip(page, UI.tomorrow)).toHaveAttribute("aria-pressed", "true");
  await expect(chip(page, UI.free)).toHaveAttribute("aria-pressed", "true");
  await expect(chip(page, UI.today)).toHaveAttribute("aria-pressed", "false");
  await expectCards(page, [T.yoga]);
});

/* ---------------------------------------------------------------- case 3 */

test("This weekend on a Friday at 17:30 is Friday 17:00 to Sunday, and the heading says the window", async ({
  page,
}) => {
  await openFeed(page, BENGALURU, "checked-staff");
  await chip(page, UI.weekend).click();
  await expectAddress(
    page,
    (p) => p.get("when") === "weekend",
    "This weekend never reached the address",
  );

  // The API's window, Friday 21 to Sunday 23 August; the page computes none.
  await expect(windowHeading(page)).toHaveText(
    UI.weekendHeading("Fri, 21 Aug", "Sun, 23 Aug"),
  );
  await expect(windowHeading(page)).toHaveRole("heading");
  // The fair runs Thursday to Saturday; the jazz starts Friday at 18:00.
  await expectCards(page, [
    T.fair,
    T.jazz,
    T.tryDive,
    T.flea,
    T.yoga,
    T.diveClub,
    T.theatre,
  ]);
  // Friday at 16:00 is before the weekend; Tuesday is after it.
  await expect(card(page, T.pottery)).toHaveCount(0);
  await expect(card(page, T.comedy)).toHaveCount(0);
  // Seven cards is not thin.
  await expect(page.getByTestId("found-coming-up")).toHaveCount(0);
  await expectAccessible(page);
});

/* ---------------------------------------------------------------- case 4 */

test("a thin weekend adds Coming up from the next two weeks, and the ask-the-team line", async ({
  page,
}) => {
  // `found-weekend-thin`: This weekend answers one card, complete.
  await openFeed(page, BENGALURU, "found-weekend-thin");
  await chip(page, UI.weekend).click();
  await expectCards(page, [T.fair]);

  const thin = page.getByTestId("found-coming-up");
  await expect(
    thin.getByRole("heading", { level: 2, name: UI.comingUp, exact: true }),
  ).toBeVisible();
  await expect(thin.getByText(UI.thinLine, { exact: true })).toBeVisible();
  await expect(thin.getByText(UI.askLine, { exact: true })).toBeVisible();
  await expect(
    thin.getByRole("link", { name: UI.askLink, exact: true }),
  ).toHaveAttribute("href", /^\/help(\?|$)/);

  /*
    The plain feed with the day dropped, from the API's today (Friday 21) to
    13 days on, less what is on screen: the fair started on Thursday and is
    shown already, and Monday 7 September is 17 days on.
  */
  await expect(comingUp(page).locator("article")).toHaveCount(10);
  for (const title of [T.pottery, T.jazz, T.comedy, T.heritage, T.birds]) {
    await expect(
      comingUp(page).getByRole("article", { name: title, exact: true }),
    ).toBeVisible();
  }
  await expect(card(page, T.fair)).toHaveCount(1);
  await expect(card(page, T.craft)).toHaveCount(0);
  await expectAccessible(page);
});

test("Coming up keeps the other choices: a thin free weekend comes up free", async ({
  page,
}) => {
  const asked = eventsAsked(page);
  await openFeed(page, BENGALURU, "found-weekend-thin", "&when=weekend&free=1");
  await expect(cards(page)).toHaveCount(1);
  await expect(comingUp(page)).toBeVisible();
  await expectAsked(
    asked,
    (p) => !p.has("when") && p.get("free") === "true",
    "Coming up was not asked with Free and without the day",
  );
  /*
    Free in the next two weeks is the yoga, the dive club and the bird walk;
    one of the first two is the weekend's card already, so two come up.
  */
  await expect(comingUp(page).locator("article")).toHaveCount(2);
  await expect(
    comingUp(page).getByRole("article", { name: T.birds, exact: true }),
  ).toBeVisible();
});

/* ---------------------------------------------------------------- case 5 */

test("dive saturday shows Adventure and Saturday; removing Saturday searches it as text", async ({
  page,
}) => {
  await openFeed(page, BENGALURU, "checked-staff");
  const asked = eventsAsked(page);
  await search(page, "Bengaluru", "dive saturday");

  await expect(understood(page)).toBeVisible();
  await expect(understood(page)).toHaveAttribute(
    "data-testid",
    "found-understood",
  );
  await expect(removeChip(page, "Adventure")).toBeVisible();
  await expect(removeChip(page, "Saturday")).toBeVisible();
  // Adventure on Saturday 22 August, with "dive" in it.
  await expectCards(page, [T.tryDive]);
  await expectAccessible(page);

  await removeChip(page, "Saturday").click();
  await expectAsked(
    asked,
    (p) =>
      p.get("q") === "dive saturday" && p.getAll("asText").includes("saturday"),
    "removing Saturday never sent asText=saturday with the same q",
  );
  await expectAddress(
    page,
    (p) =>
      p.get("q") === "dive saturday" && p.getAll("asText").includes("saturday"),
    "removing Saturday never kept q and added asText in the address",
  );
  await expect(removeChip(page, "Saturday")).toHaveCount(0);
  await expect(removeChip(page, "Adventure")).toBeVisible();
  /*
    "saturday" as plain words finds the Saturday Dive Club, which meets on
    Sunday, and no longer finds the try-dive, which is on Saturday. Only the
    mock reading asText=saturday answers that.
  */
  await expectCards(page, [T.diveClub]);
  await expectAccessible(page);

  // A new search is new words: none is kept as plain text.
  await search(page, "Bengaluru", "dive club");
  await expectAddress(
    page,
    (p) => p.get("q") === "dive club" && !p.has("asText"),
    "a new search kept the old asText",
  );
});

test("a search needs two characters, and Clear search shows only with words", async ({
  page,
}) => {
  await openFeed(page, BENGALURU, "checked-staff");
  const box = searchBox(page, "Bengaluru");
  const clear = page
    .getByRole("search")
    .getByRole("button", { name: UI.clearSearch, exact: true });
  await expect(
    page
      .getByRole("search")
      .getByRole("button", { name: "Search", exact: true }),
  ).toBeVisible();
  await expect(clear).toHaveCount(0);

  const asked = eventsAsked(page);
  await box.fill("d");
  await expect(clear).toBeVisible();
  await box.press("Enter");
  await expectCards(page, WHOLE_WEEK);
  expect(
    asked.filter((p) => p.has("q")),
    "one character was sent as a search",
  ).toEqual([]);

  await clear.click();
  await expect(box).toHaveValue("");
  await expect(box).toBeFocused();
  await expect(clear).toHaveCount(0);
});

/* ---------------------------------------------------------------- case 6 */

test("a search naming another place offers Search in that place", async ({
  page,
}) => {
  await openFeed(page, BENGALURU, "checked-staff", "&budget=under_500");
  await search(page, "Bengaluru", "rafting in coorg");

  // Nothing in Bengaluru is rafting, and Coorg is a link, never a filter.
  const line = UI.emptySearch("Bengaluru", "rafting in coorg");
  await expect(page.getByText(line, { exact: true })).toBeVisible();
  await expect(
    emptyState(page, line).getByRole("button", {
      name: UI.clearSearch,
      exact: true,
    }),
  ).toBeVisible();
  const searchIn = understood(page).getByRole("link", {
    name: UI.searchIn("Coorg"),
    exact: true,
  });
  await expect(searchIn).toBeVisible();
  await expect(removeChip(page, "Coorg")).toHaveCount(0);
  await expectAccessible(page);

  // The place and the words, and none of this place's filters.
  const href = (await searchIn.getAttribute("href")) ?? "";
  const target = new URL(href, page.url()).searchParams;
  expect(target.get("place")).toBe(COORG);
  expect(target.get("q")).toBe("rafting in coorg");
  expect(noFilters(target), `${href} carried a filter`).toBe(true);

  /*
    The link keeps no `__scenario`, as no page link in a real build would, so
    the mocked world is added by hand rather than followed with a click.
  */
  await page.goto(`${href}&__scenario=checked-staff`);
  await expect(heading(page, "Coorg")).toBeVisible();
  await expect(card(page, "White water rafting on the Barapole")).toBeVisible();
});
