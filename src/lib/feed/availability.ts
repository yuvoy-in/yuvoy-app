import type { components } from "@/lib/api/schema.gen";

type ExperienceSummary = components["schemas"]["ExperienceSummary"];

/**
 * What a card may say about when a traveller could actually go.
 *
 * ## Why this exists again
 *
 * It existed, on the feed card, and was deleted on 13 September when the
 * overlay was cut back to the picture (yuvoy-app#36). The contract is explicit
 * about what that cost:
 *
 * > **Absent means nothing is bookable in the next 90 days**, not "we did not
 * > check". A card that says nothing about availability makes the traveller tap
 * > through to find out, and the tap that ends in "no dates" is the one that
 * > loses them.
 *
 * Between that deletion and this, the feed sent travellers to listings with no
 * departures and gave them no way to know in advance. `seatsOnNextDisplay` was
 * built by the API for this card (yuvoy-api#92) and has been rendered nowhere
 * at all since.
 *
 * ## The two rules that are not ours to bend
 *
 * **The date is the MARKET's, never the device's.** A slot rendered in the
 * traveller's own timezone is a missed boat, which is why an eslint rule bans
 * every `toLocale*` call in this repository. `nextAvailable` arrives already in
 * the market's calendar, so the correct handling is to not convert it at all:
 * see `marketDate` for why reaching for `Intl` here was both unnecessary and
 * actively wrong.
 *
 * **`seatsOnNextDisplay` is printed verbatim.** The card used to derive "N
 * seats left" from `seatsOnNext` against a threshold it kept itself, which is a
 * second copy of a rule the server owns; the moment that threshold moves, the
 * card and the slot row disagree about the same departure. Absent means say
 * nothing about seats, which is also why a request-mode departure shows none:
 * it holds nothing until an operator says yes.
 */
export interface NextDeparture {
  /** Whether anything is on sale in the next ninety days. */
  bookable: boolean;
  /** For the caption: "Thu, 17 Sep", or the absence, stated. */
  short: string;
  /** For the panel: the same, with the server's seat sentence appended. */
  full: string;
  /** The seat sentence alone, or null. Rendered verbatim or not at all. */
  seats: string | null;
}

/*
  Fixed tables, not `Intl`, and this is a production defect rather than a
  preference.

  The first version formatted with `Intl.DateTimeFormat("en-IN", { month:
  "short", timeZone: "Asia/Kolkata" })`, which looks correct and is not: the
  abbreviation comes from whatever CLDR the RUNTIME carries. Node renders
  "Wed, 16 Sept" and WebKit renders "Wed, 16 Sep", so the server HTML and the
  client's first render disagreed by one character and React threw a hydration
  mismatch (#418) on every reel with a departure. It reached production and was
  found by reading the console on the live site, because nothing else can see
  it: both halves are individually right, and the server and the browser only
  disagree when they are the same machine's two different ICU builds.

  There was also no reason to convert a timezone at all. `nextAvailable` is
  already a plain `YYYY-MM-DD` in the MARKET's own calendar, so treating it as
  an instant and asking what day that instant falls on in Asia/Kolkata is a
  round trip back to where it started, with an environment dependency picked up
  on the way.

  The weekday is computed in UTC so it cannot depend on where this runs either.
*/
const WEEKDAYS = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"] as const;
const MONTHS = [
  "Jan",
  "Feb",
  "Mar",
  "Apr",
  "May",
  "Jun",
  "Jul",
  "Aug",
  "Sep",
  "Oct",
  "Nov",
  "Dec",
] as const;

/** "Wed, 16 Sep", identically on a server and in any browser. */
function marketDate(date: string): string | null {
  const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(date);
  if (!match) return null;
  const year = Number(match[1]);
  const month = Number(match[2]);
  const day = Number(match[3]);
  if (month < 1 || month > 12 || day < 1 || day > 31) return null;

  const weekday =
    WEEKDAYS[new Date(Date.UTC(year, month - 1, day)).getUTCDay()];
  return `${weekday}, ${day} ${MONTHS[month - 1]}`;
}

export function nextDepartureSentence(
  experience: Pick<ExperienceSummary, "nextAvailable" | "seatsOnNextDisplay">,
): NextDeparture {
  if (!experience.nextAvailable) {
    /*
      The absence IS the message, and it is the most useful sentence this card
      can carry. Ninety days is the contract's own bound and is stated rather
      than implied, because "no dates" alone reads as a fault in the app.
    */
    const text = "No dates in the next 90 days";
    return { bookable: false, short: text, full: text, seats: null };
  }

  const when = marketDate(experience.nextAvailable);
  const seats = experience.seatsOnNextDisplay ?? null;

  /*
    A date the server sent in a shape this cannot read is treated exactly like
    no date at all. Saying "Next" followed by nothing, or echoing a raw
    `2026-09-16`, would both be worse than the honest sentence.
  */
  if (!when) {
    const text = "No dates in the next 90 days";
    return { bookable: false, short: text, full: text, seats: null };
  }

  return {
    bookable: true,
    short: when,
    full: seats ? `${when} · ${seats}` : when,
    seats,
  };
}
