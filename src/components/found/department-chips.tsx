"use client";

import { ChipButton } from "@/components/ui/chip";
import { foundWords, type Category } from "@/lib/found/found-words";

/**
 * The department chips over the found feed (yuvoy-app#179): "All", then the
 * vocabulary's departments, one at a time.
 *
 * ## The vocabulary's answer, and nothing else
 *
 * The chips are exactly `GET /catalog/vocabulary`'s `categories`, in the order
 * it sends them, with its labels (REQ-R0-16). No list of departments lives in
 * web code: a department the API adds tomorrow is a chip tomorrow, and one it
 * retires is gone, with no web release in between. With the vocabulary down
 * the row is "All" alone (decision 9 of the note), which is still a true
 * statement of what the list shows.
 *
 * ## Filters, not tabs
 *
 * Each chip is a button with `aria-pressed`, the app's filter chip, in a named
 * group. They narrow one list rather than switching between panels, so they
 * are not a tablist. The caller writes `?category=` and reads the list for
 * it; this component only says which was chosen.
 */
export function DepartmentChips({
  terms,
  selected,
  onSelect,
}: {
  /** The vocabulary's `categories`, as sent, or null while it has not answered or could not. */
  terms: readonly { key: string; label: string }[] | null | undefined;
  selected: Category | null;
  onSelect: (category: Category | null) => void;
}) {
  return (
    <div
      role="group"
      aria-label={foundWords.chipsLabel}
      className="-mx-4 flex [scrollbar-width:none] gap-2 overflow-x-auto px-4 pb-1"
    >
      <ChipButton
        pressed={selected === null}
        onClick={() => onSelect(null)}
        data-category=""
      >
        {foundWords.allChip}
      </ChipButton>
      {(terms ?? []).map((term) => (
        <ChipButton
          key={term.key}
          pressed={selected === term.key}
          // The vocabulary's keys are the API's `Category` values.
          onClick={() => onSelect(term.key as Category)}
          data-category={term.key}
        >
          {term.label}
        </ChipButton>
      ))}
    </div>
  );
}
