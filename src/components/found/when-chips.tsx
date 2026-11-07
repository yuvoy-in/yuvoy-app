"use client";

import type { ReactNode } from "react";
import { ChipButton } from "@/components/ui/chip";
import {
  toggleDay,
  toggleFree,
  type FoundFilters,
} from "@/lib/found/found-filters";
import { foundWords, type FoundWhen } from "@/lib/found/found-words";

/** The day chips in the order they show: the words table's, which is the contract's. */
const DAYS = Object.keys(foundWords.days) as FoundWhen[];

/**
 * The day chips and Free over the found feed (yuvoy-app#180, R3-T2):
 * "Today", "Tomorrow" and "This weekend" as one single choice, then "Free" as
 * a toggle of its own, in a group named "Filter by day and price". A second
 * tap on the chosen day clears it.
 *
 * Each is a filter chip, a button with `aria-pressed`, as the department
 * chips are: they narrow one list rather than switch between panels. The
 * page works out no dates for them: `when` names the day and the server says
 * back which dates it covered.
 *
 * Free here and Free in the Filters sheet are one choice (`toggleFree`), and
 * turning it on replaces an under-price budget, so the two are never sent
 * together.
 *
 * `after` is drawn beside the group and outside it: the Filters button, which
 * opens a sheet rather than narrowing by itself.
 */
export function WhenChips({
  filters,
  onChange,
  after,
}: {
  filters: FoundFilters;
  onChange: (next: FoundFilters) => void;
  after?: ReactNode;
}) {
  return (
    <div className="-mx-4 flex [scrollbar-width:none] items-center gap-2 overflow-x-auto px-4 pb-1">
      <div
        role="group"
        aria-label={foundWords.dayGroup}
        className="flex shrink-0 items-center gap-2"
      >
        {DAYS.map((when) => (
          <ChipButton
            key={when}
            pressed={filters.when === when}
            onClick={() => onChange(toggleDay(filters, when))}
            data-when={when}
          >
            {foundWords.days[when]}
          </ChipButton>
        ))}
        {/* A hairline between the days and Free: they are different things. */}
        <span aria-hidden="true" className="bg-paper-line h-5 w-px shrink-0" />
        <ChipButton
          pressed={filters.budget === "free"}
          onClick={() => onChange(toggleFree(filters))}
          data-free=""
        >
          {foundWords.free}
        </ChipButton>
      </div>
      {after}
    </div>
  );
}
