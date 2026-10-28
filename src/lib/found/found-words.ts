import type { components } from "@/lib/api/schema.gen";
import {
  civilFromDate,
  civilHere,
  civilInZone,
  clockTime,
  weekdayDayMonth,
} from "@/lib/format/date";

/**
 * The found feed's words, and the small rules they are drawn with
 * (yuvoy-app#179, R2-T4).
 *
 * ## Whose words these are
 *
 * The R2 copy table's, as the issue lists them and as the phone app built
 * them (yuvoy-mobile `packages/core/src/explore/found.ts`), so a card reads
 * the same on both. They wait for the owner's approval of the R2 copy, and a
 * change later is an edit here and nowhere else: the card page and its sheets
 * (P3's files) import from this module rather than writing their own.
 *
 * ## What is NOT here, on purpose
 *
 * Every claim on a card is the API's and is shown word for word: the trust
 * line (`check.label`), the card page's sentence about the check
 * (`check.sentence`), the price (`price.text`), the place's name and the
 * department names. This module composes none of them. What the web writes is
 * only what the copy table gives it: the when line from the card's dates, the
 * status words, the lines for what a card does not say, and the screen's own
 * headings and states.
 *
 * No list of department names either (REQ-R0-16, decision 9 of the note): a
 * department is named by the vocabulary's answer, and with the vocabulary down
 * a card shows its art and no name. The phone keeps a fallback list; the web
 * does not need one.
 *
 * No server or client boundary is declared, so a Server Component (the card
 * page) and a client one (the feed) read the same values.
 */

export type FoundItem = components["schemas"]["FoundItem"];
export type FoundItemList = components["schemas"]["FoundItemList"];
export type ExplorePlace = components["schemas"]["ExplorePlace"];
export type Category = components["schemas"]["Category"];
export type FoundStatus = FoundItem["status"];

/**
 * How many cards a page asks for: the API's default (1 to 30), and the
 * phone's. Here rather than beside the hook because the server's first page
 * reads it too, and a server file may not take a value out of a
 * `"use client"` module (`pnpm qa`, 7b).
 */
export const FOUND_PAGE_SIZE = 20;

/** A list on screen longer than this is said to be from earlier. */
export const FOUND_STALE_AFTER_MS = 30 * 60_000;

const STATUS_WORDS: Readonly<Record<Exclude<FoundStatus, "scheduled">, string>> =
  Object.freeze({
    cancelled: "Cancelled",
    postponed: "Postponed",
    moved: "Date or place changed",
    sold_out: "Sold out",
    ended: "This has ended",
  });

const UNDATED = "Check dates on their page";
const NO_PLACE = "Place on their page";

const TIME = /^([01]\d|2[0-3]):([0-5]\d)(?::[0-5]\d)?$/;

/** `HH:MM`, or null when the API sent no time or one this app cannot read. */
function clockOf(time: string | null | undefined): string | null {
  const match = TIME.exec(time?.trim() ?? "");
  return match ? `${match[1]}:${match[2]}` : null;
}

export const foundWords = Object.freeze({
  heading: (place: string) => `Things to do in ${place}`,
  /** Under the heading, by how the place's cards are checked. */
  placeLine: {
    local: "Every card here was checked by a person at Yuvoy.",
    travel:
      "Found by Trigo on organisers' and venues' own pages. Each card says whether a person has checked it.",
  } satisfies Record<ExplorePlace["kind"], string>,
  allChip: "All",
  /** Names the row of chips for a screen reader. */
  chipsLabel: "Kinds of things to do",
  loading: (place: string) => `Loading things to do in ${place}`,
  emptyPlace: {
    title: (place: string) => `Nothing to show in ${place} right now`,
    body: "Everything we had has ended or is being checked. Try another place, or come back soon.",
  },
  emptyDepartment: {
    /** The department as the vocabulary names it, lower-cased in the sentence as the phone does. */
    title: (department: string, place: string) =>
      `No ${department.toLowerCase()} in ${place} right now`,
    body: "Try another kind of thing.",
  },
  pickAnother: "Pick another place",
  showEverything: "Show everything",
  end: (place: string) => `That's what we know about ${place} so far.`,
  tail: {
    more: "Loading more…",
    failed: "More cards did not load. Scroll up and back down to try again.",
    stopped:
      "That's as far as we can load right now, not the end of the list. Reload to try again.",
  },
  refresh: "Refresh",

  /* The card's lines for what it does not say. */
  undated: UNDATED,
  noPlace: NO_PLACE,
  noEndTime: "End time not listed",

  seeDetails: "See details",
  opens: (host: string) => `Opens ${host}`,
  more: "More",
  share: "Share",
  reportProblem: "Report a problem",
  /** The share disc's own words (`ShareLink`), for the same two outcomes. */
  shareCopied: "Link copied",
  shareUnavailable: "Copy the address instead",

  /**
   * The card's when line: `Sat, 22 Nov · 18:30`, `Sat, 22 Nov to Sun, 23 Nov`,
   * `Every Sunday · next Sun, 23 Nov`, or `Check dates on their page`, as the
   * phone's `foundWhenLine`.
   *
   * `when` is in the place's own calendar and clock already (`startsOn` is
   * "local date in the place's zone"), so `timezone` is what the line is IN
   * rather than something to convert to: the dates are read as written and
   * never turned into an instant, which is what keeps a reader in another zone
   * from seeing a different day. No `Intl`, so the server and the browser
   * write the same characters (`lib/format/date.ts`, yuvoy-app#67).
   * `repeats` is shown as the source states it.
   */
  whenLine: (
    item: Pick<FoundItem, "when">,
    // The zone the dates are already in. Taken so a caller cannot forget
    // which clock it is reading, and read by nothing: see above.
    timezone?: string,
  ): string => {
    void timezone;
    const { when } = item;
    const repeats = when.repeats?.trim() || null;
    const start = when.startsOn ? civilFromDate(when.startsOn) : null;
    if (!start) return repeats ?? UNDATED;
    const day = weekdayDayMonth(start);
    const time = clockOf(when.startTime);
    let line = repeats ? `${repeats} · next ${day}` : day;
    if (time) line += ` · ${time}`;
    const end = when.endsOn ? civilFromDate(when.endsOn) : null;
    // Plain `YYYY-MM-DD` strings sort as dates do.
    if (end && when.endsOn && when.startsOn && when.endsOn > when.startsOn) {
      line += ` to ${weekdayDayMonth(end)}`;
    }
    return line;
  },

  /**
   * Where it is: the venue (or the address), then the town; `Place on their
   * page` without one. An address that already ends with its town does not
   * say it twice.
   */
  whereLine: (item: Pick<FoundItem, "where">): string => {
    const place = item.where.placeText?.trim();
    const town = item.where.town?.trim();
    if (!place) return NO_PLACE;
    if (!town || place.toLowerCase().endsWith(town.toLowerCase())) return place;
    return `${place}, ${town}`;
  },

  /** The status tag, or null for `scheduled` and for a status this build has no words for. */
  statusTag: (status: string): string | null =>
    Object.prototype.hasOwnProperty.call(STATUS_WORDS, status)
      ? STATUS_WORDS[status as Exclude<FoundStatus, "scheduled">]
      : null,

  /**
   * The stale line: when the list on screen was read, by the PLACE's clock,
   * since the cards' times are the place's. The reader's own clock only when
   * the zone is one this runtime does not know, and then this is drawn in the
   * browser alone (the stale notice appears 30 minutes after a read, never in
   * a server render).
   */
  stale: (readAt: number, timezone: string | null | undefined): string => {
    const iso = new Date(readAt).toISOString();
    const civil = (timezone ? civilInZone(iso, timezone) : null) ?? civilHere(iso);
    const time = civil ? clockTime(civil) : "earlier";
    return `This list is from ${time}. Refresh for the latest.`;
  },
});

/**
 * A department's name from the vocabulary's answer, or null: no answer, a key
 * the answer does not have, or a card with no department. Null means the card
 * shows its art and no name, and the chips show "All" alone.
 */
export function departmentName(
  key: string | null | undefined,
  vocabulary: readonly { key: string; label: string }[] | null | undefined,
): string | null {
  if (!key || !vocabulary) return null;
  return vocabulary.find((term) => term.key === key)?.label.trim() || null;
}

/**
 * The foot of the feed, by its last page: `more` while there is a cursor,
 * `end` once the server says the list is complete, and `stopped` for
 * `complete: false` with no cursor, which is NOT the end of the list and is
 * never said as one. `complete` is read first, so a complete page that still
 * carries a stray cursor is the end.
 */
export type FoundTail = "more" | "end" | "stopped";

export function foundTail(
  pages: readonly Pick<FoundItemList, "complete" | "nextCursor">[] | undefined,
): FoundTail {
  const last = pages?.at(-1);
  if (!last) return "more";
  if (last.complete) return "end";
  return last.nextCursor ? "more" : "stopped";
}

/**
 * The cards of every page loaded, in the server's order and never re-sorted,
 * each once (a card merged into another can reach two pages), leaving out the
 * ones this browser hides. Ids are compared in lower case, as the hidden list
 * keeps them.
 */
export function visibleCards(
  pages: readonly Pick<FoundItemList, "items">[] | undefined,
  hidden: ReadonlySet<string>,
): FoundItem[] {
  const seen = new Set<string>();
  const out: FoundItem[] = [];
  for (const page of pages ?? []) {
    for (const item of page.items ?? []) {
      if (!item?.id) continue;
      const id = item.id.toLowerCase();
      if (seen.has(id)) continue;
      seen.add(id);
      if (hidden.has(id)) continue;
      out.push(item);
    }
  }
  return out;
}
