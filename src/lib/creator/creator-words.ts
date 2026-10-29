import { civilFromDate, dayMonth } from "@/lib/format/date";
import type { components } from "@/lib/api/schema.gen";

export type CreatorLink = components["schemas"]["CreatorLink"];

/**
 * Every word of a traveller's share links (yuvoy-app#207, R12-T2), in one
 * place: Your links on Account and Get my link on a past trip.
 *
 * From the issue and its phone twin, yuvoy-mobile#389, so the two apps read
 * alike. The lines a refusal shows are not here: they are the API's own
 * `error.message`, shown as it is sent.
 *
 * ## Counts, and nothing else
 *
 * A link is never about money. The API sends no amount, no name and no date
 * of anybody else's trip, and nothing here may add one: the counts are opens
 * and bookings, and the one date is the day the latest booking was made.
 */
export const CREATOR_WORDS = {
  title: "Your links",
  intro:
    "Share a link to something you went on. We count opens and bookings through it. The counts are indicative. Yuvoy does not pay for links yet.",
  empty: "No links yet. Get one from a trip you went on.",
  loading: "Loading your links",
  failed: "Your links did not load",
  retry: "Try again",
  retrying: "Trying again",

  copy: "Copy link",
  copied: "Copied",
  share: "Share",
  /** No share sheet, so the message went to the clipboard. */
  messageCopied: "Message copied. Paste it where you want to send it.",
  /** Said when even the clipboard refused. */
  copyRefused: "This browser did not let us copy. Try again.",

  getMyLink: "Get my link",
  gettingLink: "Getting your link",
  /** `201`: made just now. */
  made: "Your link is ready. It is in Your links on Account too.",
  /** `200`: the one they already had. */
  already: "You already have this link. It is in Your links on Account.",

  /** A `401`: the same answer Trips gives a sign-in that has ended. */
  signedOut: {
    title: "Your sign-in has expired",
    body: "Sign in again and every trip on your number comes back.",
    action: "Sign in again",
    href: "/account?next=/trips",
  },
} as const;

/** "4 opens", "1 open": the singular where it belongs, as Account's counts. */
function plural(n: number, one: string, many: string): string {
  return `${n} ${n === 1 ? one : many}`;
}

/**
 * "{opens30Days} opens in the last 30 days · {opensTotal} in all ·
 * {bookings} bookings".
 */
export function linkCounts(
  link: Pick<CreatorLink, "opens30Days" | "opensTotal" | "bookings">,
): string {
  return [
    `${plural(link.opens30Days, "open", "opens")} in the last 30 days`,
    `${link.opensTotal} in all`,
    plural(link.bookings, "booking", "bookings"),
  ].join(" · ");
}

/**
 * "Latest booking 21 Oct", or null when nobody has booked through it.
 *
 * `lastBookingOn` is a plain `YYYY-MM-DD`, so it is read as a calendar day
 * with no zone step, and the month comes from our own table rather than the
 * runtime's (yuvoy-app#67). A day in a shape this cannot read draws no line.
 */
export function latestBooking(
  link: Pick<CreatorLink, "lastBookingOn">,
): string | null {
  if (!link.lastBookingOn) return null;
  const civil = civilFromDate(link.lastBookingOn);
  return civil ? `Latest booking ${dayMonth(civil)}` : null;
}

/** "I went on {title} with Yuvoy. Have a look: {link}", the link as sent. */
export function shareText(link: Pick<CreatorLink, "link" | "target">): string {
  return `I went on ${link.target.title} with Yuvoy. Have a look: ${link.link}`;
}

/**
 * Your links with one link put in: replacing the same code where it is
 * already listed, at the top where it is new (the list is newest first).
 */
export function withLink(
  items: readonly CreatorLink[],
  link: CreatorLink,
): CreatorLink[] {
  const at = items.findIndex((item) => item.code === link.code);
  if (at < 0) return [link, ...items];
  return items.map((item, i) => (i === at ? link : item));
}
