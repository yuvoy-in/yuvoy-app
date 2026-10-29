import { describe, it, expect } from "vitest";
import {
  CREATOR_WORDS,
  latestBooking,
  linkCounts,
  shareText,
  withLink,
  type CreatorLink,
} from "./creator-words";

/** One link as the API sends it, with only what a test varies. */
function link(over: Partial<CreatorLink> = {}): CreatorLink {
  return {
    code: "C-K7QM2XPA",
    link: "https://app.yuvoy.in/go/C-K7QM2XPA",
    target: {
      kind: "experience",
      id: "8d2f6a10-3c4b-4e5f-8a9b-0c1d2e3f4a52",
      slug: "snorkel-elephant-beach",
      title: "Snorkel trip to Elephant Beach",
    },
    createdAt: "2026-10-21T04:00:00Z",
    opens30Days: 4,
    opensTotal: 12,
    bookings: 2,
    ...over,
  };
}

/**
 * The words of a share link (yuvoy-app#207, from yuvoy-mobile#389).
 *
 * The property worth defending is what is NOT said: a link is counts only,
 * never an amount, an earning or anybody else's name or trip date.
 */
describe("a link's counts", () => {
  it("reads opens in the last 30 days, opens in all, and bookings", () => {
    expect(linkCounts(link())).toBe(
      "4 opens in the last 30 days · 12 in all · 2 bookings",
    );
  });

  it("uses the singular where there is one", () => {
    expect(
      linkCounts(link({ opens30Days: 1, opensTotal: 1, bookings: 1 })),
    ).toBe("1 open in the last 30 days · 1 in all · 1 booking");
  });

  it("says nought plainly for a link nobody has opened", () => {
    expect(
      linkCounts(link({ opens30Days: 0, opensTotal: 0, bookings: 0 })),
    ).toBe("0 opens in the last 30 days · 0 in all · 0 bookings");
  });
});

describe("the latest booking", () => {
  it("is the day and the month, from our own month table", () => {
    expect(latestBooking(link({ lastBookingOn: "2026-10-21" }))).toBe(
      "Latest booking 21 Oct",
    );
    // September is the month `Intl` spells two ways (yuvoy-app#67).
    expect(latestBooking(link({ lastBookingOn: "2026-09-03" }))).toBe(
      "Latest booking 3 Sep",
    );
  });

  it("draws no line when nobody has booked through it", () => {
    expect(latestBooking(link())).toBeNull();
  });

  it("draws no line for a day it cannot read, rather than a raw value", () => {
    expect(latestBooking(link({ lastBookingOn: "21/10/2026" }))).toBeNull();
  });
});

describe("the share text", () => {
  it("names what they went on and carries the link as sent", () => {
    expect(shareText(link())).toBe(
      "I went on Snorkel trip to Elephant Beach with Yuvoy. Have a look: https://app.yuvoy.in/go/C-K7QM2XPA",
    );
  });
});

describe("a link put into the list", () => {
  it("goes on top when it is new, since the list is newest first", () => {
    const older = link({ code: "C-OLDER111" });
    const made = link({ code: "C-NEWER222" });
    expect(withLink([older], made).map((l) => l.code)).toEqual([
      "C-NEWER222",
      "C-OLDER111",
    ]);
  });

  it("replaces itself in place when it is the one they already had", () => {
    const first = link({ code: "C-FIRST111" });
    const had = link({ code: "C-HAD22222", bookings: 0 });
    const again = { ...had, bookings: 3 };
    const items = withLink([first, had], again);
    expect(items.map((l) => l.code)).toEqual(["C-FIRST111", "C-HAD22222"]);
    expect(items[1].bookings).toBe(3);
  });
});

describe("what the words never say", () => {
  it("names no money, no earning and no payout", () => {
    /*
      Case 13 of yuvoy-mobile#389. The intro's "does not pay" is the one
      mention, and it says the opposite of a payout.
    */
    const all = JSON.stringify(CREATOR_WORDS);
    expect(all).not.toMatch(/₹|\brs\.?\s?\d|earn|commission|payout|reward/i);
    expect(all.match(/\bpay\b/gi)).toHaveLength(1);
  });

  it("uses no long dash anywhere", () => {
    const all = [
      JSON.stringify(CREATOR_WORDS),
      linkCounts(link()),
      shareText(link()),
    ].join(" ");
    // Built from the code points, so this file does not carry one either.
    const long = new RegExp(`[${String.fromCharCode(0x2013, 0x2014)}]`);
    expect(all).not.toMatch(long);
  });
});
