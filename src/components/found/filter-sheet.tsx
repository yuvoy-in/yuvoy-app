"use client";

import { useId, useState, type ReactNode } from "react";
import { Button } from "@/components/ui/button";
import { ChipButton, chipVariants } from "@/components/ui/chip";
import { Sheet, SheetPresence } from "@/components/ui/sheet";
import { cn } from "@/lib/cn";
import {
  clearRows,
  foundRowsOn,
  foundSheetRows,
  toggleRow,
  type FoundFilterRow,
  type FoundFilters,
} from "@/lib/found/found-filters";
import { foundWords } from "@/lib/found/found-words";

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
 * and `difficulty` is never sent (`foundListQuery`'s `local`). The vocabulary
 * marks such a row `localOnly`.
 *
 * ## The rows and their words are the API's
 *
 * `GET /catalog/vocabulary` sends `foundFilters`: each row's title and its
 * values with their words, in the order to show them (yuvoy-api#589). No word
 * of a row lives in web code, so changing one needs no web release. Only a
 * value this app can carry is offered (`foundSheetRows`). With the vocabulary
 * down the sheet says so and has no rows; what the address already narrows by
 * still narrows, and Clear filters still clears it.
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
  rows,
  rowsPending,
  onApply,
  onClose,
}: {
  open: boolean;
  filters: FoundFilters;
  /** Whether the place is local (`kind` is `local`): How hard is offered there only. */
  local: boolean;
  /** The vocabulary's `foundFilters`, as sent, or absent while it has not answered or could not. */
  rows: readonly FoundFilterRow[] | null | undefined;
  /** The vocabulary has not answered yet, so no rows is not yet a failure. */
  rowsPending: boolean;
  /** The sheet's rows as chosen; the caller keeps its own day. */
  onApply: (next: FoundFilters) => void;
  onClose: () => void;
}) {
  return (
    <SheetPresence open={open}>
      <FoundFilterForm
        filters={filters}
        local={local}
        rows={rows}
        rowsPending={rowsPending}
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
  rows,
  rowsPending,
  onApply,
  onClose,
}: {
  filters: FoundFilters;
  local: boolean;
  rows: readonly FoundFilterRow[] | null | undefined;
  rowsPending: boolean;
  onApply: (next: FoundFilters) => void;
  onClose: () => void;
}) {
  const [draft, setDraft] = useState<FoundFilters>(filters);
  const drawn = foundSheetRows(rows, local);
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
      {drawn.length > 0 ? (
        <p className="text-forest/70 text-sm text-pretty">
          {foundWords.filtersNote}
        </p>
      ) : rowsPending ? null : (
        <p role="status" className="text-forest/70 text-sm text-pretty">
          {foundWords.filtersUnavailable}
        </p>
      )}

      {drawn.map((row) => (
        <Group key={row.key} label={row.label} className="mt-6">
          {row.options.map((option) => (
            <ChipButton
              key={option.key}
              size="lg"
              pressed={draft[row.key] === option.key}
              role="radio"
              aria-pressed={undefined}
              aria-checked={draft[row.key] === option.key}
              onClick={() => setDraft((d) => toggleRow(d, row.key, option.key))}
              data-option={option.key}
            >
              {option.label}
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
