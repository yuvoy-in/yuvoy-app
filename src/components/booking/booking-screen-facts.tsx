"use client";

import Link from "@/components/ui/link";
import { Panel } from "@/components/ui/panel";
import { cn } from "@/lib/cn";
import type { components } from "@/lib/api/schema.gen";
import { formatDeparture, formatTotal, moneyRowLabel } from "./trip-copy";

type BookingStatus = components["schemas"]["BookingStatus"];

/**
 * The facts panel of the booking page (reference, experience, when, where
 * you meet, guests and the money row), lifted word for word out of
 * StatusBody (booking-screen-body.tsx), with the Row it is built from.
 */
export function BookingFacts({
  status,
  meetingText,
  meetingLandmark,
}: {
  status: BookingStatus;
  meetingText: string | undefined;
  meetingLandmark: string | undefined;
}) {
  return (
    <>
      {/* Everything needed for the day, on the page. Not in a message that
          may never arrive. */}
      <Panel data-arrival-panel="" className="mt-8 p-0">
        <dl className="divide-paper-line divide-y text-sm">
          {status.bookingReference ? (
            <Row label="Reference">
              <div data-arrival-reference="">
                <span className="tracking-ref text-lg font-bold slashed-zero tabular-nums">
                  {status.bookingReference}
                </span>
                <p className="text-forest/70 mt-1 text-xs">
                  Read this out at the jetty. It is how the operator finds you.
                </p>
              </div>
            </Row>
          ) : null}
          {/*
            The title as a link to the listing (#38 item 3).

            Somebody on this page a week before their trip wants to re-read
            what they booked: what is included, what to bring, how long it
            takes. None of that is here and all of it is one tap away, and
            without the link the only route is searching for it again by name.

            `slug` is required on the response and is guarded anyway, in line
            with the standing rule that a pinned contract states what an API
            WILL send. A missing slug renders the title as plain text rather
            than a link to `/e/undefined`.
          */}
          <Row label="Experience" className="voice-host text-balance">
            {status.experience.slug ? (
              /*
                `tap-target`: a link alone in its row is the whole target, and
                as bare text it was 18px tall (cited 3 Oct 2026).
              */
              <Link
                href={`/e/${status.experience.slug}`}
                className="tap-target underline"
              >
                {status.experience.title}
              </Link>
            ) : (
              status.experience.title
            )}
          </Row>
          {/*
            The booking carries an instant plus the MARKET's zone, not the
            pre-formatted local fields the catalog slots have. Rendering it in
            `status.slot.timezone` rather than the device's is the whole point:
            a 7am dive shown as 1:30am is a missed boat.
          */}
          <Row label="When" className="tabular-nums">
            {formatDeparture(status.slot)}
          </Row>
          {/*
            WHERE THE DAY STARTS — yuvoy-app#22 §1.

            `/trip/{token}` and `/me/bookings` both rendered this and the
            private booking page — the link we send to the person who paid,
            the one this panel's own comment calls "everything needed for the
            day, on the page" — was the only one of the three without it. A
            traveller awake at 5:40am was reading their reference, their guest
            count and what they paid, and going back through WhatsApp to find
            the jetty.

            Trimmed for the reason yuvoy-app#25 gives: an unset meeting point
            reaches a client as "" rather than as an absent key, so a
            truthiness test on the raw value is not enough. A landmark alone
            still answers "where".
          */}
          {meetingText || meetingLandmark ? (
            <Row
              label="Where you meet"
              className="voice-host leading-body text-pretty"
            >
              {meetingText}
              {meetingLandmark ? (
                <span
                  className={
                    meetingText
                      ? "text-forest/70 mt-1 block text-xs"
                      : undefined
                  }
                >
                  {meetingLandmark}
                </span>
              ) : null}
            </Row>
          ) : null}
          <Row label="Guests" className="leading-body text-pretty">
            {status.guests}
          </Row>
          {/*
            "PAID" IS A CLAIM, AND IT IS FALSE ON A CASH BOOKING —
            yuvoy-app#29.

            The money has not moved: the traveller hands it to the operator on
            the day, and `capturedAmountPaise` is `0` on these bookings for
            their whole life. Labelling it "Paid" tells somebody they have
            settled up when they are about to be asked for the notes.

            "To pay on the day" rather than "Unpaid" or "Due": the booking is
            confirmed and the wording must not read as a debt or as a problem
            with it. Once the operator records taking the cash `payment
            .collected` flips and this goes back to "Paid", which is then true.

            It used to key on the state, and D-034 made that always false — so
            this row said "Paid ₹9,000" to somebody who had not handed over a
            rupee. And it still said "Paid" on a waiting request and on a hold,
            where nothing had been charged at all (cited 3 Oct 2026). The whole
            rule is `moneyRowLabel` now, one place, tested state by state.
          */}
          <Row label={moneyRowLabel(status)}>{formatTotal(status.price)}</Row>
        </dl>
      </Panel>
    </>
  );
}

function Row({
  label,
  className,
  children,
}: {
  label: string;
  /** The value's voice: the host's words, a time, running text. */
  className?: string;
  children: React.ReactNode;
}) {
  return (
    <div className="flex flex-wrap justify-between gap-x-6 gap-y-1 px-5 py-4">
      <dt className="label text-forest/75">{label}</dt>
      <dd className={cn("text-right", className)}>{children}</dd>
    </div>
  );
}
