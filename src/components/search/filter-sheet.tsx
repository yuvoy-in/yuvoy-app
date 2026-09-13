"use client";

import { useState } from "react";
import { Sheet } from "@/components/ui/sheet";
import { Button } from "@/components/ui/button";
import { ChipButton } from "@/components/ui/chip";
import { marketDays, marketToday } from "@/lib/booking/availability-window";
import type { ReelFilters, Category } from "@/lib/search/filters";
import { useVocabulary } from "@/lib/search/use-search-reels";

/**
 * One Filters button, one pop-up — yuvoy-app#37.
 *
 * The owner's words on the screen this replaces: "see how bad the UI is."
 * Three stacked chip rows — Which day, Where, What kind of day — filled the
 * phone above the results, so a search screen showed no results until you
 * scrolled past its own controls.
 *
 * ## The choices are drafted, then applied
 *
 * Each tap in here changes a DRAFT, and only Apply writes it to the address.
 * A sheet that filtered live would refetch on every tap and, worse, leave the
 * grid behind it reflowing under a panel nobody can see past. It also makes
 * Clear meaningful: it empties the draft, and the traveller still has to say
 * so.
 *
 * The draft is seeded from the applied filters on MOUNT, and the caller mounts
 * this only while the sheet is open — so a traveller who changes their mind and
 * closes it does not find their abandoned edits waiting the next time.
 *
 * That is why there is no "re-seed when `open` flips" effect here. There was
 * one, and it is the shape React now lints against by name: setting state
 * synchronously in an effect to mirror a prop, which costs a cascading render
 * and is a remount expressed the long way round.
 *
 * ## Activity types are grouped by category, as asked
 *
 * `GET /catalog/vocabulary` returns each activity type with the category it
 * belongs to, which is what makes the grouping the server's rather than a map
 * in this client. Choosing an activity type does NOT also set its category:
 * they are independent filters on the API and sending both would narrow to the
 * intersection, which is the same set and one more thing to un-tap.
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

  const days = marketDays(14);
  const categories = vocabulary.data?.categories ?? [];
  const destinations = vocabulary.data?.destinations ?? [];
  const activityTypes = vocabulary.data?.activityTypes ?? [];

  /*
    The activity chips, narrowed to the chosen category when there is one.
    The vocabulary carries the category on each type precisely so this can be
    the server's grouping rather than a second copy of the taxonomy here.
  */
  const shownTypes = draft.category
    ? activityTypes.filter((t) => t.category === draft.category)
    : activityTypes;

  const set = <K extends keyof ReelFilters>(key: K, value: ReelFilters[K]) =>
    setDraft((d) => ({ ...d, [key]: d[key] === value ? undefined : value }));

  return (
    <Sheet
      open
      onClose={onClose}
      title="Filters"
      footer={
        <div className="flex gap-3">
          <Button
            variant="outline"
            className="flex-1"
            onClick={() => setDraft({ q: draft.q })}
          >
            Clear
          </Button>
          <Button
            className="flex-1"
            onClick={() => {
              onApply(draft);
              onClose();
            }}
          >
            Apply
          </Button>
        </div>
      }
    >
      <Group label="Which day">
        <ChipButton
          size="lg"
          pressed={draft.bookableOn === undefined}
          onClick={() => setDraft((d) => ({ ...d, bookableOn: undefined }))}
        >
          Any day
        </ChipButton>
        {days.map((day) => (
          <ChipButton
            key={day}
            size="lg"
            pressed={draft.bookableOn === day}
            onClick={() => set("bookableOn", day)}
          >
            {dayLabel(day)}
          </ChipButton>
        ))}
      </Group>

      {/*
        Andaman is not one place: getting between Port Blair and Havelock is a
        ferry and most of a morning, so somebody staying on one island is
        browsing an island rather than a market.

        The label is the server's, verbatim — "Havelock (Swaraj Dweep)" is not
        something any title-casing of `andaman/havelock` produces.
      */}
      {destinations.length > 1 ? (
        <Group label="Where" className="mt-6">
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
              onClick={() => set("destinationKey", place.key)}
            >
              {place.label}
            </ChipButton>
          ))}
        </Group>
      ) : null}

      {categories.length > 1 ? (
        <Group label="What kind of day" className="mt-6">
          <ChipButton
            size="lg"
            pressed={draft.category === undefined}
            onClick={() =>
              /*
                Clearing the category also clears the activity type, because
                the type chips are narrowed BY the category: leaving a type
                selected that is no longer on screen is a filter a traveller
                cannot see and cannot remove.
              */
              setDraft((d) => ({
                ...d,
                category: undefined,
                activityType: undefined,
              }))
            }
          >
            Anything
          </ChipButton>
          {categories.map((kind) => (
            <ChipButton
              key={kind.key}
              size="lg"
              pressed={draft.category === kind.key}
              onClick={() =>
                setDraft((d) => ({
                  ...d,
                  category:
                    d.category === kind.key
                      ? undefined
                      : (kind.key as Category),
                  // Same reason as above, on the way in as well as out.
                  activityType: undefined,
                }))
              }
            >
              {kind.label}
            </ChipButton>
          ))}
        </Group>
      ) : null}

      {shownTypes.length > 0 ? (
        <Group label="Doing what" className="mt-6">
          {shownTypes.map((type) => (
            <ChipButton
              key={type.key}
              size="lg"
              pressed={draft.activityType === type.key}
              onClick={() => set("activityType", type.key)}
            >
              {type.label}
            </ChipButton>
          ))}
        </Group>
      ) : null}

      {/*
        The vocabulary failed to load. The text box still searches and the day
        chips are calendar dates rather than server data, so this says what is
        missing instead of taking the sheet to an error state that would also
        remove the parts that still work.
      */}
      {vocabulary.isError ? (
        <p role="alert" className="text-terra-deep mt-6 text-sm">
          The place and activity choices did not load. Searching by word or by
          day still works.
        </p>
      ) : null}
    </Sheet>
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

function dayLabel(date: string): string {
  const d = new Date(`${date}T12:00:00+05:30`);
  if (date === marketToday()) return "Today";
  return new Intl.DateTimeFormat("en-IN", {
    weekday: "short",
    day: "numeric",
    timeZone: "Asia/Kolkata",
  }).format(d);
}
