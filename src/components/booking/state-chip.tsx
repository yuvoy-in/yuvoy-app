import { Chip } from "@/components/ui/chip";
import type { components } from "@/lib/api/schema.gen";

type BookingState = components["schemas"]["BookingStatus"]["state"];

/**
 * A booking's state, in the traveller's words rather than ours.
 *
 * Shared because it was not, and the copy that did not exist printed the wire
 * value at customers — Account rendered `<Chip>{b.state}</Chip>`, so somebody
 * waiting on an operator read `awaiting_operator` and somebody who missed the
 * boat read `no_show` (yuvoy-app#26).
 *
 * The mapping is the interesting part, not the pill. `declined: "Refunded"`
 * says the thing that matters to the person reading it rather than the thing
 * that happened in our state machine; `no_show: "Not boarded"` is what
 * happened without the accusation.
 */
const LABEL: Record<BookingState, string> = {
  holding: "Holding",
  awaiting_operator: "Asked",
  verifying: "Checking",
  confirmed: "Confirmed",
  declined: "Refunded",
  cancelled: "Cancelled",
  expired: "Expired",
  released: "Released",
  completed: "Done",
  no_show: "Not boarded",
};

/**
 * `state` is typed as the closed union on `GET /bookings/status`, and as a
 * bare `string` on `GET /me/bookings` — the same values, typed loosely on one
 * of the two endpoints. So this accepts a string and looks the label up,
 * which is also what makes it safe against the API growing a state.
 *
 * An unrecognised state renders NOTHING. There is no honest generic: "Booked"
 * is false for a cancellation and "In progress" is false for a completed
 * trip, and the raw token is the defect this component exists to remove. A
 * missing chip loses a word; a wrong or internal one misinforms.
 */
export function StateChip({ state }: { state: string }) {
  const label = LABEL[state as BookingState];
  if (!label) return null;

  const live = state === "confirmed" || state === "completed";
  const over =
    state === "cancelled" || state === "declined" || state === "expired";

  return (
    <Chip
      size="sm"
      tone={live ? "accent" : "neutral"}
      className={over ? "text-forest/70" : undefined}
    >
      {label}
    </Chip>
  );
}
