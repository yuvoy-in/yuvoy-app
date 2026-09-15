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
 * every `toLocale*` call in this repository. `Intl.DateTimeFormat` with an
 * explicit `timeZone` is the sanctioned route and the one `formatMarketTime`
 * already uses.
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

const MARKET_TIMEZONE = "Asia/Kolkata";

/**
 * "Thu, 17 Sep" in the market's zone.
 *
 * The date arrives as a plain `YYYY-MM-DD` in the market's own calendar, so it
 * is anchored at that zone's midnight before formatting. Parsing it as a bare
 * date string would put it at UTC midnight, which is the previous evening in
 * the Andamans and prints the wrong day for every departure.
 */
function marketDate(date: string): string {
  return new Intl.DateTimeFormat("en-IN", {
    weekday: "short",
    day: "numeric",
    month: "short",
    timeZone: MARKET_TIMEZONE,
  }).format(new Date(`${date}T00:00:00+05:30`));
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

  return {
    bookable: true,
    short: when,
    full: seats ? `${when} · ${seats}` : when,
    seats,
  };
}
