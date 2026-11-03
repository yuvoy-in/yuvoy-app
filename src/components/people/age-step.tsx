"use client";

import { useId, useState, type FormEvent } from "react";
import { YuvoyError } from "@/lib/api/errors";
import { useConfirmAge } from "@/lib/people/use-people";
import {
  PEOPLE_WORDS,
  birthYearOf,
  needsBirthday,
} from "@/lib/people/people-words";
import { Button } from "@/components/ui/button";
import { Field } from "@/components/ui/field";
import { Refusal } from "./people-parts";

const W = PEOPLE_WORDS.age;

/**
 * The age step before People opens (yuvoy-app#222): the year of birth, and
 * whether this year's birthday has passed only for the one year that
 * straddles 18 (`needsBirthday`), as the API asks.
 *
 * `under_age_sign_up` is handed up with the API's sentence: the account is
 * closed and the screen above keeps the sentence while it signs out.
 * `age_locked` and every other refusal is shown here, in the API's words.
 */
export function AgeStep({
  onDone,
  onUnderAge,
}: {
  onDone?: () => void;
  onUnderAge: (message: string) => void;
}) {
  const confirm = useConfirmAge();
  const [typed, setTyped] = useState("");
  const [birthday, setBirthday] = useState<boolean | undefined>(undefined);
  const [problem, setProblem] = useState<string | null>(null);
  const legendId = useId();

  const year = birthYearOf(typed);
  const askBirthday = year !== null && needsBirthday(year);

  function submit(e: FormEvent) {
    e.preventDefault();
    if (year === null) {
      setProblem(W.yearBad);
      return;
    }
    if (askBirthday && birthday === undefined) {
      setProblem(W.birthdayMissing);
      return;
    }
    setProblem(null);
    confirm.mutate(
      askBirthday
        ? { birthYear: year, birthdayPassed: birthday }
        : { birthYear: year },
      {
        onSuccess: () => onDone?.(),
        onError: (error) => {
          if (
            error instanceof YuvoyError &&
            error.code === "under_age_sign_up"
          ) {
            onUnderAge(error.message);
          }
        },
      },
    );
  }

  const refused =
    confirm.error instanceof YuvoyError &&
    confirm.error.code === "under_age_sign_up"
      ? null
      : confirm.error;

  return (
    <form onSubmit={submit} noValidate aria-labelledby={`${legendId}-title`}>
      <h1
        id={`${legendId}-title`}
        className="font-display tracking-display leading-display text-3xl text-balance"
      >
        {W.title}
      </h1>
      <p className="text-forest/70 text-body mt-3 text-pretty">{W.body}</p>

      <Field
        className="mt-6"
        label={W.year}
        hint={W.yearHint}
        error={problem === W.yearBad ? problem : undefined}
        inputMode="numeric"
        autoComplete="bday-year"
        maxLength={4}
        value={typed}
        onChange={(e) => {
          setTyped(e.target.value);
          setBirthday(undefined);
          if (problem) setProblem(null);
        }}
      />

      {askBirthday ? (
        <fieldset className="mt-6">
          <legend id={legendId} className="label text-forest/75">
            {W.birthday}
          </legend>
          <div className="mt-3 flex gap-6">
            {([true, false] as const).map((answer) => (
              <label key={String(answer)} className="flex items-center gap-2">
                <input
                  type="radio"
                  name="birthday-passed"
                  checked={birthday === answer}
                  onChange={() => {
                    setBirthday(answer);
                    if (problem) setProblem(null);
                  }}
                  className="accent-terra-deep size-6 shrink-0"
                />
                <span>{answer ? W.yes : W.no}</span>
              </label>
            ))}
          </div>
          {problem === W.birthdayMissing ? (
            <p role="alert" className="text-terra-deep mt-1.5 text-xs">
              {problem}
            </p>
          ) : null}
        </fieldset>
      ) : null}

      {refused ? <Refusal error={refused} className="mt-4" /> : null}

      <Button
        type="submit"
        size="lg"
        className="mt-6"
        pending={confirm.isPending}
        pendingLabel={W.saving}
      >
        {W.action}
      </Button>
    </form>
  );
}
