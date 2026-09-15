import { Chip } from "@/components/ui/chip";

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
const LABEL: Record<string, string> = {
  /*
    BOOKED, AND OURS TO SETTLE — yuvoy-app#29.

    A cash booking sits at `paid_pending_ops` until the operator records
    taking the money, then becomes `confirmed`. **Both read as booked to the
    traveller**: the difference is our bookkeeping, not their standing. They
    have a seat on a boat.

    It is deliberately NOT called "unpaid" or "pending payment" anywhere —
    `paid_pending_ops` is our internal word, and a traveller who reads
    "pending" on a seat they committed to rings somebody.

    Keyed by `string` rather than by either endpoint's union, because the two
    endpoints do not share one. `GET /me/bookings` declares `paid_pending_ops`
    (yuvoy-api#190, 14 Sep); `BookingStatus.state` deliberately does not and
    never will, because a cash booking reads `confirmed` there with a `payment`
    block instead (D-034). This chip is rendered from both, so it takes what
    they have in common and looks the label up.
  */
  paid_pending_ops: "Booked",
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
 * `state` is a closed union on both endpoints now, but NOT the same union:
 * `GET /bookings/status` has `holding`, `awaiting_operator`, `verifying`,
 * `expired` and `released`, which a trips row never carries; `GET /me/bookings`
 * has `paid_pending_ops` and `pending_request`, which a status answer never
 * carries. Their intersection is not a type worth writing, so this takes a
 * string and looks the label up, which is also what makes it safe against the
 * API growing a state.
 *
 * An unrecognised state renders NOTHING. There is no honest generic: "Booked"
 * is false for a cancellation and "In progress" is false for a completed
 * trip, and the raw token is the defect this component exists to remove. A
 * missing chip loses a word; a wrong or internal one misinforms.
 */
export function StateChip({ state }: { state: string }) {
  const label = LABEL[state];
  if (!label) return null;

  const live =
    state === "confirmed" ||
    state === "completed" ||
    state === "paid_pending_ops";
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
