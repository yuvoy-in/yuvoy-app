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
import { YearFields } from "@/components/auth/year-fields";
import { Refusal } from "./people-parts";

const W = PEOPLE_WORDS.age;

/**
 * The age step before People opens (yuvoy-app#222): the year of birth, and
 * whether this year's birthday has passed only for the one year that
 * straddles 18 (`needsBirthday`), as the API asks. The fields are the
 * sign-in year step's (`YearFields`, yuvoy-app#229).
 *
 * `under_age_sign_up` is handed up with the API's sentence: the account is
 * closed and the screen above keeps the sentence while it signs out.
 * `age_locked` and every other refusal is shown here, in the API's words.
 *
 * Account asks the same question as "Confirm your age" (yuvoy-app#229), in
 * its own words and under an h2, since the screen already has its h1.
 */
export function AgeStep({
  onDone,
  onUnderAge,
  words = W,
  level = 1,
}: {
  onDone?: () => void;
  onUnderAge: (message: string) => void;
  words?: { title: string; body: string };
  level?: 1 | 2;
}) {
  const Heading = level === 1 ? "h1" : "h2";
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
      <Heading
        id={`${legendId}-title`}
        className={
          level === 1
            ? "font-display tracking-display leading-display text-3xl text-balance"
            : "text-sm font-bold text-balance"
        }
      >
        {words.title}
      </Heading>
      <p
        className={`text-forest/70 text-body text-pretty ${level === 1 ? "mt-3" : "mt-1.5"}`}
      >
        {words.body}
      </p>

      <YearFields
        className="mt-6"
        typed={typed}
        onTyped={(next) => {
          setTyped(next);
          setBirthday(undefined);
          if (problem) setProblem(null);
        }}
        birthday={birthday}
        onBirthday={(answer) => {
          setBirthday(answer);
          if (problem) setProblem(null);
        }}
        askBirthday={askBirthday}
        problem={
          problem === W.yearBad
            ? { field: "year", sentence: problem }
            : problem === W.birthdayMissing
              ? { field: "birthday", sentence: problem }
              : null
        }
      />

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
