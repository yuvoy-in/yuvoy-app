import { expect, type Page } from "@playwright/test";
import { STATED_TITLES as S } from "../../mocks/found-stated-fixtures";
import { CHECKED_TITLES as W } from "../../mocks/found-checked-fixtures";
import {
  UI,
  applyFilters,
  filterSheet,
  filtersButton,
  pick,
} from "./explore-filters";

/**
 * What the two specs of yuvoy-app#195 share (`explore-stated.spec.ts`, the
 * filter sheet's four rows, and `explore-stated-page.spec.ts`, "As listed"
 * on a card's page): the words, the worlds and what each filter lists.
 *
 * ## The words
 *
 * The issue's, which are mobile's (`packages/core/src/explore/filters.ts`
 * and `stated.ts`), still waiting for the owner's approval. Copied here since
 * no spec imports app code, so a change of words is one edit.
 *
 * ## The worlds
 *
 * `found-stated-facts` opens `explore` and `checkedCities` at `staff`;
 * `found-stated-closed` is the same cards and pages with `checkedCities`
 * `off`. Both are on R3's clock, Friday 21 August 2026 at 17:30 in Kolkata,
 * and both are open to a signed-in caller only, so every test signs in
 * (`openSignedIn`). The cards, and the fact each is for, are in
 * `mocks/found-stated-fixtures.ts`.
 */

export const STATED = "found-stated-facts";
export const STATED_CLOSED = "found-stated-closed";

/** The rows' titles and choices, and the card page's words. */
export const WORDS = {
  howLong: "How long",
  under2h: "Under 2 hours",
  halfDay: "Half a day",
  longer: "Longer",
  setting: "Indoors or out",
  indoors: "Indoors",
  outdoors: "Outdoors",
  suits: "Who it suits",
  howHard: "How hard",
  asListed: "As listed",
  included: "What's included",
  goodToKnow: "Good to know",
  checkedLine: (source: string) =>
    `From ${source}. A person at Yuvoy checked the date, time, place and price, not these.`,
  foundLine: (source: string) =>
    `From ${source}. Nobody at Yuvoy has checked it yet.`,
  from: (source: string) => `From ${source}.`,
  ends: (time: string) => `Ends ${time}`,
  venue: (venue: string) => `Venue: ${venue}`,
  suitsRow: (who: string) => `Suits: ${who}`,
  bothRow: "Indoors and outdoors",
  difficultyRow: (how: string) => `Difficulty: ${how}`,
};

/** The four rows' URL and request names, beside #180's two. */
export const FOUR = ["duration", "setting", "suits", "difficulty"];
export const SIX = ["budget", "timeOfDay", ...FOUR];

/** Bengaluru under `found-stated-facts` with nothing chosen: 22 cards, 20 a page. */
export const PAGE_ONE = 20;
export const BENGALURU_ALL = 22;
/** Coorg under `found-stated-facts`: R2's seven and the river taster. */
export const COORG_ALL = 8;

/** One choice of a row: its words, its value, and Bengaluru's cards that state it. */
export interface Choice {
  name: string;
  value: string;
  titles: string[];
}

/**
 * What each choice lists in Bengaluru. The week's fair states nothing and
 * runs over three days, so it is Longer, as the API counts a multi-day item;
 * no other card that states nothing is in any list.
 */
export const LISTS = {
  duration: [
    // 10:00 to 11:30, 90 minutes.
    { name: WORDS.under2h, value: "under_2h", titles: [S.kayak] },
    // 10:00 to 12:00 and 10:00 to 15:00: 120 and 300 minutes, both edges.
    { name: WORDS.halfDay, value: "half_day", titles: [S.pottery, S.trek] },
    // 10:00 to 15:30, and two multi-day items.
    {
      name: WORDS.longer,
      value: "longer",
      titles: [S.cooking, S.kites, W.fair],
    },
  ],
  setting: [
    // The planetarium is stated as both.
    {
      name: WORDS.indoors,
      value: "indoor",
      titles: [S.pottery, S.cooking, S.planetarium, S.museum],
    },
    {
      name: WORDS.outdoors,
      value: "outdoor",
      titles: [S.kayak, S.trek, S.kites, S.planetarium, S.climbing],
    },
  ],
  suits: [
    { name: "Solo", value: "solo", titles: [S.pottery] },
    { name: "Couples", value: "couples", titles: [S.pottery, S.cooking] },
    { name: "Friends", value: "friends", titles: [S.kayak, S.trek] },
    {
      name: "Families",
      value: "families",
      titles: [S.kayak, S.cooking, S.kites, S.planetarium],
    },
    { name: "Kids", value: "kids", titles: [S.kites, S.planetarium, S.museum] },
  ],
  // The climbing card states hard, and its check ran out: never Hard.
  difficulty: [
    { name: "Easy", value: "easy", titles: [S.kayak, S.planetarium] },
    { name: "Moderate", value: "moderate", titles: [S.pottery] },
    { name: "Hard", value: "hard", titles: [S.trek] },
  ],
} satisfies Record<string, Choice[]>;

/** Each row's title, by its request name. */
export const ROW: Record<string, string> = {
  duration: WORDS.howLong,
  setting: WORDS.setting,
  suits: WORDS.suits,
  difficulty: WORDS.howHard,
};

/** A row of the open sheet, by its title. */
export const sheetRow = (page: Page, title: string) =>
  filterSheet(page).getByRole("group", { name: title, exact: true });

/** Opens the sheet, clears it, chooses `name` in `row` alone and applies it. */
export async function chooseOnly(page: Page, row: string, name: string) {
  await filtersButton(page).click();
  await expect(filterSheet(page)).toBeVisible();
  await filterSheet(page)
    .getByRole("button", { name: UI.clearFilters, exact: true })
    .click();
  await pick(page, row, name);
  await applyFilters(page);
}
