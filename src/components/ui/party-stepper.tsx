"use client";

import { IconButton } from "./icon-button";
import { MinusIcon, PlusIcon } from "./icons";

/**
 * How many of you — a plus, a minus, and the cap the API enforces.
 *
 * Lifted out of the checkout form for yuvoy-app#32: "I should book for my
 * family, friends, right?" The control existed only at checkout, so a
 * traveller had to commit to a departure before they could say there were four
 * of them — and a party larger than the seats left was discovered a screen
 * later.
 *
 * ## The cap stays, and it is the owner's call
 *
 * The owner ruled on 13 September: keep it. The `+` stops at the listing's
 * `maxPartySize`, which is what the API enforces — a larger party is refused
 * with `capacity_unavailable`, so a stepper that went past it would be
 * offering something that cannot be bought.
 *
 * At the cap the note appears. Its number comes from `max`, never written out:
 * the issue asks for "Coming with more than 6?" and 6 is this listing's cap,
 * not a constant. Hardcoding it would be wrong on every other listing and
 * would go stale the day an operator changes theirs.
 */
export function PartyStepper({
  value,
  onChange,
  max,
  /** Shown when the cap is reached. Omit where there is nothing to say. */
  capNote = true,
  className,
}: {
  value: number;
  onChange: (next: number) => void;
  max: number;
  capNote?: boolean;
  className?: string;
}) {
  const atCap = value >= max;

  return (
    <div className={className}>
      <span className="label text-forest/75">How many of you</span>
      <div className="mt-3 flex items-center gap-4">
        <IconButton
          label="One fewer guest"
          variant="onPaper"
          disabled={value <= 1}
          onClick={() => onChange(Math.max(1, value - 1))}
        >
          <MinusIcon />
        </IconButton>
        {/*
          `aria-live="polite"` on the number, so a screen reader hears the new
          count rather than only the button that changed it.
        */}
        <span
          className="w-8 text-center text-xl font-bold tabular-nums"
          aria-live="polite"
        >
          {value}
        </span>
        <IconButton
          label="One more guest"
          variant="onPaper"
          disabled={atCap}
          onClick={() => onChange(Math.min(max, value + 1))}
        >
          <PlusIcon />
        </IconButton>
        <span className="text-forest/70 text-xs">Up to {max}</span>
      </div>

      {/*
        The way out for a group the cap refuses — the owner's words, with the
        listing's own number in them. It appears only AT the cap: shown always,
        it would read as an upsell on a solo booking; shown never, the `+`
        simply stops working and says nothing about why.
      */}
      {capNote && atCap ? (
        <p role="status" className="text-forest/70 mt-3 text-sm">
          Coming with more than {max}? Ask the operator about a group booking.
        </p>
      ) : null}
    </div>
  );
}
