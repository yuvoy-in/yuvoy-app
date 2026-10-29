"use client";

import { useId, useState, type ReactNode } from "react";
import { Button } from "@/components/ui/button";
import { ChipButton, chipVariants } from "@/components/ui/chip";
import { Sheet, SheetPresence } from "@/components/ui/sheet";
import { cn } from "@/lib/cn";
import {
  clearRows,
  foundRowsOn,
  type FoundFilters,
} from "@/lib/found/found-filters";
import {
  foundWords,
  type FoundBudget,
  type FoundTimeOfDay,
} from "@/lib/found/found-words";

const BUDGETS = Object.keys(foundWords.budget.options) as FoundBudget[];
const TIMES = Object.keys(foundWords.timeOfDay.options) as FoundTimeOfDay[];

/**
 * The Filters button beside the day chips (yuvoy-app#180, R3-T2). Opens the
 * sheet; it narrows nothing by itself, so it is a plain button and not a
 * chip with `aria-pressed`. How many of the sheet's rows narrow is on its
 * face and in its name ("Filters, 1 on"), since a number beside a word is not
 * read out on its own. Free is not counted: the Free chip says it is on.
 */
export function FiltersButton({
  filters,
  onOpen,
}: {
  filters: FoundFilters;
  onOpen: () => void;
}) {
  const on = foundRowsOn(filters);
  return (
    <button
      type="button"
      onClick={onOpen}
      aria-haspopup="dialog"
      aria-label={foundWords.filtersName(on)}
      data-filters-on={on}
      className={cn(
        chipVariants({ tone: on > 0 ? "selected" : "neutral" }),
        on === 0 && "hover:border-forest/40",
      )}
    >
      {foundWords.filters}
      {on > 0 ? (
        <span
          aria-hidden="true"
          className="bg-paper text-forest inline-flex size-5 items-center justify-center rounded-full text-[11px] font-bold"
        >
          {on}
        </span>
      ) : null}
    </button>
  );
}

/**
 * Filters over the found feed, on `Sheet` (yuvoy-app#180, R3-T2): Budget and
 * Time of day, one choice each, nothing chosen by default, and Clear filters.
 * R3-T6 adds four more rows (yuvoy-app#195).
 *
 * ## The words are the copy table's
 *
 * The contract sends no words for `budget` or `timeOfDay`: only `category`
 * has a vocabulary. So the rows say what the phone's sheet says, from
 * `foundWords`, keyed by the contract's values. Only a value with a word is
 * offered, and each table is typed against the contract, so a value the API
 * adds fails to compile rather than showing with no word.
 *
 * ## One choice per row, so radios
 *
 * Each row takes one value or none, as the phone's: so its chips are radios
 * (`aria-checked`) in a group named by the row, not toggles. A second tap on
 * the chosen one clears the row, which a native radio cannot do, so they
 * stay buttons.
 *
 * ## Drafted, then applied
 *
 * As the search screen's sheet: each tap changes a draft and Show results
 * applies it, so the list does not refetch under a sheet nobody can see past.
 * The draft is seeded on mount, and `SheetPresence` mounts the form afresh on
 * every opening, so abandoned choices are not waiting next time. Clear
 * filters empties the draft's rows, Free with them (Budget's Free and the
 * chip are one choice); the day stays, since it is not on this sheet.
 */
export function FoundFilterSheet({
  open,
  filters,
  onApply,
  onClose,
}: {
  open: boolean;
  filters: FoundFilters;
  /** The sheet's rows as chosen; the caller keeps its own day. */
  onApply: (next: FoundFilters) => void;
  onClose: () => void;
}) {
  return (
    <SheetPresence open={open}>
      <FoundFilterForm filters={filters} onApply={onApply} onClose={onClose} />
    </SheetPresence>
  );
}

/** Mounted afresh on every opening, so each starts from what is applied. */
function FoundFilterForm({
  filters,
  onApply,
  onClose,
}: {
  filters: FoundFilters;
  onApply: (next: FoundFilters) => void;
  onClose: () => void;
}) {
  const [draft, setDraft] = useState<FoundFilters>(filters);
  return (
    <Sheet
      open
      onClose={onClose}
      title={foundWords.filters}
      footer={
        <div className="flex gap-3">
          <Button
            variant="outline"
            className="flex-1"
            onClick={() => setDraft(clearRows(draft))}
          >
            {foundWords.clearFilters}
          </Button>
          <Button
            className="flex-1"
            onClick={() => {
              onApply(draft);
              onClose();
            }}
          >
            {foundWords.showResults}
          </Button>
        </div>
      }
    >
      <p className="text-forest/70 text-sm text-pretty">
        {foundWords.filtersNote}
      </p>

      <Group label={foundWords.budget.label} className="mt-6">
        {BUDGETS.map((budget) => (
          <ChipButton
            key={budget}
            size="lg"
            pressed={draft.budget === budget}
            role="radio"
            aria-pressed={undefined}
            aria-checked={draft.budget === budget}
            onClick={() =>
              setDraft((d) => ({
                ...d,
                budget: d.budget === budget ? null : budget,
              }))
            }
            data-budget={budget}
          >
            {foundWords.budget.options[budget]}
          </ChipButton>
        ))}
      </Group>

      <Group label={foundWords.timeOfDay.label} className="mt-6">
        {TIMES.map((time) => (
          <ChipButton
            key={time}
            size="lg"
            pressed={draft.timeOfDay === time}
            role="radio"
            aria-pressed={undefined}
            aria-checked={draft.timeOfDay === time}
            onClick={() =>
              setDraft((d) => ({
                ...d,
                timeOfDay: d.timeOfDay === time ? null : time,
              }))
            }
            data-time-of-day={time}
          >
            {foundWords.timeOfDay.options[time]}
          </ChipButton>
        ))}
      </Group>
    </Sheet>
  );
}

/** One row of the sheet: its name, then its chips, named by it for a screen reader. */
function Group({
  label,
  children,
  className,
}: {
  label: string;
  children: ReactNode;
  className?: string;
}) {
  const id = useId();
  return (
    <div className={className}>
      <span id={id} className="label text-forest/75">
        {label}
      </span>
      <div
        className="mt-2.5 flex flex-wrap gap-2"
        role="group"
        aria-labelledby={id}
      >
        {children}
      </div>
    </div>
  );
}
