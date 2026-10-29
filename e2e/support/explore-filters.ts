import { expect, type Page } from "@playwright/test";
import AxeBuilder from "@axe-core/playwright";
import {
  CHECKED_NOW,
  CHECKED_TITLES as T,
} from "../../mocks/found-checked-fixtures";

/**
 * What the two specs of yuvoy-app#180 share (`explore-filters.spec.ts`,
 * cases 1 to 6, and `explore-filters-more.spec.ts`, cases 7 to 9 and the
 * card page's footnote): the words they find controls and lines by, the way
 * in, and the watchers that prove what the page asked for.
 *
 * ## The words
 *
 * Copied from the issue, the R3 copy table (still waiting for the owner's
 * approval). Every name either spec finds a control or a line by is in `UI`
 * below, so a change of words is one edit here.
 *
 * ## What was asked
 *
 * Page one is fetched by the server render, which the browser never sees,
 * and a later page or a refetch by the browser, through the proxy when signed
 * in. So "the page asked for X" is either a request the browser made to
 * `/v1/events` or `/api/v1/events`, or the address the server rendered from,
 * and `expectAsked` accepts both. What the mock then answered (a chip gone,
 * a card in or out) is asserted beside it, which only the server reading the
 * same parameter can explain.
 */

/* ------------------------------------------------------------- the words */

/** Every name and line the specs look for. Adjust here if the app's words differ. */
export const UI = {
  chipGroup: "Filter by day and price",
  today: "Today",
  tomorrow: "Tomorrow",
  weekend: "This weekend",
  free: "Free",
  /** The search field's role: a `type="search"` input is a searchbox. */
  searchRole: "searchbox" as const,
  search: (place: string) => `Search ${place}`,
  clearSearch: "Clear search",
  showing: "Showing",
  remove: (label: string) => `Remove ${label}`,
  searchIn: (place: string) => `Search in ${place}`,
  filters: "Filters",
  /** The sheet, as a dialog named by its title. */
  filterSheet: "Filters",
  /** The sheet's rows, as the report sheet's: a group of radios. */
  groupRole: "group" as const,
  optionRole: "radio" as const,
  budget: "Budget",
  timeOfDay: "Time of day",
  under500: "Under ₹500",
  morning: "Morning",
  clearFilters: "Clear filters",
  showEverything: "Show everything",
  /** The weekend's heading, from the answer's `window`. */
  weekendHeading: (from: string, to: string) =>
    `This weekend · ${from} to ${to}`,
  emptyDay: (day: string, place: string) =>
    `Nothing checked for ${day} in ${place} yet.`,
  emptyFree: (place: string) => `Nothing free in ${place} right now.`,
  /** Straight or curly quotes around the words. */
  emptySearch: (place: string, q: string) =>
    new RegExp(`^Nothing in ${place} matches [“"]${q}[”"]\\.$`),
  comingUp: "Coming up",
  thinLine:
    "Not much this weekend yet. Here's what's coming up in the next two weeks.",
  askLine: "Looking for something specific? Ask the Yuvoy team.",
  askLink: /Ask the Yuvoy team/,
  /** Straight or curly apostrophe. */
  freeFootnote: /^Free means the organiser says there.s no ticket price\.$/,
};

/** The URL state the chips keep (`?when=&free=1&q=`), read on the server. */
export const URL_STATE = { when: "when", free: "free", q: "q" };

/**
 * Closes the filter sheet once its choices are made. The issue names no
 * button for it, so Escape, which every sheet here answers.
 */
export async function closeFilters(page: Page) {
  await page.keyboard.press("Escape");
  await expect(page.getByRole("dialog", { name: UI.filterSheet })).toBeHidden();
}

/* ------------------------------------------------------------- helpers */

export const TAGS = ["wcag2a", "wcag2aa", "wcag21a", "wcag21aa", "wcag22aa"];

/** The same check `explore-place.spec.ts` runs, once entrances finish. */
export async function expectAccessible(page: Page) {
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

/** Signs in on Account, as `session-cookie.spec.ts` does. */
export async function signIn(page: Page) {
  await page.goto("/account");
  await page.getByLabel("Your WhatsApp number").fill("9111111111");
  await page.getByRole("button", { name: "Send me a code" }).click();
  await page.getByLabel("Sign-in code").fill("123456");
  await page.getByRole("button", { name: "Show me my trips" }).click();
  await expect(
    page.getByRole("button", { name: "Sign out on this device" }),
  ).toBeVisible();
}

/** A place's found feed, under a scenario. */
export const feedOf = (key: string, scenario: string, extra = "") =>
  `/?place=${key}${extra}&__scenario=${scenario}`;

export const cards = (page: Page) => page.locator('[role="feed"] article');

export const card = (page: Page, title: string) =>
  page.getByRole("article", { name: title, exact: true });

export const heading = (page: Page, place: string) =>
  page.getByRole("heading", {
    level: 1,
    name: `Things to do in ${place}`,
    exact: true,
  });

export const chip = (page: Page, name: string) =>
  page
    .getByRole("group", { name: UI.chipGroup })
    .getByRole("button", { name, exact: true });

export const searchBox = (page: Page, place: string) =>
  page.getByRole(UI.searchRole, { name: UI.search(place), exact: true });

export const filtersButton = (page: Page) =>
  page.getByRole("button", { name: UI.filters, exact: true });

/** The feed shows exactly these cards, in any order. */
export async function expectCards(page: Page, titles: string[]) {
  await expect(cards(page)).toHaveCount(titles.length);
  for (const title of titles) await expect(card(page, title)).toBeVisible();
}

/** Every `GET /events` list request the browser makes, from now on. */
export function eventsAsked(page: Page): URLSearchParams[] {
  const asked: URLSearchParams[] = [];
  page.on("request", (r) => {
    const url = new URL(r.url());
    if (r.method() === "GET" && /\/v1\/events$/.test(url.pathname)) {
      asked.push(url.searchParams);
    }
  });
  return asked;
}

/** The page asked for what `want` says: from the browser, or by its own address. */
export async function expectAsked(
  page: Page,
  asked: URLSearchParams[],
  want: (p: URLSearchParams) => boolean,
  message: string,
) {
  await expect
    .poll(() => asked.some(want) || want(new URL(page.url()).searchParams), {
      message,
    })
    .toBe(true);
}

/** Searches the place from its own field. */
export async function search(page: Page, place: string, q: string) {
  const box = searchBox(page, place);
  await box.fill(q);
  await box.press("Enter");
  await page.waitForURL((u) => u.searchParams.get(URL_STATE.q) === q);
}

/** The whole week, as `checked-staff` answers Bengaluru with nothing chosen. */
export const WHOLE_WEEK = Object.values(T);

/**
 * Every test's way in: the browser on the mock's R3 clock, Friday 21 August
 * 2026 at 17:30 in Kolkata, then signed in, since `checkedCities` at `staff`
 * is open to a signed-in caller only.
 */
export async function openSignedIn(page: Page) {
  await page.clock.setFixedTime(new Date(CHECKED_NOW));
  await signIn(page);
}
