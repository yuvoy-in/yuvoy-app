"use client";

import { useState } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { YuvoyError } from "@/lib/api/errors";
import { dedash } from "@/lib/format/dedash";
import { qk } from "@/lib/query/policy";
import { useEmailSignInOpen } from "@/lib/site/use-release";
import {
  useTravellerSession,
  useRequestSignInCode,
  useVerifySignInCode,
  type SignInWayIn,
} from "@/lib/auth/use-traveller";
import {
  BIRTH_YEAR_WORDS,
  asksBirthdayFor,
  asksForYear,
  birthYearOf,
  isUnderAgeSignUp,
} from "@/lib/auth/birth-year";
import { DEFAULT_DIAL_CODE } from "@/components/ui/phone-field";
import { signInFailure } from "./sign-in-failure";

/**
 * Signing in with a number or an email and a code: the steps' state,
 * wherever they are asked for (`SignInSteps` draws them).
 *
 * ## The email door (yuvoy-app#229, web half of yuvoy-mobile#340)
 *
 * The email door opens once `features.signIn.email` says so on
 * `GET /app-config`; the number has no switch and is always open. While both
 * are open the steps start on the doors, email first, as the mobile app's do.
 * Until the config is read, or when it cannot be, the steps start on the
 * number. A config that lands while the number is being typed never swaps the
 * step under the traveller: the first keystroke chooses the number.
 *
 * The invite gate offers the same doors: an invitation admits the traveller,
 * not only a number, so one signed in by email redeems it (yuvoy-api#351).
 *
 * ## The year
 *
 * A person no account holds yet is asked the year before an account exists:
 * verify without one answers `400` with `details.birthYear` and leaves the
 * code usable, so the year step shows and the same code goes again with the
 * year. Under 18 is `403 under_age_sign_up`: nothing is made, the code is
 * spent, and the steps end on the under step. A returning person is never
 * asked. The year lives in this state only while the steps are up, and is
 * never stored or logged.
 *
 * ## Attempt limits are the API's
 *
 * No resend timer and no attempt counter here: `429` on requesting and a
 * single `401` for a wrong, expired, used or over-attempted code.
 */

/** The two ways in: a number (always open) and an email (behind its switch). */
export type SignInWay = "phone" | "email";

/**
 * Where the steps are: choosing a door, the number or the address, the code,
 * the year (a new person, once the API asked), or under 18.
 */
export type SignInStage = "doors" | "entry" | "code" | "year" | "under";

/** The field a sentence belongs to. */
export type SignInField = "phone" | "email" | "code" | "year" | "birthday";

/** Every word of the email door's own steps (the mobile app's, yuvoy-mobile#340). */
export const EMAIL_SIGN_IN = {
  door: "Continue with email",
  phoneDoor: "Sign in with your number",
  heading: "Continue with email",
  sentence: "We'll email you a six-digit code. No password.",
  label: "Your email",
  placeholder: "name@example.com",
  empty: "Enter your email, and we'll send the code there.",
  incomplete:
    "That email looks incomplete. It should look like name@example.com.",
  /**
   * "Look for a code at {the address, in bold}. ..." Not the mobile app's "We
   * sent a code to": the API answers every address the same way, so the screen
   * never says a code went (yuvoy-app#125, `scripts/qa.mjs`).
   */
  sentLead: "Look for a code at ",
  sentTail: ". It is good for a few minutes and works once.",
  codeHint:
    "Not there after a minute? Check your spam folder, or send another code.",
  useAnother: "Use another email",
  useEmail: "Use my email instead",
  useNumber: "Use my number instead",
} as const;

/** The under step's words, when the API's own message is not a sentence. */
export const UNDER_AGE_SIGN_UP =
  "Yuvoy accounts are for people 18 and over. You can still look around without an account.";

/** What is wrong with an address before it is sent, or null. The API's check is the last word. */
export function emailProblem(email: string): string | null {
  const text = email.trim();
  if (!text) return EMAIL_SIGN_IN.empty;
  if (text.length > 254 || !/^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test(text)) {
    return EMAIL_SIGN_IN.incomplete;
  }
  return null;
}

/** A message that reads as a sentence, to show as it came. */
function sentenceOf(error: unknown): string | null {
  if (!(error instanceof YuvoyError)) return null;
  const message = error.message?.trim();
  return message && /^[A-Z]/.test(message) && /[.!?]$/.test(message)
    ? message
    : null;
}

type Problem = { field: SignInField; sentence: string };

export function useSignInFlow() {
  const { signIn } = useTravellerSession();
  const qc = useQueryClient();
  const emailOpen = useEmailSignInOpen();

  const [chosen, setChosen] = useState<SignInWay | null>(null);
  const way: SignInWay | null = chosen ?? (emailOpen ? null : "phone");

  const [step, setStep] = useState<Exclude<SignInStage, "doors">>("entry");
  const stage: SignInStage = way === null ? "doors" : step;

  const [phone, setPhoneRaw] = useState(DEFAULT_DIAL_CODE);
  const [email, setEmailRaw] = useState("");
  const [code, setCodeRaw] = useState("");
  const [sentMessage, setSentMessage] = useState<string | null>(null);
  const [devCode, setDevCode] = useState<string | undefined>();
  const [resent, setResent] = useState(false);
  const [typedYear, setTypedYear] = useState("");
  const [birthday, setBirthdayRaw] = useState<boolean | undefined>();
  const [birthdayAskedFor, setBirthdayAskedFor] = useState<number | null>(null);
  const [problem, setProblem] = useState<Problem | null>(null);
  const [underSentence, setUnderSentence] = useState(UNDER_AGE_SIGN_UP);

  const request = useRequestSignInCode();
  const verify = useVerifySignInCode();

  const phoneGiven = phone.replace(/\D/g, "").length > 4;
  const year = birthYearOf(typedYear);
  const askBirthday = asksBirthdayFor(year, birthdayAskedFor);

  function setPhone(next: string) {
    // The first keystroke chooses the number, so a late config cannot swap it.
    if (chosen === null) setChosen("phone");
    setPhoneRaw(next);
    setProblem(null);
  }
  function setEmail(next: string) {
    setEmailRaw(next);
    setProblem(null);
  }
  function setCode(next: string) {
    setCodeRaw(next);
    setProblem(null);
  }
  function setYear(next: string) {
    // A birthday answer is about the year it was given for.
    if (next !== typedYear) setBirthdayRaw(undefined);
    setTypedYear(next);
    setProblem(null);
  }
  function setBirthday(passed: boolean) {
    setBirthdayRaw(passed);
    setProblem(null);
  }

  /** Back to a first step, with what was typed there kept. */
  function startAgain(next: Exclude<SignInStage, "doors">) {
    setStep(next);
    setCodeRaw("");
    setSentMessage(null);
    setDevCode(undefined);
    setResent(false);
    setTypedYear("");
    setBirthdayRaw(undefined);
    setBirthdayAskedFor(null);
    setProblem(null);
    request.reset();
    verify.reset();
  }

  function wayIn(): SignInWayIn {
    return way === "email" ? { email: email.trim() } : { phone };
  }

  /** The email door shut after it was drawn: the doors are read again. */
  function doorShut(error: unknown) {
    if (
      error instanceof YuvoyError &&
      error.status === 503 &&
      error.code === "sign_in_unavailable"
    ) {
      void qc.invalidateQueries({ queryKey: qk.appConfig() });
    }
  }

  async function askForCode(again = false) {
    if (way === null) return;
    verify.reset();
    setCodeRaw("");
    setProblem(null);
    if (way === "email") {
      const sentence = emailProblem(email);
      if (sentence) {
        setProblem({ field: "email", sentence });
        return;
      }
    }
    const answer = await request.mutateAsync(wayIn()).catch((error) => {
      doorShut(error);
      return null;
    });
    if (!answer) return;
    setChosen(way);
    // A new code after the year was asked goes back to the code, year kept.
    setStep("code");
    setSentMessage(answer.message ? dedash(answer.message) : null);
    setDevCode(answer.devCode);
    setResent(again);
  }

  /**
   * `true` once the session exists and every per-number cache has been told.
   *
   * The answer carries no token, only `{ signedIn: true }`. The session is
   * already in an HttpOnly cookie by the time this resolves, because
   * `POST /api/session` set it server-side (yuvoy-app#57).
   */
  async function submitCode(): Promise<boolean> {
    if (stage === "year") {
      if (year === null) {
        setProblem({ field: "year", sentence: BIRTH_YEAR_WORDS.needYear });
        return false;
      }
      if (askBirthday && birthday === undefined) {
        setProblem({
          field: "birthday",
          sentence: BIRTH_YEAR_WORDS.needBirthday,
        });
        return false;
      }
    }
    setProblem(null);
    const age =
      year !== null && typedYear
        ? askBirthday && birthday !== undefined
          ? { birthYear: year, birthdayPassed: birthday }
          : { birthYear: year }
        : {};
    const answer = await verify
      .mutateAsync({ ...wayIn(), code, ...age })
      .catch((error: unknown) => {
        refused(error, age.birthYear ?? null);
        return null;
      });
    if (!answer?.signedIn) return false;
    await signIn();
    startAgain("entry");
    return true;
  }

  /** What a refused verify moves the steps to. */
  function refused(error: unknown, yearSent: number | null) {
    doorShut(error);
    if (isUnderAgeSignUp(error)) {
      // Nothing was made and the code is spent.
      const said = sentenceOf(error);
      startAgain("under");
      setUnderSentence(said ?? UNDER_AGE_SIGN_UP);
      return;
    }
    const asked = asksForYear(error);
    if (asked) {
      if (asked.birthday && yearSent !== null) setBirthdayAskedFor(yearSent);
      if (step === "code") {
        // The year step opening is a step, not a failure.
        setStep("year");
        verify.reset();
      }
      return;
    }
    if (
      step === "year" &&
      error instanceof YuvoyError &&
      (error.status === 401 || error.status === 400)
    ) {
      /*
        The code that went with the year did not work (401), or a 400 that is
        not a year question, which is about the code: back to the code step,
        where the sentence lands on the field it is about, year kept.
      */
      setStep("code");
      setCodeRaw("");
    }
  }

  /** "Change number" or "Use another email": back to the first step. */
  function changeNumber() {
    startAgain("entry");
  }

  /** The other way in, or back to the doors with `null`. */
  function chooseWay(next: SignInWay | null) {
    setChosen(next);
    startAgain("entry");
  }

  return {
    way,
    stage,
    emailOpen,
    phone,
    setPhone,
    email,
    setEmail,
    code,
    setCode,
    /** A code has been asked for: the code or the year step. */
    sent: stage === "code" || stage === "year",
    sentMessage,
    devCode,
    resent,
    typedYear,
    setYear,
    birthday,
    setBirthday,
    askBirthday,
    underSentence,
    problem,
    request,
    verify,
    phoneGiven,
    failure: signInFailure(verify.error ?? request.error, {
      way: way ?? "phone",
      stage,
    }),
    askForCode,
    submitCode,
    changeNumber,
    chooseWay,
  };
}

export type SignInFlow = ReturnType<typeof useSignInFlow>;
