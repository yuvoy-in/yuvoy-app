"use client";

import { useId, type InputHTMLAttributes } from "react";
import { cn } from "@/lib/cn";

/**
 * A phone number, with the country code beside it rather than inside it.
 *
 * The owner asked for `+91` as the default prefix in three places on the same
 * day — the listing's ask pop-up, the account sign-in, and link recovery
 * (yuvoy-app#32, #34) — so it is one component.
 *
 * ## Why the prefix is a select and not a placeholder
 *
 * It was a free-text field with a `+91…` placeholder. A placeholder is a hint,
 * not a value: it vanishes on the first keystroke, so somebody who types
 * `9000000000` sends a number with no country code and the API refuses it with
 * a message about E.164. Almost every traveller in this market is on `+91`,
 * and the ones who are not are exactly the ones who know their own code.
 *
 * ## The value handed up is always E.164
 *
 * `onChange` receives `+91` plus the digits, never the two halves — so no
 * caller has to remember to join them, and no caller can join them
 * differently. Everything that is not a digit is dropped from the national
 * part, because a number typed as `90000 00000` or `(900) 000-0000` is the
 * same number and the API takes exactly one of those spellings.
 */

/**
 * The codes offered.
 *
 * Deliberately short, and India first. A full ITU list is 240 entries of
 * scrolling for a market where the answer is `+91`; these are the codes a
 * traveller in the Andamans plausibly arrives with. "Other" is not offered
 * because a code this list lacks cannot be typed into a select — if that
 * becomes a real complaint, the fix is a combobox, not a longer list nobody
 * can scroll on a phone.
 */
export const DIAL_CODES = [
  { code: "+91", label: "India +91" },
  { code: "+44", label: "United Kingdom +44" },
  { code: "+1", label: "United States and Canada +1" },
  { code: "+61", label: "Australia +61" },
  { code: "+65", label: "Singapore +65" },
  { code: "+971", label: "United Arab Emirates +971" },
  { code: "+49", label: "Germany +49" },
  { code: "+33", label: "France +33" },
] as const;

export const DEFAULT_DIAL_CODE = "+91";

/** Splits an E.164 value back into a known code and the rest. */
export function splitDial(value: string): { code: string; national: string } {
  const trimmed = value.trim();
  /*
    Longest match first. `+1` is a prefix of `+91`, so a shortest-first scan
    would read `+919000000000` as the United States and leave `9` in front of
    the national number — which is a wrong country on a booking confirmation.
  */
  const match = [...DIAL_CODES]
    .map((d) => d.code)
    .sort((a, b) => b.length - a.length)
    .find((code) => trimmed.startsWith(code));

  if (!match) return { code: DEFAULT_DIAL_CODE, national: digits(trimmed) };
  return { code: match, national: digits(trimmed.slice(match.length)) };
}

const digits = (s: string) => s.replace(/\D/g, "");

export function PhoneField({
  label,
  hint,
  error,
  value,
  onChange,
  className,
  ...input
}: {
  label: string;
  hint?: string;
  error?: string;
  /** E.164, e.g. `+919000000000`. Empty string for an empty field. */
  value: string;
  /** Receives E.164, always. Never the two halves. */
  onChange: (e164: string) => void;
  className?: string;
} & Omit<
  InputHTMLAttributes<HTMLInputElement>,
  "value" | "onChange" | "type"
>) {
  const id = useId();
  const hintId = hint ? `${id}-hint` : undefined;
  const errorId = error ? `${id}-error` : undefined;
  const { code, national } = splitDial(value);

  const emit = (nextCode: string, nextNational: string) =>
    onChange(nextNational ? `${nextCode}${nextNational}` : "");

  return (
    <div className={className}>
      <label htmlFor={id} className="label text-forest/75">
        {label}
      </label>

      <div className="mt-2 flex gap-2">
        {/*
          `text-base`, like every control in the app: iOS Safari zooms the
          whole page in on a focused control under 16px and never zooms back
          out (yuvoy-app#35). `pnpm qa` refuses anything smaller here.
        */}
        <select
          aria-label="Country code"
          value={code}
          onChange={(e) => emit(e.target.value, national)}
          className="rounded-control border-paper-line bg-paper-deep text-forest focus:border-forest/60 ease-interaction h-12 w-24 shrink-0 border px-3 text-base transition-colors duration-200 outline-none"
        >
          {DIAL_CODES.map((d) => (
            <option key={d.code} value={d.code} label={d.label}>
              {d.code}
            </option>
          ))}
        </select>

        <input
          id={id}
          type="tel"
          inputMode="tel"
          autoComplete="tel-national"
          aria-describedby={cn(hintId, errorId) || undefined}
          aria-invalid={error ? true : undefined}
          value={national}
          onChange={(e) => emit(code, digits(e.target.value))}
          className={cn(
            "border-paper-line bg-paper-deep text-forest rounded-control h-12 min-w-0 flex-1 border px-4 text-base outline-none",
            "ease-interaction transition-[border-color,background-color] duration-200",
            "focus:border-forest/60 focus:bg-paper placeholder:text-forest/70",
            error && "border-terra-deep",
          )}
          placeholder="90000 00000"
          {...input}
        />
      </div>

      {hint ? (
        <span id={hintId} className="text-forest/70 mt-1.5 block text-xs">
          {hint}
        </span>
      ) : null}
      {error ? (
        <span
          id={errorId}
          role="alert"
          className="text-terra-deep mt-1.5 block text-xs"
        >
          {error}
        </span>
      ) : null}
    </div>
  );
}
