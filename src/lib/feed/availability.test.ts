import { describe, it, expect } from "vitest";
import { nextDepartureSentence } from "./availability";

/**
 * The guard for a defect that reached production.
 *
 * The date was formatted with `Intl.DateTimeFormat`, which takes its month
 * abbreviation from whatever CLDR the RUNTIME carries: Node renders "Sept" and
 * WebKit renders "Sep". The server HTML and the client's first render therefore
 * disagreed by one character, and React threw a hydration mismatch (#418) on
 * every reel with a departure.
 *
 * Nothing in the suite could see it, because each half was individually correct
 * and the two halves only disagree across two different ICU builds. It was
 * found by reading the console on the live site.
 *
 * So these assert the EXACT string. A test that accepted `/Sep/` would pass on
 * both spellings and would have shipped this too.
 */
describe("the departure sentence", () => {
  it("formats a date identically in every runtime", () => {
    expect(nextDepartureSentence({ nextAvailable: "2026-09-16" }).short).toBe(
      "Wed, 16 Sep",
    );
    /* September is the month the two ICU builds disagree about, so it is
       checked by name rather than left to a loop over twelve. */
    expect(nextDepartureSentence({ nextAvailable: "2026-09-01" }).short).toBe(
      "Tue, 1 Sep",
    );
  });

  it("gets the weekday right across a month and a year boundary", () => {
    // UTC arithmetic, so this cannot drift with the machine's own zone.
    expect(nextDepartureSentence({ nextAvailable: "2026-08-31" }).short).toBe(
      "Mon, 31 Aug",
    );
    expect(nextDepartureSentence({ nextAvailable: "2027-01-01" }).short).toBe(
      "Fri, 1 Jan",
    );
    expect(nextDepartureSentence({ nextAvailable: "2028-02-29" }).short).toBe(
      "Tue, 29 Feb",
    );
  });

  it("states the absence rather than staying quiet about it", () => {
    /*
      The contract: absent means nothing is bookable in the next ninety days,
      NOT "we did not check". A card silent about availability is what causes
      the tap that ends in "no dates".
    */
    const none = nextDepartureSentence({});
    expect(none.bookable).toBe(false);
    expect(none.short).toBe("No dates in the next 90 days");
    expect(none.seats).toBeNull();
  });

  it("prints the server's seat sentence verbatim, or nothing", () => {
    /*
      Never re-derived from `seatsOnNext`. A client keeping its own threshold is
      a second copy of a rule the API owns, and the copy that drifts is the one
      that misstates a departure.
    */
    const withSeats = nextDepartureSentence({
      nextAvailable: "2026-09-16",
      seatsOnNextDisplay: "3 seats left",
    });
    expect(withSeats.full).toBe("Wed, 16 Sep · 3 seats left");
    expect(withSeats.seats).toBe("3 seats left");

    const without = nextDepartureSentence({ nextAvailable: "2026-09-16" });
    expect(without.full).toBe("Wed, 16 Sep");
    expect(without.seats).toBeNull();
  });

  it("treats an unreadable date as no date, rather than echoing it", () => {
    // Saying "Next" followed by nothing, or printing a raw 2026-09-16, would
    // both be worse than the honest sentence.
    for (const bad of ["", "2026-9-16", "16/09/2026", "2026-13-01", "nope"]) {
      const out = nextDepartureSentence({ nextAvailable: bad });
      expect(out.bookable, `"${bad}" was treated as a date`).toBe(false);
      expect(out.short).toBe("No dates in the next 90 days");
    }
  });
});
