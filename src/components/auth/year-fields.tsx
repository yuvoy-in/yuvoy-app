"use client";

import { useId } from "react";
import { BIRTH_YEAR_WORDS as W } from "@/lib/auth/birth-year";
import { Field } from "@/components/ui/field";

/**
 * The year question's fields (yuvoy-app#229): the year, typed, and whether
 * this year's birthday has passed when `askBirthday` says the year needs it.
 * One part for every place that asks: the sign-in year step and People's age
 * step (yuvoy-app#222). The screen around it, its heading, its button and
 * what it does with the answer, stays the caller's.
 *
 * Typed rather than a select, for parity with the mobile app: four digits are
 * quicker than a list of a hundred years on a phone.
 */
export function YearFields({
  typed,
  onTyped,
  birthday,
  onBirthday,
  askBirthday,
  problem,
  form,
  autoFocus,
  className,
}: {
  typed: string;
  onTyped: (typed: string) => void;
  birthday: boolean | undefined;
  onBirthday: (passed: boolean) => void;
  askBirthday: boolean;
  /** What is missing, said on its field. */
  problem?: { field: "year" | "birthday"; sentence: string } | null;
  /** The form the fields belong to, when they are drawn outside it. */
  form?: string;
  autoFocus?: boolean;
  className?: string;
}) {
  const legendId = useId();
  return (
    <div className={className}>
      <Field
        form={form}
        label={W.label}
        placeholder={W.placeholder}
        error={problem?.field === "year" ? problem.sentence : undefined}
        inputMode="numeric"
        autoComplete="bday-year"
        maxLength={4}
        value={typed}
        onChange={(e) => onTyped(e.target.value)}
        autoFocus={autoFocus}
      />

      {askBirthday ? (
        <fieldset className="mt-6">
          <legend className="label text-forest/75">{W.birthday}</legend>
          <div className="mt-3 flex gap-6">
            {([true, false] as const).map((answer) => (
              <label key={String(answer)} className="flex items-center gap-2">
                <input
                  form={form}
                  type="radio"
                  name={`${legendId}-birthday-passed`}
                  checked={birthday === answer}
                  onChange={() => onBirthday(answer)}
                  className="accent-terra-deep size-6 shrink-0"
                />
                <span>{answer ? W.yes : W.notYet}</span>
              </label>
            ))}
          </div>
          {problem?.field === "birthday" ? (
            <p role="alert" className="text-terra-deep mt-1.5 text-xs">
              {problem.sentence}
            </p>
          ) : null}
        </fieldset>
      ) : null}

      <p className="text-forest/70 mt-4 text-xs">{W.foot}</p>
    </div>
  );
}
