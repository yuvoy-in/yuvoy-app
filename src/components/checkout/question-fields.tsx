"use client";

import { useId } from "react";
import { cn } from "@/lib/cn";
import { Field } from "@/components/ui/field";
import { ANSWER_MAX, answerableQuestions } from "@/lib/booking/answers";
import type { AnswerDraft } from "@/lib/booking/answers";
import type { components } from "@/lib/api/schema.gen";

type ListingQuestion = components["schemas"]["ListingQuestion"];

/** What a flagged question says. One sentence, and the same one everywhere. */
const NEEDS_ANSWER = "This one needs an answer.";

/**
 * The listing's own questions, as controls a wrong answer cannot come out of.
 *
 * The operator asks these, not us: a diver's certification agency and level, a
 * pickup hotel, whether somebody has done this before. Never about health,
 * which stays with `safety.screener` and is a different kind of gate with a
 * different refusal behind it.
 *
 * ## The control is chosen so the answer cannot be wrong
 *
 * An answer that does not fit its question "is not recorded and never refuses
 * the checkout on its own: it leaves its question unanswered". That is a
 * silent loss, and a silent loss is worse than a refusal, because nothing on
 * the traveller's screen says it happened and the operator reads an unanswered
 * question at the jetty.
 *
 * So `choice` is a select over the listing's own `options` and `yes_no` is two
 * radios. Neither can produce a value the server will drop. Only `short_text`
 * is free text, where anything up to 300 characters fits by definition, and
 * the cap is on the input rather than applied at submit so nobody types four
 * hundred characters and silently loses a hundred.
 *
 * ## Both screens draw the same controls
 *
 * Checkout passes `ListingQuestion`s straight through; the booking page maps
 * its `PartyQuestion`s with `asListingQuestion`. One component, so the two
 * cannot disagree about what a `yes_no` looks like or what counts as answered.
 */
export function QuestionFields({
  questions,
  draft,
  onChange,
  flagged,
  legend,
  intro,
  className,
  disabled,
}: {
  questions: readonly ListingQuestion[];
  draft: AnswerDraft;
  onChange: (questionId: string, value: string) => void;
  /** Ids a `409 answers_required` named, marked in the listing's order. */
  flagged?: readonly string[];
  legend: string;
  intro?: string;
  className?: string;
  /** Answers are closed, so the words stay and the controls do not take input. */
  disabled?: boolean;
}) {
  const scope = useId();
  /*
    A question no control can answer is not drawn. See `isUnanswerable`: a
    `choice` with no `options` would take an answer the server discards, and
    if it were also required, sending `answers` at all would be a refusal
    nobody could clear. Checkout handles that half by not sending `answers`.
  */
  const drawable = answerableQuestions(questions);
  if (drawable.length === 0) return null;

  const flaggedSet = new Set(flagged ?? []);

  return (
    <fieldset className={className}>
      <legend className="label text-forest/75">{legend}</legend>
      {intro ? <p className="text-forest/70 mt-2 text-sm">{intro}</p> : null}

      <div className="mt-4 space-y-6">
        {drawable.map((question) => (
          <QuestionControl
            key={question.id}
            scope={scope}
            question={question}
            value={draft[question.id] ?? ""}
            onChange={(next) => onChange(question.id, next)}
            flagged={flaggedSet.has(question.id)}
            disabled={disabled}
          />
        ))}
      </div>
    </fieldset>
  );
}

function QuestionControl({
  scope,
  question,
  value,
  onChange,
  flagged,
  disabled,
}: {
  scope: string;
  question: ListingQuestion;
  value: string;
  onChange: (value: string) => void;
  flagged: boolean;
  disabled?: boolean;
}) {
  const id = `${scope}-${question.id}`;
  const errorId = flagged ? `${id}-error` : undefined;
  /*
    "(optional)" on the optional ones rather than a marker on the required
    ones. Most questions an operator asks are required, so marking the
    exception is quieter, and it never leaves a traveller wondering whether a
    star means "needed" or "special".
  */
  const labelText = question.required
    ? question.text
    : `${question.text} (optional)`;

  if (question.answerType === "short_text") {
    return (
      <Field
        label={labelText}
        value={value}
        onChange={(e) => onChange(e.target.value)}
        maxLength={ANSWER_MAX}
        error={flagged ? NEEDS_ANSWER : undefined}
        disabled={disabled}
      />
    );
  }

  if (question.answerType === "yes_no") {
    return (
      <fieldset>
        <legend className="text-forest/80 text-sm">{labelText}</legend>
        {/*
          No default and no pre-tick, for the reason the screener gives: a
          default is an answer nobody gave, and here it would be recorded
          against the traveller's name on the operator's manifest.
        */}
        <div className="mt-3 space-y-2.5">
          <ChoiceCard
            name={id}
            label="Yes"
            checked={value === "yes"}
            onSelect={() => onChange("yes")}
            disabled={disabled}
          />
          <ChoiceCard
            name={id}
            label="No"
            checked={value === "no"}
            onSelect={() => onChange("no")}
            disabled={disabled}
          />
        </div>
        {flagged ? (
          <p id={errorId} role="alert" className="text-terra-deep mt-2 text-xs">
            {NEEDS_ANSWER}
          </p>
        ) : null}
      </fieldset>
    );
  }

  return (
    <div>
      <label htmlFor={id} className="text-forest/80 block text-sm">
        {labelText}
      </label>
      <select
        id={id}
        value={value}
        disabled={disabled}
        aria-describedby={errorId}
        aria-invalid={flagged ? true : undefined}
        onChange={(e) => onChange(e.target.value)}
        /*
          `text-base`, not `text-sm`, and it is not a style choice: iOS Safari
          zooms the whole page in whenever a focused control computes below
          16px and never zooms back out (yuvoy-app#35). This one sits in
          checkout, which is the worst place in the product to throw somebody's
          viewport off mid-form.
        */
        className={cn(
          "rounded-control border-cream-line bg-cream-deep focus:border-forest/60 ease-interaction mt-2 h-12 w-full border px-4 text-base transition-colors duration-200 outline-none",
          flagged && "border-terra-deep",
          disabled && "opacity-60",
        )}
      >
        {/*
          Selectable rather than disabled, so an optional question can be put
          back to unanswered. A required one is held by the form's blocker,
          which is a better place to say "still needed" than a dead option.
        */}
        <option value="">Choose one</option>
        {(question.options ?? []).map((option) => (
          <option key={option} value={option}>
            {option}
          </option>
        ))}
      </select>
      {flagged ? (
        <p id={errorId} role="alert" className="text-terra-deep mt-1.5 text-xs">
          {NEEDS_ANSWER}
        </p>
      ) : null}
    </div>
  );
}

/** The screener's radio card, which is already the shape for a short choice. */
function ChoiceCard({
  name,
  label,
  checked,
  onSelect,
  disabled,
}: {
  name: string;
  label: string;
  checked: boolean;
  onSelect: () => void;
  disabled?: boolean;
}) {
  return (
    <label
      className={cn(
        "rounded-card ease-interaction flex gap-3 border p-4 text-sm transition-[border-color,background-color,box-shadow] duration-200",
        disabled ? "cursor-default opacity-60" : "cursor-pointer",
        checked
          ? "border-forest bg-cream-deep ring-forest ring-1"
          : "border-cream-line",
        !checked && !disabled && "hover:border-forest/40",
      )}
    >
      <input
        type="radio"
        name={name}
        checked={checked}
        onChange={onSelect}
        disabled={disabled}
        className="accent-terra-deep mt-0.5 size-4 shrink-0"
      />
      <span className="text-forest/80">{label}</span>
    </label>
  );
}
