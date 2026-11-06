import { describe, it, expect } from "vitest";
import { YuvoyError } from "@/lib/api/errors";
import {
  asksBirthdayFor,
  asksForYear,
  birthYearOf,
  detailSentence,
  indiaYear,
  isUnderAgeSignUp,
  needsBirthday,
} from "./birth-year";

/**
 * The year question's rules (yuvoy-app#229). The web never rules on an age:
 * it checks a year was typed, asks the birthday for the one year that
 * straddles 18, and reads what the API answered.
 */

// 15 June 2026 in India, far from the year's edges.
const JUNE = new Date("2026-06-15T06:00:00Z");

const refusal = (
  status: number,
  code: string,
  details?: Record<string, unknown>,
) => new YuvoyError({ status, code, message: "No.", details });

describe("the year in India", () => {
  it("is India's on 31 December evening UTC, which is already 1 January there", () => {
    expect(indiaYear(new Date("2026-12-31T20:00:00Z"))).toBe(2027);
  });
});

describe("a typed year", () => {
  it("takes four digits from 1900 to this year", () => {
    expect(birthYearOf("1998", JUNE)).toBe(1998);
    expect(birthYearOf(" 1900 ", JUNE)).toBe(1900);
    expect(birthYearOf("2026", JUNE)).toBe(2026);
  });

  it("refuses a slip of a key rather than send it as under 18", () => {
    for (const typed of ["", "98", "19988", "1899", "2027", "19a8"]) {
      expect(birthYearOf(typed, JUNE)).toBeNull();
    }
  });
});

describe("the birthday question", () => {
  it("is asked only for this year minus 18", () => {
    expect(needsBirthday(2008, JUNE)).toBe(true);
    expect(needsBirthday(2007, JUNE)).toBe(false);
    expect(needsBirthday(2009, JUNE)).toBe(false);
  });

  it("is also asked for the year the API asked about, near 1 January", () => {
    expect(asksBirthdayFor(2009, 2009, JUNE)).toBe(true);
    expect(asksBirthdayFor(2007, 2009, JUNE)).toBe(false);
    expect(asksBirthdayFor(null, 2009, JUNE)).toBe(false);
  });
});

describe("reading the API's answer", () => {
  it("reads a 400 naming birthYear as the year step", () => {
    expect(
      asksForYear(refusal(400, "invalid_input", { birthYear: "Tell us." })),
    ).toEqual({ birthday: false });
  });

  it("reads a 400 naming birthdayPassed as the birthday question", () => {
    expect(
      asksForYear(
        refusal(400, "invalid_input", {
          birthYear: "Tell us.",
          birthdayPassed: "Tell us whether.",
        }),
      ),
    ).toEqual({ birthday: true });
  });

  it("does not read any other 400 as the year step", () => {
    expect(
      asksForYear(refusal(400, "invalid_input", { email: "Enter one." })),
    ).toBeNull();
    expect(
      asksForYear(refusal(422, "invalid_input", { birthYear: "x" })),
    ).toBeNull();
    expect(asksForYear(new Error("no"))).toBeNull();
  });

  it("knows under_age_sign_up only as a 403", () => {
    expect(isUnderAgeSignUp(refusal(403, "under_age_sign_up"))).toBe(true);
    expect(isUnderAgeSignUp(refusal(400, "under_age_sign_up"))).toBe(false);
    expect(isUnderAgeSignUp(refusal(403, "forbidden"))).toBe(false);
  });

  it("takes a field's sentence only when it is words", () => {
    const e = refusal(400, "invalid_input", { birthYear: "  Tell us. ", x: 3 });
    expect(detailSentence(e, "birthYear")).toBe("Tell us.");
    expect(detailSentence(e, "x")).toBeNull();
    expect(detailSentence(e, "missing")).toBeNull();
  });
});
