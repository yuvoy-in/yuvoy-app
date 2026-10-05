"use client";

import { useEffect, useLayoutEffect, useRef, useState } from "react";
import { marketDaysFrom } from "@/lib/booking/availability-window";
import {
  firstOpenDay,
  type DayAvailability,
} from "@/lib/booking/day-availability";
import { civilFromDate, weekdayName } from "@/lib/format/date";
import { formatMoney } from "@/lib/format/money";
import { Skeleton } from "@/components/states";
import { cn } from "@/lib/cn";
import {
  DURATION,
  EASE,
  prefersReducedMotion,
  stopAnimations,
} from "@/lib/motion";
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
            className="text-terra-deep tap-target text-button font-bold underline-offset-4 hover:underline"
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

  /*
    THE CHOSEN DAY IS ONE OBJECT (T09 A, approved 4 Oct 2026). A forest
    window sits over the chosen day and slides to the next one on the tap
    (250ms on `--ease-move`); inside it the strip is drawn again as chosen
    days, moving the other way by the same amount, so the dates stay put and
    each one turns paper exactly where the window passes over it. Transforms
    only. The window is `aria-hidden`: the days under it keep `aria-pressed`
    and take every tap.

    The first day chosen fades in under the finger (150ms), and under reduced
    motion every choice does (120ms) without travelling. Before it is placed
    (the server's HTML, the first paint) the chosen day paints its own fill,
    exactly as before; once it is, the strip is marked `data-day-window` and
    the days all draw unchosen under it.
  */
  const windowRef = useRef<HTMLSpanElement | null>(null);
  const copyRef = useRef<HTMLSpanElement | null>(null);
  /** Whether the days were already drawn: a day chosen as they load is simply there. */
  const drawn = useRef(false);
  useLayoutEffect(() => {
    const strip = stripRef.current;
    const win = windowRef.current;
    const copy = copyRef.current;
    if (!strip || !win || !copy || state !== "ready") {
      drawn.current = false;
      return;
    }
    const loading = !drawn.current;
    drawn.current = true;
    const chip = value
      ? strip.querySelector<HTMLElement>(`button[data-date="${value}"]`)
      : null;
    if (!chip) {
      win.hidden = true;
      strip.removeAttribute("data-day-window");
      return;
    }
    for (const twin of copy.querySelectorAll<HTMLElement>("[data-twin]")) {
      const real = strip.querySelector<HTMLElement>(
        `button[data-date="${twin.dataset.twin}"]`,
      );
      if (!real) continue;
      twin.style.left = `${real.offsetLeft}px`;
      twin.style.top = `${real.offsetTop}px`;
      twin.style.width = `${real.offsetWidth}px`;
      twin.style.height = `${real.offsetHeight}px`;
    }
    const left = chip.offsetLeft;
    const top = chip.offsetTop;
    const shown = !win.hidden;
    // From where the window is drawn now, mid-glide included.
    const from = shown ? win.offsetLeft + drawnShiftX(win) : left;
    stopAnimations(win);
    stopAnimations(copy);
    win.hidden = false;
    win.style.left = `${left}px`;
    win.style.top = `${top}px`;
    win.style.width = `${chip.offsetWidth}px`;
    win.style.height = `${chip.offsetHeight}px`;
    copy.style.left = `${-left}px`;
    copy.style.top = `${-top}px`;
    strip.setAttribute("data-day-window", "on");
    if (loading || typeof win.animate !== "function") return;
    const reduced = prefersReducedMotion();
    if (!shown || reduced) {
      win.animate([{ opacity: 0 }], {
        duration: reduced ? DURATION.reducedFade : DURATION.quick,
        easing: reduced ? "linear" : EASE.interaction,
      });
      return;
    }
    const dx = from - left;
    if (Math.abs(dx) < 0.5) return;
    const timing = { duration: DURATION.sheet, easing: EASE.move };
    win.animate(
      [{ transform: `translateX(${dx}px)` }, { transform: "none" }],
      timing,
    );
    copy.animate(
      [{ transform: `translateX(${-dx}px)` }, { transform: "none" }],
      timing,
    );
  }, [value, state, dates]);

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
            <DayFace date={date} day={day} today={today} chosen={selected} />
          </button>
        );
      })}
      {state === "ready" ? (
        <span ref={windowRef} aria-hidden="true" hidden className="day-window">
          <span ref={copyRef} className="day-window-copy">
            {dates.map((date) => {
              const day = days.get(date);
              return (
                <span
                  key={date}
                  data-twin={date}
                  className={cn(
                    "rounded-card border-forest bg-forest text-paper absolute flex flex-col items-center justify-center gap-0.5 border",
                    (day?.state ?? "none") !== "open" && "opacity-40",
                  )}
                >
                  <DayFace date={date} day={day} today={today} chosen />
                </span>
              );
            })}
          </span>
        </span>
      ) : null}
    </div>
  );
}

/** What a day says: its weekday, its date, and from what it costs. */
function DayFace({
  date,
  day,
  today,
  chosen,
}: {
  date: string;
  day: DayAvailability | undefined;
  today: string;
  chosen: boolean;
}) {
  const civil = civilFromDate(date);
  const dayState = day?.state ?? "none";
  const open = dayState === "open";
  return (
    <>
      <span aria-hidden="true" className="label">
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
          chosen ? "text-paper/80" : "text-forest/70",
        )}
      >
        {open && day?.from
          ? formatMoney(day.from)
          : dayState === "full"
            ? "Full"
            : // Held, so a day with nothing on is as tall as one with.
              " "}
      </span>
    </>
  );
}

/** How far a running slide has an element from its place, along x. */
function drawnShiftX(el: HTMLElement): number {
  const t = getComputedStyle(el).transform;
  const m = t && t !== "none" ? /^matrix\(([^)]+)\)$/.exec(t) : null;
  return m ? Number(m[1].split(",")[4]) || 0 : 0;
}
