"use client";

import { BIRTH_YEAR_WORDS } from "@/lib/auth/birth-year";
import { ButtonLink } from "@/components/ui/button";
import { Panel } from "@/components/ui/panel";
import { AgeStep } from "@/components/people/age-step";

/**
 * Confirm your age on Account (yuvoy-app#229, the web half of
 * yuvoy-mobile#340): the year asked once of an account made before the year
 * was asked, while `GET /me` says `ageConfirmed` false. The form is People's
 * age step over `PUT /me/age`, with Account's words.
 *
 * An adult answer is kept for good and the panel goes: the mutation reads
 * `/me` again. `409 age_locked` and every other refusal is said under the
 * form in the API's words. `403 under_age_sign_up` has closed the account on
 * the server and ended every session, so it is handed up with the API's
 * sentence, and the screen signs out and keeps it (`AgeClosed`).
 */
export const CONFIRM_AGE_WORDS = {
  title: "Confirm your age",
  body: `${BIRTH_YEAR_WORDS.sentence} We ask once.`,
  done: "Thanks. Your age is confirmed.",
  closedTitle: "We have closed this account",
  /** Used when the API's answer carries no sentence. */
  closedBody:
    "Yuvoy accounts are for people 18 and over, so we have closed this one. If you think this is wrong, write to us from Help.",
  help: "Help",
  feed: "Back to the feed",
} as const;

export function ConfirmAgePanel({
  onDone,
  onUnderAge,
}: {
  onDone: () => void;
  onUnderAge: (message: string) => void;
}) {
  return (
    <Panel className="mt-6">
      <AgeStep
        level={2}
        words={CONFIRM_AGE_WORDS}
        onDone={onDone}
        onUnderAge={(message) =>
          onUnderAge(message.trim() || CONFIRM_AGE_WORDS.closedBody)
        }
      />
    </Panel>
  );
}

/** After an under-18 answer: what happened, signed out, and where to go. */
export function AgeClosed({ message }: { message: string }) {
  const W = CONFIRM_AGE_WORDS;
  return (
    <div>
      <h1 className="font-display tracking-display leading-display text-3xl text-balance">
        {W.closedTitle}
      </h1>
      <p role="alert" className="text-body mt-3 text-pretty">
        {message}
      </p>
      <div className="mt-6 flex flex-wrap gap-3">
        <ButtonLink href="/" size="lg">
          {W.feed}
        </ButtonLink>
        <ButtonLink href="/help" variant="outline" size="lg">
          {W.help}
        </ButtonLink>
      </div>
    </div>
  );
}
