"use client";

import { useEffect, useRef, useState } from "react";
import { marketDaysFrom } from "@/lib/booking/availability-window";
import {
  firstOpenDay,
  type DayAvailability,
} from "@/lib/booking/day-availability";
import { civilFromDate, weekdayName } from "@/lib/format/date";
import { formatMoney } from "@/lib/format/money";
import { Skeleton } from "@/components/states";
import { cn } from "@/lib/cn";
import { DatesFailed, MonthCalendar, dayName } from "./date-picker";

/** Two weeks: the days most trips are booked for, each one tap away. */
export const STRIP_DAYS = 14;

type View = "strip" | "month";

/**
 * Which day, on checkout (the approved redesign, traveller A, 3 Oct 2026).
 *
 * The next two weeks as a strip of days, with the month one tap away behind
 * "More dates". Most trips here are booked days ahead, not months, and a
 * month grid made a traveller read a calendar to find tomorrow. The month is
 * still there, unchanged, for anybody planning further out.
 *
 * It opens on the month instead when the day it would show is past the
 * strip: a link that names a date three weeks out, or a listing whose first
 * open day is next month. A strip of fourteen grey days would only send them
 * to the button. Derived rather than set in an effect, like the month's own
 * anchor, and a traveller's own choice of view wins from then on.
 *
 * Both views draw the same map with the same rule and name every day the same
 * way (`dayName`), so they cannot disagree about what a day offers.
 */
export function DateChooser({
  anchor,
  onAnchor,
  days,
  value,
  onSelect,
  state,
  onRetry,
  today,
}: {
  /** The first of the month the month view shows. */
  anchor: string;
  onAnchor: (month: string) => void;
  /** Every day in the window, keyed `YYYY-MM-DD`. */
  days: Map<string, DayAvailability>;
  value: string | null;
  onSelect: (date: string, day: DayAvailability) => void;
  state: "pending" | "error" | "ready";
  onRetry: () => void;
  /** The market's today, by the server's clock. */
  today: string;
}) {
  const dates = marketDaysFrom(today, STRIP_DAYS);
  const last = dates[dates.length - 1];
  const target = value ?? firstOpenDay(days);
  const [chosenView, setChosenView] = useState<View | null>(null);
  const view: View =
    chosenView ?? (target !== null && target > last ? "month" : "strip");

  return (
    <section aria-labelledby="date-heading">
      <div className="flex items-center justify-between gap-4">
        <h2 id="date-heading" className="label text-forest/75">
          Pick a day
        </h2>
        {/* Nothing to see more of until the dates have arrived. */}
        {state === "ready" ? (
          <button
            type="button"
            onClick={() => setChosenView(view === "strip" ? "month" : "strip")}
            className="text-terra-deep tap-target text-sm font-bold underline-offset-4 hover:underline"
          >
            {view === "strip" ? "More dates" : "Next two weeks"}
          </button>
        ) : null}
      </div>

      <div className="mt-3">
        {view === "strip" ? (
          <DayStrip
            dates={dates}
            days={days}
            value={value}
            onSelect={onSelect}
            state={state}
            onRetry={onRetry}
            today={today}
          />
        ) : (
          <MonthCalendar
            anchor={anchor}
            onAnchor={onAnchor}
            days={days}
            value={value}
            onSelect={onSelect}
            state={state}
            onRetry={onRetry}
            today={today}
          />
        )}
      </div>
    </section>
  );
}

function DayStrip({
  dates,
  days,
  value,
  onSelect,
  state,
  onRetry,
  today,
}: {
  dates: readonly string[];
  days: Map<string, DayAvailability>;
  value: string | null;
  onSelect: (date: string, day: DayAvailability) => void;
  state: "pending" | "error" | "ready";
  onRetry: () => void;
  today: string;
}) {
  const stripRef = useRef<HTMLDivElement | null>(null);

  /*
    The chosen day on screen, when it is past the first few: a link that names
    the 12th opens with the 12th visible, not hidden off the right edge. The
    strip's own scroll position only, never the page's: `scrollIntoView` would
    also scroll the page to it.
  */
  useEffect(() => {
    const strip = stripRef.current;
    if (!strip || !value || state !== "ready") return;
    const chip = strip.querySelector<HTMLElement>(`[data-date="${value}"]`);
    if (!chip) return;
    const right = chip.offsetLeft + chip.offsetWidth;
    if (right <= strip.scrollLeft + strip.clientWidth) return;
    const inset = parseFloat(getComputedStyle(strip).paddingLeft) || 0;
    strip.scrollLeft = chip.offsetLeft - inset;
  }, [value, state]);

  if (state === "error") return <DatesFailed onRetry={onRetry} />;

  return (
    <div
      ref={stripRef}
      role="group"
      aria-label="The next two weeks"
      /*
        Edge to edge of the sheet, so the strip reads as one that continues
        rather than a box that ends; the padding keeps the first and last day
        on the page's own margins, and snapping lands on them too.
      */
      className="relative -mx-6 flex snap-x scroll-px-6 gap-2 overflow-x-auto px-6 pb-1 sm:-mx-10 sm:scroll-px-10 sm:px-10"
    >
      {dates.map((date) => {
        if (state === "pending") {
          return (
            <Skeleton key={date} className="rounded-card h-19 w-17 shrink-0" />
          );
        }
        const day = days.get(date);
        const dayState = day?.state ?? "none";
        const open = dayState === "open";
        const selected = value === date;
        const civil = civilFromDate(date);
        return (
          <button
            key={date}
            type="button"
            data-date={date}
            disabled={!open}
            aria-pressed={selected}
            aria-label={dayName(date, dayState, day)}
            onClick={() => day && onSelect(date, day)}
            className={cn(
              "rounded-card ease-interaction flex min-h-19 w-17 shrink-0 snap-start flex-col items-center justify-center gap-0.5 border transition-colors duration-200",
              selected
                ? "border-forest bg-forest text-paper"
                : "border-paper-line bg-paper-deep text-forest",
              open && !selected && "hover:border-forest/40",
              !open && "cursor-not-allowed opacity-40",
              /*
                Today gets a ring rather than a fill, as on the month: a filled
                today would look chosen, and the chosen day is the one thing on
                this screen that must be unmistakable.
              */
              date === today && !selected && "ring-forest/40 ring-1 ring-inset",
            )}
          >
            <span aria-hidden="true" className="label text-[11px]">
              {date === today ? "Today" : civil ? weekdayName(civil) : ""}
            </span>
            <span
              aria-hidden="true"
              className="text-xl leading-6 font-bold tabular-nums"
            >
              {civil ? civil.day : date.slice(8)}
            </span>
            <span
              aria-hidden="true"
              className={cn(
                "text-[11px] leading-3.5",
                selected ? "text-paper/80" : "text-forest/70",
              )}
            >
              {open && day?.from
                ? formatMoney(day.from)
                : dayState === "full"
                  ? "Full"
                  : // Held, so a day with nothing on is as tall as one with.
                    " "}
            </span>
          </button>
        );
      })}
    </div>
  );
}
