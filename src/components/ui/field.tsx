"use client";

import { useId, type InputHTMLAttributes, type ReactNode } from "react";
import { cn } from "@/lib/cn";

/**
 * The one labelled input in the system.
 *
 * It exists because the same accessibility bug was written twice: a hint
 * placed INSIDE the <label> becomes part of the field's accessible name, so a
 * screen reader announces "WhatsApp number This is how we send your booking
 * and reach you if the sea changes" every time the field gains focus.
 *
 * Here the label is bound by `htmlFor`, the hint by `aria-describedby`, and the
 * error by `aria-errormessage` — so there is no way to compose it wrongly.
 */
export function Field({
  label,
  hint,
  error,
  labelHidden,
  className,
  suffix,
  ...input
}: {
  label: string;
  hint?: ReactNode;
  error?: string;
  /** Visually hidden label, for a search box whose purpose is obvious. */
  labelHidden?: boolean;
  suffix?: ReactNode;
} & InputHTMLAttributes<HTMLInputElement>) {
  const id = useId();
  const hintId = hint ? `${id}-hint` : undefined;
  const errorId = error ? `${id}-error` : undefined;

  return (
    <div className={className}>
      <label
        htmlFor={id}
        className={cn("label text-forest/75", labelHidden && "sr-only")}
      >
        {label}
      </label>

      <input
        id={id}
        aria-describedby={cn(hintId, errorId) || undefined}
        aria-invalid={error ? true : undefined}
        className={cn(
          "rounded-edge border-cream-line bg-cream-deep focus:border-terra-deep w-full border px-3.5 text-base outline-none",
          // 48px — the system's input height.
          "h-12",
          labelHidden ? "" : "mt-2",
          error && "border-terra-deep",
        )}
        {...input}
      />

      {hint ? (
        <span id={hintId} className="text-forest/60 mt-1.5 block text-xs">
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

      {suffix}
    </div>
  );
}
