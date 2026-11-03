"use client";

import { useId, type ReactNode } from "react";
import { ChipButton } from "@/components/ui/chip";
import { Field } from "@/components/ui/field";
import { Textarea } from "@/components/ui/textarea";
import type { OrganiserEventForm } from "@/lib/organisers/organisers";
import { ORGANISER_WORDS as W } from "@/lib/organisers/words";

/**
 * The event form's pieces that are not one plain box (yuvoy-app#224): the
 * rows of chips (kind of thing, place, free or paid), the price under them,
 * and the About box. `organiser-event-form.tsx` puts them together.
 */

const FORM_LABEL = "label text-forest/75";
const LINE = "text-terra-deep mt-1.5 block text-xs text-pretty";
const TEXTAREA =
  "rounded-control border-paper-line bg-paper-deep text-forest focus:border-forest/60 focus:bg-paper ease-interaction mt-2 w-full resize-y border px-4 py-3 text-base transition-[border-color,background-color] duration-200 outline-none";

/** The error keys a change to each box clears: the API's names for that field. */
export const EVENT_FIELD_KEYS: Readonly<
  Record<keyof OrganiserEventForm, readonly string[]>
> = {
  title: ["title"],
  department: ["department"],
  start: ["startsAt", "endsAt", "repeatsWeeklyUntil"],
  end: ["endsAt"],
  until: ["repeatsWeeklyUntil"],
  destinationKey: ["destinationKey"],
  venueName: ["venueName"],
  address: ["address"],
  free: ["free", "priceFromRupees"],
  price: ["priceFromRupees"],
  priceNote: ["priceNote"],
  link: ["link"],
  about: ["about"],
};

/** The sentences without the ones a changed box answers: the same object when there were none. */
export function withoutKeys(
  errors: Record<string, string>,
  keys: readonly string[],
): Record<string, string> {
  if (!keys.some((key) => key in errors)) return errors;
  return Object.fromEntries(
    Object.entries(errors).filter(([key]) => !keys.includes(key)),
  );
}

/** A field's sentence under a group that is not one box (the chips). */
export function FieldLine({ text }: { text: string | undefined }) {
  return text ? (
    <span role="alert" className={LINE}>
      {text}
    </span>
  ) : null;
}

/** One pick from a row of chips, named by its label for a screen reader. */
export function Choice({
  id,
  label,
  error,
  empty = null,
  small = false,
  children,
}: {
  id: string;
  label: string;
  error?: string | undefined;
  empty?: string | null;
  small?: boolean;
  children: ReactNode;
}) {
  return (
    <div className={small ? "mt-3" : undefined}>
      <span
        id={id}
        className={
          small ? "text-forest/70 block text-sm break-words" : FORM_LABEL
        }
      >
        {label}
      </span>
      {empty ? (
        <p role="status" className="text-forest/70 mt-2 text-sm text-pretty">
          {empty}
        </p>
      ) : (
        <div
          className="mt-2.5 flex flex-wrap gap-2"
          role="radiogroup"
          aria-labelledby={id}
        >
          {children}
        </div>
      )}
      <FieldLine text={error} />
    </div>
  );
}

export function Chip({
  on,
  onPick,
  children,
}: {
  on: boolean;
  onPick: () => void;
  children: ReactNode;
}) {
  return (
    <ChipButton
      size="lg"
      pressed={on}
      role="radio"
      aria-pressed={undefined}
      aria-checked={on}
      onClick={onPick}
      className="max-w-full break-words whitespace-normal"
    >
      {children}
    </ChipButton>
  );
}

interface Market {
  key: string;
  name: string;
  destinations: readonly { key: string; name: string }[];
}

/** Where the event is, from the places the person can pick, by market. */
export function EventPlacePicker({
  markets,
  pending,
  value,
  error,
  onPick,
}: {
  markets: readonly Market[];
  pending: boolean;
  value: string;
  error: string | undefined;
  onPick: (key: string) => void;
}) {
  const id = useId();
  const shown = markets.filter((market) => market.destinations.length > 0);
  return (
    <div
      role="group"
      aria-labelledby={id}
      data-testid="organiser-event-form-place"
    >
      <span id={id} className={FORM_LABEL}>
        {W.eventPlace}
      </span>
      {pending ? null : shown.length === 0 ? (
        <p role="status" className="text-forest/70 mt-2 text-sm text-pretty">
          {W.noPlaces}
        </p>
      ) : (
        shown.map((market) => (
          <Choice
            key={market.key}
            id={`${id}-${market.key}`}
            label={market.name}
            small
          >
            {market.destinations.map((place) => (
              <Chip
                key={place.key}
                on={value === place.key}
                onPick={() => onPick(place.key)}
              >
                {place.name}
              </Chip>
            ))}
          </Choice>
        ))
      )}
      <FieldLine text={error} />
    </div>
  );
}

/**
 * Free or paid, and the "from" price in whole rupees when paid. The price's
 * sentence still shows on a free event: the server can name it either way.
 */
export function EventPrice({
  free,
  price,
  errors,
  onFree,
  onPrice,
}: {
  free: boolean;
  price: string;
  errors: Record<string, string>;
  onFree: (free: boolean) => void;
  onPrice: (price: string) => void;
}) {
  return (
    <div>
      <div
        className="flex flex-wrap gap-2"
        role="radiogroup"
        aria-label={W.eventFreeOrPaid}
      >
        <Chip on={free} onPick={() => onFree(true)}>
          {W.eventFree}
        </Chip>
        <Chip on={!free} onPick={() => onFree(false)}>
          {W.eventPaid}
        </Chip>
      </div>
      <FieldLine text={errors.free} />
      {free ? (
        <FieldLine text={errors.priceFromRupees} />
      ) : (
        <Field
          className="mt-4"
          label={W.eventPrice}
          value={price}
          inputMode="numeric"
          maxLength={9}
          onChange={(e) => onPrice(e.target.value)}
          error={errors.priceFromRupees}
        />
      )}
    </div>
  );
}

export function EventAbout({
  value,
  error,
  onChange,
}: {
  value: string;
  error: string | undefined;
  onChange: (text: string) => void;
}) {
  const id = useId();
  return (
    <div>
      <label htmlFor={id} className={FORM_LABEL}>
        {W.eventAbout}
      </label>
      <Textarea
        id={id}
        rows={5}
        value={value}
        onChange={(e) => onChange(e.target.value)}
        aria-describedby={`${id}-hint${error ? ` ${id}-error` : ""}`}
        aria-invalid={error ? true : undefined}
        className={TEXTAREA}
      />
      <span id={`${id}-hint`} className="text-forest/70 mt-1.5 block text-xs">
        {W.aboutHint}
      </span>
      {error ? (
        <span id={`${id}-error`} role="alert" className={LINE}>
          {error}
        </span>
      ) : null}
    </div>
  );
}
