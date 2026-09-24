"use client";

import { useState } from "react";
import { useHasMounted } from "@/lib/react/use-has-mounted";
import Link from "next/link";
import { useDocumentTitle } from "@/lib/site/use-document-title";
import { useBookingStatus } from "@/lib/booking/use-booking-status";
import { useFragmentToken } from "@/lib/booking/use-fragment-token";
import { formatMoney } from "@/lib/format/money";
import { formatAge } from "@/lib/format/time";
import { clockOffsetMs } from "@/lib/booking/clock";
import { ErrorState, LoadingState, Skeleton } from "@/components/states";
import { CancelSheet } from "./cancel-sheet";
import { BookingQuestions } from "./booking-questions";
import { MessageThread } from "./message-thread";
import { ShareButton } from "./share-button";
import { InviteGuests } from "./invite-guests";
import { AddToCalendar } from "./add-to-calendar";
import { KeepBooking } from "./keep-booking";
import { HelpSection } from "@/components/support/help-section";
import { cashOwed, cashOwedPaise } from "@/lib/booking/cash-booking";
import { ReviewForm } from "./review-form";
import { Screen } from "@/components/chrome/screen";
import { Button, ButtonLink } from "@/components/ui/button";
import { Panel } from "@/components/ui/panel";
import type { components } from "@/lib/api/schema.gen";
import { PayButton, ReleaseButton } from "./pay-actions";
import {
  cancellationReason,
  declineView,
  formatDeparture,
  formatTotal,
  stateCopy,
} from "./trip-copy";
import {
  AnswerBy,
  HandOver,
  HoldCountdown,
  OperatorUpdates,
  RefundProgress,
} from "./trip-progress";

type BookingStatus = components["schemas"]["BookingStatus"];

const BACK = { href: "/trips", label: "your trips" };

/**
 * T9 and T10 — the confirmation, and the page a traveller returns to.
 *
 * Client-only, and not by preference: the status token lives in the URL
 * fragment, a fragment is never sent to a server, so a server component
 * structurally cannot read it.
 *
 * The state vocabulary is the contract's, computed server-side and never
 * derived here. The copy for each is the load-bearing part — particularly
 * `verifying`, which must never read as failure.
 */
export function BookingScreen() {
  // The URL is an external store; this reads it without an effect, and follows
  // a hashchange if a different booking link is pasted into the same tab.
  const token = useFragmentToken();
  const mounted = useHasMounted();

  const { data, error, isPending, isError, gaveUp, snapshot, refetch } =
    useBookingStatus(token);

  // Before hydration the fragment is genuinely unknown, so render the loading
  // shape rather than "we need your link" and then flipping to the booking.
  if (!mounted)
    return (
      <Shell>
        <Loading />
      </Shell>
    );

  if (token === null) {
    return (
      <Shell>
        <h1 className="font-display tracking-display text-3xl leading-tight">
          We need your booking link
        </h1>
        <p className="text-forest/70 mt-3 text-sm">
          Your booking opens from the private link we gave you when you booked,
          and from the message we sent. It is the only way in. We cannot look it
          up from a name.
        </p>
        <ButtonLink href="/trips" className="mt-6">
          Go to my trips
        </ButtonLink>
      </Shell>
    );
  }

  if (isPending)
    return (
      <Shell>
        <Loading />
      </Shell>
    );

  // Nothing from the network, but we kept the last known payload. Show it,
  // clearly stamped. Never present a saved booking as a live one.
  if (isError && snapshot) {
    return (
      <Shell>
        <div
          role="status"
          className="rounded-card border-paper-line bg-paper-deep mb-6 border px-4 py-3 text-xs"
        >
          You are offline. This is what we saved on your device, last checked{" "}
          {formatAge(snapshot.fetchedAt)}.
        </div>
        <StatusBody status={snapshot.status} live={false} />
      </Shell>
    );
  }

  // A dead link — expired, or replaced by a newer one — is answered with the
  // way to a fresh link, not a retry that can never work. `tokenBearing` is
  // what turns the 401 into that offer.
  if (isError) {
    return (
      <Shell>
        <ErrorState error={error} onRetry={() => void refetch()} tokenBearing />
      </Shell>
    );
  }

  return (
    <Shell>
      <StatusBody
        status={data}
        live={!gaveUp}
        token={token}
        onChanged={() => void refetch()}
      />
      {gaveUp && !data.final ? <HandOver status={data} /> : null}
    </Shell>
  );
}

/* ------------------------------------------------------------------ body */

function StatusBody({
  status,
  live,
  token,
  onChanged,
}: {
  status: BookingStatus;
  live: boolean;
  /** Absent when rendering an offline snapshot — every action needs network. */
  token?: string | null;
  onChanged?: () => void;
}) {
  const copy = stateCopy(status.state);
  /*
    A request the operator turned down, when the API says so in words
    (yuvoy-api#225). `null` for every other booking, and for a status from an
    API that does not send `cancellation.message`: then this page says what it
    always said. See `declineView`.
  */
  const declined = declineView(status);
  /*
    A CANCELLED BOOKING THAT PAID NOTHING ONLINE HAS NO REFUND COMING —
    yuvoy-app#48 §2.

    `STATE_COPY.cancelled` opens "Your refund has already started." That was
    safe while every cancellable booking had money in it, and D28 ended that:
    a booking paid in cash cancels from the sheet with `refundPaise` 0, and
    then reads a promise of money that is not moving because none was taken.

    The sentence is DROPPED rather than replaced with its opposite. `refund` is
    "present only when a refund exists", and a real refund may not have a row
    the instant the cancellation lands, so asserting "nothing is coming back"
    would be the same mistake pointed the other way. What is left is true in
    both cases, and `RefundProgress` below renders the refund the moment there
    is one, from the server's own state rather than from static copy.
  */
  const body = declined
    ? /*
        The API's sentence already says why and that nothing was charged, so
        the state's own hedge ("Either you gave it up or the operator could
        not take it") would only take back what it has just said.
      */
      null
    : status.state === "cancelled" && !status.refund
      ? "Rebooking is a fresh booking rather than a silent move. The price you see will be the price you pay."
      : copy.body;

  /*
    The reference in the tab, because the server cannot put it there.

    This page is keyed by a token in the URL fragment, which never reaches the
    server — so `generateMetadata` cannot tell one booking from another and
    every tab reads "Your booking · Yuvoy" (yuvoy-app#16). The reference leads,
    since it is the thing somebody with two tabs open is looking for, and it is
    "human-quotable and not a credential" — it goes on the operator's manifest
    and is read aloud on a jetty. The token is never in it.

    Before the reference exists — a hold that has not become a booking — the
    experience name is still better than "Your booking", and `useDocumentTitle`
    leaves Next's own title alone when there is neither.
  */
  const identity = status.bookingReference ?? status.experience?.title ?? null;
  useDocumentTitle(identity ? `${identity} · Yuvoy` : null);
  const [cancelling, setCancelling] = useState(false);

  /*
    Read ONCE, outside the render path, and against the SERVER's clock.

    Reading it during render is impure and the React compiler refuses it, and
    "is this trip still ahead" does not need re-evaluating between frames.

    `clockOffsetMs()` is the half that was missing (yuvoy-app#69). `upcoming`
    below gates Share and "I need to cancel", so a phone running fast HID the
    cancel button on a trip that had not happened, and a hidden control has no
    server backstop: no request is made for anyone to refuse. The offset is
    recorded from the `Date` header on every response, so it costs nothing to
    read and this file already uses it for the hold countdown.
  */
  const [now] = useState(() => Date.now() + clockOffsetMs());

  // Confirmed and still ahead of us: sharing and cancelling both make sense.
  // A trip that has already left can do neither.
  const upcoming =
    status.state === "confirmed" &&
    new Date(status.slot.startsAt).getTime() > now;

  /*
    Whether "Manage this trip" has anything to hold.

    Every control in that region is gated, and on a trip that is over or never
    happened ALL of them decline: the calendar and KeepBooking each exclude
    these states, and share, invite and cancel all need a trip still ahead. The
    region was drawn regardless, so its heading stood alone over nothing.

    DELIBERATELY CONSERVATIVE. This lists only the states where every child is
    known to be empty, the intersection of their own exclusions. If a child's
    rules change, the worst this can do is leave an empty heading, never hide
    a real action: hiding a cancel button someone needs is the failure that
    matters, and this cannot cause it.
  */
  const hasTripActions = !["cancelled", "declined", "expired"].includes(
    status.state,
  );

  // See the "Where you meet" row and the reason line below for why each of
  // these is derived rather than read straight off the response.
  const meetingText = status.meetingPoint?.text?.trim();
  const meetingLandmark = status.meetingPoint?.landmark?.trim();
  /*
    The decline's own sentence, when there is one, in place of the mapped
    cancellation code: a decline code is not a cancellation code, and mapped
    it read "The operator or we called it off." about a request.
  */
  const reason =
    declined?.message ?? cancellationReason(status.cancellation?.reasonCode);

  return (
    <div>
      {/*
        "Not accepted", the word Trips already uses for a declined request
        (yuvoy-app#100), rather than "Released", which reads as though the
        traveller let it go.
      */}
      <p className="eyebrow text-terra-deep">
        {declined ? "Not accepted" : copy.eyebrow}
      </p>
      <h1 className="font-display tracking-display mt-3 text-3xl leading-tight sm:text-4xl">
        {declined ? "Your request was not accepted" : copy.title}
      </h1>
      {/*
        WHY the trip is off — yuvoy-app#22 §2.

        This screen used to hedge: "If the sea called it off, rebooking is a
        fresh booking…". That "if" was a guess dressed as information, and the
        wrong guess for a licence that lapsed or seats that were resold — a
        traveller was told to wonder about the weather on a clear day. The
        hedge is gone from `STATE_COPY.cancelled` and the actual reason is
        rendered here.

        Never the raw code: `CREDENTIAL_LAPSE` is an internal token and
        shouting it in capitals at a customer is the same defect as Account's
        `awaiting_operator`. `cancellationReason` maps it and falls back for
        anything it does not know, because the set grows by INSERT on the
        server without a deploy here.
      */}
      {reason ? (
        <p className="mt-3 max-w-prose text-sm font-bold">{reason}</p>
      ) : null}
      {body ? (
        <p className="text-forest/70 mt-3 max-w-prose text-sm">{body}</p>
      ) : null}

      {/*
        THE WAY ON FROM A REQUEST THAT WAS LET GO (yuvoy-api#225).

        A declined request arrives on this page as `released`, and so does one
        the traveller gave up, and this page cannot tell them apart: the API
        does not send who released it, or why, on this endpoint yet. So it
        says nothing new about the reason (the sentence above already covers
        both) and offers the one next step that is true either way: the same
        listing's dates. It is the honest version of the review's "offer the
        next open departure", which would need a departure this page does not
        have.

        Gated on the slug the status carries, and drawn nothing without it
        rather than as a link to `/e/undefined/book`: a pinned contract says
        what the API WILL send.
      */}
      {declined ? (
        <DeclineOffer view={declined} />
      ) : status.state === "released" && status.experience?.slug ? (
        <ButtonLink
          href={`/e/${encodeURIComponent(status.experience.slug)}/book`}
          variant="outline"
          size="sm"
          className="mt-4"
        >
          See other dates
        </ButtonLink>
      ) : null}

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
      {cashOwed(status) ? (
        <Panel className="mt-6">
          <p className="text-base font-bold">
            Bring{" "}
            {formatMoney({
              amountMinor: cashOwedPaise(status) ?? 0,
              currency: status.price?.currency ?? "INR",
            })}{" "}
            in cash
          </p>
          <p className="text-forest/70 mt-1.5 text-sm">
            Pay the operator at the meeting point. The money goes to them, not
            to us, and there is nothing to pay before you arrive.
          </p>
        </Panel>
      ) : null}

      {status.state === "holding" ? (
        /*
          `onChanged` refetches the status, so once a cash booking lands the
          screen re-reads the server rather than believing its own optimism —
          the same rule the release button follows. The success moment renders
          from the booking response either way, so a slow refetch never leaves
          somebody who just committed looking at a pay button.
        */
        <PayButton status={status} onBooked={onChanged} />
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
        <ReleaseButton status={status} onReleased={onChanged} />
      ) : null}

      {/* Everything needed for the day, on the page. Not in a message that
          may never arrive. */}
      <Panel className="mt-8 p-0">
        <dl className="divide-paper-line divide-y text-sm">
          {status.bookingReference ? (
            <Row label="Reference">
              <span className="font-mono text-lg font-bold tracking-wider">
                {status.bookingReference}
              </span>
              <p className="text-forest/70 mt-1 text-xs">
                Read this out at the jetty. It is how the operator finds you.
              </p>
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
          <Row label="Experience">
            {status.experience.slug ? (
              <Link href={`/e/${status.experience.slug}`} className="underline">
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
          <Row label="When">{formatDeparture(status.slot)}</Row>
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
            <Row label="Where you meet">
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
          <Row label="Guests">{status.guests}</Row>
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
            rupee. See `cashOwed`.
          */}
          <Row label={cashOwed(status) ? "To pay on the day" : "Paid"}>
            {formatTotal(status.price)}
          </Row>
        </dl>
      </Panel>

      {/*
        What the operator has told everybody on this departure. The contract
        puts it here on purpose: a relay note "is shown HERE and never sent to
        a phone, so a traveller who is told 'see your booking page' has
        somewhere to look". For a month nothing rendered it, and an operator's
        "meet at jetty 2, not 1" went nowhere.
      */}
      {status.operatorUpdates?.length ? (
        <OperatorUpdates
          updates={status.operatorUpdates}
          timezone={status.slot.timezone}
        />
      ) : null}

      {/*
        WHAT THE OPERATOR ASKED - yuvoy-app#46 §4.

        Under the operator's own notes, because both are the business talking
        to this traveller and this is the half they can answer. Needs the
        network, so it is absent on an offline snapshot like every other
        action on this screen.

        `answersOpen` is read as told: `?? false` rather than inferred from
        the state and the departure, because the contract sends it precisely
        so "a form is never offered that would be refused".
      */}
      {token && status.questions?.length ? (
        <BookingQuestions
          token={token}
          questions={status.questions}
          answersOpen={status.answersOpen ?? false}
        />
      ) : null}

      {/*
        THE CONVERSATION WITH THE BUSINESS - yuvoy-app#47.

        Under the operator's one-way notes and the questions, because this is
        the same conversation getting more specific: what they told everybody,
        what they asked this party, and what these two can say to each other.

        Rendered for any link with a token, INCLUDING one whose hold or
        request never became a booking: that answers "an empty, complete
        conversation with `canWrite: false` and `closedReason: not_booked`,
        not an error", and saying "messages open once the booking is made" is
        more useful than a panel that is simply absent.

        Absent on an offline snapshot, like every other action here, because
        there is no token to open it with.
      */}
      {token ? (
        <MessageThread
          token={token}
          operatorName={status.experience.operator}
          bookingState={status.state}
        />
      ) : null}

      {status.refund ? <RefundProgress refund={status.refund} /> : null}

      {/*
        MANAGE THIS TRIP: one region, not five stacked panels.

        Share, invite, calendar, keep a copy and cancel were five siblings in a
        vertical stack of about twenty-two surfaces, each with its own heading
        and its own weight, none of them more important than the meeting point
        above them. Everything was level one, which is the information
        architecture problem the revamp brief describes: hierarchy, not more
        text.

        They are one labelled region now. Each control keeps its own gate
        EXACTLY as it was, because every one of those conditions encodes a
        contract rule and several were bugs once: `upcoming` reads the server's
        clock, invitations follow the 409 the API would return anyway, and the
        calendar component owns its own exclusions because it is the one that
        knows what it would write.

        On an offline snapshot the token-gated controls are absent, exactly as
        before, and the calendar stays because it never needed the network.
        The region itself is gated on `hasTripActions`, so a trip with nothing
        left to manage draws no heading at all.
      */}
      {hasTripActions ? (
        <section aria-labelledby="manage-trip" className="mt-10">
          <h2 id="manage-trip" className="label text-forest/75">
            Manage this trip
          </h2>

          {token && upcoming ? <ShareButton token={token} /> : null}

          {/*
        Offering a PLACE, which is a different thing from sharing a link
        (#38 items 6 and 12). Share reveals the meeting point to anybody it is
        pasted to; this gives somebody their own seat in the party.

        "Invitations are taken for a trip that is confirmed, or a request still
        waiting on the operator, and that has not ended." `upcoming` covers the
        confirmed half and `awaiting_operator` the other, and the server
        refuses anything else with a 409 regardless.
      */}
          {token && (upcoming || status.state === "awaiting_operator") ? (
            <InviteGuests token={token} />
          ) : null}

          {/*
        The trip in the traveller's own calendar (#38 item 5).

        Not gated on `upcoming` like Share is. Share mints a link for people
        coming along, which is meaningless once a trip has left; adding a past
        trip to a calendar is merely pointless rather than wrong, and the real
        exclusions are the states where an entry would be a lie. The component
        owns that list, since it is the one that knows what it would write.
      */}
          <AddToCalendar status={status} />

          {token ? <KeepBooking status={status} token={token} /> : null}

          {token && upcoming && !cancelling ? (
            <Button
              variant="outline"
              size="sm"
              onClick={() => setCancelling(true)}
              className="mt-4"
            >
              I need to cancel
            </Button>
          ) : null}
        </section>
      ) : null}

      {/*
        A person, two ways (#38 item 4).

        Placed after the actions and before the live-updates note, which is
        where somebody scrolls when the page has not answered their question.
        The WhatsApp message names the booking, so nobody has to explain which
        trip they mean; when there is no reference yet, it names the experience
        instead, because a request the operator has not answered is exactly the
        thing somebody chases.
      */}
      <HelpSection
        support={status.support}
        bookingReference={status.bookingReference}
        token={token}
        whatsappMessage={
          status.bookingReference
            ? `Hi, I need help with booking ${status.bookingReference}.`
            : `Hi, I need help with my request for ${status.experience?.title ?? "my trip"}.`
        }
      />

      {token && cancelling ? (
        <CancelSheet
          token={token}
          onDone={() => {
            setCancelling(false);
            onChanged?.();
          }}
          onClose={() => setCancelling(false)}
        />
      ) : null}

      {/*
        WHO DECIDES A REVIEW IS POSSIBLE, AND IT IS NOT THIS SCREEN.

        This read `status.state === "completed"`, which is the client deriving
        a rule the server owns, and it was wrong in both directions (#38 item
        3). `leaveReview` also refuses a trip whose 30 day window has closed
        and one already reviewed, so a completed trip could offer a button that
        could never succeed. That is exactly the trap yuvoy-app#53 was filed
        about.

        `review.canReview` is the server's own answer to the same question:
        "true for a completed trip with no review that ended no more than 30
        days ago, which is exactly when `leaveReview` accepts one". One rule,
        one place.

        `review` is required on the response and is read defensively anyway, in
        line with the standing rule here that a pinned contract states what an
        API WILL send rather than what it does send today.
      */}
      {token && status.review?.canReview ? <ReviewForm token={token} /> : null}

      {/*
        Already rated. The stars are said back, because a traveller who returns
        to this page wants to know their rating landed, and an absent form is
        indistinguishable from a broken one.
      */}
      {status.review?.reviewed ? (
        <Panel className="mt-8">
          <p className="text-sm font-bold">How was it?</p>
          <p className="text-forest/70 mt-1.5 text-sm">
            {status.review.rating
              ? `Thanks, you rated this ${status.review.rating} ${status.review.rating === 1 ? "star" : "stars"}.`
              : "Thanks, your rating is recorded."}{" "}
            Reviews cannot be changed once left, so it stands as written.
          </p>
        </Panel>
      ) : null}

      {live && !status.final ? (
        <p className="text-forest/70 mt-6 text-xs" role="status">
          This page updates itself. You can leave it open.
        </p>
      ) : null}

      {/*
        The closing "something not right?" paragraph is GONE.

        It said the same thing `HelpSection` says, a few lines above it, on a
        page the audit counted about twenty surfaces on. Two offers of help
        within one screen of each other is the duplication the revamp brief
        named, and the one that survives is the one with the working controls
        rather than the one describing a message that may never have arrived.
      */}
    </div>
  );
}

/* ---------------------------------------------------------- state copy */

function Row({
  label,
  children,
}: {
  label: string;
  children: React.ReactNode;
}) {
  return (
    <div className="flex flex-wrap justify-between gap-x-6 gap-y-1 px-5 py-4">
      <dt className="label text-forest/75">{label}</dt>
      <dd className="text-right">{children}</dd>
    </div>
  );
}

function Loading() {
  return (
    <LoadingState label="Loading your booking">
      <div className="space-y-4">
        <Skeleton className="h-8 w-2/3 rounded-full" />
        <Skeleton className="h-32 w-full" />
      </div>
    </LoadingState>
  );
}

function Shell({ children }: { children: React.ReactNode }) {
  return (
    <Screen back={BACK} stageLabel="Your booking">
      {children}
    </Screen>
  );
}

/**
 * What to do instead, after a request was turned down (yuvoy-api#225).
 *
 * The review asked for "the next open departure of the same listing in the
 * same message". The API sends it when there is one: then it is the one loud
 * control, opening this app's checkout on that date with the same party size,
 * and "See other dates" sits beside it. When there is none in the next 90
 * days that is said plainly, and the way on is somewhere else to go rather
 * than a calendar with nothing on it.
 */
function DeclineOffer({
  view,
}: {
  view: NonNullable<ReturnType<typeof declineView>>;
}) {
  if (view.next) {
    return (
      <div className="mt-4">
        <p className="max-w-prose text-sm">
          The next date on this trip is{" "}
          <span className="font-bold">{view.next.when}</span>.
        </p>
        <div className="mt-3 flex flex-wrap gap-2">
          <ButtonLink href={view.next.href} size="sm">
            Book that date
          </ButtonLink>
          {view.otherDates ? (
            <ButtonLink href={view.otherDates} variant="outline" size="sm">
              See other dates
            </ButtonLink>
          ) : null}
        </div>
      </div>
    );
  }

  /*
    Only when the page knows the listing: a status too old to say which one
    it was cannot claim there is nothing else on it.
  */
  if (!view.otherDates) return null;
  return (
    <div className="mt-4">
      <p className="text-forest/70 max-w-prose text-sm">
        Nothing else is on sale for this trip in the next 90 days.
      </p>
      <ButtonLink href="/" variant="outline" size="sm" className="mt-3">
        Find something else
      </ButtonLink>
    </div>
  );
}
