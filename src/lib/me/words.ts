import {
  civilFromDate,
  civilInZone,
  dayMonth,
  type Civil,
} from "@/lib/format/date";
import type { BadgeProgress, LifeEntry, MeLanguage } from "./types";

/**
 * Every word of Me on the web (yuvoy-mobile#444, R10-M1): the header row,
 * Did you go?, the life list, its badges and the two settings. The same
 * strings the phone shows (packages/core/src/me/words.ts in yuvoy-mobile, as
 * merged in yuvoy-mobile#446), so a traveller who uses both reads one product.
 * A change goes to Teja on the issue first, then to both apps.
 */

/** The market's calendar: a date on the list is the day where it happened. */
const MARKET_ZONE = "Asia/Kolkata";

/**
 * The line that says where an entry came from, by its proof.
 *
 * `checked_in` on a trip is the crew's tick at the meeting point; on anything
 * else it is the entry's own check-in. A proof this app does not know (a
 * newer API) has no line: null, and the page does not draw the entry, since
 * nothing on the list may appear without saying where it came from.
 */
export function proofLine(entry: {
  kind: string;
  proof: string;
}): string | null {
  switch (entry.proof) {
    case "booked":
      return "Booked with Yuvoy";
    case "checked_in":
      return entry.kind === "trip"
        ? "Booked with Yuvoy · Checked in by the crew"
        : "Checked in";
    case "said_you_went":
      return "You said you went";
    case "with_friends":
      return "With friends";
    case "table_check_in":
      return "Checked in at a table";
    default:
      return null;
  }
}

/** "2 cheers", "1 cheer" (mobile as built, PR #446); nothing at none. */
export function cheersLine(n: number): string | null {
  if (!(n > 0)) return null;
  return n === 1 ? "1 cheer" : `${n} cheers`;
}

/** Under the name: what was done, what is saved and the badges earned. */
export function headerLine(c: {
  done: number;
  saved: number;
  badges: number;
}): string {
  const n = (v: number) => (Number.isFinite(v) ? Math.max(0, v) : 0);
  return `Done ${n(c.done)} · Bucket list ${n(c.saved)} · Badges ${n(c.badges)}`;
}

function withYear(civil: Civil): string {
  return `${dayMonth(civil)} ${civil.year}`;
}

/** "16 Sep 2026", the day in the market's calendar; empty for a bad stamp. */
export function lifeDate(iso: string): string {
  const civil = civilInZone(iso, MARKET_ZONE);
  return civil ? withYear(civil) : "";
}

/** "Ends 30 Sep 2026" for a season's last day (a plain date); null without. */
export function endsLine(endsOn: string | null | undefined): string | null {
  if (!endsOn) return null;
  const civil = civilFromDate(endsOn);
  return civil ? `Ends ${withYear(civil)}` : null;
}

/** "1 of 2", and for a season "1 of 3 · Ends 30 Sep 2026". */
export function progressLine(
  b: Pick<BadgeProgress, "have" | "need" | "endsOn">,
): string {
  const line = `${Math.max(0, b.have)} of ${Math.max(0, b.need)}`;
  const ends = endsLine(b.endsOn);
  return ends ? `${line} · ${ends}` : line;
}

/**
 * Whether the page draws "Who sees this" on an entry. A plan is only ever the
 * owner's, so it gets "Only you see plans" instead. A went entry is changed by
 * its event id, so one without an id (an API defect) gets no control either.
 */
export function canSetVisibility(
  entry: Pick<LifeEntry, "kind" | "eventId">,
): boolean {
  if (entry.kind === "trip" || entry.kind === "table") return true;
  if (entry.kind === "went") return Boolean(entry.eventId);
  return false;
}

/** The four languages, in the order the chips show them. */
export const LANGUAGES: { key: MeLanguage; label: string }[] = [
  { key: "en", label: "English" },
  { key: "hi", label: "Hindi" },
  { key: "te", label: "Telugu" },
  { key: "kn", label: "Kannada" },
];

export const ME_WORDS = {
  didYouGoHead: "Did you go?",
  didYouGo: (title: string) => `Did you go to ${title}?`,
  yes: "Yes",
  no: "No",
  /** What a screen reader hears on Yes and No: the event they answer for. */
  yesLabel: (title: string) => `Yes, I went to ${title}`,
  noLabel: (title: string) => `No, I did not go to ${title}`,
  lifeListLabel: "Done or bucket list",
  done: "Done",
  bucketList: "Bucket list",
  loadingLifeList: "Loading your life list",
  /** The read failed: only this section says so, the rest of Account works. */
  lifeListError:
    "We couldn't load your life list just now. Everything else here still works.",
  emptyDone:
    "Nothing here yet. Things you book, go to and do with friends show up here after they happen.",
  emptyBucket:
    "Your bucket list is everything you save. Tap the bookmark on any card.",
  showMore: "Show more",
  loadingMore: "Loading more",
  moreFailed: "That page did not load. Try again.",
  whoSeesThis: "Who sees this:",
  whoSeesLabel: (title: string) => `Who sees ${title}`,
  friends: "Friends",
  onlyMe: "Only me",
  plansOnlyYou: "Only you see plans",
  badges: "Badges",
  emptyBadges:
    "Badges come from things you do. Your first one comes with your first trip or event.",
  onlyYouBadge:
    "Only you can see this one. It counts for friends once a check-in confirms it.",
  earnedFrom: "Earned from",
  newBadge: (name: string) => `New badge: ${name}`,
  nice: "Nice",
  languagesTitle: "Languages I'm happy with",
  languagesNote:
    "Trigo understands these. It replies in English, or in your language when you write in its own script.",
  womenOnlyTitle: "Women-only tables",
  womenOnlyLabel: "Show them in my lists",
  /** A visibility or settings change that did not go through: it goes back. */
  changeFailed: "We could not change that just now. Try again.",
  /** A Nice that did not go through: the badge shows again on a later read. */
  saveFailed: "We could not save that just now. Try again.",
} as const;
