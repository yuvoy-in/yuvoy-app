import type { components } from "@/lib/api/schema.gen";

type Slot = components["schemas"]["Slot"];

/**
 * Whether a departure can still be booked, by the client's own reading.
 *
 * The server is the authority — `POST /reservations` answers `cutoff_passed`
 * after `bookingCutoffAt` whatever the screen showed — but the contract asks
 * the screen to agree in advance: "After this instant the slot cannot be
 * booked. Shown disabled, never hidden." For a month `status: open` was the
 * only thing consulted, so a traveller who sat on the picker as the cutoff
 * passed, or opened a bookmarked `?slot=` link, could fill in the whole form
 * and be refused at the end.
 *
 * `now` is passed in rather than read, so the rule is pure and so a render
 * never reads the clock (the React compiler refuses it).
 */
export function cutoffPassed(
  slot: Partial<Pick<Slot, "bookingCutoffAt">>,
  now: number,
): boolean {
  if (!slot.bookingCutoffAt) return false;
  const at = new Date(slot.bookingCutoffAt).getTime();
  return Number.isFinite(at) && at <= now;
}

export function slotIsOpen(
  slot: Partial<Pick<Slot, "status" | "remainingDisplay" | "bookingCutoffAt">>,
  now: number,
): boolean {
  return (
    slot.status === "open" &&
    slot.remainingDisplay !== "Full" &&
    !cutoffPassed(slot, now)
  );
}
