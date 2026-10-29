"use client";

import { useId, useState, type ReactNode } from "react";
import { Button } from "@/components/ui/button";
import { ChipButton, chipVariants } from "@/components/ui/chip";
import { Sheet, SheetPresence } from "@/components/ui/sheet";
import { cn } from "@/lib/cn";
import {
  clearRows,
  foundRows,
  foundRowsOn,
  toggleRow,
  type FoundFilters,
  type FoundRowKey,
} from "@/lib/found/found-filters";
import { foundWords } from "@/lib/found/found-words";

/** A row's options in the order they show, with their words: the words table's, which is the contract's. */
function optionsOf(key: FoundRowKey): [string, string][] {
  return Object.entries(foundWords[key].options);
}

/**
 * The Filters button beside the day chips (yuvoy-app#180, R3-T2). Opens the
 * sheet; it narrows nothing by itself, so it is a plain button and not a
 * chip with `aria-pressed`. How many of the sheet's rows narrow is on its
 * face and in its name ("Filters, 1 on"), since a number beside a word is not
 * read out on its own. Free is not counted: the Free chip says it is on.
 */
export function FiltersButton({
  filters,
  local,
  onOpen,
}: {
  filters: FoundFilters;
  /** Whether the place is local: How hard counts there only. */
  local: boolean;
  onOpen: () => void;
}) {
  const on = foundRowsOn(filters, local);
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
 * Time of day, then R3-T6's How long, Indoors or out, Who it suits and How
 * hard (yuvoy-app#195), one choice each, nothing chosen by default, and Clear
 * filters.
 *
 * ## How hard is a local place's only
 *
 * The API matches `difficulty` on checked cards only, and only a local
 * place's cards are all checked. So in a travel place the row is not drawn,
 * and `difficulty` is never sent (`foundListQuery`'s `local`).
 *
 * ## The words are the copy table's
 *
 * The contract sends no words for the rows: only `category` has a
 * vocabulary. So the rows say what the phone's sheet says, from
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
  local,
  onApply,
  onClose,
}: {
  open: boolean;
  filters: FoundFilters;
  /** Whether the place is local (`kind` is `local`): How hard is offered there only. */
  local: boolean;
  /** The sheet's rows as chosen; the caller keeps its own day. */
  onApply: (next: FoundFilters) => void;
  onClose: () => void;
}) {
  return (
    <SheetPresence open={open}>
      <FoundFilterForm
        filters={filters}
        local={local}
        onApply={onApply}
        onClose={onClose}
      />
    </SheetPresence>
  );
}

/** Mounted afresh on every opening, so each starts from what is applied. */
function FoundFilterForm({
  filters,
  local,
  onApply,
  onClose,
}: {
  filters: FoundFilters;
  local: boolean;
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

      {foundRows(local).map((key) => (
        <Group key={key} label={foundWords[key].label} className="mt-6">
          {optionsOf(key).map(([value, word]) => (
            <ChipButton
              key={value}
              size="lg"
              pressed={draft[key] === value}
              role="radio"
              aria-pressed={undefined}
              aria-checked={draft[key] === value}
              onClick={() => setDraft((d) => toggleRow(d, key, value))}
              data-option={value}
            >
              {word}
            </ChipButton>
          ))}
        </Group>
      ))}
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
