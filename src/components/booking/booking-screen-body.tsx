"use client";

import { useLayoutEffect, useRef, useState } from "react";
import { useDocumentTitle } from "@/lib/site/use-document-title";
import { clockOffsetMs } from "@/lib/booking/clock";
import { useServerClock } from "@/lib/booking/use-server-clock";
import { CancelSheet } from "./cancel-sheet";
import { BookingQuestions } from "./booking-questions";
import { MessageThread } from "./message-thread";
import { HelpSection } from "@/components/support/help-section";
import { cashToGetBack } from "@/lib/booking/cash-booking";
import { ReviewForm } from "./review-form";
import { ButtonLink } from "@/components/ui/button";
import { Panel } from "@/components/ui/panel";
import { cn } from "@/lib/cn";
import { FadeText } from "@/components/ui/fade-text";
import { useListMotion } from "@/lib/motion/use-list-motion";
import type { components } from "@/lib/api/schema.gen";
import {
  cancellationReason,
  declineView,
  stateCopy,
  tripWhen,
} from "./trip-copy";
import { OperatorUpdates, RefundProgress } from "./trip-progress";
import { HoldAndPay } from "./booking-screen-pay";
import { BookingFacts } from "./booking-screen-facts";
import { ManageTrip } from "./booking-screen-manage";
import { DeclineOffer } from "./booking-screen-decline";
import { TickMark, settle } from "./booking-screen-settle";

type BookingStatus = components["schemas"]["BookingStatus"];

/*
  The body of the booking page, moved word for word out of booking-screen.tsx.
  Three of its blocks are lifted into booking-screen-pay.tsx,
  booking-screen-facts.tsx and booking-screen-manage.tsx.
*/

/* ------------------------------------------------------------------ body */

export function StatusBody({
  status,
  live,
  token,
  onChanged,
  arrived = false,
}: {
  status: BookingStatus;
  live: boolean;
  /** Absent when rendering an offline snapshot — every action needs network. */
  token?: string | null;
  onChanged?: () => void;
  /** Opened by the tap that booked it: the pass settles, once (T10 A). */
  arrived?: boolean;
}) {
  const copy = stateCopy(status.state);
  /*
    A request the operator turned down, when the API says so in words
    (yuvoy-api#225). `null` for every other booking, and for a status from an
    API that does not send `cancellation.message`: then this page says what it
    always said. See `declineView`.
  */
  const declined = declineView(status);
  const cashBack = cashToGetBack(status);
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
    The SERVER's clock, from the moment the page was drawn, and kept current
    while it stays open.

    Never read during render: that is impure and the React compiler refuses
    it. It used to be read once, so a page left open overnight said
    "Tomorrow, 07:00" on the morning itself, and a trip that had left still
    offered Share and "I need to cancel" (stability audit, 6 Oct 2026).

    `clockOffsetMs()` is the half that was missing (yuvoy-app#69). `upcoming`
    below gates Share and "I need to cancel", so a phone running fast HID the
    cancel button on a trip that had not happened, and a hidden control has no
    server backstop: no request is made for anyone to refuse. The offset is
    recorded from the `Date` header on every response, so it costs nothing to
    read and this file already uses it for the hold countdown.
  */
  const [opened] = useState(() => Date.now() + clockOffsetMs());
  const now = useServerClock(opened);

  // Confirmed and still ahead of us: sharing and cancelling both make sense.
  // A trip that has already left can do neither.
  const upcoming =
    status.state === "confirmed" &&
    new Date(status.slot.startsAt).getTime() > now;

  /*
    The hour as the headline for a trip still ahead (the approved redesign,
    3 Oct 2026): "Tomorrow, 07:00" is what somebody opens this page for on the
    morning, and "You are going" leads the line under it instead.
  */
  const when = upcoming ? tripWhen(status.slot, now) : null;

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

  /*
    THE PASS SETTLES (T10 A, approved 4 Oct 2026), the second of the app's two
    authored moments. On the page the booking tap lands on, and only there:
    the eyebrow's tick draws (250ms, from 100ms), the first panel rises 12px
    into place (250ms), and the reference arrives last (150ms, from 200ms),
    350ms in all. Under reduced motion the tick is simply drawn and the panel
    and the reference fade in (120ms). Read once, at mount.
  */
  const page = useRef<HTMLDivElement | null>(null);
  const settles = useRef(arrived);
  useLayoutEffect(() => {
    const root = page.current;
    if (settles.current && root) settle(root);
  }, []);

  /*
    And a page that changes while it is open (a poll, a cancel opened) is
    seen changing (T10 A): a section that arrives fades in, one that goes
    fades where it was, and what was under it slides up into the gap. Every
    section is an item, named by its element, so none of them needs a key.
  */
  // Checked after every render of the page; only what moved, moves.
  useListMotion(page, [status, cancelling], { arrive: "fade", byNode: true });

  /*
    A confirmed booking's eyebrow carries a tick where the terra square is
    (the owner's word, 4 Oct 2026). The word Confirmed carries the state; the
    tick is drawn for the eye and hidden from assistive technology.
  */
  const ticked = status.state === "confirmed" && !declined;

  return (
    <div ref={page}>
      {/*
        "Not accepted", the word Trips already uses for a declined request
        (yuvoy-app#100), rather than "Released", which reads as though the
        traveller let it go.
      */}
      <p className={cn("eyebrow text-terra-deep", ticked && "eyebrow-tick")}>
        {ticked ? <TickMark /> : null}
        <FadeText>{declined ? "Not accepted" : copy.eyebrow}</FadeText>
      </p>
      {/*
        The hour is a figure on the board; every other title is Yuvoy's
        headline. On the words, so the leaving copy keeps its face.
      */}
      <h1 className="mt-3 text-3xl sm:text-4xl">
        <FadeText
          block
          wordsClassName={
            !declined && when
              ? "font-board leading-tight tabular-nums"
              : "font-display tracking-display leading-display text-balance"
          }
        >
          {declined ? "Your request was not accepted" : (when ?? copy.title)}
        </FadeText>
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
        <p className="text-body mt-3 max-w-prose font-bold text-pretty">
          {reason}
        </p>
      ) : null}
      {body ? (
        <p className="text-forest/70 text-body mt-3 max-w-prose text-pretty">
          {/* The state's own words lead the line when the hour is the title. */}
          <FadeText block>{when ? `${copy.title}. ${body}` : body}</FadeText>
        </p>
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

      <HoldAndPay
        status={status}
        token={token}
        onChanged={onChanged}
        cashBack={cashBack}
      />

      <BookingFacts
        status={status}
        meetingText={meetingText}
        meetingLandmark={meetingLandmark}
      />

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

      <ManageTrip
        status={status}
        token={token}
        upcoming={upcoming}
        hasTripActions={hasTripActions}
        cancelling={cancelling}
        setCancelling={setCancelling}
      />

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
          <p className="text-sm font-bold text-balance">How was it?</p>
          <p className="text-forest/70 text-body mt-1.5 text-pretty">
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
