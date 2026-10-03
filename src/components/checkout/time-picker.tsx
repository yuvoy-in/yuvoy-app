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
          const seatsId = `seats-${slot.id}`;

          return (
            <button
              key={slot.id}
              type="button"
              disabled={!open}
              aria-pressed={chosen}
              aria-label={open ? time : `${time}, ${why.toLowerCase()}`}
              // The seats as a description: the name stays the time, which is
              // what a traveller asks for ("the 07:00"), and they still hear
              // what is left on it.
              aria-describedby={
                open && slot.remainingDisplay ? seatsId : undefined
              }
              onClick={() => onSelect(slot)}
              /*
                One line, the time and then the seats, with a gap between them.
                They used to be two `block` spans inside `tap-target`, which is
                `inline-flex` and so laid them side by side with nothing
                between: "07:003 seats left" (cited in the redesign's before
                page, 3 Oct 2026). `min-h-11` is the 44px target the utility
                was standing in for.
              */
              className={cn(
                "ease-interaction inline-flex min-h-11 items-center gap-2 rounded-full border px-4 transition-colors duration-200",
                !open && "cursor-not-allowed opacity-40",
                chosen
                  ? "border-forest bg-forest text-paper"
                  : "border-paper-line bg-paper-deep text-forest hover:border-forest/40",
              )}
            >
              <span className="text-[15px] font-bold tabular-nums">{time}</span>
              {/*
                The server's own sentence about seats, or the reason there are
                none. Never a number this client worked out.
              */}
              {!open ? (
                <span className="text-[13px]">{why}</span>
              ) : slot.remainingDisplay ? (
                <span
                  id={seatsId}
                  className={cn(
                    "text-[13px]",
                    chosen ? "text-paper/80" : "text-forest/70",
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
