import { describe, it, expect } from "vitest";
import { YuvoyError } from "@/lib/api/errors";
import {
  dateAlertWaits,
  draftDateRange,
  draftDayHeading,
  draftDays,
  trigoCardListed,
  trigoCheckLook,
  trigoListCardPath,
  trigoListDownSentence,
  trigoListFault,
  trigoListSentence,
  withoutDateAlert,
  withoutTripDraft,
} from "./lists";
import { TRIGO_LISTS_API_WORDS } from "./lists-words";
import {
  FOUND_CARD,
  FOUND_ID,
  GONE_CARD,
  LISTED_CARD,
  ODD_CARD,
  UNTITLED_EVENT_CARD,
  defaultAlerts,
  defaultDrafts,
  manyDrafts,
} from "../../../mocks/trigo-list-fixtures";

/** The rules of the date alerts and the trip drafts (yuvoy-app#220). */

const failed = (status: number, message = "") =>
  new YuvoyError({ code: "x", message, status });

describe("where a card opens", () => {
  it("opens a listing at /e/{slug} and a found event at /f/{uuid}", () => {
    expect(trigoListCardPath(LISTED_CARD)).toBe("/e/try-dive-nemo-reef");
    expect(trigoListCardPath(FOUND_CARD)).toBe(`/f/${FOUND_ID}`);
  });

  it("takes the cardId and never the href", () => {
    expect(FOUND_CARD.href).toMatch(/^https:/);
    expect(trigoListCardPath(FOUND_CARD)).toBe(`/f/${FOUND_ID}`);
  });

  it.each([
    ["venue:ross-island"],
    ["exp:"],
    ["exp:Bad Slug"],
    ["exp:../admin"],
    ["item:not-a-uuid"],
    ["item:"],
    [""],
  ])("opens nothing for %j", (cardId) => {
    expect(trigoListCardPath({ cardId })).toBeNull();
  });

  it("writes a found event's id in lower case", () => {
    expect(
      trigoListCardPath({ cardId: `item:${FOUND_ID.toUpperCase()}` }),
    ).toBe(`/f/${FOUND_ID}`);
  });
});

describe("which cards are still listed", () => {
  it("is a card that is available and has a title", () => {
    expect(trigoCardListed(LISTED_CARD)).toBe(true);
    expect(trigoCardListed(ODD_CARD)).toBe(true);
  });

  it("is not a card that is gone, or a found event whose title is gone", () => {
    expect(trigoCardListed(GONE_CARD)).toBe(false);
    expect(trigoCardListed(UNTITLED_EVENT_CARD)).toBe(false);
    expect(trigoCardListed({ ...LISTED_CARD, title: "   " })).toBe(false);
  });
});

describe("the check line's look", () => {
  it("is a listing, checked by us, or found by Trigo", () => {
    expect(trigoCheckLook(LISTED_CARD)).toBe("listing");
    expect(trigoCheckLook(FOUND_CARD)).toBe("found");
    expect(
      trigoCheckLook({ ...FOUND_CARD, checkLabel: "Checked by Yuvoy · 2 Nov" }),
    ).toBe("checked");
  });
});

describe("date alerts", () => {
  it("waits until it has told, and only then", () => {
    const [waiting, fired] = defaultAlerts();
    expect(dateAlertWaits(waiting)).toBe(true);
    expect(dateAlertWaits(fired)).toBe(false);
  });

  it("takes one alert out by its id, in any case", () => {
    const alerts = defaultAlerts();
    const left = withoutDateAlert(alerts, alerts[0].id.toUpperCase());
    expect(left.map((a) => a.id)).toEqual([alerts[1].id, alerts[2].id]);
  });

  it("leaves the list as it was for an id it does not hold", () => {
    const alerts = defaultAlerts();
    expect(withoutDateAlert(alerts, "nope")).toEqual(alerts);
  });
});

describe("trip drafts", () => {
  it("takes one draft out by its id", () => {
    const drafts = defaultDrafts();
    expect(withoutTripDraft(drafts, drafts[0].id)).toEqual([drafts[1]]);
  });

  it("keeps only the days with something on them, in order", () => {
    const [draft] = manyDrafts();
    expect(draft.days).toHaveLength(14);
    expect(draftDays(draft).map((d) => d.date)).toEqual([
      "2026-12-01",
      "2026-12-07",
      "2026-12-14",
    ]);
  });

  it("heads a day with its weekday and date, or nothing when it is bad", () => {
    expect(draftDayHeading("2026-11-14")).toBe("Sat, 14 Nov");
    expect(draftDayHeading("2026-02-30")).toBe("");
    expect(draftDayHeading("soon")).toBe("");
  });

  it("gives the range, one date for a day trip, nothing when either is bad", () => {
    const [weekend, dayTrip] = defaultDrafts();
    expect(draftDateRange(weekend)).toBe("14 Nov to 16 Nov");
    expect(draftDateRange(dayTrip)).toBe("20 Nov");
    expect(draftDateRange({ ...weekend, dateTo: "later" })).toBe("");
  });
});

describe("what a failure means", () => {
  it.each([
    [401, "sign-in"],
    [404, "gone"],
    [503, "down"],
    [500, "other"],
    [429, "other"],
  ] as const)("%i is %s", (status, fault) => {
    expect(trigoListFault(failed(status))).toBe(fault);
  });

  it("is other for anything that is not the API's answer", () => {
    expect(trigoListFault(new TypeError("Failed to fetch"))).toBe("other");
    expect(trigoListFault(undefined)).toBe("other");
  });

  it("shows the API's own sentence, or ours when it sent none", () => {
    expect(trigoListSentence(failed(404, "Gone."), "Ours.")).toBe("Gone.");
    expect(trigoListSentence(failed(404, "  "), "Ours.")).toBe("Ours.");
    expect(trigoListSentence(new Error("raw"), "Ours.")).toBe("Ours.");
    expect(trigoListDownSentence(failed(503))).toBe(
      TRIGO_LISTS_API_WORDS.unavailable,
    );
  });
});
