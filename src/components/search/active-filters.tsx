"use client";

import { Skeleton } from "@/components/states";
import { CloseIcon } from "@/components/ui/icons";
import {
  filterPills,
  withoutFilter,
  withoutFilters,
  activeFilterCount,
  type VocabularyLike,
} from "@/lib/search/labels";
import type { ReelFilters } from "@/lib/search/filters";

/**
 * What is applied, on the screen, removable one at a time (yuvoy-app#37 item 1).
 *
 * The owner's verdict on the first attempt was "very bad filters", and the
 * sharpest half of it was not the wall of chips inside the sheet: it was that
 * **nothing on the screen showed what was applied**. A traveller could open
 * `/search?place=andaman/neil&kind=adventure`, see an empty grid, and have no
 * way to know why except opening the sheet and reading sixty-one chips for a
 * highlight.
 *
 * So the applied filters are the first thing under the search bar, in words,
 * each with its own way off. Removing one takes one filter off: no sheet, no
 * Apply, no draft. That is the whole point, and it is why this is not a
 * shortcut into the pop-up.
 *
 * ## Not shown when nothing is applied
 *
 * An empty row would be permanent furniture above every result.
 *
 * ## "Clear all" only from two
 *
 * With exactly one pill applied, the pill's own × already clears everything,
 * and a second control beside it that does the same thing is a choice a
 * traveller has to read before discovering it was not one.
 */
export function ActiveFilters({
  filters,
  vocabulary,
  onChange,
}: {
  filters: ReelFilters;
  /** `undefined` while the read is in flight: pills show skeletons. */
  vocabulary: VocabularyLike | null | undefined;
  onChange: (next: ReelFilters) => void;
}) {
  const pills = filterPills(filters, vocabulary);
  if (pills.length === 0) return null;

  const count = activeFilterCount(filters);

  return (
    <div
      /*
        Horizontal scroll, never wrap. Four pills plus Clear all would wrap to
        three rows on a small phone and push the grid off the screen, which is
        the fault this row exists to fix arriving from the other direction.

        `-mx-4 px-4` lets the row bleed to the screen edges inside the sheet's
        padding, so a scrolled pill is cut by the viewport rather than by an
        invisible box four pixels in. `pb-1` leaves room for a scrollbar that
        some desktop browsers draw inside the box, which is the same pattern
        the availability picker's day chips use.
      */
      className="-mx-4 mt-3 flex items-center gap-2 overflow-x-auto px-4 pb-1"
      role="group"
      aria-label="Filters applied"
    >
      {pills.map((pill) => (
        <Pill
          key={pill.field}
          label={pill.label}
          onRemove={() => onChange(withoutFilter(filters, pill.field))}
        />
      ))}

      {count >= 2 ? (
        <button
          type="button"
          onClick={() => onChange(withoutFilters(filters))}
          className="text-terra-deep tap-target shrink-0 px-1 text-sm underline underline-offset-4"
        >
          Clear all
        </button>
      ) : null}
    </div>
  );
}

function Pill({
  label,
  onRemove,
}: {
  label: string | null;
  onRemove: () => void;
}) {
  /*
    A label the vocabulary cannot name yet. The skeleton is pill-shaped and
    holds the row's height, and the × still works: the filter IS applied, so
    the way to remove it must not wait on a label to describe it.
  */
  if (label === null) {
    return (
      <span className="border-paper-line flex h-11 shrink-0 items-center gap-2 rounded-full border pr-1 pl-4">
        <Skeleton className="h-3 w-16" />
        <RemoveButton label="this filter" onRemove={onRemove} />
      </span>
    );
  }

  return (
    <span className="border-forest/25 flex h-11 shrink-0 items-center gap-1 rounded-full border pr-1 pl-4 text-sm">
      {label}
      <RemoveButton label={label} onRemove={onRemove} />
    </span>
  );
}

function RemoveButton({
  label,
  onRemove,
}: {
  label: string;
  onRemove: () => void;
}) {
  return (
    <button
      type="button"
      onClick={onRemove}
      /*
        44px, inside a 44px pill. The × is the only control here and a 20px
        target on a moving bus is a filter nobody can take off.
      */
      aria-label={`Remove ${label}`}
      className="text-forest/70 hover:bg-forest/8 hover:text-forest ease-interaction flex size-11 shrink-0 items-center justify-center rounded-full transition-[background-color,color] duration-200"
    >
      <CloseIcon className="size-4" />
    </button>
  );
}
