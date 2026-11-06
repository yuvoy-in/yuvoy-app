/**
 * The trust line, check and price words, for `found-fixtures.ts` (yuvoy-app#243 split it).
 * Import from `found-fixtures.ts`: it re-exports what the mocks and specs use.
 */
import type { components } from "../src/lib/api/schema.gen";

type FoundItem = components["schemas"]["FoundItem"];
type Check = FoundItem["check"];
type Price = FoundItem["price"];

/* ---------------------------------------------------------------- words */

/** India keeps one offset all year: the place's day is this far ahead of UTC. */
const IST_MS = 5.5 * 60 * 60_000;
const DAY_MS = 24 * 60 * 60_000;
const WEEKDAYS = "Sun Mon Tue Wed Thu Fri Sat".split(" ");
const MONTHS = "Jan Feb Mar Apr May Jun Jul Aug Sep Oct Nov Dec".split(" ");

/** Today plus `offset` days in the place, as a calendar date (`2026-08-20`). */
export function placeDate(offset: number, now: number): string {
  return new Date(now + IST_MS + offset * DAY_MS).toISOString().slice(0, 10);
}

/** That day as the API's trust line writes it (Go's "Mon, 2 Jan"). */
function spoken(offset: number, now: number): string {
  const d = new Date(now + IST_MS + offset * DAY_MS);
  return `${WEEKDAYS[d.getUTCDay()]}, ${d.getUTCDate()} ${MONTHS[d.getUTCMonth()]}`;
}

/** A person's check `ago` days back, at 11:00 in the place. */
function checkedAt(ago: number, now: number): string {
  return `${placeDate(-ago, now)}T05:30:00Z`;
}

/** How a person checked: the trust line's ending, and the page's sentence. */
export type Method = { line: string; sentence: (on: string) => string };
const onPage = (page: string): Method => ({
  line: ` · ${page}`,
  sentence: (on) =>
    `A person at Yuvoy checked the date, time, place and price on the ${page} on ${on}.`,
});
export const ORGANISER = onPage("organiser's page");
export const VENUE = onPage("venue's page");
export const IN_PERSON: Method = {
  line: " · in person",
  sentence: (on) => `A person at Yuvoy checked this in person on ${on}.`,
};

export function checked(
  host: string,
  path: string,
  how: Method,
  ago: number,
  now: number,
): Check {
  const on = spoken(-ago, now);
  return {
    tier: "staff_checked",
    label: `Checked by Yuvoy · ${on}${how.line}`,
    checkedAt: checkedAt(ago, now),
    lapsed: false,
    sentence: how.sentence(on),
    sourceName: host,
    sourceUrl: `https://${host}${path}`,
  };
}

export function confirmed(
  host: string,
  path: string,
  ago: number,
  now: number,
): Check {
  const on = spoken(-ago, now);
  return {
    tier: "organiser_confirmed",
    label: `Confirmed with the organiser · ${on}`,
    checkedAt: checkedAt(ago, now),
    lapsed: false,
    sentence: `A person at Yuvoy confirmed this with the organiser on ${on}.`,
    sourceName: host,
    sourceUrl: `https://${host}${path}`,
  };
}

/** Trigo's find. `host` null is a source no page may be linked to. */
export function trigo(host: string | null, path = "/"): Check {
  return {
    tier: "found",
    label: host
      ? `Found by Trigo · not checked yet · source: ${host}`
      : "Found by Trigo · not checked yet",
    checkedAt: null,
    lapsed: false,
    sentence: host
      ? `Trigo found this on ${host}. Nobody at Yuvoy has checked it yet, so check the details on their page before you go.`
      : "Trigo found this. Nobody at Yuvoy has checked it yet, so check the details on their page before you go.",
    sourceName: host,
    sourceUrl: host ? `https://${host}${path}` : null,
  };
}

/**
 * A check that no longer counts: the tier falls back to `found`, and the API
 * has no sentence for its page yet, so the key is absent rather than empty.
 */
export function lapsed(
  host: string,
  path: string,
  ago: number,
  now: number,
): Check {
  return {
    tier: "found",
    label: `Last checked by Yuvoy ${ago} days ago`,
    checkedAt: checkedAt(ago, now),
    lapsed: true,
    sourceName: host,
    sourceUrl: `https://${host}${path}`,
  };
}

export const FREE: Price = { kind: "free", from: null, text: "Free" };
export const UNPRICED: Price = {
  kind: "unknown",
  from: null,
  text: "Price on the organiser's page",
};

/** Whole rupees in the Indian grouping (1,500; 1,25,000). */
function grouped(rupees: number): string {
  const digits = String(rupees);
  if (digits.length <= 3) return digits;
  const lakhs = digits.slice(0, -3).replace(/\B(?=(\d{2})+(?!\d))/g, ",");
  return `${lakhs},${digits.slice(-3)}`;
}

/** A price a person checked, or (`asListed`) one only the page states. */
export function paid(rupees: number, asListed = false): Price {
  return {
    kind: "paid",
    from: { amountMinor: rupees * 100, currency: "INR" },
    text: `From ₹${grouped(rupees)}${asListed ? ", as listed" : ""}`,
  };
}
