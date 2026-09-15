"use client";

import { slotIsOpen } from "@/lib/booking/slot-open";
import { cn } from "@/lib/cn";
import type { components } from "@/lib/api/schema.gen";

type Slot = components["schemas"]["Slot"];

/**
 * Which departure, once a day is chosen (yuvoy-app#62 item 4).
 *
 * One chip per departure, in the market's own time order. A sold-out one is
 * shown disabled and reads "Full" rather than being hidden, which is the same
 * rule the calendar follows and for the same reason: a traveller who knows the
 * 07:00 exists and is taken will look for another day, where one who sees only
 * the 14:00 will assume that is all there ever is.
 *
 * `remainingDisplay` is rendered VERBATIM where it exists. The contract is
 * explicit: "Render this string; do not re-derive it from `remainingSeats`, or
 * the two disagree the moment either rule changes."
 */
export function TimePicker({
  slots,
  value,
  onSelect,
  now,
}: {
  slots: readonly Slot[];
  value: string | null;
  onSelect: (slot: Slot) => void;
  /** The server's clock, so a cutoff is judged the same way the API judges it. */
  now: number;
}) {
  return (
    <section className="mt-8" aria-labelledby="time-heading">
      <h2 id="time-heading" className="label text-forest/75">
        What time?
      </h2>

      <div className="mt-3 flex flex-wrap gap-2">
        {slots.map((slot) => {
          const open = !slot.soldOut && slotIsOpen(slot, now);
          const time = (slot.localStartTime ?? "").slice(0, 5);
          const chosen = value === slot.id;
          /*
            "Full" and "Closed" are different sentences, and the old date
            pop-up said so before yuvoy-app#62 deleted it. A boat with no seats
            left tells a traveller to try another day; a departure past its
            booking cutoff tells them they are too late TODAY, and the two
            suggest different next moves.
          */
          const why = slot.soldOut ? "Full" : "Closed";

          return (
            <button
              key={slot.id}
              type="button"
              disabled={!open}
              aria-pressed={chosen}
              aria-label={open ? time : `${time}, ${why.toLowerCase()}`}
              onClick={() => onSelect(slot)}
              className={cn(
                "rounded-control ease-interaction tap-target border px-4 py-2 text-left transition-colors duration-200",
                !open && "cursor-not-allowed opacity-40",
                chosen
                  ? "border-forest bg-forest text-cream"
                  : "border-cream-line bg-cream text-forest hover:border-forest/40",
              )}
            >
              <span className="block text-sm font-bold">{time}</span>
              {/*
                The server's own sentence about seats, or the reason there are
                none. Never a number this client worked out.
              */}
              {!open ? (
                <span className="mt-0.5 block text-[11px] leading-none">
                  {why}
                </span>
              ) : slot.remainingDisplay ? (
                <span
                  className={cn(
                    "mt-0.5 block text-[11px] leading-none",
                    chosen ? "text-cream/80" : "text-forest/70",
                  )}
                >
                  {slot.remainingDisplay}
                </span>
              ) : null}
            </button>
          );
        })}
      </div>
    </section>
  );
}
