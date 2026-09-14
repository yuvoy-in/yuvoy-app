"use client";

import { useState } from "react";
import { Sheet } from "@/components/ui/sheet";
import { Button } from "@/components/ui/button";
import { ChipButton } from "@/components/ui/chip";
import { Skeleton } from "@/components/states";
import { marketToday, marketDaysFrom } from "@/lib/booking/availability-window";
import { dayLabel } from "@/lib/search/labels";
import type { ReelFilters, Category } from "@/lib/search/filters";
import { useVocabulary } from "@/lib/search/use-search-reels";
import { MonthCalendar } from "./month-calendar";

/**
 * Where, when and what — yuvoy-app#37, second attempt.
 *
 * ## What the first attempt got wrong
 *
 * It replaced three stacked chip rows with one pop-up, which was the right
 * move, and then put everything in the pop-up: 14 day chips, 12 category chips
 * and all 35 activity types, visible at once. The owner's verdict was "very
 * bad". Two separate faults:
 *
 *   - **A wall of chips is not a filter.** Sixty-one controls on one sheet is
 *     harder to read than the rows it replaced, and the day chips could never
 *     reach past a fortnight however many were added.
 *   - **Nothing on screen said what was applied.** That half is fixed outside
 *     this file, by the pills under the search bar.
 *
 * So: fourteen day chips become four, one of which opens a calendar. Thirty-five
 * activity types become however many the chosen category has, and none at all
 * until one is chosen. Where, When, What, in that order, and Activity under
 * What because it only exists in relation to it.
 *
 * ## The choices are drafted, then applied
 *
 * Each tap changes a DRAFT and only "Show results" writes it to the address. A
 * sheet that filtered live would refetch on every tap and leave the grid
 * reflowing under a panel nobody can see past. It also makes "Clear all"
 * meaningful: it empties the draft, and the traveller still has to say so.
 *
 * The draft is seeded on MOUNT and the caller mounts this only while the sheet
 * is open, so abandoned edits are not waiting next time. That is why there is
 * no "re-seed when `open` flips" effect: it is the shape React lints against by
 * name, and a remount expressed the long way round.
 *
 * ## What survives a vocabulary that will not load
 *
 * When. It is calendar arithmetic, not server data, so it keeps working while
 * Where and What say what is missing (item 7). A whole-sheet error state would
 * take away the part that still works.
 */
export function FilterSheet({
  onClose,
  filters,
  onApply,
}: {
  onClose: () => void;
  filters: ReelFilters;
  onApply: (next: ReelFilters) => void;
}) {
  const vocabulary = useVocabulary();
  const [draft, setDraft] = useState<ReelFilters>(filters);

  const today = marketToday();
  const [, tomorrow] = marketDaysFrom(today, 2);

  const destinations = vocabulary.data?.destinations ?? [];
  const categories = vocabulary.data?.categories ?? [];
  const activityTypes = vocabulary.data?.activityTypes ?? [];

  /*
    "Pick a date" is open when the chosen day is neither today nor tomorrow, so
    a traveller re-opening the sheet on `on=2026-09-20` sees the calendar with
    that date selected rather than three chips and no sign of what is applied.
  */
  const [pickingDate, setPickingDate] = useState(
    Boolean(draft.bookableOn) &&
      draft.bookableOn !== today &&
      draft.bookableOn !== tomorrow,
  );

  /** Only the chosen category's types, which is what makes 35 into a handful. */
  const shownTypes = draft.category
    ? activityTypes.filter((t) => t.category === draft.category)
    : [];

  const setDay = (bookableOn: string | undefined) => {
    setPickingDate(false);
    setDraft((d) => ({ ...d, bookableOn }));
  };

  /*
    Choosing or clearing a category always clears the activity type. The type
    chips are narrowed BY the category, so a type left behind is a filter with
    no chip on screen to un-tap.
  */
  const setCategory = (key: string | undefined) =>
    setDraft((d) => ({
      ...d,
      category: d.category === key ? undefined : (key as Category | undefined),
      activityType: undefined,
    }));

  return (
    <Sheet
      open
      onClose={onClose}
      title="Filters"
      footer={
        <div className="flex gap-3">
          {/*
            Clears the DRAFT only. Nothing has been applied yet, so this is not
            "clear my search": that is the pill row's "Clear all".
          */}
          <Button
            variant="outline"
            className="flex-1"
            onClick={() => {
              setPickingDate(false);
              setDraft({ q: draft.q });
            }}
          >
            Clear all
          </Button>
          <Button
            className="flex-1"
            onClick={() => {
              onApply(draft);
              onClose();
            }}
          >
            Show results
          </Button>
        </div>
      }
    >
      {/*
        WHERE.

        Andaman is not one place: getting between Port Blair and Havelock is a
        ferry and most of a morning, so somebody staying on one island is
        browsing an island rather than a market.

        Hidden entirely below two destinations, because a single-choice group
        with one real option is a control that cannot change anything. The
        labels are the server's, verbatim: "Havelock (Swaraj Dweep)" is not
        something any title-casing of `andaman/havelock` produces.
      */}
      {vocabulary.isLoading ? (
        <Group label="Where">
          <ChipSkeletons />
        </Group>
      ) : vocabulary.isError ? null : destinations.length > 1 ? (
        <Group label="Where">
          <ChipButton
            size="lg"
            pressed={draft.destinationKey === undefined}
            onClick={() =>
              setDraft((d) => ({ ...d, destinationKey: undefined }))
            }
          >
            Anywhere
          </ChipButton>
          {destinations.map((place) => (
            <ChipButton
              key={place.key}
              size="lg"
              pressed={draft.destinationKey === place.key}
              onClick={() =>
                setDraft((d) => ({
                  ...d,
                  destinationKey:
                    d.destinationKey === place.key ? undefined : place.key,
                }))
              }
            >
              {place.label}
            </ChipButton>
          ))}
        </Group>
      ) : null}

      {/*
        WHEN. Four chips where there were fourteen, and a calendar behind the
        fourth. Works with no vocabulary at all: these are dates.
      */}
      <Group label="When" className="mt-6">
        <ChipButton
          size="lg"
          pressed={draft.bookableOn === undefined && !pickingDate}
          onClick={() => setDay(undefined)}
        >
          Any day
        </ChipButton>
        <ChipButton
          size="lg"
          pressed={draft.bookableOn === today}
          onClick={() => setDay(today)}
        >
          Today
        </ChipButton>
        <ChipButton
          size="lg"
          pressed={draft.bookableOn === tomorrow}
          onClick={() => setDay(tomorrow)}
        >
          Tomorrow
        </ChipButton>
        {/*
          Once a date is chosen the chip READS that date, so the applied day is
          legible without opening the calendar. "Pick a date" with a date
          quietly selected behind it is the fault this whole issue is about.
        */}
        <ChipButton
          size="lg"
          pressed={pickingDate}
          onClick={() => setPickingDate(true)}
        >
          {pickingDate && draft.bookableOn
            ? dayLabel(draft.bookableOn, today)
            : "Pick a date"}
        </ChipButton>
      </Group>

      {pickingDate ? (
        <MonthCalendar
          value={draft.bookableOn}
          today={today}
          onSelect={(date) => setDraft((d) => ({ ...d, bookableOn: date }))}
        />
      ) : null}

      {/*
        WHAT.

        No "Anything" chip, by instruction: tapping the selected chip unselects
        it, so a neutral option would be a second way to do one thing. Nothing
        is selected by default.
      */}
      {vocabulary.isLoading ? (
        <Group label="What" className="mt-6">
          <ChipSkeletons />
        </Group>
      ) : vocabulary.isError ? (
        <div className="mt-6">
          <p role="alert" className="text-sm">
            Places and activities did not load.
          </p>
          <Button
            variant="outline"
            size="sm"
            className="mt-3"
            onClick={() => void vocabulary.refetch()}
          >
            Try again
          </Button>
        </div>
      ) : categories.length > 0 ? (
        <Group label="What" className="mt-6">
          {categories.map((kind) => (
            <ChipButton
              key={kind.key}
              size="lg"
              pressed={draft.category === kind.key}
              onClick={() => setCategory(kind.key)}
            >
              {kind.label}
            </ChipButton>
          ))}
        </Group>
      ) : null}

      {/*
        ACTIVITY. Only after a category is chosen, and only when that category
        has types. This is the 35-chips-at-once fault, fixed: the vocabulary
        carries the category on each type, so the grouping is the server's
        rather than a second copy of the taxonomy in this client.
      */}
      {shownTypes.length > 0 ? (
        <Group label="Activity" className="mt-6">
          {shownTypes.map((type) => (
            <ChipButton
              key={type.key}
              size="lg"
              pressed={draft.activityType === type.key}
              onClick={() =>
                setDraft((d) => ({
                  ...d,
                  activityType:
                    d.activityType === type.key ? undefined : type.key,
                }))
              }
            >
              {type.label}
            </ChipButton>
          ))}
        </Group>
      ) : null}
    </Sheet>
  );
}

/** Three chip-shaped placeholders. Never a raw key. */
function ChipSkeletons() {
  return (
    <>
      {[0, 1, 2].map((i) => (
        <Skeleton key={i} className="h-11 w-24 rounded-full" />
      ))}
    </>
  );
}

function Group({
  label,
  children,
  className,
}: {
  label: string;
  children: React.ReactNode;
  className?: string;
}) {
  return (
    <div className={className}>
      <span className="label text-forest/75">{label}</span>
      <div
        className="mt-2.5 flex flex-wrap gap-2"
        role="group"
        aria-label={label}
      >
        {children}
      </div>
    </div>
  );
}
