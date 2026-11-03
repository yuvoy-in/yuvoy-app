import { describe, it, expect } from "vitest";
import {
  isNamed,
  markedSeen,
  meSettingsPatch,
  namedEntriesOf,
  nextNewBadge,
  toggledLanguages,
  visibilityRoute,
  withEntry,
  withQuestion,
  withoutQuestion,
  withSetting,
} from "./me-helpers";
import type { MySettings } from "./types";

/** The pure half of Me's hooks (yuvoy-mobile#444). */

const row = (entryId: string, kind = "trip", proof = "booked") => ({
  entryId,
  kind,
  proof,
});

describe("the life list's entries", () => {
  it("names only a known kind with a known proof", () => {
    expect(isNamed(row("trip:1"))).toBe(true);
    expect(isNamed(row("x:1", "badge"))).toBe(false);
    expect(isNamed(row("trip:1", "trip", "photo_upload"))).toBe(false);
  });

  it("keeps every page in order, each entry once, and drops what it cannot name", () => {
    const pages = [
      { entries: [row("trip:1"), row("went:2", "went", "said_you_went")] },
      {
        entries: [
          row("went:2", "went", "said_you_went"),
          row("trip:3", "trip", "photo_upload"),
          row("table:4", "table", "table_check_in"),
        ],
      },
    ];
    expect(namedEntriesOf(pages).map((e) => e.entryId)).toEqual([
      "trip:1",
      "went:2",
      "table:4",
    ]);
  });

  it("changes one entry wherever it sits and leaves the other pages alone", () => {
    const pages = [
      { entries: [{ entryId: "a", v: 1 }] },
      { entries: [{ entryId: "b", v: 1 }] },
    ];
    const after = withEntry(pages, "b", (e) => ({ ...e, v: 2 }));
    expect(after[1].entries[0].v).toBe(2);
    expect(after[0]).toBe(pages[0]);
  });
});

describe("which route changes who sees an entry", () => {
  it("sends a trip and a table by entry, a went entry by event, a plan nowhere", () => {
    expect(visibilityRoute({ kind: "trip" })).toBe("life-list");
    expect(visibilityRoute({ kind: "table" })).toBe("life-list");
    expect(visibilityRoute({ kind: "went", eventId: "e1" })).toBe("went");
    expect(visibilityRoute({ kind: "went" })).toBeNull();
    expect(visibilityRoute({ kind: "plan" })).toBeNull();
  });
});

describe("Did you go?", () => {
  const q = (eventId: string) => ({ eventId, title: eventId, startsAt: "" });
  const pages = [
    { didYouGo: [q("A"), q("b"), q("c")] },
    { didYouGo: [] as ReturnType<typeof q>[] },
  ];

  it("drops an answered question from the first page, by id in any case", () => {
    const after = withoutQuestion(pages, "B");
    expect(after[0].didYouGo.map((x) => x.eventId)).toEqual(["A", "c"]);
    expect(after[1]).toBe(pages[1]);
  });

  it("puts one back where it was, and never twice", () => {
    const dropped = withoutQuestion(pages, "b");
    const back = withQuestion(dropped, q("b"), 1);
    expect(back[0].didYouGo.map((x) => x.eventId)).toEqual(["A", "b", "c"]);
    expect(withQuestion(back, q("B"), 0)[0]).toBe(back[0]);
  });
});

describe("badges", () => {
  const first = { key: "first_step", seen: true };
  const explorer = { key: "explorer", seen: false };
  const owl = { key: "night_owl", seen: false };

  it("shows the first unseen badge, never one whose Nice is on its way", () => {
    expect(nextNewBadge([first, explorer, owl])).toBe(explorer);
    expect(nextNewBadge([first, explorer, owl], new Set(["explorer"]))).toBe(
      owl,
    );
    expect(nextNewBadge([first])).toBeNull();
  });

  it("marks only the keys sent as seen", () => {
    const after = markedSeen([first, explorer, owl], ["explorer", "other"]);
    expect(after).toEqual([first, { key: "explorer", seen: true }, owl]);
    expect(after[0]).toBe(first);
  });
});

describe("Me's two settings", () => {
  it("toggles a chip, in the chips' order, four at most", () => {
    expect(toggledLanguages(["en"], "hi")).toEqual(["en", "hi"]);
    expect(toggledLanguages(["hi"], "en")).toEqual(["en", "hi"]);
    expect(toggledLanguages(["en", "hi"], "en")).toEqual(["hi"]);
    expect(toggledLanguages(["en", "hi", "te", "kn"], "kn")).toEqual([
      "en",
      "hi",
      "te",
    ]);
  });

  it("sends only the field that changed", () => {
    expect(meSettingsPatch({ languages: ["en", "hi"] })).toEqual({
      languages: ["en", "hi"],
    });
    expect(meSettingsPatch({ showWomenOnlyTables: false })).toEqual({
      showWomenOnlyTables: false,
    });
  });

  it("draws one change over the rest of the settings untouched", () => {
    const was = {
      analyticsConsent: "granted",
      reminderEmails: true,
      didYouGoEmails: true,
      languages: ["en"],
      showWomenOnlyTables: true,
    } as unknown as MySettings;
    const after = withSetting(was, { showWomenOnlyTables: false });
    expect(after).toEqual({ ...was, showWomenOnlyTables: false });
    expect(withSetting(was, { languages: ["en", "te"] }).languages).toEqual([
      "en",
      "te",
    ]);
  });
});
