import { describe, it, expect } from "vitest";
import {
  formatInviteCode,
  inviteCodeProblem,
  inviteCodeProblemSentence,
  isInviteCode,
  normaliseInviteCode,
} from "./invite-code";

/**
 * Invite codes as typed (yuvoy-api#195).
 *
 * Redeeming is throttled to ten attempts an hour per number, so everything a
 * code can be checked for without the API is checked here: a typo must never
 * spend an attempt, and the sentence has to say which thing is wrong.
 */

describe("reading what was typed", () => {
  it("ignores case, spaces and the hyphen, as the contract says", () => {
    for (const typed of [
      "K7QM-4XRD",
      "k7qm 4xrd",
      "k7qm4xrd",
      " K7QM - 4XRD ",
    ]) {
      expect(normaliseInviteCode(typed), typed).toBe("K7QM4XRD");
      expect(isInviteCode(typed), typed).toBe(true);
    }
  });

  it("ignores any other dash a phone or a message app puts there", () => {
    /*
      iOS turns two hyphens into a long dash, and messaging apps render a
      code's hyphen as a non-breaking one. Built from code points so that no
      long dash is written into this file.
    */
    for (const point of [0x2010, 0x2011, 0x2012, 0x2013, 0x2014]) {
      const dash = String.fromCharCode(point);
      expect(normaliseInviteCode(`K7QM${dash}4XRD`), point.toString(16)).toBe(
        "K7QM4XRD",
      );
    }
  });

  it("drops the invisible characters a paste can carry", () => {
    const [zeroWidth, noBreak, bom, softHyphen] = [
      0x200b, 0xa0, 0xfeff, 0xad,
    ].map((point) => String.fromCharCode(point));
    expect(
      normaliseInviteCode(`${zeroWidth}K7QM${noBreak}4X${softHyphen}RD${bom}`),
    ).toBe("K7QM4XRD");
  });

  it("folds full-width letters and digits to plain ones", () => {
    // A CJK keyboard's full-width K, 7, Q and M: the same code, not four unknown characters.
    const fullWidth = String.fromCharCode(0xff2b, 0xff17, 0xff31, 0xff2d);
    expect(normaliseInviteCode(`${fullWidth}4XRD`)).toBe("K7QM4XRD");
  });
});

describe("what cannot be a code, before anything is sent", () => {
  it("accepts every character of the alphabet", () => {
    expect(inviteCodeProblem("ABCD-EFGH")).toBeNull();
    expect(inviteCodeProblem("JKMN-PQRS")).toBeNull();
    expect(inviteCodeProblem("TUVW-XYZ2")).toBeNull();
    expect(inviteCodeProblem("3456-789A")).toBeNull();
  });

  it("names each of the five characters a code never uses", () => {
    for (const c of ["0", "O", "1", "I", "L", "o", "i", "l"]) {
      expect(inviteCodeProblem(`K7QM4XR${c}`), c).toEqual({
        kind: "lookalikes",
      });
    }
  });

  it("says a character is not a letter or a number before it counts them", () => {
    // Too short AND a full stop: the full stop is the useful sentence.
    expect(inviteCodeProblem("K7.QM")).toEqual({ kind: "characters" });
    expect(inviteCodeProblem("K7QM_4XRD")).toEqual({ kind: "characters" });
  });

  it("counts, after the separators are gone", () => {
    expect(inviteCodeProblem("K7QM-4XR")).toEqual({
      kind: "length",
      length: 7,
    });
    expect(inviteCodeProblem("K7QM-4XRDA")).toEqual({
      kind: "length",
      length: 9,
    });
  });

  it("calls nothing at all empty, spaces and hyphens included", () => {
    expect(inviteCodeProblem("")).toEqual({ kind: "empty" });
    expect(inviteCodeProblem(" - ")).toEqual({ kind: "empty" });
  });

  it("says each problem in words, with the example and the count", () => {
    expect(inviteCodeProblemSentence({ kind: "length", length: 7 })).toBe(
      "That cannot be a code. A code is 8 letters and numbers, like K7QM-4XRD, and that has 7.",
    );
    expect(inviteCodeProblemSentence({ kind: "lookalikes" })).toMatch(
      /never use the letters O, I or L, or the numbers 0 or 1/,
    );
    expect(inviteCodeProblemSentence({ kind: "characters" })).toMatch(
      /letters and numbers only/,
    );
    expect(inviteCodeProblemSentence({ kind: "empty" })).toMatch(/Enter/);
  });
});

describe("showing a code", () => {
  it("groups a well-formed code in two fours, the way it is shown", () => {
    expect(formatInviteCode("k7qm4xrd")).toBe("K7QM-4XRD");
    expect(formatInviteCode("K7QM 4XRD")).toBe("K7QM-4XRD");
  });

  it("leaves anything else exactly as it was typed", () => {
    // Rewriting a mistake into something else would hide what was typed.
    expect(formatInviteCode("k7qm4xr")).toBe("k7qm4xr");
    expect(formatInviteCode("k7qm4xr0")).toBe("k7qm4xr0");
  });
});
