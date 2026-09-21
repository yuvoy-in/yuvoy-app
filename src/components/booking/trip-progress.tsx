"use client";

import { useEffect, useState } from "react";
import { formatMoney } from "@/lib/format/money";
import { formatCountdown, msUntil } from "@/lib/format/time";
import { clockOffsetMs } from "@/lib/booking/clock";
import { amountToBring, type CashBooking } from "@/lib/booking/cash-booking";
import { Panel } from "@/components/ui/panel";
import { cn } from "@/lib/cn";
import {
  UPDATE_LABEL,
  formatDeparture,
  formatSentAt,
  updateKind,
} from "./trip-copy";
import type { components } from "@/lib/api/schema.gen";

type BookingStatus = components["schemas"]["BookingStatus"];

export function HoldCountdown({ expiresAt }: { expiresAt: string }) {
  // Against the SERVER's clock, via the offset every response teaches us.
  // A phone ten minutes fast used to show a fresh hold as already run out.
  const [left, setLeft] = useState(() => msUntil(expiresAt, clockOffsetMs()));

  useEffect(() => {
    const t = setInterval(
      () => setLeft(msUntil(expiresAt, clockOffsetMs())),
      1000,
    );
    return () => clearInterval(t);
  }, [expiresAt]);

  const urgent = left < 120_000;

  return (
    <Panel
      tone={urgent ? "alert" : "raised"}
      className="mt-6"
      role="timer"
      aria-live="off"
    >
      <p className="label text-forest/75">Time left to pay</p>
      <p
        className={cn(
          "mt-1 font-mono text-3xl font-bold tabular-nums",
          urgent && "text-terra-deep",
        )}
      >
        {formatCountdown(left)}
      </p>
      {left === 0 ? (
        <p className="text-forest/70 mt-2 text-sm">
          The hold has run out. If you pay now it may still work, but the seat
          is no longer reserved, and if it has gone we refund you in full,
          automatically.
        </p>
      ) : null}
    </Panel>
  );
}

export function OperatorUpdates({
  updates,
  timezone,
}: {
  updates: NonNullable<BookingStatus["operatorUpdates"]>;
  timezone: string;
}) {
  return (
    <Panel tone="alert" className="mt-8">
      <section aria-labelledby="operator-updates">
        <h2 id="operator-updates" className="label text-forest/75">
          From the operator
        </h2>
        <ul className="mt-3 space-y-3">
          {updates.map((u, i) => {
            const sentAt = u.sentAt ? formatSentAt(u.sentAt, timezone) : null;
            return (
              <li key={`${u.sentAt ?? i}-${updateKind(u)}`} className="text-sm">
                <p className="font-bold">
                  {UPDATE_LABEL[updateKind(u)] ?? "From the operator"}
                  {u.detail ? `: ${u.detail}` : ""}
                </p>
                {u.note ? (
                  <p className="text-forest/80 mt-1">{u.note}</p>
                ) : null}
                {sentAt ? (
                  <p className="text-forest/70 mt-1 text-xs">{sentAt}</p>
                ) : null}
              </li>
            );
          })}
        </ul>
        <p className="text-forest/70 mt-3 text-xs">
          Shown here and not sent to your phone. This page is the place to
          check.
        </p>
      </section>
    </Panel>
  );
}

export function RefundProgress({
  refund,
}: {
  refund: NonNullable<BookingStatus["refund"]>;
}) {
  // The contract's own enum. `processed` is the end state, not "completed".
  const STEPS = ["requested", "pending", "processed"] as const;
  const failed = refund.state === "failed" || refund.state === "abandoned";
  const at = STEPS.indexOf(refund.state as (typeof STEPS)[number]);

  return (
    <Panel className="mt-8">
      <p className="label text-forest/75">Your refund</p>

      {failed ? (
        /* A failed refund tells the truth and promises a human, rather than
           hiding behind a spinner. */
        <p className="text-forest/80 mt-2 text-sm">
          The refund did not go through. That is ours to fix, not yours to
          chase. Someone is on it and will message you.
        </p>
      ) : (
        <ol className="mt-3 space-y-2.5">
          {STEPS.map((step, i) => (
            <li key={step} className="flex items-center gap-3 text-sm">
              <span
                aria-hidden="true"
                className={cn(
                  "size-2 shrink-0 rounded-full",
                  i <= at ? "bg-terra-deep" : "bg-forest/20",
                )}
              />
              <span className={i <= at ? "text-forest" : "text-forest/70"}>
                {step === "requested"
                  ? "Refund started"
                  : step === "pending"
                    ? "On its way to your bank"
                    : "Back in your account"}
              </span>
            </li>
          ))}
        </ol>
      )}

      {/* The server ships ready-to-render copy for the current state; prefer
          it over ours, so a change in refund handling does not need a deploy. */}
      {refund.message ? (
        <p className="text-forest/70 mt-3 text-sm">{refund.message}</p>
      ) : null}

      {refund.amountPaise != null ? (
        <p className="text-forest/70 mt-3 text-xs">
          {formatMoney({ amountMinor: refund.amountPaise, currency: "INR" })}.
          Banks usually take 5 to 7 working days.
        </p>
      ) : null}
    </Panel>
  );
}

/** The ceiling. Stop, and put a person in front of them. */
export function HandOver({ status }: { status: BookingStatus }) {
  return (
    <Panel tone="alert" role="alert" className="mt-8">
      <p className="text-sm font-bold">This is taking longer than it should</p>
      <p className="text-forest/70 mt-1.5 text-sm">
        We have stopped checking automatically. Nothing is lost. Your booking
        reference is{" "}
        <span className="font-mono font-bold">
          {status.bookingReference ?? status.reservationId}
        </span>
        . Send us that on WhatsApp and someone will sort it out.
      </p>
    </Panel>
  );
}

/**
 * When the operator has to answer by — yuvoy-app#32.
 *
 * ## It used to tick, and the API made that absurd
 *
 * `requestExpiresAt` was a short answer clock: a request lapsed in about two
 * hours, so a live countdown beside it was the right shape. yuvoy-api#170
 * changed it to the departure's booking CUTOFF, which is routinely days away
 * — "so show it as a date and time rather than a countdown".
 *
 * The countdown was `formatCountdown`, which is `m:ss`. Three days out it
 * rendered "4320:00" and decremented once a second: a number nobody can read
 * as a duration, on a screen whose whole job is to stop somebody worrying.
 *
 * So the deadline is a date and a time, said once, with no interval and no
 * re-render. Which is also the honest shape: the traveller is waiting on a
 * person, not on a clock, and a second-by-second display implies a precision
 * the answer does not have.
 *
 * Still `role="timer"` with `aria-live="off"`: it is a deadline, and it must
 * not be announced.
 */
export function AnswerBy({
  expiresAt,
  timezone,
}: {
  expiresAt: string;
  timezone: string;
}) {
  const deadline = new Intl.DateTimeFormat("en-IN", {
    timeZone: timezone,
    weekday: "long",
    day: "numeric",
    month: "long",
    hour: "2-digit",
    minute: "2-digit",
    hour12: false,
  }).format(new Date(expiresAt));

  return (
    <Panel className="mt-6" role="timer" aria-live="off">
      <p className="label text-forest/75">The operator has until</p>
      <p className="mt-1 text-lg font-bold">{deadline}</p>
      <p className="text-forest/70 mt-2 text-sm">
        Nothing has been charged, and you can withdraw the ask at any time. If
        they do not answer by then, the request lapses on its own.
      </p>
    </Panel>
  );
}

/**
 * The moment somebody has committed — yuvoy-app#29.
 *
 * "This is the one screen where somebody has just committed, so it can have a
 * moment. Everywhere else the absence is the design; here it should feel like
 * something happened."
 *
 * Three things carry it, in this order:
 *
 *   - **The reference, large and selectable.** It is what they say out loud at
 *     a jetty, so it is the biggest thing on the screen and monospaced. The
 *     alphabet already excludes letters people mishear.
 *   - **"Bring ₹X in cash" — an instruction, not a balance.** From
 *     `payAtCounterPaise` and never `capturedAmountPaise`, which is `0` on
 *     these bookings and stays `0` forever because we never touch the money.
 *   - **"Pay the operator"**, never "pay Yuvoy" and never "amount due".
 *
 * The word "booked" does the work. Nothing here calls it unpaid or pending:
 * `paid_pending_ops` is our word for "committed, ops have not confirmed", and
 * the traveller-facing word is booked.
 */
export function CashBooked({
  booking,
  status,
}: {
  booking: CashBooking;
  status: BookingStatus;
}) {
  const bring = amountToBring(booking);
  const meeting = status.meetingPoint?.text?.trim();

  return (
    <div className="mt-6">
      <Panel tone="raised" role="status">
        <p className="eyebrow text-terra-deep">Booked</p>
        <p className="font-display tracking-display mt-2 text-3xl leading-tight">
          You&rsquo;re booked
        </p>

        {/*
          Selectable, and big. Somebody reads this to an operator over the
          noise of an outboard motor.
        */}
        <p className="mt-5 font-mono text-3xl font-bold tracking-wider select-all">
          {booking.bookingReference}
        </p>

        <p className="mt-6 text-lg font-bold">
          Bring{" "}
          {formatMoney({
            amountMinor: bring,
            currency: booking.currency || status.price.currency,
          })}{" "}
          in cash
        </p>
        <p className="text-forest/80 mt-1 text-sm">
          Pay the operator at the meeting point. The money goes to them, not to
          us.
        </p>

        <p className="border-paper-line text-forest/80 mt-5 border-t pt-4 text-sm">
          {formatDeparture(status.slot)}
          {meeting ? ` · ${meeting}` : null}
        </p>
      </Panel>
    </div>
  );
}
