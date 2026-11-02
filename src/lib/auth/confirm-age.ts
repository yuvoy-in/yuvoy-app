import { NetworkError, YuvoyError } from "@/lib/api/errors";

/**
 * Confirm your age (yuvoy-app#224, from the phone's `birth-year.ts` and
 * `confirm-age.ts` on yuvoy-mobile dev): the year asked once of an account
 * GET /me says `ageConfirmed: false` for, through `PUT /me/age`. The organiser
 * pages need it (403 `adult_confirmation_required`).
 *
 * The server rules on it, in India's year: born this year minus 19 or earlier
 * is an adult, this year minus 18 only once the birthday has passed, and
 * anything later is under 18. The web never rules on an age itself: it checks
 * that a year was given, asks about the birthday for the one year that needs
 * it, and sends the answer. An under-18 answer closes the account on the
 * server, which ends every session, so the web signs out.
 *
 * Sending an answer again is always safe: the first adult answer is kept and a
 * later one changes nothing (409 `age_locked` once it is kept).
 *
 * The year is never kept: not in the browser, never in a log.
 */

/** The earliest year the server takes. */
export const OLDEST_BIRTH_YEAR = 1900;

/** Yuvoy accounts are for people this age and over. */
export const ADULT_AGE = 18;

/** India keeps one offset all year (+05:30), as the API's own fallback does. */
const INDIA_OFFSET_MS = 330 * 60_000;

/** The year in India at `nowMs`, the server's now: the year the server judges an answer in. */
export function indiaYear(nowMs: number): number {
  return new Date(nowMs + INDIA_OFFSET_MS).getUTCFullYear();
}

/** The one birth year that is 18 or not by the birthday: this year minus 18. */
export function birthdayYear(thisYear: number): number {
  return thisYear - ADULT_AGE;
}

/**
 * Every word of the year step, the phone's own. `foot` says "in this browser"
 * where the phone says "on this phone".
 */
export const BIRTH_YEAR_WORDS = {
  heading: "One more thing",
  sentence: "Yuvoy accounts are for people 18 and over.",
  label: "What year were you born?",
  placeholder: "For example 1998",
  birthday: "Have you had your birthday this year?",
  yes: "Yes",
  notYet: "Not yet",
  foot: "Asked once. The year is not kept in this browser.",
  needYear: "Tell us the year you were born.",
  needBirthday: "Tell us whether you have had your birthday this year.",
  /** The phone's sheet button, and its pending label. */
  send: "Continue",
  sending: "Checking",
} as const;

export const CONFIRM_AGE_WORDS = {
  title: "Confirm your age",
  sentence: BIRTH_YEAR_WORDS.sentence,
  done: "Thanks. Your age is confirmed.",
  closedTitle: "We have closed this account",
  /** The API's sentence for the closing, used when an answer carries none. */
  closedBody:
    "Yuvoy accounts are for people 18 and over, so we have closed this one. If you think this is wrong, contact us.",
  contactUs: "Contact us",
  close: "Close",
} as const;

/** What the step says when the reply to an answer never came. */
export const CONFIRM_AGE_UNKNOWN = {
  title: "We could not confirm that",
  noSignal:
    "We could not reach Yuvoy, so we cannot tell whether your answer went through. Sending it again is safe.",
  fault:
    "Something went wrong on our side, so we cannot tell whether your answer went through. Sending it again is safe.",
} as const;

/** The answer as it stands on screen: the year as typed, and the birthday answer if given. */
export interface BirthYearAnswer {
  year: string;
  birthdayPassed: boolean | null;
}

export interface BirthYearProblem {
  field: "year" | "birthday";
  sentence: string;
}

/** The year typed, when it is four digits from 1900 through this year; otherwise null. */
export function readBirthYear(typed: string, thisYear: number): number | null {
  const text = typed.trim();
  if (!/^\d{4}$/.test(text)) return null;
  const year = Number(text);
  return year >= OLDEST_BIRTH_YEAR && year <= thisYear ? year : null;
}

/**
 * Whether the birthday question shows: the year typed is this year minus 18,
 * or it is the year the server asked about (a 400 with
 * `details.birthdayPassed`), since near New Year its clock and this browser's
 * may name different years.
 */
export function asksBirthday(
  answer: Pick<BirthYearAnswer, "year">,
  thisYear: number,
  askedFor: number | null,
): boolean {
  const text = answer.year.trim();
  if (!/^\d{4}$/.test(text)) return false;
  const year = Number(text);
  return (
    year === birthdayYear(thisYear) || (askedFor !== null && year === askedFor)
  );
}

/** What is missing before the answer can go, said on its field; null when it can go. */
export function birthYearProblem(
  answer: BirthYearAnswer,
  thisYear: number,
  askedFor: number | null,
): BirthYearProblem | null {
  if (readBirthYear(answer.year, thisYear) === null) {
    return { field: "year", sentence: BIRTH_YEAR_WORDS.needYear };
  }
  if (
    asksBirthday(answer, thisYear, askedFor) &&
    answer.birthdayPassed === null
  ) {
    return { field: "birthday", sentence: BIRTH_YEAR_WORDS.needBirthday };
  }
  return null;
}

/**
 * What goes to the server: `birthYear` as a number, and `birthdayPassed` only
 * for the year it is about. Null while something is missing.
 */
export function birthYearBody(
  answer: BirthYearAnswer,
  thisYear: number,
  askedFor: number | null,
): { birthYear: number; birthdayPassed?: boolean } | null {
  if (birthYearProblem(answer, thisYear, askedFor)) return null;
  const birthYear = readBirthYear(answer.year, thisYear);
  if (birthYear === null) return null;
  return asksBirthday(answer, thisYear, askedFor) &&
    answer.birthdayPassed !== null
    ? { birthYear, birthdayPassed: answer.birthdayPassed }
    : { birthYear };
}

/** What a refusal of `PUT /me/age` means for the step. */
export type ConfirmAgeOutcome =
  /** The year is to be fixed on its field (`birthday`: the server asks about the birthday). */
  | { type: "field"; problem: BirthYearProblem }
  /** Under 18: the account is closed and every session ended. */
  | { type: "closed"; sentence: string }
  /** The session is gone (a 401). */
  | { type: "signed-out" }
  /** Yuvoy answered and kept nothing new; `body` is the API's sentence where it gave one. */
  | { type: "failed"; title: string; body: string }
  /** No reply, or a fault on Yuvoy's side: the answer may have been taken. */
  | { type: "unknown"; title: string; body: string };

function detail(error: YuvoyError, key: string): string | null {
  const value = error.details[key];
  return typeof value === "string" && value.trim() ? value.trim() : null;
}

/**
 * The outcome of a refused `PUT /me/age`. The phone's, with one change: a
 * 409 `age_locked` shows the API's sentence ("Your age can only be changed
 * by the Yuvoy team. Write to us from Help.") rather than "Nothing was
 * changed".
 */
export function confirmAgeOutcome(error: unknown): ConfirmAgeOutcome {
  if (error instanceof NetworkError) {
    return {
      type: "unknown",
      title: CONFIRM_AGE_UNKNOWN.title,
      body: CONFIRM_AGE_UNKNOWN.noSignal,
    };
  }
  if (!(error instanceof YuvoyError)) {
    return {
      type: "unknown",
      title: CONFIRM_AGE_UNKNOWN.title,
      body: CONFIRM_AGE_UNKNOWN.fault,
    };
  }
  const said = error.message.trim();
  if (error.status === 403 && error.code === "under_age_sign_up") {
    return { type: "closed", sentence: said || CONFIRM_AGE_WORDS.closedBody };
  }
  if (error.status === 401) return { type: "signed-out" };
  if (error.status === 400) {
    const birthday = detail(error, "birthdayPassed");
    if (birthday) {
      return {
        type: "field",
        problem: { field: "birthday", sentence: birthday },
      };
    }
    return {
      type: "field",
      problem: {
        field: "year",
        sentence: detail(error, "birthYear") ?? BIRTH_YEAR_WORDS.needYear,
      },
    };
  }
  if (error.status === 429) {
    return {
      type: "failed",
      title: "Too many tries",
      body: "Wait a little, then try again. Nothing was changed.",
    };
  }
  if (error.status === 409 && error.code === "age_locked" && said) {
    return { type: "failed", title: "That did not go through", body: said };
  }
  if (error.status >= 400 && error.status < 500) {
    return {
      type: "failed",
      title: "That did not go through",
      body: "Nothing was changed. Try again in a moment.",
    };
  }
  return {
    type: "unknown",
    title: CONFIRM_AGE_UNKNOWN.title,
    body: CONFIRM_AGE_UNKNOWN.fault,
  };
}
