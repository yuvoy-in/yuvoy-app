"use client";

import { useState } from "react";
import { cn } from "@/lib/cn";
import { marketToday } from "@/lib/booking/availability-window";
import { dateLabel } from "@/lib/search/labels";
import {
  monthGrid,
  monthLabel,
  monthStart,
  shiftMonth,
  canStepMonth,
  WEEKDAY_INITIALS,
} from "@/lib/search/month-grid";
import { ChevronRightIcon } from "@/components/ui/icons";

/**
 * Pick a date, inline under the When chips (yuvoy-app#37 item 4).
 *
 * It replaces fourteen day chips. The owner's verdict on those, alongside 12
 * category chips and all 35 activity types on one screen, was "very bad": a
 * filter sheet that is a wall of chips shows nothing about what is applied and
 * cannot grow past a fortnight.
 *
 * ## The arithmetic is not in here
 *
 * `lib/search/month-grid.ts` decides which cell a month starts on, which days
 * are outside the window and whether an arrow leads anywhere, and it is tested
 * without rendering. This file is the buttons.
 *
 * ## Every cell is a real button with a real name
 *
 * The visible text is a bare number, which reads as "20" to a screen reader
 * and says nothing about which month or whether it can be chosen. Each cell
 * carries its full date as its accessible name instead, and a disabled day is
 * `disabled` rather than merely styled: a date outside the window is one the
 * API refuses, so letting it be pressed would spend a round trip to show an
 * empty grid.
 *
 * `dateLabel` rather than `dayLabel`, so a cell is never named "Today". The
 * When chip above already is, and two buttons with one accessible name in the
 * same dialog is ambiguous to anybody navigating by name.
 */
export function MonthCalendar({
  value,
  onSelect,
  today = marketToday(),
}: {
  /** The chosen date, if there is one. */
  value?: string;
  onSelect: (date: string) => void;
  today?: string;
}) {
  /*
    The month on screen. Seeded from the chosen date so re-opening a calendar
    lands where the traveller left it, and from today otherwise.
  */
  const [anchor, setAnchor] = useState(() => monthStart(value ?? today));

  const cells = monthGrid(anchor, today);
  const canBack = canStepMonth(anchor, -1, today);
  const canForward = canStepMonth(anchor, 1, today);

  return (
    <div className="border-paper-line mt-3 rounded-2xl border p-3">
      <div className="flex items-center justify-between">
        <Arrow
          direction="back"
          disabled={!canBack}
          onClick={() => setAnchor(shiftMonth(anchor, -1))}
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
          onClick={() => setAnchor(shiftMonth(anchor, 1))}
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

      <div className="mt-1 grid grid-cols-7 gap-1">
        {cells.map((cell, i) =>
          cell.date === null ? (
            <span key={`blank-${i}`} aria-hidden="true" />
          ) : (
            <button
              key={cell.date}
              type="button"
              disabled={cell.disabled}
              aria-pressed={value === cell.date}
              aria-label={dateLabel(cell.date)}
              onClick={() => onSelect(cell.date!)}
              className={cn(
                "ease-interaction flex h-10 items-center justify-center rounded-full text-sm transition-[background-color,color] duration-200",
                /*
                  The repo's own disabled treatment, from `buttonVariants`,
                  rather than a low text opacity. §1's opacity ladder reserves
                  anything under forest/70 for decoration, and a date is read.
                */
                cell.disabled && "opacity-40",
                !cell.disabled && value !== cell.date && "hover:bg-forest/8",
                value === cell.date && "bg-forest text-paper font-bold",
              )}
            >
              {cell.day}
            </button>
          ),
        )}
      </div>
    </div>
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
