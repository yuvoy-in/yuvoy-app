import { YuvoyError } from "@/lib/api/errors";
import { civilInZone } from "@/lib/format/date";

/**
 * The birth year Yuvoy asks once (yuvoy-mobile#340, R4-T1; web half
 * yuvoy-app#229): at a sign-in door, of a person no account holds yet, and on
 * People's age step, of an account made before the year was asked.
 *
 * The API rules on it, in India's year: born this year minus 19 or earlier is
 * an adult, this year minus 18 only once the birthday has passed, and anything
 * later is under 18. The web never rules on an age itself. It checks that a
 * year was given, asks about the birthday for the one year that needs it, and
 * sends the answer: an under-18 answer must reach the API, which spends the
 * sign-in code or closes the account.
 *
 * The year is never kept: not in storage, and never in a log or a report.
 *
 * The rules and the words are the mobile app's (`packages/core/src/auth/
 * birth-year.ts`), so the two apps ask the same question the same way. The
 * spec (r4) asked for a select; the field is typed for parity with mobile.
 */

/** The earliest year the API takes. */
export const OLDEST_BIRTH_YEAR = 1900;

/** Yuvoy accounts are for people this age and over. */
export const ADULT_AGE = 18;

/** Every word of the year step, at sign-in and on People's age step. */
export const BIRTH_YEAR_WORDS = {
  heading: "One more thing",
  sentence: "Yuvoy accounts are for people 18 and over.",
  label: "What year were you born?",
  placeholder: "For example 1998",
  birthday: "Have you had your birthday this year?",
  yes: "Yes",
  notYet: "Not yet",
  foot: "Asked once. The year is not kept on this device.",
  needYear: "Tell us the year you were born.",
  needBirthday: "Tell us whether you have had your birthday this year.",
} as const;

/** The year in India now, which is the year the API's 18 is counted in. */
export function indiaYear(now: Date = new Date()): number {
  return (
    civilInZone(now.toISOString(), "Asia/Kolkata")?.year ?? now.getUTCFullYear()
  );
}

/** The one birth year that is 18 or not by the birthday: this year minus 18. */
export function birthdayYear(thisYear: number): number {
  return thisYear - ADULT_AGE;
}

/**
 * Whether the birthday question must be asked: only for the one year that
 * straddles 18, as the API asks (`birthdayPassed`).
 */
export function needsBirthday(
  birthYear: number,
  now: Date = new Date(),
): boolean {
  return birthYear === birthdayYear(indiaYear(now));
}

/**
 * A birth year as typed, or null. Four digits, not in the future, and not
 * before 1900: the API reads any later year as under 18, so a slip of a key
 * must stop here rather than close an adult's account.
 */
export function birthYearOf(
  typed: string,
  now: Date = new Date(),
): number | null {
  const t = typed.trim();
  if (!/^\d{4}$/.test(t)) return null;
  const year = Number(t);
  return year >= OLDEST_BIRTH_YEAR && year <= indiaYear(now) ? year : null;
}

/**
 * Whether the birthday question shows for the year typed: it is this year
 * minus 18, or it is the year the API asked about (a `400` with
 * `details.birthdayPassed`), since near 1 January the browser's clock and the
 * API's may name different years (yuvoy-app#228).
 */
export function asksBirthdayFor(
  year: number | null,
  askedFor: number | null,
  now: Date = new Date(),
): boolean {
  if (year === null) return false;
  return needsBirthday(year, now) || (askedFor !== null && year === askedFor);
}

/** The API's own sentence for one field of a `400`, or null. */
export function detailSentence(error: unknown, key: string): string | null {
  if (!(error instanceof YuvoyError)) return null;
  const value = error.details?.[key];
  return typeof value === "string" && value.trim() ? value.trim() : null;
}

/**
 * Whether a refusal is the API asking for the year: `400` with
 * `details.birthYear` (no year yet) or `details.birthdayPassed` (the birthday
 * for the year sent). The code it went with stays usable.
 */
export function asksForYear(error: unknown): { birthday: boolean } | null {
  if (!(error instanceof YuvoyError) || error.status !== 400) return null;
  if (detailSentence(error, "birthdayPassed")) return { birthday: true };
  if (detailSentence(error, "birthYear")) return { birthday: false };
  return null;
}

/** `403 under_age_sign_up`: the year said under 18, so nothing was made. */
export function isUnderAgeSignUp(error: unknown): boolean {
  return (
    error instanceof YuvoyError &&
    error.status === 403 &&
    error.code === "under_age_sign_up"
  );
}
