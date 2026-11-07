import type { TableReport, TableSeatState, TableView } from "./use-table";

/**
 * Every word on the table page at `/tables/{id}` (yuvoy-app#194), in one
 * place.
 *
 * Proposed, not approved: they come from the issue's Words section (the R8
 * web copy table, spec R8-a:228-233, and the lines marked new), and the
 * paused state uses the mobile app's words so the two read alike. The page
 * ships with them and changes here when @gamallasaiteja answers.
 *
 * Wire values are mapped to sentences rather than shown: `requested` or
 * `in_review` on a page is a token from our own tables, not English.
 */
export const TABLE_WORDS = {
  /** The tab, on every branch: a forwarded link must not name the table. */
  pageTitle: "A table on Yuvoy",
  back: { href: "/", label: "the feed" },
  loading: "Loading this table",

  signedOut: {
    title: "Sign in to see this table",
    body: "It is on the account that asked to join. Sign in with it and it is here.",
    action: "Sign in",
  },

  notFound: {
    title: "We can't show this table",
    body: "It may have ended, or it is on another account. Sign in with the account that asked to join.",
    action: "Back to the feed",
  },

  paused: {
    title: "Tables are paused right now",
    body: "Nothing is lost. Your requests and seats come back as they were when we open tables again.",
    action: "Try again",
  },

  /** `Fri, 21 Aug, 18:00 to 20:00`, in the table's own zone. */
  when: (day: string, start: string, end: string) =>
    `${day}, ${start} to ${end}`,

  /** Before approval: the area and the kind of place, never the place. */
  where: (kind: TableView["venueKind"], area: string) =>
    `${VENUE_KIND[kind] ?? VENUE_KIND.other_public} in ${area}. The exact place is shared when you're in.`,

  ledBy: (leader: TableView["leader"]) =>
    leader.kind === "partner_club" && leader.clubName
      ? `Led by ${leader.clubName}`
      : `Led by ${leader.firstName} from Yuvoy`,

  whoIsGoing: "Who's going",
  soFar: (n: number) => `${n} ${n === 1 ? "person" : "people"} so far`,
  seats: (taken: number, max: number) => `${taken} of ${max} going`,
  full: "Full",
  womenOnly: "Women only",

  costDefault:
    "You pay for your own food and drinks at the place. Yuvoy takes no money for tables.",
  gettingHome: "Getting home",

  safety: (leader: TableView["leader"]) =>
    `Tables meet only in public places. Someone from ${
      leader.kind === "partner_club" && leader.clubName
        ? leader.clubName
        : "Yuvoy"
    } is there from start to end. Report anything that feels wrong.`,

  openInMaps: "Open in maps",
  dayOfContact: "On the day, the Yuvoy team is on",

  report: {
    open: "Report a problem",
    title: "Report a problem",
    reasonLegend: "What happened?",
    reasonMissing: "Pick what it is about.",
    personName: "Who is it about? (first name, optional)",
    note: "Anything else we should know (optional)",
    send: "Send report",
    sending: "Sending",
    sent: "Thanks. A person at Yuvoy reads every report within one working day.",
    tooFast: "That was sent too fast. Send it again in a moment.",
    failed: "That did not send. Try again.",
  },

  withdraw: {
    requested: "Withdraw my request",
    approved: "Give back my seat",
    confirm: "Withdraw",
    confirming: "Withdrawing",
    keep: "Keep it",
    requestedBody: "The Yuvoy team stops looking at your request.",
    approvedBody: "Your seat goes back to the table for somebody else.",
    canNotMake: "Can't make it? Let us know so someone else can have the seat.",
    closed:
      "This table has started, so the seat can't be given back here. Write to us if you can't come.",
    failed: "That did not work. Try again.",
  },
} as const;

/** `venueKind`, as the start of a sentence. */
const VENUE_KIND: Record<TableView["venueKind"], string> = {
  cafe: "A café",
  restaurant: "A restaurant",
  park: "A park",
  event_venue: "An event venue",
  community_space: "A community space",
  other_public: "A public place",
};

/**
 * The reader's own request, as a line. Declined and removed read alike: the
 * team turned it down either way, and the page never says why.
 */
export const SEAT_LINE: Record<TableSeatState, string | null> = {
  requested: "Request sent. We will email you.",
  // An approved guest gets the venue and the day's number instead of a line.
  approved: null,
  declined: "The Yuvoy team could not offer you a seat at this table.",
  removed: "The Yuvoy team could not offer you a seat at this table.",
  withdrawn: "You withdrew your request.",
};

/** Where the table stands, when it is not simply listed. */
export const STATUS_LINE: Record<TableView["status"], string | null> = {
  listed: null,
  in_review: "The Yuvoy team is checking a change to this table.",
  cancelled: "This table was cancelled.",
  ended: "This table has ended.",
};

/** `TableReport.reason`, in the order the sheet offers them. */
export const REPORT_REASONS: {
  key: TableReport["reason"];
  label: string;
}[] = [
  { key: "unsafe", label: "Unsafe" },
  { key: "harassment", label: "Harassment" },
  { key: "not_as_described", label: "Not as described" },
  { key: "spam", label: "Spam" },
  { key: "other", label: "Something else" },
];
