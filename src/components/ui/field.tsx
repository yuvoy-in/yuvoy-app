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
 *
 * `leading` places an icon inside the field's left edge (the search box);
 * `shape="pill"` rounds it fully, which is the shape a search box takes in
 * every reference and no other field does.
 */
export function Field({
  label,
  hint,
  error,
  labelHidden,
  className,
  suffix,
  leading,
  shape = "control",
  ...input
}: {
  label: ReactNode;
  hint?: ReactNode;
  error?: string;
  /** Visually hidden label, for a search box whose purpose is obvious. */
  labelHidden?: boolean;
  suffix?: ReactNode;
  leading?: ReactNode;
  shape?: "control" | "pill";
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

      <div className={cn("relative", !labelHidden && "mt-2")}>
        {leading ? (
          <span
            aria-hidden="true"
            className="text-forest/70 pointer-events-none absolute top-1/2 left-4 -translate-y-1/2"
          >
            {leading}
          </span>
        ) : null}
        <input
          id={id}
          // Only colour changes here, and colour keeps its 150ms under
          // reduced motion (S01 A, T16 A): the global rule would cut it.
          data-motion=""
          aria-describedby={cn(hintId, errorId) || undefined}
          aria-invalid={error ? true : undefined}
          className={cn(
            "border-paper-line bg-paper-deep text-forest w-full border text-base outline-none",
            "ease-interaction transition-[border-color,background-color] duration-150",
            "focus:border-forest/60 focus:bg-paper",
            "placeholder:text-forest/70",
            // 48px — the system's input height.
            "h-12",
            shape === "pill" ? "rounded-full px-5" : "rounded-control px-4",
            leading && "pl-12",
            error && "border-terra-deep",
          )}
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
          // It arrives where the room was made for it, and fades where it
          // was when it goes (T16 A).
          data-motion=""
          data-motion-leave=""
          className="motion-reason-in text-terra-deep mt-1.5 block text-xs"
        >
          {error}
        </span>
      ) : null}

      {suffix}
    </div>
  );
}
