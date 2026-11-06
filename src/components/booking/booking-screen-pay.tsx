"use client";

import { formatMoney } from "@/lib/format/money";
import { cashOwed, cashOwedPaise } from "@/lib/booking/cash-booking";
import { Panel } from "@/components/ui/panel";
import type { components } from "@/lib/api/schema.gen";
import { PayButton, ReleaseButton } from "./pay-actions";
import { AnswerBy, HoldCountdown } from "./trip-progress";
import { CheckInBlock } from "./check-in-block";
import type { CheckInView } from "@/lib/booking/check-in";

type BookingStatus = components["schemas"]["BookingStatus"];

/**
 * The hold and money run of the booking page, lifted word for word out of
 * StatusBody (booking-screen-body.tsx): the hold countdown, the answer-by
 * line, the two cash panels, the check-in block (yuvoy-app#218), and the pay
 * and release buttons.
 */
export function HoldAndPay({
  status,
  token,
  onChanged,
  cashBack,
  checkIn,
}: {
  status: BookingStatus;
  token?: string | null;
  onChanged?: () => void;
  cashBack: number | null;
  /** From `checkInView` in StatusBody, which holds the server clock. */
  checkIn: CheckInView | null;
}) {
  return (
    <>
      {/*
        The countdown renders ONLY while holding. `holdExpiresAt` is absent in
        every other state precisely so a clock is never shown beside a dead
        booking — and it is one countdown, not two: the payment order's
        expiresAt IS this deadline.

        Not always a countdown any more (yuvoy-app#97). A hold from an accepted
        request runs up to twelve hours and can end tomorrow, and then this
        draws "Pay by 08:00 on Tue 22 Sep" in the trip's own zone instead.
        The timezone is passed for that, and only for that.
      */}
      {status.state === "holding" && status.holdExpiresAt ? (
        <HoldCountdown
          expiresAt={status.holdExpiresAt}
          timezone={status.slot?.timezone}
        />
      ) : null}

      {/*
        HOW LONG THEY ARE WAITING — yuvoy-app#22 §3.

        `holdExpiresAt` is set for allotment holds only, so in
        `awaiting_operator` — the one state where somebody is genuinely
        waiting on a human — the page carried no deadline at all. Somebody who
        asked on Tuesday opened it on Wednesday and read exactly what it said
        on Tuesday.

        Gated on the FIELD, not on the state: the API sends
        `requestExpiresAt` while the booking is non-terminal and drops it once
        it is final, so the key being there is already the answer to "is
        anybody still waiting on this".
      */}
      {status.requestExpiresAt ? (
        <AnswerBy
          expiresAt={status.requestExpiresAt}
          timezone={status.slot.timezone}
        />
      ) : null}

      {/*
        WHAT TO BRING, FOR AS LONG AS IT IS OWED — yuvoy-app#29.

        The success panel is transient by design: the moment a cash booking
        lands the status is refetched and the pay area stops rendering. Without
        this the amount and the instruction would vanish with it, and a
        traveller who reloads on the morning of the trip would have a reference
        and no idea what to bring.

        Read off `payment`, NOT off the state, and that is a correction rather
        than a preference — see `cashOwed`. D-034 made a cash booking read
        `confirmed` from the moment it is made, so the old
        `state === "paid_pending_ops"` test silently stopped matching and this
        panel silently stopped rendering.

        The amount is `payment.amountPaise`: the price frozen at checkout, so
        an operator editing a price cannot restate what this traveller agreed
        to, and the field that names the obligation rather than the one that
        names the sale.

        It disappears when `collected` flips, which is the operator recording
        that they took the money. "The honest version is a quiet line that
        disappears once it flips."
      */}
      {/*
        While the trip is going ahead, and only then: a cash booking that was
        cancelled still carries `payment`, uncollected, and "Bring ₹9,000 in
        cash" beside "Cancelled" is an instruction to carry money to a trip
        that is not happening.
      */}
      {cashOwed(status) && status.state === "confirmed" ? (
        <Panel data-arrival-panel="" className="mt-6">
          <p className="text-base font-bold text-balance">
            Bring{" "}
            {formatMoney({
              amountMinor: cashOwedPaise(status) ?? 0,
              currency: status.price?.currency ?? "INR",
            })}{" "}
            in cash
          </p>
          <p className="text-forest/70 text-body mt-1.5 text-pretty">
            Pay the operator at the meeting point. The money goes to them, not
            to us, and there is nothing to pay before you arrive.
          </p>
        </Panel>
      ) : null}

      {/*
        THE CASH A CALLED-OFF TRIP DOES NOT REFUND. The operator is told
        "Anyone who paid you in cash gets it back from you", and this is the
        same fact from the traveller's side, so the two screens cannot
        disagree about one call-off. See `cashToGetBack`.
      */}
      {cashBack !== null ? (
        <Panel data-arrival-panel="" className="mt-6">
          <p className="text-base font-bold text-balance">
            You get your{" "}
            {formatMoney({
              amountMinor: cashBack,
              currency: status.price?.currency ?? "INR",
            })}{" "}
            back from the operator
          </p>
          <p className="text-forest/70 text-body mt-1.5 text-pretty">
            You paid them in cash, so it never reached us and nothing is
            refunded online.
          </p>
        </Panel>
      ) : null}

      {/*
        SHOW AT CHECK-IN (yuvoy-app#218). Under what to bring and above the
        details, where the app has it: the thing to hold up at the jetty. The
        API decides whether there is one; `checkInView` only hides it once the
        trip's day is over. On the offline copy too, since a jetty is where
        the signal goes.
      */}
      {checkIn ? <CheckInBlock view={checkIn} /> : null}

      {token && status.state === "holding" ? (
        /*
          `onChanged` refetches the status, so once a cash booking lands the
          screen re-reads the server rather than believing its own optimism —
          the same rule the release button follows. The success moment renders
          from the booking response either way, so a slow refetch never leaves
          somebody who just committed looking at a pay button.

          With the link only, like every other action here: paying is a hold
          write, and it carries the link (yuvoy-api#369). An offline copy has
          none, and could not reach the server anyway.
        */
        <PayButton status={status} token={token} onBooked={onChanged} />
      ) : null}

      {/*
        The way out of a hold or a pending request. Until now cancel existed
        only for a confirmed booking, so a traveller who changed their mind
        mid-hold could only let the clock run out — and one who asked an
        operator could not withdraw the ask at all. `POST /reservations/{id}/
        release` is idempotent and answers 204 for both.
      */}
      {token &&
      onChanged &&
      (status.state === "holding" || status.state === "awaiting_operator") ? (
        <ReleaseButton status={status} token={token} onReleased={onChanged} />
      ) : null}
    </>
  );
}
