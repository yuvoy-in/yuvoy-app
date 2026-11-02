import { describe, it, expect } from "vitest";
import {
  LANGUAGES,
  ME_WORDS,
  canSetVisibility,
  cheersLine,
  endsLine,
  headerLine,
  lifeDate,
  progressLine,
  proofLine,
} from "./words";
import type { BadgeProgress, LifeEntry } from "./types";

/**
 * Me's words (yuvoy-mobile#444), the same as the phone's. A string here that
 * drifts from yuvoy-mobile packages/core/src/me/words.ts is a product change
 * and goes to Teja on the issue first.
 */

function entry(over: Partial<LifeEntry> = {}): LifeEntry {
  return {
    entryId: "trip:b0a11000-0000-4000-8000-000000000001",
    kind: "trip",
    title: "Sunrise trek to Kalavantin",
    happenedAt: "2026-09-16T01:30:00.000Z",
    proof: "booked",
    checked: false,
    visibility: "only_me",
    cheers: 0,
    ...over,
  } as LifeEntry;
}

function progress(over: Partial<BadgeProgress> = {}): BadgeProgress {
  return {
    key: "early_bird",
    name: "Early bird",
    emoji: "🌅",
    description: "Two trips that start before seven",
    have: 1,
    need: 2,
    ...over,
  } as BadgeProgress;
}

describe("where an entry came from", () => {
  it("names every proof the contract has", () => {
    expect(proofLine(entry({ proof: "booked" }))).toBe("Booked with Yuvoy");
    expect(proofLine(entry({ proof: "said_you_went", kind: "went" }))).toBe(
      "You said you went",
    );
    expect(proofLine(entry({ proof: "with_friends", kind: "plan" }))).toBe(
      "With friends",
    );
    expect(proofLine(entry({ proof: "table_check_in", kind: "table" }))).toBe(
      "Checked in at a table",
    );
  });

  it("says a trip's check-in is the crew's, and any other is its own", () => {
    expect(proofLine(entry({ kind: "trip", proof: "checked_in" }))).toBe(
      "Booked with Yuvoy · Checked in by the crew",
    );
    expect(proofLine(entry({ kind: "went", proof: "checked_in" }))).toBe(
      "Checked in",
    );
  });

  it("has no line for a proof a newer API sends, so the entry is not drawn", () => {
    expect(proofLine({ kind: "trip", proof: "photo_upload" })).toBeNull();
  });
});

describe("cheers on the owner's own entries", () => {
  it("says nothing at none, and counts in the singular at one", () => {
    expect(cheersLine(0)).toBeNull();
    expect(cheersLine(-1)).toBeNull();
    expect(cheersLine(Number.NaN)).toBeNull();
    expect(cheersLine(1)).toBe("1 cheer");
    expect(cheersLine(2)).toBe("2 cheers");
  });
});

describe("the header row", () => {
  it("reads the three counts in the issue's order", () => {
    expect(headerLine({ done: 4, saved: 12, badges: 2 })).toBe(
      "Done 4 · Bucket list 12 · Badges 2",
    );
  });

  it("never shows a negative or a NaN", () => {
    expect(headerLine({ done: -1, saved: Number.NaN, badges: 0 })).toBe(
      "Done 0 · Bucket list 0 · Badges 0",
    );
  });
});

describe("dates", () => {
  it("dates an entry by the market's day, with the year", () => {
    // 20:00 UTC on the 15th is 01:30 on the 16th in Asia/Kolkata.
    expect(lifeDate("2026-09-15T20:00:00.000Z")).toBe("16 Sep 2026");
    expect(lifeDate("not a date")).toBe("");
  });

  it("says when a season ends, from a plain date", () => {
    expect(endsLine("2026-09-30")).toBe("Ends 30 Sep 2026");
    expect(endsLine(undefined)).toBeNull();
    expect(endsLine("30/09/2026")).toBeNull();
  });
});

describe("a badge on its way", () => {
  it("says how far it has got", () => {
    expect(progressLine(progress({ have: 1, need: 2 }))).toBe("1 of 2");
    expect(progressLine(progress({ have: -3, need: 2 }))).toBe("0 of 2");
  });

  it("adds a season's last day", () => {
    expect(
      progressLine(progress({ have: 1, need: 3, endsOn: "2026-09-30" })),
    ).toBe("1 of 3 · Ends 30 Sep 2026");
  });
});

describe("who sees an entry", () => {
  it("offers the control on a trip, a table and a went entry, never a plan", () => {
    expect(canSetVisibility(entry({ kind: "trip" }))).toBe(true);
    expect(canSetVisibility(entry({ kind: "table" }))).toBe(true);
    expect(
      canSetVisibility(
        entry({
          kind: "went",
          eventId: "e7e10000-0000-4000-8000-000000000003",
        }),
      ),
    ).toBe(true);
    expect(canSetVisibility(entry({ kind: "plan" }))).toBe(false);
  });

  it("offers none on a went entry with no event to change it by", () => {
    expect(canSetVisibility(entry({ kind: "went", eventId: undefined }))).toBe(
      false,
    );
  });
});

describe("the words", () => {
  it("lists the four languages in the issue's order", () => {
    expect(LANGUAGES.map((l) => l.key)).toEqual(["en", "hi", "te", "kn"]);
    expect(LANGUAGES.map((l) => l.label)).toEqual([
      "English",
      "Hindi",
      "Telugu",
      "Kannada",
    ]);
  });

  it("asks about the event by its name", () => {
    expect(ME_WORDS.didYouGo("Open mic at Lamakaan")).toBe(
      "Did you go to Open mic at Lamakaan?",
    );
    expect(ME_WORDS.newBadge("Explorer")).toBe("New badge: Explorer");
  });

  it("says the same two failure lines the phone does", () => {
    expect(ME_WORDS.changeFailed).toBe(
      "We could not change that just now. Try again.",
    );
    expect(ME_WORDS.saveFailed).toBe(
      "We could not save that just now. Try again.",
    );
    expect(ME_WORDS.lifeListError).toBe(
      "We couldn't load your life list just now. Everything else here still works.",
    );
  });
});
