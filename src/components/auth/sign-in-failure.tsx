import type { ReactNode } from "react";
import { YuvoyError } from "@/lib/api/errors";
import {
  BIRTH_YEAR_WORDS,
  asksForYear,
  detailSentence,
  isUnderAgeSignUp,
} from "@/lib/auth/birth-year";
import { ButtonLink, buttonVariants } from "@/components/ui/button";
import { SUPPORT_PHONE, SUPPORT_PHONE_HREF } from "@/lib/support/phone";
import type { SignInField, SignInStage, SignInWay } from "./use-sign-in-flow";

export interface SignInFailure {
  title: string;
  body: string;
  /** Renders on that field instead of in a panel. */
  field?: SignInField;
  /** A control under the sentence. */
  action?: ReactNode;
  /** The email door shut: offer the number, which the steps draw. */
  offer?: "use-number";
}

/** The email door's closed account, when the API sends no sentence. */
const ACCOUNT_CLOSED_EMAIL =
  "You asked us to close it, so this email cannot sign in. Your personal details will be erased within 30 days of your request. If that was a mistake, contact support and ask us to stop it.";

const TOO_MANY_EMAIL =
  "We have stopped sending codes to this address for a while. Nothing is wrong with your account. Wait a while and ask for another.";

/** The number's, when the API sends no sentence: its limits are an hour. */
const TOO_MANY_NUMBER =
  "We have stopped sending codes to this number for a while. Nothing is wrong with your account. Wait a while and ask for another.";

/** The API's message when it reads as a sentence, else null. */
function apiSentence(error: YuvoyError): string | null {
  const said = error.message?.trim();
  return said && /^[A-Z]/.test(said) && /[.!?]$/.test(said) ? said : null;
}

/**
 * What went wrong, as something a person can act on.
 *
 * The owner's words about what was here: "just basic AI generated, make it
 * proper. Say what happened, what to do next and where, with the field it
 * concerns."
 *
 * So each branch answers three things (what happened, what to do, and which
 * field to do it in), and `field` is what puts the sentence beside the input
 * rather than in a panel below the button.
 *
 * The email door's sentences are the mobile app's (yuvoy-mobile#340), so the
 * two apps say the same thing about the same answer. Two answers are steps,
 * not failures, and say nothing here: the API asking for the year on the code
 * step, and `under_age_sign_up`, which ends on the under step.
 *
 * The generic `describeError` is deliberately not used here. It is written for
 * a booking that may have taken money, and its vocabulary ("this link no
 * longer opens anything") is wrong for somebody who has typed six digits.
 */
export function signInFailure(
  error: unknown,
  { way, stage }: { way: SignInWay; stage: SignInStage },
): SignInFailure | null {
  if (!error) return null;

  const code = error instanceof YuvoyError ? error.code : null;
  const status = error instanceof YuvoyError ? error.status : null;
  const email = way === "email";
  const codeStep = stage === "code" || stage === "year";

  if (isUnderAgeSignUp(error)) return null;

  if (status === 503 && code === "sign_in_unavailable") {
    return {
      title: "Signing in with email is closed right now",
      body: "Use your number instead.",
      offer: "use-number",
    };
  }

  if (status === 429) {
    return {
      title: "Too many tries",
      body:
        apiSentence(error as YuvoyError) ??
        (email ? TOO_MANY_EMAIL : TOO_MANY_NUMBER),
    };
  }

  if (status === 401) {
    /*
      "Wrong, expired, used and over-attempted codes all answer 401 with one
      message." So this cannot say WHICH, and must not guess, but it can say
      the three things that are true of all four, and offer the way out.
    */
    return {
      title: "That code did not work",
      body: "It may be wrong, it may have expired, or it may already have been used. Ask for a new one and try again.",
      field: "code",
    };
  }

  /*
    The code was right, but this number or address closed its account and
    the request to erase it is still open (`account_deletion_pending`, a 403
    only ever answered after the code checked out). Not "We could not
    connect": that would send them round again. The API's message says to
    contact support if closing it was a mistake, and it is printed as sent,
    with the one way to reach a person that needs no session.
  */
  if (code === "account_deletion_pending") {
    return {
      title: "This account is being closed",
      body:
        (error as YuvoyError).message.trim() ||
        (email
          ? ACCOUNT_CLOSED_EMAIL
          : "This number closed its Yuvoy account, so it cannot sign in. If that was a mistake, contact us."),
      action: (
        <a
          href={SUPPORT_PHONE_HREF}
          className={buttonVariants({ variant: "outline", size: "sm" })}
        >
          Call us on {SUPPORT_PHONE}
        </a>
      ),
    };
  }

  const asked = asksForYear(error);
  if (asked) {
    // On the code step this opens the year step, which is not a failure.
    if (stage !== "year") return null;
    const key = asked.birthday ? "birthdayPassed" : "birthYear";
    return {
      title: "One more answer",
      body:
        detailSentence(error, key) ??
        (asked.birthday
          ? BIRTH_YEAR_WORDS.needBirthday
          : BIRTH_YEAR_WORDS.needYear),
      field: asked.birthday ? "birthday" : "year",
    };
  }

  if (status === 400 || code === "invalid_input") {
    if (codeStep) {
      return {
        title: "That does not look like the code",
        body: "It is six digits, numbers only.",
        // The year step draws no code field, so it says so in the panel.
        field: stage === "code" ? "code" : undefined,
      };
    }
    return email
      ? {
          title: "That email did not go through",
          body: "That email looks incomplete. It should look like name@example.com.",
          field: "email",
        }
      : {
          title: "That number did not go through",
          body: "Check the country code and the digits. An Indian mobile is ten digits after +91.",
          field: "phone",
        };
  }

  /*
    Everything else: the network, or us. Not the traveller's fault and not
    their problem to diagnose, so it says so and offers the one thing that
    still works with no session at all.
  */
  return {
    title: "We could not connect",
    body: `That is our side or a weak signal, not your ${email ? "email" : "number"}. Try again in a moment.`,
    action: (
      <ButtonLink href="/trips" variant="outline" size="sm">
        Go to my trips
      </ButtonLink>
    ),
  };
}
