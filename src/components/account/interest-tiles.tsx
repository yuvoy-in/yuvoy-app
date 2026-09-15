"use client";

import { cn } from "@/lib/cn";

/** The contract's own cap, after duplicates are removed. */
export const MAX_INTERESTS = 8;

export interface InterestOption {
  key: string;
  label: string;
}

/**
 * What a traveller likes, as toggles (yuvoy-app#38 items 9 and 10).
 *
 * Shared by the first-sign-in screen and the profile sheet, which offer the
 * same list and the same rules and differ only in what surrounds them.
 *
 * ## The cap is enforced here rather than at the API
 *
 * "At most 8 after duplicates are removed. Anything else is a `400`." A form
 * that lets somebody choose nine and then refuses the whole save has lost the
 * name and the email they typed as well. So the ninth simply does not turn on,
 * and the reason is on screen before it is reached.
 *
 * ## Order is kept
 *
 * `interests` is "Category and activity-type keys, in the order chosen", so a
 * toggle appends rather than rebuilding from the options list. A traveller who
 * picks diving first has said something by picking it first.
 */
export function InterestTiles({
  options,
  chosen,
  onChange,
  className,
}: {
  options: InterestOption[];
  chosen: string[];
  onChange: (next: string[]) => void;
  className?: string;
}) {
  const full = chosen.length >= MAX_INTERESTS;

  return (
    <div className={className}>
      <div className="flex flex-wrap gap-2">
        {options.map((option) => {
          const on = chosen.includes(option.key);
          return (
            <button
              key={option.key}
              type="button"
              aria-pressed={on}
              /*
                Disabled only for the ones that would break the cap, never for
                the ones already chosen: somebody at eight must still be able
                to change their mind about one of them.
              */
              disabled={!on && full}
              onClick={() =>
                onChange(
                  on
                    ? chosen.filter((key) => key !== option.key)
                    : [...chosen, option.key],
                )
              }
              className={cn(
                "rounded-control ease-interaction tap-target border px-3 py-2 text-sm transition-colors duration-200",
                on
                  ? "border-forest bg-forest text-paper"
                  : "border-paper-line bg-paper text-forest hover:border-forest/40",
                !on && full && "cursor-not-allowed opacity-40",
              )}
            >
              {option.label}
            </button>
          );
        })}
      </div>

      {full ? (
        <p className="text-forest/70 mt-2 text-xs">
          That is {MAX_INTERESTS}, the most we can keep. Turn one off to swap
          it.
        </p>
      ) : null}
    </div>
  );
}
