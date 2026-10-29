import type { components } from "@/lib/api/schema.gen";
import { foundClock } from "./found-words";

/**
 * What a card's own page states, on the card page (yuvoy-app#195, R3-T6's
 * `stated` on `GET /events/{id}`): As listed, with the facts a page may state
 * about it, then What's included and Good to know. Each fact shows only when
 * stated: a fact the page does not state has no heading, no empty line and
 * no placeholder.
 *
 * The phone's rules and words (yuvoy-mobile `packages/core/src/explore/
 * stated.ts`, #361), so a card's page reads the same on both.
 *
 * ## A person's check covers four things
 *
 * The date, time, place and price, so As listed says the rest is the page's.
 * A check that ran out says only where the facts are from (the phone's, ours,
 * for Sai Teja): "a person checked" would claim a check that no longer
 * counts, and "nobody has checked it" would deny one that happened.
 *
 * ## Shown as sent
 *
 * The API already leaves out how hard and the note on a card nobody checked;
 * this shows what it is sent and never works anything out from the tier.
 *
 * No server or client boundary is declared, so a Server Component and a
 * client one read the same values.
 */

export type StatedFacts = components["schemas"]["StatedFacts"];
type FoundItemDetail = components["schemas"]["FoundItemDetail"];

/** The block's words: the issue's drafts and the phone's, waiting for the owner's approval. */
export const STATED_WORDS = Object.freeze({
  heading: "As listed",
  checked:
    "A person at Yuvoy checked the date, time, place and price, not these.",
  found: "Nobody at Yuvoy has checked it yet.",
  from: (source: string) => `From ${source}.`,
  /** A check that ran out, with no source to name (the phone's, ours, for Sai Teja). */
  asStated: "As the page states it.",
  ends: (time: string) => `Ends ${time}`,
  venue: (venue: string) => `Venue: ${venue}`,
  suits: (who: readonly string[]) => `Suits: ${who.join(", ")}`,
  difficulty: (how: string) => `Difficulty: ${how}`,
  included: "What's included",
  goodToKnow: "Good to know",
});

/*
  Keyed by the contract's values, so a value it adds fails to compile here
  until it has a word; read through `own`, so a value the build has no word
  for yet shows no row rather than a raw token.
*/
const SETTING: Readonly<Record<NonNullable<StatedFacts["setting"]>, string>> =
  Object.freeze({
    indoor: "Indoors",
    outdoor: "Outdoors",
    both: "Indoors and outdoors",
  });
const SUITS: Readonly<Record<StatedFacts["suits"][number], string>> =
  Object.freeze({
    solo: "Solo",
    couples: "Couples",
    friends: "Friends",
    families: "Families",
    kids: "Kids",
  });
const DIFFICULTY: Readonly<
  Record<NonNullable<StatedFacts["difficulty"]>, string>
> = Object.freeze({
  easy: "Easy",
  moderate: "Moderate",
  hard: "Hard",
});

/** The word for a value in one of the tables above, or null for one it does not have. */
function wordOf(
  table: Readonly<Record<string, string>>,
  value: unknown,
): string | null {
  return typeof value === "string" &&
    Object.prototype.hasOwnProperty.call(table, value)
    ? table[value]
    : null;
}

/** Words a page states, trimmed, or null for none. */
function said(value: unknown): string | null {
  return typeof value === "string" && value.trim() ? value.trim() : null;
}

/** What the block reads of a card. `stated` may be missing on an answer from before it was sent. */
export type StatedCard = Pick<FoundItemDetail, "when" | "check" | "sources"> & {
  stated?: StatedFacts | null;
};

/** Where the facts are from: the first of the card's sources with a name, or none. */
export function statedSource(
  card: Pick<FoundItemDetail, "sources">,
): string | null {
  for (const source of card.sources ?? []) {
    const name = said(source?.name);
    if (name) return name;
  }
  return null;
}

/**
 * As listed's rows, each only when stated, in the issue's order: `Ends 18:30`
 * (not on an item over more than one day), `Venue: rooftop cafe`,
 * `Suits: Families, Kids` (in the order sent, each once), `Indoors`,
 * `Outdoors` or `Indoors and outdoors`, and `Difficulty: Easy`.
 */
export function asListedRows(card: StatedCard): string[] {
  const s = card.stated;
  if (!s) return [];
  const rows: string[] = [];
  const { startsOn, endsOn } = card.when;
  // Plain `YYYY-MM-DD` strings sort as dates do.
  const multiDay = Boolean(startsOn && endsOn && endsOn > startsOn);
  const ends = foundClock(s.endTime);
  if (ends && !multiDay) rows.push(STATED_WORDS.ends(ends));
  const venue = said(s.venueType);
  if (venue) rows.push(STATED_WORDS.venue(venue));
  const who: string[] = [];
  for (const value of Array.isArray(s.suits) ? s.suits : []) {
    const word = wordOf(SUITS, value);
    if (word && !who.includes(word)) who.push(word);
  }
  if (who.length > 0) rows.push(STATED_WORDS.suits(who));
  const setting = wordOf(SETTING, s.setting);
  if (setting) rows.push(setting);
  const difficulty = wordOf(DIFFICULTY, s.difficulty);
  if (difficulty) rows.push(STATED_WORDS.difficulty(difficulty));
  return rows;
}

/**
 * The line under As listed: where the facts are from, and who checked what.
 * A card nobody checked says so; a check that ran out names only the source,
 * whatever its tier.
 */
export function asListedLine(card: StatedCard): string {
  const source = statedSource(card);
  const from = source ? STATED_WORDS.from(source) : null;
  if (card.check.lapsed) return from ?? STATED_WORDS.asStated;
  const says =
    card.check.tier === "found" ? STATED_WORDS.found : STATED_WORDS.checked;
  return from ? `${from} ${says}` : says;
}

/** One of the two sections under As listed. */
export interface StatedSection {
  key: "included" | "goodToKnow";
  title: string;
  body: string;
  /** `From {source}.`, or null when no source has a name. */
  from: string | null;
}

/** What's included and Good to know, each only when stated, with where it is from. */
export function statedSections(card: StatedCard): StatedSection[] {
  const s = card.stated;
  if (!s) return [];
  const source = statedSource(card);
  const from = source ? STATED_WORDS.from(source) : null;
  const sections: StatedSection[] = [];
  const included = said(s.included);
  if (included) {
    sections.push({
      key: "included",
      title: STATED_WORDS.included,
      body: included,
      from,
    });
  }
  const note = said(s.goodToKnow);
  if (note) {
    sections.push({
      key: "goodToKnow",
      title: STATED_WORDS.goodToKnow,
      body: note,
      from,
    });
  }
  return sections;
}
