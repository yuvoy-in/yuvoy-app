"use client";

import { useId } from "react";
import Link from "@/components/ui/link";
import { ChipButton, chipVariants } from "@/components/ui/chip";
import { CloseIcon, MapPinIcon } from "@/components/ui/icons";
import { cn } from "@/lib/cn";
import { foundWords, type UnderstoodChip } from "@/lib/found/found-words";

/**
 * What a search's words were taken to mean (yuvoy-app#180, R3-T2's
 * `understood`): "Showing", then one chip per thing the API understood, in
 * its order and with its `label` word for word.
 *
 * ## The chips are the API's, never ours
 *
 * The page never makes a chip from the words itself: the API reads them in
 * English and romanised Hindi, Telugu and Kannada, and its word lists change
 * with no web release. The caller hands in `understoodRow`'s reading of the
 * answer and this draws it.
 *
 * ## Removing one searches its word as plain text
 *
 * Each chip that narrows (a department, a day, free) is a button named
 * "Remove {label}". Pressed, its `from` word goes back in `asText` with the
 * same `q`, so the word is searched as text and no longer read as a chip.
 * The chip is drawn as an applied one, but it is an action rather than a
 * toggle, so it reports no pressed state.
 *
 * ## A place never narrows
 *
 * A `place` chip is a link, "Search in {place}", to that place with the same
 * words. The caller only hands one in for a place it can open.
 */
export function UnderstoodRow({
  chips,
  onRemove,
  placeHref,
}: {
  chips: readonly UnderstoodChip[];
  onRemove: (chip: UnderstoodChip) => void;
  /** Where "Search in {place}" goes, for a place's `DestinationKey`. */
  placeHref: (destinationKey: string) => string;
}) {
  const labelId = useId();
  if (chips.length === 0) return null;
  return (
    <div
      role="group"
      aria-labelledby={labelId}
      className="flex flex-wrap items-center gap-2"
      data-testid="found-understood"
    >
      <span id={labelId} className="label text-forest/70">
        {foundWords.search.showing}
      </span>
      {chips.map((chip) =>
        chip.kind === "place" ? (
          <Link
            key={`place:${chip.value}`}
            href={placeHref(chip.value)}
            className={cn(chipVariants(), "hover:border-forest/40 bg-paper")}
            data-understood={`place:${chip.value}`}
          >
            <MapPinIcon className="text-terra-deep size-4" />
            {foundWords.search.searchIn(chip.label)}
          </Link>
        ) : (
          <ChipButton
            key={`${chip.kind}:${chip.value}`}
            pressed
            aria-pressed={undefined}
            aria-label={foundWords.search.remove(chip.label)}
            onClick={() => onRemove(chip)}
            data-understood={`${chip.kind}:${chip.value}`}
          >
            {chip.label}
            <CloseIcon className="size-3.5" />
          </ChipButton>
        ),
      )}
    </div>
  );
}
