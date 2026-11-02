import { describe, expect, it } from "vitest";
import { NetworkError, YuvoyError } from "@/lib/api/errors";
import type { PlaceDestination } from "@/lib/site/place-choice";
import {
  CLAIM_FIELD_WORDS,
  CLUB_API_WORDS,
  CLUB_REPORT_WORDS,
  CLUB_WORDS,
  PEOPLE_ERROR_WORDS,
} from "./club-words";
import {
  PEOPLE_CLOSED_LINE,
  PeopleClosedError,
  claimBody,
  claimMissing,
  clubCardLabel,
  clubFailure,
  clubLabel,
  clubMeta,
  clubPlaces,
  clubReportBody,
  reportNeedsNote,
  type Club,
  type ClubAction,
} from "./clubs";

/*
  The groups directory's logic (yuvoy-mobile#386, web backfill). Nothing here
  reads the clock: every input is fixed.
*/

const refused = (
  status: number,
  code: string,
  details?: Record<string, unknown>,
  message = "",
) => new YuvoyError({ code, status, message, details });

const club: Club = {
  clubId: "c10b0000-0000-4000-8000-000000000002",
  slug: "havelock-reef-runners",
  destinationKey: "andaman/havelock",
  name: "Havelock Reef Runners",
  what: "Running club",
  category: "sports",
  meets: "Sundays, 6 am",
  area: "Govind Nagar",
  emoji: "🏃",
  sourceName: "Havelock Reef Runners",
  sourceUrl: "https://reef-runners.example/",
  onYuvoy: false,
  claimable: true,
};

const place = (key: string, name: string): PlaceDestination => ({
  key,
  name,
  kind: "local",
  visibleTo: "all",
});

const havelock = place("andaman/havelock", "Havelock");
const neil = place("andaman/neil", "Neil");
const goa = place("goa/panaji", "Panaji");

const emptyForm = { roleText: "", contactEmail: "", proofUrl: "", note: "" };

describe("clubMeta", () => {
  it("joins what, meets and area", () => {
    expect(clubMeta(club)).toBe("Running club · Sundays, 6 am · Govind Nagar");
  });

  it("leaves out a null part with its dot", () => {
    expect(clubMeta({ what: "Trek group", meets: null, area: null })).toBe(
      "Trek group",
    );
    expect(clubMeta({ what: "Trek group", meets: null, area: "Beach 7" })).toBe(
      "Trek group · Beach 7",
    );
  });

  it("leaves out a blank part and trims the rest", () => {
    expect(
      clubMeta({ what: "  Book club ", meets: "   ", area: "Radhanagar" }),
    ).toBe("Book club · Radhanagar");
  });
});

describe("clubLabel", () => {
  it("says On Yuvoy once the group is claimed", () => {
    expect(clubLabel({ onYuvoy: true })).toBe(CLUB_WORDS.onYuvoy);
  });

  it("says Not on Yuvoy yet before that", () => {
    expect(clubLabel({ onYuvoy: false })).toBe(CLUB_WORDS.notOnYuvoy);
  });
});

describe("clubCardLabel", () => {
  it("reads the card in the order it is drawn, without the emoji", () => {
    const label = clubCardLabel(club);
    expect(label).toBe(
      [
        "Havelock Reef Runners",
        "Running club · Sundays, 6 am · Govind Nagar",
        CLUB_WORDS.from("Havelock Reef Runners"),
        CLUB_WORDS.notOnYuvoy,
      ].join(", "),
    );
    expect(label).not.toContain("🏃");
  });
});

describe("clubPlaces", () => {
  const markets = [
    { destinations: [havelock, neil] },
    { destinations: [goa, havelock] },
  ];

  it("lists every place once, in the list's order", () => {
    expect(clubPlaces(markets, null).map((d) => d.key)).toEqual([
      "andaman/havelock",
      "andaman/neil",
      "goa/panaji",
    ]);
  });

  it("moves the place picked last to the front", () => {
    expect(
      clubPlaces(markets, { destination: "goa/panaji" }).map((d) => d.key),
    ).toEqual(["goa/panaji", "andaman/havelock", "andaman/neil"]);
  });

  it("moves nothing for a pick the list does not have", () => {
    expect(
      clubPlaces(markets, { destination: "kerala/kochi" }).map((d) => d.key),
    ).toEqual(["andaman/havelock", "andaman/neil", "goa/panaji"]);
  });

  it("moves nothing for a pick with no town", () => {
    expect(
      clubPlaces(markets, { destination: null }).map((d) => d.key),
    ).toEqual(["andaman/havelock", "andaman/neil", "goa/panaji"]);
    expect(clubPlaces(markets, {}).map((d) => d.key)).toEqual([
      "andaman/havelock",
      "andaman/neil",
      "goa/panaji",
    ]);
  });

  it("is empty for an empty list", () => {
    expect(clubPlaces([], { destination: "andaman/havelock" })).toEqual([]);
  });
});

describe("claimBody", () => {
  it("trims every field", () => {
    expect(
      claimBody({
        roleText: "  I run it ",
        contactEmail: " runs@reef-runners.example ",
        proofUrl: " https://reef-runners.example/team ",
        note: " Ask for Asha. ",
      }),
    ).toEqual({
      roleText: "I run it",
      contactEmail: "runs@reef-runners.example",
      proofUrl: "https://reef-runners.example/team",
      note: "Ask for Asha.",
    });
  });

  it("leaves out an empty proof link and note", () => {
    expect(
      claimBody({
        roleText: "Organiser",
        contactEmail: "a@reef-runners.example",
        proofUrl: "   ",
        note: "",
      }),
    ).toEqual({ roleText: "Organiser", contactEmail: "a@reef-runners.example" });
  });
});

describe("claimMissing", () => {
  it("names both required fields when they are empty", () => {
    expect(claimMissing(emptyForm)).toEqual({
      roleText: CLAIM_FIELD_WORDS.roleText,
      contactEmail: CLAIM_FIELD_WORDS.contactEmail,
    });
  });

  it("counts spaces alone as empty", () => {
    expect(
      claimMissing({ ...emptyForm, roleText: "  ", contactEmail: "a@b.example" }),
    ).toEqual({ roleText: CLAIM_FIELD_WORDS.roleText });
  });

  it("is empty once both are typed, whatever the optional two hold", () => {
    expect(
      claimMissing({
        ...emptyForm,
        roleText: "Organiser",
        contactEmail: "a@b.example",
      }),
    ).toEqual({});
  });
});

describe("reportNeedsNote", () => {
  it("asks for a note on other with none", () => {
    expect(reportNeedsNote("other", "")).toBe(true);
    expect(reportNeedsNote("other", "   ")).toBe(true);
  });

  it("is happy with a note on other", () => {
    expect(reportNeedsNote("other", "It closed in 2024.")).toBe(false);
  });

  it("never asks on the other reasons, or before a reason", () => {
    expect(reportNeedsNote("wrong_details", "")).toBe(false);
    expect(reportNeedsNote("not_a_real_group", "")).toBe(false);
    expect(reportNeedsNote("offensive", "")).toBe(false);
    expect(reportNeedsNote(null, "")).toBe(false);
  });
});

describe("clubReportBody", () => {
  it("sends the reason alone with no note", () => {
    expect(clubReportBody("wrong_details", "  ")).toEqual({
      reason: "wrong_details",
    });
  });

  it("sends the note trimmed", () => {
    expect(clubReportBody("other", "  It closed. ")).toEqual({
      reason: "other",
      note: "It closed.",
    });
  });
});

describe("clubFailure", () => {
  const actions: ClubAction[] = ["claim", "removal", "report"];

  it("says no signal for a network failure", () => {
    for (const action of actions) {
      expect(clubFailure(action, new NetworkError())).toEqual({
        kind: "say",
        line: PEOPLE_ERROR_WORDS.noSignal,
      });
    }
  });

  it("says our fault for something that is not an API answer", () => {
    expect(clubFailure("claim", new Error("boom"))).toEqual({
      kind: "say",
      line: PEOPLE_ERROR_WORDS.fault,
    });
    expect(clubFailure("report", undefined)).toEqual({
      kind: "say",
      line: PEOPLE_ERROR_WORDS.fault,
    });
  });

  it("is gone on a 404 with People open, always in our words", () => {
    // The API's 404 message can say People is not open; the release read
    // again has said it is, so the not-there line is ours.
    for (const action of actions) {
      expect(
        clubFailure(
          action,
          refused(404, "not_found", undefined, "People isn't open to your account yet."),
        ),
      ).toEqual({ kind: "gone", line: CLUB_API_WORDS.gone });
      expect(clubFailure(action, refused(404, "not_found"))).toEqual({
        kind: "gone",
        line: CLUB_API_WORDS.gone,
      });
    }
  });

  it("is People closed when the release read again after a 404 is closed", () => {
    for (const action of actions) {
      expect(clubFailure(action, new PeopleClosedError())).toEqual({
        kind: "closed",
        line: PEOPLE_CLOSED_LINE,
      });
    }
  });

  it("puts a claim's refused fields on their fields", () => {
    expect(
      clubFailure(
        "claim",
        refused(400, "invalid_input", {
          roleText: "2 to 80 characters",
          proofUrl: "an https address",
          other: "x",
        }),
      ),
    ).toEqual({
      kind: "fields",
      fields: {
        roleText: CLAIM_FIELD_WORDS.roleText,
        proofUrl: CLAIM_FIELD_WORDS.proofUrl,
      },
    });
  });

  it("puts a report's refused note on the note", () => {
    expect(
      clubFailure("report", refused(400, "invalid_input", { note: "1 to 500" })),
    ).toEqual({
      kind: "fields",
      fields: { note: CLUB_REPORT_WORDS.noteTooLong },
    });
  });

  it("says our fault for a 400 that names no field of the form", () => {
    expect(
      clubFailure("removal", refused(400, "invalid_input", { reason: "x" })),
    ).toEqual({ kind: "say", line: PEOPLE_ERROR_WORDS.fault });
    expect(clubFailure("claim", refused(400, "invalid_input"))).toEqual({
      kind: "say",
      line: PEOPLE_ERROR_WORDS.fault,
    });
  });

  it("asks to sign in again on a 401", () => {
    for (const action of actions) {
      expect(clubFailure(action, refused(401, "unauthorized"))).toEqual({
        kind: "say",
        line: PEOPLE_ERROR_WORDS.signIn,
      });
    }
  });

  it("asks for the age on 403 adult_confirmation_required", () => {
    expect(
      clubFailure("claim", refused(403, "adult_confirmation_required")),
    ).toEqual({ kind: "age", line: PEOPLE_ERROR_WORDS.age });
  });

  it("says paused or ended on 403 people_paused, by the standing", () => {
    expect(
      clubFailure(
        "claim",
        refused(403, "people_paused", {
          standing: "restricted",
          until: "2026-08-26T00:00:00Z",
        }),
      ),
    ).toEqual({ kind: "paused", line: PEOPLE_ERROR_WORDS.paused });
    expect(
      clubFailure("claim", refused(403, "people_paused", { standing: "removed" })),
    ).toEqual({ kind: "paused", line: PEOPLE_ERROR_WORDS.ended });
  });

  it("asks for a first name on 409 name_required", () => {
    expect(clubFailure("claim", refused(409, "name_required"))).toEqual({
      kind: "name",
      line: PEOPLE_ERROR_WORDS.name,
    });
  });

  it("says waiting or claimed on a 409 conflict, by its reason", () => {
    expect(
      clubFailure("claim", refused(409, "conflict", { reason: "claim_waiting" })),
    ).toEqual({ kind: "waiting", line: CLUB_API_WORDS.claimWaiting });
    expect(
      clubFailure(
        "claim",
        refused(409, "conflict", { reason: "already_claimed" }, "Claimed."),
      ),
    ).toEqual({ kind: "claimed", line: "Claimed." });
    expect(
      clubFailure("claim", refused(409, "conflict", { reason: "already_claimed" })),
    ).toEqual({ kind: "claimed", line: CLUB_API_WORDS.alreadyClaimed });
  });

  it("says our fault for a 409 conflict with no reason it knows", () => {
    expect(clubFailure("claim", refused(409, "conflict"))).toEqual({
      kind: "say",
      line: PEOPLE_ERROR_WORDS.fault,
    });
  });

  it("gives each form its own words on a 429 with no message", () => {
    expect(clubFailure("claim", refused(429, "rate_limited"))).toEqual({
      kind: "limit",
      line: CLUB_API_WORDS.claimLimit,
    });
    expect(clubFailure("removal", refused(429, "rate_limited"))).toEqual({
      kind: "limit",
      line: CLUB_API_WORDS.removalLimit,
    });
    expect(clubFailure("report", refused(429, "rate_limited"))).toEqual({
      kind: "limit",
      line: CLUB_API_WORDS.reportLimit,
    });
  });

  it("keeps the API's 429 message when there is one", () => {
    expect(
      clubFailure("report", refused(429, "rate_limited", undefined, "Slow down.")),
    ).toEqual({ kind: "limit", line: "Slow down." });
  });

  it("says our fault for a 503", () => {
    for (const action of actions) {
      expect(clubFailure(action, refused(503, "internal_error"))).toEqual({
        kind: "say",
        line: PEOPLE_ERROR_WORDS.fault,
      });
    }
  });
});
