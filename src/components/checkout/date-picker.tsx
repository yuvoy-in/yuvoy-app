"use client";

import { formatMoney } from "@/lib/format/money";
import { marketToday } from "@/lib/booking/availability-window";
import type { DayAvailability } from "@/lib/booking/day-availability";
import {
  monthGrid,
  monthLabel,
  shiftMonth,
  canStepMonth,
  WEEKDAY_INITIALS,
} from "@/lib/search/month-grid";
import { dateLabel } from "@/lib/search/labels";
import { Button } from "@/components/ui/button";
import { ChevronRightIcon } from "@/components/ui/icons";
import { Skeleton } from "@/components/states";
import { cn } from "@/lib/cn";

/**
 * The month calendar on checkout (yuvoy-app#62 item 3).
 *
 * Not the search one. `MonthCalendar` under `components/search` answers "which
 * day are you looking for", where every day in the window is equally
 * choosable. This answers "which day can you go", where most squares are not
 * choosable at all and the ones that are carry a price.
 *
 * The arithmetic is shared: `lib/search/month-grid` decides which cell a month
 * starts on and which days are outside the window, and it is tested without
 * rendering. What is added here is the departures.
 *
 * ## It fetches nothing
 *
 * The screen above holds one 90-day window, which is the API's own ceiling and
 * the whole span a traveller may choose. See `CALENDAR_WINDOW_DAYS` for why
 * that beats a request per month. This component draws whichever month it is
 * pointed at out of that one map, so stepping a month is instant and the
 * arrows can be drawn correctly before anything is fetched.
 */
export function DatePicker({
  anchor,
  onAnchor,
  days,
  value,
  onSelect,
  state,
  onRetry,
  today = marketToday(),
}: {
  /** The first of the month on screen. */
  anchor: string;
  onAnchor: (month: string) => void;
  /** Every day in the window, keyed `YYYY-MM-DD`. */
  days: Map<string, DayAvailability>;
  value: string | null;
  onSelect: (date: string, day: DayAvailability) => void;
  state: "pending" | "error" | "ready";
  onRetry: () => void;
  today?: string;
}) {
  const cells = monthGrid(anchor, today);
  const canBack = canStepMonth(anchor, -1, today);
  const canForward = canStepMonth(anchor, 1, today);

  return (
    <section aria-labelledby="date-heading">
      <h2 id="date-heading" className="label text-forest/75">
        Pick a day
      </h2>

      <div className="border-paper-line mt-3 rounded-2xl border p-3">
        <div className="flex items-center justify-between">
          <Arrow
            direction="back"
            disabled={!canBack}
            onClick={() => onAnchor(shiftMonth(anchor, -1))}
          />
          {/*
            `aria-live` so stepping a month is announced. Without it the arrows
            are two buttons that appear to do nothing.
          */}
          <p aria-live="polite" className="text-sm font-bold">
            {monthLabel(anchor)}
          </p>
          <Arrow
            direction="forward"
            disabled={!canForward}
            onClick={() => onAnchor(shiftMonth(anchor, 1))}
          />
        </div>

        <div
          aria-hidden="true"
          className="text-forest/75 mt-3 grid grid-cols-7 gap-1 text-center text-xs"
        >
          {WEEKDAY_INITIALS.map((initial, i) => (
            // Two Tuesdays and two Saturdays share an initial, so the index is
            // the key. `aria-hidden` because each cell already names its day.
            <span key={i}>{initial}</span>
          ))}
        </div>

        {state === "pending" ? (
          <div className="mt-1 grid grid-cols-7 gap-1">
            {Array.from({ length: 35 }).map((_, i) => (
              <Skeleton key={i} className="h-14 rounded-xl" />
            ))}
          </div>
        ) : state === "error" ? (
          <div className="py-8 text-center">
            <p className="text-sm font-bold">Dates did not load.</p>
            <Button
              variant="outline"
              size="sm"
              onClick={onRetry}
              className="mt-3"
            >
              Try again
            </Button>
          </div>
        ) : (
          <div className="mt-1 grid grid-cols-7 gap-1">
            {cells.map((cell, i) =>
              cell.date === null ? (
                <span key={`blank-${i}`} aria-hidden="true" />
              ) : (
                <DayCell
                  key={cell.date}
                  date={cell.date}
                  day={cell.day}
                  outOfWindow={cell.disabled}
                  availability={days.get(cell.date)}
                  selected={value === cell.date}
                  isToday={cell.date === today}
                  onSelect={onSelect}
                />
              ),
            )}
          </div>
        )}
      </div>
    </section>
  );
}

function DayCell({
  date,
  day,
  outOfWindow,
  availability,
  selected,
  isToday,
  onSelect,
}: {
  date: string;
  day: number;
  outOfWindow: boolean;
  availability: DayAvailability | undefined;
  selected: boolean;
  isToday: boolean;
  onSelect: (date: string, day: DayAvailability) => void;
}) {
  const state = outOfWindow ? "none" : (availability?.state ?? "none");
  const open = state === "open";

  /*
    The accessible name carries everything the square says, because the visible
    text is a bare number and "20" tells a screen reader nothing about which
    month, what it costs, or whether it can be chosen at all.
  */
  const name = [
    dateLabel(date),
    state === "full" ? "full" : null,
    open && availability?.from
      ? `from ${formatMoney(availability.from)}`
      : null,
  ]
    .filter(Boolean)
    .join(", ");

  return (
    <button
      type="button"
      disabled={!open}
      aria-pressed={selected}
      aria-label={name}
      onClick={() => availability && onSelect(date, availability)}
      className={cn(
        "ease-interaction flex h-14 flex-col items-center justify-center rounded-xl text-sm transition-[background-color,color] duration-200",
        !open && "opacity-40",
        open && !selected && "hover:bg-forest/8",
        selected && "bg-forest text-paper font-bold",
        /*
          Today gets a ring rather than a fill. A filled today would be
          indistinguishable from the chosen day, and on this screen the chosen
          day is the one thing that must be unmistakable.
        */
        isToday && !selected && "ring-forest/40 ring-1 ring-inset",
      )}
    >
      <span>{day}</span>
      {open && availability?.from ? (
        <span
          aria-hidden="true"
          className={cn(
            "mt-0.5 text-[10px] leading-none",
            selected ? "text-paper/80" : "text-forest/70",
          )}
        >
          {formatMoney(availability.from)}
        </span>
      ) : state === "full" ? (
        <span
          aria-hidden="true"
          className="text-forest/70 mt-0.5 text-[10px] leading-none"
        >
          Full
        </span>
      ) : null}
    </button>
  );
}

function Arrow({
  direction,
  disabled,
  onClick,
}: {
  direction: "back" | "forward";
  disabled: boolean;
  onClick: () => void;
}) {
  return (
    <button
      type="button"
      disabled={disabled}
      onClick={onClick}
      aria-label={direction === "back" ? "Previous month" : "Next month"}
      className="text-forest/70 hover:bg-forest/8 hover:text-forest ease-interaction flex size-11 items-center justify-center rounded-full transition-[background-color,color] duration-200 disabled:pointer-events-none disabled:opacity-30"
    >
      <ChevronRightIcon
        className={cn("size-5", direction === "back" && "rotate-180")}
      />
    </button>
  );
}
