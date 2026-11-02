import { describe, expect, it } from "vitest";
import { NetworkError, YuvoyError } from "@/lib/api/errors";
import {
  checkInDone,
  checkInRefusal,
  codeFromHash,
  codeReady,
  doorTime,
  normaliseCode,
} from "./check-in";
import { DOOR_WORDS as D } from "./door-words";

function refused(
  status: number,
  code: string,
  message = "",
  details?: Record<string, unknown>,
) {
  return new YuvoyError({ status, code, message, details });
}

describe("normaliseCode and codeReady", () => {
  it("drops spaces and hyphens and writes capitals", () => {
    expect(normaliseCode("k7qm-2xpa")).toBe("K7QM2XPA");
    expect(normaliseCode(" K7QM 2XPA ")).toBe("K7QM2XPA");
    expect(normaliseCode("k7-qm 2x-pa")).toBe("K7QM2XPA");
  });

  it("turns the button on at eight code characters, up to twelve", () => {
    expect(codeReady("K7QM-2XP")).toBe(false);
    expect(codeReady("k7qm2xpa")).toBe(true);
    expect(codeReady("K7QM-2XPA")).toBe(true);
    expect(codeReady("K7QM2XPAK7QM")).toBe(true);
    expect(codeReady("K7QM2XPAK7QM2")).toBe(false);
    expect(codeReady("")).toBe(false);
  });

  it("keeps the button off for characters a code cannot have", () => {
    expect(codeReady("K7QM.2XPA")).toBe(false);
    expect(codeReady("K7QM2XP?")).toBe(false);
  });
});

describe("codeFromHash", () => {
  it("reads the code after the #, as it is sent", () => {
    expect(codeFromHash("#K7QM2XPA")).toBe("K7QM2XPA");
    expect(codeFromHash("#abcd-2345")).toBe("ABCD2345");
    expect(codeFromHash("abcd2345")).toBe("ABCD2345");
    expect(codeFromHash("#abcd%202345")).toBe("ABCD2345");
  });

  it("is null when empty or not a code", () => {
    expect(codeFromHash("")).toBeNull();
    expect(codeFromHash("#")).toBeNull();
    expect(codeFromHash("#K7QM")).toBeNull();
    expect(codeFromHash("#top")).toBeNull();
    expect(codeFromHash("#a.b.c.d.e.f.g.h")).toBeNull();
    expect(codeFromHash("#%E0%A4%A")).toBeNull();
  });
});

describe("checkInDone", () => {
  const answer = {
    firstName: "Asha",
    eventTitle: "Sample Sunday Run",
    checkedInAt: "2026-11-01T13:12:00Z",
    alreadyCheckedIn: false,
  };

  it("names the person, with the event under it", () => {
    expect(checkInDone(answer)).toEqual({
      title: "Asha is checked in",
      sub: "Sample Sunday Run",
    });
  });

  it("says Checked in when there is no name", () => {
    expect(checkInDone({ ...answer, firstName: "" }).title).toBe("Checked in");
    expect(checkInDone({ ...answer, firstName: "  " }).title).toBe(
      "Checked in",
    );
  });

  it("says when an already used code was first used, in India's time", () => {
    // 13:12 UTC is 18:42 in Asia/Kolkata.
    expect(checkInDone({ ...answer, alreadyCheckedIn: true })).toEqual({
      title: "Already checked in at 18:42",
      sub: "Sample Sunday Run",
    });
    // Past midnight in India the day changes, and the time reads 00:15.
    expect(doorTime("2026-11-01T18:45:00Z")).toBe("00:15");
  });

  it("leaves the time out when it does not parse", () => {
    expect(
      checkInDone({ ...answer, alreadyCheckedIn: true, checkedInAt: "soon" })
        .title,
    ).toBe("Already checked in");
  });
});

describe("checkInRefusal", () => {
  it("shows the API's sentence for a code it refused, and its own when none came", () => {
    const notOurs = "This code is not for one of your events.";
    expect(checkInRefusal(refused(404, "not_found", notOurs))).toEqual({
      kind: "refused",
      message: notOurs,
    });
    expect(checkInRefusal(refused(404, "not_found"))).toEqual({
      kind: "refused",
      message: D.notFound,
    });
    expect(
      checkInRefusal(
        refused(400, "invalid_input", "We could not read that code.", {
          code: "the eight characters on the Going card, like K7QM-2XPA",
        }),
      ),
    ).toEqual({ kind: "refused", message: "We could not read that code." });
    expect(checkInRefusal(refused(400, "invalid_input"))).toEqual({
      kind: "refused",
      message: D.badCode,
    });
  });

  it("reads own code and not today", () => {
    expect(
      checkInRefusal(
        refused(
          409,
          "own_code",
          "You can't check yourself in. Ask another helper at the door.",
        ),
      ),
    ).toEqual({ kind: "refused", message: D.ownCode });
    expect(checkInRefusal(refused(409, "own_code"))).toEqual({
      kind: "refused",
      message: D.ownCode,
    });
    expect(
      checkInRefusal(
        refused(409, "check_in_not_today", "This code is for Sat 24 Oct.", {
          validOn: "2026-10-24",
        }),
      ),
    ).toEqual({ kind: "refused", message: "This code is for Sat 24 Oct." });
    expect(
      checkInRefusal(
        refused(409, "check_in_not_today", "", { validOn: "2026-10-24" }),
      ),
    ).toEqual({ kind: "refused", message: "This code is for Sat 24 Oct." });
    expect(checkInRefusal(refused(409, "check_in_not_today"))).toEqual({
      kind: "refused",
      message: D.notTodayNoDay,
    });
  });

  it("reads both 429s as refused with their sentence", () => {
    const misses = "Too many codes did not match. Try again in an hour.";
    expect(checkInRefusal(refused(429, "rate_limited", misses))).toEqual({
      kind: "refused",
      message: misses,
    });
    expect(checkInRefusal(refused(429, "rate_limited"))).toEqual({
      kind: "refused",
      message: D.tooFast,
    });
  });

  it("reads the age step, the sign-in and the pause", () => {
    expect(
      checkInRefusal(
        refused(403, "adult_confirmation_required", D.adultsOnly),
      ),
    ).toEqual({ kind: "age" });
    expect(
      checkInRefusal(refused(401, "unauthorized", D.signIn)),
    ).toEqual({ kind: "signIn" });
    expect(
      checkInRefusal(refused(503, "organisers_paused", "Paused for now.")),
    ).toEqual({ kind: "paused", message: "Paused for now." });
    expect(checkInRefusal(refused(503, "organisers_paused"))).toEqual({
      kind: "paused",
      message: D.paused,
    });
  });

  it("reads no answer as offline, with the phone's line", () => {
    expect(checkInRefusal(new NetworkError())).toEqual({
      kind: "offline",
      message: "No signal. Try again when the signal is back.",
    });
  });

  it("reads a fault, another 503 and anything unknown as broken", () => {
    const broken = { kind: "broken", message: D.broken };
    expect(checkInRefusal(refused(500, "internal_error", "boom"))).toEqual(
      broken,
    );
    expect(checkInRefusal(refused(503, "unavailable", "x"))).toEqual(broken);
    expect(checkInRefusal(refused(409, "conflict"))).toEqual(broken);
    expect(
      checkInRefusal(refused(404, "internal_error", "The server answered 404.")),
    ).toEqual(broken);
    expect(checkInRefusal(new Error("boom"))).toEqual(broken);
    expect(checkInRefusal(undefined)).toEqual(broken);
  });
});
