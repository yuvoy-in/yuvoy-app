import { describe, expect, it } from "vitest";
import { NetworkError, YuvoyError } from "@/lib/api/errors";
import {
  BIRTH_YEAR_WORDS,
  CONFIRM_AGE_UNKNOWN,
  CONFIRM_AGE_WORDS,
  asksBirthday,
  birthYearBody,
  birthYearProblem,
  birthdayYear,
  confirmAgeOutcome,
  indiaYear,
  readBirthYear,
} from "./confirm-age";

const THIS_YEAR = 2026;

function refused(
  status: number,
  code: string,
  message = "",
  details?: Record<string, unknown>,
) {
  return new YuvoyError({ status, code, message, details });
}

describe("the year rules", () => {
  it("counts the year in India", () => {
    // 31 Dec 2025 19:00 UTC is already 1 Jan 2026 in India.
    expect(indiaYear(Date.UTC(2025, 11, 31, 19, 0))).toBe(2026);
    expect(indiaYear(Date.UTC(2025, 11, 31, 18, 0))).toBe(2025);
    expect(birthdayYear(THIS_YEAR)).toBe(2008);
  });

  it("reads four digits from 1900 through this year", () => {
    expect(readBirthYear(" 1998 ", THIS_YEAR)).toBe(1998);
    expect(readBirthYear("98", THIS_YEAR)).toBeNull();
    expect(readBirthYear("1899", THIS_YEAR)).toBeNull();
    expect(readBirthYear("2027", THIS_YEAR)).toBeNull();
  });

  it("asks about the birthday only for this year minus 18, or the year the server asked", () => {
    expect(asksBirthday({ year: "2008" }, THIS_YEAR, null)).toBe(true);
    expect(asksBirthday({ year: "2007" }, THIS_YEAR, null)).toBe(false);
    expect(asksBirthday({ year: "2007" }, THIS_YEAR, 2007)).toBe(true);
  });

  it("says what is missing, then builds the body", () => {
    expect(
      birthYearProblem({ year: "", birthdayPassed: null }, THIS_YEAR, null),
    ).toEqual({ field: "year", sentence: BIRTH_YEAR_WORDS.needYear });
    expect(
      birthYearProblem({ year: "2008", birthdayPassed: null }, THIS_YEAR, null),
    ).toEqual({ field: "birthday", sentence: BIRTH_YEAR_WORDS.needBirthday });
    expect(
      birthYearBody({ year: "1998", birthdayPassed: true }, THIS_YEAR, null),
    ).toEqual({ birthYear: 1998 });
    expect(
      birthYearBody({ year: "2008", birthdayPassed: false }, THIS_YEAR, null),
    ).toEqual({ birthYear: 2008, birthdayPassed: false });
    expect(
      birthYearBody({ year: "2008", birthdayPassed: null }, THIS_YEAR, null),
    ).toBeNull();
  });
});

describe("confirmAgeOutcome", () => {
  it("closes on under_age_sign_up, with the API's sentence", () => {
    expect(
      confirmAgeOutcome(refused(403, "under_age_sign_up", "Closed, sorry.")),
    ).toEqual({ type: "closed", sentence: "Closed, sorry." });
    expect(confirmAgeOutcome(refused(403, "under_age_sign_up"))).toEqual({
      type: "closed",
      sentence: CONFIRM_AGE_WORDS.closedBody,
    });
  });

  it("reads a 401 as signed out", () => {
    expect(confirmAgeOutcome(refused(401, "unauthorized"))).toEqual({
      type: "signed-out",
    });
  });

  it("puts a 400's sentence on its field", () => {
    expect(
      confirmAgeOutcome(
        refused(400, "invalid_input", "x", {
          birthdayPassed: "Say yes or no.",
        }),
      ),
    ).toEqual({
      type: "field",
      problem: { field: "birthday", sentence: "Say yes or no." },
    });
    expect(
      confirmAgeOutcome(
        refused(400, "invalid_input", "x", { birthYear: "From 1900." }),
      ),
    ).toEqual({
      type: "field",
      problem: { field: "year", sentence: "From 1900." },
    });
    expect(confirmAgeOutcome(refused(400, "invalid_input"))).toEqual({
      type: "field",
      problem: { field: "year", sentence: BIRTH_YEAR_WORDS.needYear },
    });
  });

  it("shows the API's sentence for age_locked", () => {
    const line =
      "Your age can only be changed by the Yuvoy team. Write to us from Help.";
    expect(confirmAgeOutcome(refused(409, "age_locked", line))).toEqual({
      type: "failed",
      title: "That did not go through",
      body: line,
    });
  });

  it("reads too many tries, other refusals, faults and no reply", () => {
    expect(confirmAgeOutcome(refused(429, "rate_limited"))).toMatchObject({
      type: "failed",
      title: "Too many tries",
    });
    expect(confirmAgeOutcome(refused(404, "not_found"))).toMatchObject({
      type: "failed",
      body: "Nothing was changed. Try again in a moment.",
    });
    expect(confirmAgeOutcome(refused(500, "internal_error"))).toEqual({
      type: "unknown",
      title: CONFIRM_AGE_UNKNOWN.title,
      body: CONFIRM_AGE_UNKNOWN.fault,
    });
    expect(confirmAgeOutcome(new NetworkError())).toEqual({
      type: "unknown",
      title: CONFIRM_AGE_UNKNOWN.title,
      body: CONFIRM_AGE_UNKNOWN.noSignal,
    });
  });
});
