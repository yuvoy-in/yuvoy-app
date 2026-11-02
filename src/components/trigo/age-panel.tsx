"use client";

import { useState } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { Button } from "@/components/ui/button";
import { Field } from "@/components/ui/field";
import { sessionQuery } from "@/lib/auth/use-traveller";
import { classifyAgeError, useConfirmAge } from "@/lib/trigo/api";
import {
  AGE_BIRTHDAY_QUESTION,
  AGE_LINE,
  AGE_SAVE,
  AGE_YEAR_LABEL,
  FAILURE_LINE,
  SIGNED_OUT_LINE,
} from "@/lib/trigo/words";
import { AGE_YEAR_INVALID, NO, YES } from "./ui-words";

/** Four digits, and not a year nobody alive was born in. */
function yearOf(text: string): number | null {
  if (!/^\d{4}$/.test(text.trim())) return null;
  const year = Number(text.trim());
  const now = new Date().getFullYear();
  return year >= now - 120 && year <= now ? year : null;
}

/**
 * The birth year Trigo needs before it answers (`403
 * adult_confirmation_required`, CAL-15). yuvoy-app has no age form yet, so
 * this is the small one inside the sheet: the year, and the birthday question
 * only when the API asks for it (`need_birthday`, a year exactly 18 back).
 *
 * `under_age` closes the account on the server: the API's own sentence is
 * the only thing shown, and the session is read again so the rest of the
 * app sees the traveller signed out. On a saved answer the caller sends the
 * same turn again with the same key.
 */
export function AgePanel({ onDone }: { onDone: () => void }) {
  const qc = useQueryClient();
  const confirm = useConfirmAge();
  const [text, setText] = useState("");
  const [invalid, setInvalid] = useState(false);
  const failure = confirm.error ? classifyAgeError(confirm.error) : null;

  const save = (birthdayPassed?: boolean) => {
    const birthYear = yearOf(text);
    if (birthYear === null) {
      setInvalid(true);
      return;
    }
    setInvalid(false);
    confirm.mutate(
      birthdayPassed === undefined
        ? { birthYear }
        : { birthYear, birthdayPassed },
      {
        onSuccess: onDone,
        onError: (error) => {
          const kind = classifyAgeError(error).kind;
          if (kind === "under_age" || kind === "signed_out") {
            void qc.invalidateQueries({ queryKey: sessionQuery.queryKey });
          }
        },
      },
    );
  };

  // Closed (under_age) or fixed by the team (locked): the API's sentence only.
  if (failure?.kind === "under_age" || failure?.kind === "locked") {
    return (
      <p role="alert" className="text-forest text-body">
        {failure.message}
      </p>
    );
  }

  const askBirthday = failure?.kind === "need_birthday";

  return (
    <section aria-label={AGE_LINE} className="flex flex-col gap-4">
      <p className="text-forest text-body">{AGE_LINE}</p>
      <form
        className="flex flex-col gap-3"
        onSubmit={(e) => {
          e.preventDefault();
          save();
        }}
      >
        <Field
          label={AGE_YEAR_LABEL}
          inputMode="numeric"
          autoComplete="bday-year"
          maxLength={4}
          value={text}
          onChange={(e) => setText(e.target.value.replace(/\D/g, ""))}
          error={invalid ? AGE_YEAR_INVALID : undefined}
          readOnly={confirm.isPending}
        />
        {askBirthday ? (
          <fieldset className="flex flex-col gap-2">
            <legend className="text-forest text-body mb-2">
              {AGE_BIRTHDAY_QUESTION}
            </legend>
            <div className="flex gap-2">
              <Button
                variant="outline"
                size="sm"
                disabled={confirm.isPending}
                onClick={() => save(true)}
              >
                {YES}
              </Button>
              <Button
                variant="outline"
                size="sm"
                disabled={confirm.isPending}
                onClick={() => save(false)}
              >
                {NO}
              </Button>
            </div>
          </fieldset>
        ) : (
          <Button
            type="submit"
            pending={confirm.isPending}
            pendingLabel={AGE_SAVE}
          >
            {AGE_SAVE}
          </Button>
        )}
      </form>
      {failure?.kind === "signed_out" ? (
        <p role="alert" className="text-terra-deep text-body">
          {SIGNED_OUT_LINE}
        </p>
      ) : failure?.kind === "failure" ? (
        <p role="alert" className="text-terra-deep text-body">
          {FAILURE_LINE}
        </p>
      ) : null}
    </section>
  );
}
