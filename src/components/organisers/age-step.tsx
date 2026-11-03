"use client";

import { useState, type FormEvent } from "react";
import { Button, ButtonLink } from "@/components/ui/button";
import { Field } from "@/components/ui/field";
import {
  BIRTH_YEAR_WORDS as W,
  CONFIRM_AGE_WORDS,
  asksBirthday,
  birthYearBody,
  birthYearProblem,
  confirmAgeOutcome,
  indiaYear,
  type BirthYearProblem,
} from "@/lib/auth/confirm-age";
import { useConfirmAge } from "@/lib/auth/use-confirm-age";
import { useTravellerSession } from "@/lib/auth/use-traveller";
import { clockOffsetMs } from "@/lib/booking/clock";
import { ORGANISER_WORDS } from "@/lib/organisers/words";

/**
 * Confirm your age, as one step before the organiser pages (yuvoy-app#224).
 * Shown when GET /me says `ageConfirmed: false`, or when an organiser call
 * answered 403 `adult_confirmation_required`.
 *
 * The year as typed, and the birthday question only for this year minus 18 (or
 * the year the server asked about). A kept answer calls `onDone`. An under-18
 * answer closes the account on the server: the step says so with the API's
 * sentence and signs out here. The year is never written to the browser.
 */
export function AgeStep({ onDone }: { onDone: () => void }) {
  const confirm = useConfirmAge();
  const { signOut } = useTravellerSession();
  const [year, setYear] = useState("");
  const [birthdayPassed, setBirthdayPassed] = useState<boolean | null>(null);
  const [askedFor, setAskedFor] = useState<number | null>(null);
  const [problem, setProblem] = useState<BirthYearProblem | null>(null);
  const [failed, setFailed] = useState<{ title: string; body: string } | null>(
    null,
  );
  const [closed, setClosed] = useState<string | null>(null);
  const [signedOut, setSignedOut] = useState(false);

  // The server's year: its clock, in India, read once when the step opens.
  const [thisYear] = useState(() => indiaYear(Date.now() + clockOffsetMs()));
  const answer = { year, birthdayPassed };
  const asking = asksBirthday(answer, thisYear, askedFor);

  async function send(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (confirm.isPending) return;
    setFailed(null);
    setSignedOut(false);
    const missing = birthYearProblem(answer, thisYear, askedFor);
    setProblem(missing);
    if (missing) return;
    const body = birthYearBody(answer, thisYear, askedFor);
    if (!body) return;
    try {
      await confirm.mutateAsync(body);
      onDone();
    } catch (error) {
      const outcome = confirmAgeOutcome(error);
      switch (outcome.type) {
        case "field":
          if (outcome.problem.field === "birthday") setAskedFor(body.birthYear);
          setProblem(outcome.problem);
          return;
        case "closed":
          setClosed(outcome.sentence);
          void signOut();
          return;
        case "signed-out":
          setSignedOut(true);
          return;
        case "failed":
        case "unknown":
          setFailed({ title: outcome.title, body: outcome.body });
          return;
      }
    }
  }

  if (closed !== null) {
    return (
      <section role="alert" aria-labelledby="age-step-closed">
        <h2
          id="age-step-closed"
          className="font-display tracking-display leading-display text-2xl text-balance"
        >
          {CONFIRM_AGE_WORDS.closedTitle}
        </h2>
        <p className="text-forest/80 mt-3 text-pretty">{closed}</p>
        <ButtonLink href="/help" variant="outline" size="sm" className="mt-4">
          {CONFIRM_AGE_WORDS.contactUs}
        </ButtonLink>
      </section>
    );
  }

  return (
    <form noValidate onSubmit={send} aria-labelledby="age-step-heading">
      <h2
        id="age-step-heading"
        className="font-display tracking-display leading-display text-2xl text-balance"
      >
        {W.heading}
      </h2>
      <p className="text-forest/80 mt-3 text-pretty">{W.sentence}</p>

      <Field
        className="mt-5"
        label={W.label}
        placeholder={W.placeholder}
        inputMode="numeric"
        autoComplete="off"
        maxLength={4}
        value={year}
        onChange={(e) => {
          setYear(e.target.value);
          if (problem?.field === "year") setProblem(null);
        }}
        error={problem?.field === "year" ? problem.sentence : undefined}
      />

      {asking ? (
        <fieldset
          className="mt-5"
          aria-describedby={
            problem?.field === "birthday"
              ? "age-step-birthday-error"
              : undefined
          }
        >
          <legend className="label text-forest/75">{W.birthday}</legend>
          <div className="mt-3 flex gap-6">
            {(
              [
                [true, W.yes],
                [false, W.notYet],
              ] as const
            ).map(([value, label]) => (
              <label key={label} className="flex items-center gap-3">
                <input
                  type="radio"
                  name="birthday-passed"
                  checked={birthdayPassed === value}
                  onChange={() => {
                    setBirthdayPassed(value);
                    if (problem?.field === "birthday") setProblem(null);
                  }}
                  className="accent-terra-deep size-6 shrink-0"
                />
                <span>{label}</span>
              </label>
            ))}
          </div>
          {problem?.field === "birthday" ? (
            <p
              id="age-step-birthday-error"
              role="alert"
              className="text-terra-deep mt-2 text-sm text-pretty"
            >
              {problem.sentence}
            </p>
          ) : null}
        </fieldset>
      ) : null}

      <p className="text-forest/70 mt-5 text-sm text-pretty">{W.foot}</p>

      {failed ? (
        <div role="alert" className="mt-4">
          <p className="text-sm font-bold">{failed.title}</p>
          <p className="text-forest/70 mt-1 text-sm text-pretty">
            {failed.body}
          </p>
        </div>
      ) : null}
      {signedOut ? (
        <p role="alert" className="text-terra-deep mt-4 text-sm text-pretty">
          {ORGANISER_WORDS.signIn}
        </p>
      ) : null}

      <Button
        type="submit"
        className="mt-5"
        block
        pending={confirm.isPending}
        pendingLabel={W.sending}
      >
        {W.send}
      </Button>
    </form>
  );
}
