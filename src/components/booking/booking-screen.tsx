"use client";

import { useEffect, useState, useSyncExternalStore } from "react";
import { useDocumentTitle } from "@/lib/site/use-document-title";
import { useMutation } from "@tanstack/react-query";
import { createApiClient } from "@/lib/api/client";
import { useBookingStatus } from "@/lib/booking/use-booking-status";
import { useFragmentToken } from "@/lib/booking/use-fragment-token";
import { formatMoney } from "@/lib/format/money";
import { formatCountdown, msUntil, formatAge } from "@/lib/format/time";
import { clockOffsetMs } from "@/lib/booking/clock";
import {
  describeError,
  ErrorState,
  FailurePanel,
  LoadingState,
  Skeleton,
} from "@/components/states";
import { openHostedCheckout } from "@/lib/booking/payment-handoff";
import { YuvoyError, isCheckoutDeadEnd } from "@/lib/api/errors";
import { CancelSheet } from "./cancel-sheet";
import { ShareButton } from "./share-button";
import {
  amountToBring,
  isBooked,
  cashOwed,
  cashOwedPaise,
  readPayAtCounter,
  type CashBooking,
} from "@/lib/booking/cash-booking";
import { ReviewForm } from "./review-form";
import { Screen } from "@/components/chrome/screen";
import { Button, ButtonLink } from "@/components/ui/button";
import { Panel } from "@/components/ui/panel";
import { cn } from "@/lib/cn";
import type { components } from "@/lib/api/schema.gen";

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
          Bookings on this device
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
          className="rounded-card border-cream-line bg-cream-deep mb-6 border px-4 py-3 text-xs"
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

  // Read the clock ONCE, outside the render path. Reading it during render is
  // impure and the React compiler refuses it — and "is this trip still ahead"
  // does not need to be re-evaluated between frames.
  const [now] = useState(() => Date.now());

  // Confirmed and still ahead of us: sharing and cancelling both make sense.
  // A trip that has already left can do neither.
  const upcoming =
    status.state === "confirmed" &&
    new Date(status.slot.startsAt).getTime() > now;

  // See the "Where you meet" row and the reason line below for why each of
  // these is derived rather than read straight off the response.
  const meetingText = status.meetingPoint?.text?.trim();
  const meetingLandmark = status.meetingPoint?.landmark?.trim();
  const reason = cancellationReason(status.cancellation?.reasonCode);

  return (
    <div>
      <p className="eyebrow text-terra-deep">{copy.eyebrow}</p>
      <h1 className="font-display tracking-display mt-3 text-3xl leading-tight sm:text-4xl">
        {copy.title}
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
      <p className="text-forest/70 mt-3 max-w-prose text-sm">{copy.body}</p>

      {/*
        The countdown renders ONLY while holding. `holdExpiresAt` is absent in
        every other state precisely so a clock is never shown beside a dead
        booking — and it is one countdown, not two: the payment order's
        expiresAt IS this deadline.
      */}
      {status.state === "holding" && status.holdExpiresAt ? (
        <HoldCountdown expiresAt={status.holdExpiresAt} />
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
        <dl className="divide-cream-line divide-y text-sm">
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
          <Row label="Experience">{status.experience.title}</Row>
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

      {status.refund ? <RefundProgress refund={status.refund} /> : null}

      {/* Actions need the network, so they are absent on an offline snapshot. */}
      {token && upcoming ? <ShareButton token={token} /> : null}

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

      {/* Reviews unlock only on a trip that actually happened. */}
      {token && status.state === "completed" ? (
        <ReviewForm token={token} />
      ) : null}

      {live && !status.final ? (
        <p className="text-forest/70 mt-6 text-xs" role="status">
          This page updates itself. You can leave it open.
        </p>
      ) : null}

      <p className="text-forest/70 border-cream-line mt-8 border-t pt-6 text-xs">
        Something not right? Reply to the WhatsApp message we sent, or contact
        us from the link in it. Someone answers between 06:00 and 21:00.
      </p>
    </div>
  );
}

/* ---------------------------------------------------------- state copy */

/**
 * The vocabulary, one entry per contract state.
 *
 * `verifying` is the one that matters most: money may have moved and the
 * outcome is not settled. It is ALSO what the server says when a booking
 * exists but is not yet visible to it. Rendering it as failure tells somebody
 * who has just been debited that they have lost their money.
 */
const STATE_COPY: Record<
  string,
  { eyebrow: string; title: string; body: string }
> = {
  /*
    A CASH BOOKING, BEFORE THE OPERATOR HAS RECORDED THE MONEY — yuvoy-app#29.

    Keyed by `string` rather than by `BookingStatus["state"]` because
    `paid_pending_ops` is NOT in that enum: the traveller contract declares it
    only on `CashBooking`. `STATE_COPY[status.state]` is dereferenced three
    lines into the render, so an undeclared state was a TypeError on the screen
    of somebody who had just committed money — the worst place in the product
    to crash. `stateCopy` below makes the lookup total.

    The copy says BOOKED. "Both should read as booked to the traveller — the
    difference is our bookkeeping, not their standing." Never "unpaid", never
    "pending payment": it is a confirmed seat on a boat.
  */
  paid_pending_ops: {
    eyebrow: "Booked",
    title: "You're booked",
    body: "Your seat is held on the boat. Pay the operator in cash when you arrive. The amount and where to meet are below.",
  },
  holding: {
    eyebrow: "Seats held",
    title: "Your seats are held",
    body: "Nobody else can take them while this clock runs. Pay to confirm.",
  },
  awaiting_operator: {
    eyebrow: "Asked",
    title: "We have asked the operator",
    body: "They confirm this one by hand, so it is a person answering rather than a system. We will message you the moment they do. Nothing has been charged.",
  },
  verifying: {
    eyebrow: "Checking",
    title: "Confirming your payment",
    /*
      Copy set by yuvoy-api#53, which answered this precisely: there is no
      bound on `verifying` and nothing measures it, because it is a RACE
      WINDOW of milliseconds to seconds — the moment between a payment landing
      and the booking row becoming visible — not a waiting room. A traveller
      sitting here for two hours is an incident, not the design.

      So: no number, no countdown, and no "come back later". The prototype's
      two-hour cap was drawn for a sustained operational state that does not
      exist yet; publishing it would publish a promise nothing keeps.
    */
    body: "This usually takes a few seconds. If money left your account it is safe, and this page updates itself the moment it settles.",
  },
  confirmed: {
    eyebrow: "Confirmed",
    title: "You are going",
    body: "Everything you need is on this page. Save the link. It works from any device, and you do not need an account or a password.",
  },
  declined: {
    eyebrow: "Refunded",
    title: "We could not get you the seat",
    body: "Money was taken and the seat could not be delivered, so a full refund is already on its way. You do not need to ask for it.",
  },
  cancelled: {
    eyebrow: "Cancelled",
    title: "This trip was called off",
    /*
      The "if the sea called it off" hedge was removed with yuvoy-app#22 §2 —
      the real reason is rendered above this from `cancellation.reasonCode`.
      What is left is the refund fact and the rebooking rule, both of which
      are true whatever the reason was.
    */
    body: "Your refund has already started. Rebooking is a fresh booking rather than a silent move. The price you see will be the price you pay.",
  },
  expired: {
    eyebrow: "Expired",
    title: "The hold ran out",
    body: "The seats went back on sale. Nothing was charged, and you can book again if they are still there.",
  },
  released: {
    eyebrow: "Released",
    title: "This booking was let go",
    body: "Either you gave it up or the operator could not take it. Nothing was charged.",
  },
  completed: {
    eyebrow: "Done",
    title: "Hope it was worth it",
    body: "This trip has happened. If you want to say something about it, we would read it.",
  },
  no_show: {
    eyebrow: "Not boarded",
    title: "You did not board",
    body: "The operator marked this one as a no-show. If that is wrong, tell us and we will look.",
  },
};

/**
 * The copy for a state, for ANY state.
 *
 * `STATE_COPY[status.state]` was dereferenced unguarded three lines into the
 * render, so a state this build has never heard of took the whole booking
 * screen to the error boundary — for somebody holding a reference, possibly
 * having just handed over money. `paid_pending_ops` is exactly such a state
 * today: real, returned after a cash booking, and absent from the enum.
 *
 * The fallback is deliberately vague and deliberately not alarming. There is
 * no honest specific: "Confirmed" would be a lie for a cancellation and
 * "Something went wrong" a lie for a booking that is fine. It says what is
 * certainly true — the booking exists, we can see it, here is your reference —
 * and leaves the rest of the screen, which is all derived from fields rather
 * than from the state, to say the rest.
 */
function stateCopy(state: string): {
  eyebrow: string;
  title: string;
  body: string;
} {
  return (
    STATE_COPY[state] ?? {
      eyebrow: "Your booking",
      title: "Your booking",
      body: "We can see this booking. Your reference and the details are below. If anything here looks wrong, send us the reference and we will check it.",
    }
  );
}

/* ------------------------------------------------------------- fragments */

function HoldCountdown({ expiresAt }: { expiresAt: string }) {
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

/**
 * T8 — opening checkout.
 *
 * Two answers the contract gives, and both are rendered — a client "switches
 * on one field across both responses rather than inferring from the status
 * code":
 *
 *   - `200 coming_soon` — "Payment is not open yet. A deliberate product
 *     state, not a failure: the hold is real and still running, so keep
 *     showing the countdown. Render `message` and do not treat this as an
 *     error." This is what production answers until a processor exists.
 *   - `201 ready` — an order to pay against, handed to the provider's own
 *     checkout through `openHostedCheckout`. No provider is registered yet,
 *     and that is said on screen rather than spun through.
 *
 * The first version rendered neither. It read only `order.error`, so both
 * success shapes were discarded: the button said "Opening…", returned to
 * "Pay", and the traveller learned nothing while the hold clock ran. The
 * mock hid it by answering an uncontracted 503 — the one shape that WAS
 * rendered. A 503 `payments_unavailable` is still handled below, because a
 * transport can always say it.
 */
function PayButton({
  status,
  onBooked,
}: {
  status: BookingStatus;
  /** Refetch the status once a cash booking lands, so the screen catches up. */
  onBooked?: () => void;
}) {
  const [handoff, setHandoff] = useState<"idle" | "opening" | "no_adapter">(
    "idle",
  );

  const order = useMutation({
    retry: false,
    mutationFn: async () => {
      const client = createApiClient();
      const { data, error } = await client.POST(
        "/reservations/{id}/payment-order",
        { params: { path: { id: status.reservationId } } },
      );
      if (error) throw error;
      return data;
    },
    onSuccess: async (answer) => {
      if (answer.state !== "ready") return;
      setHandoff("opening");
      const outcome = await openHostedCheckout(answer);
      setHandoff(outcome === "opened" ? "opening" : "no_adapter");
    },
  });

  const answer = order.data;

  /*
    PAYING THE OPERATOR IN CASH ON THE DAY — yuvoy-app#29.

    Until a processor is live this is the ONLY way a booking can be finished.
    The payment step reached `coming_soon`, rendered the message and stopped,
    and the held seats lapsed fifteen minutes later — so nothing in the app
    could be booked to completion at all.

    Read by PRESENCE off either answer. `payAtCounter` arrives on the
    `coming_soon` answer AND on `ready`, and production has a processor
    configured and returns `ready` — so gating this on `state` would have
    hidden it exactly where it is live. See `readPayAtCounter`.
  */
  const cashOffer = readPayAtCounter(answer);

  const cash = useMutation({
    retry: false,
    mutationFn: async () => {
      const client = createApiClient();
      /*
        The typed path, not `payAtCounter.confirmAt`.

        `confirmAt` is what SAYS the option is available and is honoured as
        that signal. It is not used as the request target: posting the
        traveller's own reservation to a path taken from a response body is a
        redirect we would be following on the server's word, and the path is
        declared in the contract anyway, so nothing is gained by trusting it.
        Flagged on the issue in case the API means to move it.

        No `Idempotency-Key`, and that is not an omission: "one reservation has
        at most one booking by construction."
      */
      const { data, error } = await client.POST(
        "/reservations/{id}/cash-booking",
        { params: { path: { id: status.reservationId } } },
      );
      if (error) throw error;
      return data;
    },
    /*
      `201` the first time, `200` if it was already confirmed — the second tap
      on ferry wifi. Same booking, so both land here and are rendered
      identically. Nothing counts a `200` as a fresh conversion because nothing
      counts conversions here at all.
    */
    onSuccess: () => onBooked?.(),
  });

  const booked = cash.data;
  const failure = order.error
    ? describeError(order.error)
    : cash.error
      ? describeError(cash.error)
      : null;
  const busy = order.isPending || handoff === "opening";

  /*
    A checkout that cannot be finished, and the way out of it.

    `operator_not_bookable` is new here (yuvoy-app#19 §3): the operator's
    standing is re-checked when a traveller RE-ENTERS checkout, not only when
    they first took the seat, which closes the window where a traveller could
    hold seats, the operator be switched off, and the traveller pay anyway.
    `reservation_not_payable` is the same shape and much commoner — a hold that
    lapsed while somebody found their card.

    Both used to render as a panel of text on a screen whose only control is a
    Pay button that will fail again. The copy already said "pick a departure
    again"; there was nothing to tap that got them there, so the traveller's
    options were the browser's back button or leaving. The dates are one link
    away and `BookingStatus.experience.slug` is required by the contract, so
    the screen can simply offer it.
  */
  const deadEnd =
    order.error instanceof YuvoyError && isCheckoutDeadEnd(order.error.code);

  /*
    Somebody has just committed. This is the one screen in the product where
    the absence is NOT the design — everywhere else a state change is a quiet
    line, and here it should feel like something happened.
  */
  if (booked && isBooked(booked)) {
    return <CashBooked booking={booked} status={status} />;
  }

  return (
    <div className="mt-6">
      <Button size="lg" block onClick={() => order.mutate()} disabled={busy}>
        {busy ? "Opening…" : `Pay ${formatTotal(status.price)}`}
      </Button>

      {answer?.state === "coming_soon" ? (
        <Panel role="status" className="mt-4">
          <p className="text-sm font-bold">Payment is not open yet</p>
          <p className="text-forest/70 mt-1.5 text-sm">{answer.message}</p>
          <p className="text-forest/70 mt-2 text-xs">
            Nothing has been charged.
            {answer.holdStillActive === false
              ? ""
              : " Your seats stay held while the clock above runs."}
          </p>
        </Panel>
      ) : null}

      {/*
        CASH, AS A REAL CHOICE — yuvoy-app#29.

        Not a fallback tucked under a "having trouble?" link. "On a jetty in
        the Andamans it is how people pay, and a traveller with no card or no
        signal at the moment they decide is not an edge case."

        When the card flow is not open (`coming_soon`) this is the ONLY way to
        finish, so it leads. When an order is ready the card flow leads and
        this sits beside it, clearly labelled and full size.

        The amount is in the button on purpose: "a traveller deciding whether
        to commit wants to know what they are committing to, and 'pay on the
        day' without a number reads as a trap."
      */}
      {cashOffer && !busy ? (
        <div className="mt-4">
          <Button
            size="lg"
            block
            variant={answer?.state === "ready" ? "outline" : "primary"}
            disabled={cash.isPending}
            onClick={() => cash.mutate()}
          >
            {cash.isPending
              ? "Booking…"
              : `Book now, pay ${formatTotal(status.price)} cash on the day`}
          </Button>
          <p className="text-forest/70 mt-2 text-center text-xs">
            {/*
              "Pay the operator", never "pay Yuvoy" or "amount due". The money
              never reaches us, and it is what they will be holding when they
              arrive.
            */}
            You pay the operator at the meeting point. Nothing is charged now.
          </p>
        </div>
      ) : null}

      {answer?.state === "ready" && handoff === "no_adapter" ? (
        <Panel role="status" className="mt-4">
          <p className="text-sm font-bold">
            Your order is ready:{" "}
            {formatMoney({
              amountMinor: answer.amountPaise,
              currency: answer.currency,
            })}
          </p>
          <p className="text-forest/70 mt-1.5 text-sm">
            This version of the app cannot open the {answer.provider} payment
            page yet. Nothing has been charged, and your seats stay held while
            the clock above runs. Update the app, or send us your reference on
            WhatsApp and we will take it from there.
          </p>
        </Panel>
      ) : null}

      {answer?.state === "ready" && handoff === "opening" ? (
        <p role="status" className="text-forest/70 mt-4 text-sm">
          Opening payment with {answer.provider}…
        </p>
      ) : null}

      {failure ? (
        <FailurePanel failure={failure} className="mt-4">
          {deadEnd ? (
            <ButtonLink
              href={`/e/${status.experience.slug}`}
              variant="outline"
              size="sm"
              className="mt-4"
            >
              See other dates
            </ButtonLink>
          ) : null}
        </FailurePanel>
      ) : null}
    </div>
  );
}

/**
 * Giving the seats back, in two taps.
 *
 * A hold releases the seats to whoever is next; a request tells the operator
 * not to bother answering. Neither charges anything and neither can be undone,
 * which is why the first tap only asks. The server's answer is the truth: the
 * status is refetched rather than assumed, so the screen lands on `released`
 * because the API said so.
 */
function ReleaseButton({
  status,
  onReleased,
}: {
  status: BookingStatus;
  onReleased: () => void;
}) {
  const [confirming, setConfirming] = useState(false);
  const isRequest = status.state === "awaiting_operator";

  const release = useMutation({
    retry: false,
    mutationFn: async () => {
      const client = createApiClient();
      const { error } = await client.POST("/reservations/{id}/release", {
        params: { path: { id: status.reservationId } },
      });
      if (error) throw error;
    },
    onSuccess: () => onReleased(),
  });

  const failure = release.error ? describeError(release.error) : null;

  return (
    <div className="mt-4">
      {confirming ? (
        <Panel>
          <p className="text-sm font-bold">
            {isRequest ? "Withdraw this request?" : "Give these seats back?"}
          </p>
          <p className="text-forest/70 mt-1.5 text-sm">
            {isRequest
              ? "The operator will not answer it. Nothing has been charged, and you can ask again any time."
              : "They go back on sale for whoever is next. Nothing has been charged."}
          </p>
          <div className="mt-4 flex flex-wrap gap-3">
            <Button
              variant="outline"
              disabled={release.isPending}
              onClick={() => release.mutate()}
              className="flex-1"
            >
              {release.isPending
                ? "Letting go…"
                : isRequest
                  ? "Yes, withdraw it"
                  : "Yes, let them go"}
            </Button>
            <Button onClick={() => setConfirming(false)} className="flex-1">
              {isRequest ? "Keep asking" : "Keep them"}
            </Button>
          </div>
          {failure ? <FailurePanel failure={failure} className="mt-3" /> : null}
        </Panel>
      ) : (
        <Button variant="outline" size="sm" onClick={() => setConfirming(true)}>
          {isRequest ? "Withdraw the request" : "Give these seats back"}
        </Button>
      )}
    </div>
  );
}

/** What the operator has told everybody on this departure. */
const UPDATE_LABEL: Record<string, string> = {
  time_change: "Time changed",
  meeting_point_change: "Meeting point changed",
  weather_watch: "Weather watch",
  bring_item: "Bring",
  note: "A note",
};

function OperatorUpdates({
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
          {updates.map((u, i) => (
            <li
              key={`${u.sentAt ?? i}-${u.intent ?? "note"}`}
              className="text-sm"
            >
              <p className="font-bold">
                {UPDATE_LABEL[u.intent ?? "note"] ?? "From the operator"}
                {u.detail ? `: ${u.detail}` : ""}
              </p>
              {u.note ? <p className="text-forest/80 mt-1">{u.note}</p> : null}
              {u.sentAt ? (
                <p className="text-forest/70 mt-1 text-xs">
                  {formatSentAt(u.sentAt, timezone)}
                </p>
              ) : null}
            </li>
          ))}
        </ul>
        <p className="text-forest/70 mt-3 text-xs">
          Shown here and not sent to your phone. This page is the place to
          check.
        </p>
      </section>
    </Panel>
  );
}

/** When an update was sent, in the MARKET's zone. */
function formatSentAt(iso: string, timeZone: string): string {
  return new Intl.DateTimeFormat("en-IN", {
    timeZone,
    weekday: "short",
    day: "numeric",
    month: "short",
    hour: "2-digit",
    minute: "2-digit",
    hour12: false,
  }).format(new Date(iso));
}

function RefundProgress({
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
function HandOver({ status }: { status: BookingStatus }) {
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

/** The frozen total. `totalPaise` on a booking, not `amountMinor`. */
function formatTotal(price: BookingStatus["price"]): string {
  return formatMoney({
    amountMinor: price.totalPaise,
    currency: price.currency,
  });
}

/** Renders the departure in the MARKET's zone, never the device's. */
/**
 * Why a trip was called off, in a sentence a traveller can act on.
 *
 * The codes are a closed set in `cancellation_reason_codes` — twelve today —
 * and they are OUR tokens. `CREDENTIAL_LAPSE` is a column value, not an
 * explanation, and printing it is the same defect as printing a booking state.
 *
 * `TRAVELLER_REQUEST` and `CUSTOMER_REQUEST` are the same event under two
 * names. That duplicate is in the backend's data and is not ours to fix, so
 * both are mapped to the same sentence rather than one of them falling
 * through.
 *
 * The FALLBACK is the load-bearing part. The set grows by INSERT on the
 * server with no deploy here, so an unmapped code is not a defect to guard
 * against, it is the expected steady state after any addition. It must not
 * render blank and it must not render the token.
 */
export function cancellationReason(code?: string): string | null {
  const key = code?.trim().toUpperCase();
  if (!key) return null;

  const sentences: Record<string, string> = {
    WEATHER: "Conditions on the day.",
    SAFETY: "The operator made a safety call.",
    OPERATOR_CANCELLED: "The operator cancelled.",
    OPERATOR_DISHONOUR: "The operator could not honour the booking.",
    OPERATOR_UNREACHABLE: "We could not reach the operator.",
    CAPACITY_LOST: "The seats were no longer available.",
    CREDENTIAL_LAPSE: "The operator's paperwork was not current.",
    MEDICAL_UNFIT: "This trip was not medically suitable.",
    TRAVELLER_REQUEST: "You asked us to cancel.",
    CUSTOMER_REQUEST: "You asked us to cancel.",
    PAYMENT_FAILED: "The payment did not complete.",
    ADMIN_ERROR: "This was our mistake.",
  };

  return sentences[key] ?? "The operator or we called it off.";
}

/**
 * How long the operator has left to answer a request.
 *
 * The same machinery as `HoldCountdown` and deliberately not the same copy:
 * a hold is the traveller's clock — pay before it runs out — and this is
 * somebody else's. Nothing is required of the person reading it, so it is
 * `raised` rather than `alert` at every point on the clock, and there is no
 * urgent state. A request lapsing costs them nothing; they were never charged.
 *
 * The deadline is stated in the MARKET's zone, like every other time on this
 * screen, and against the server's clock via the offset each response teaches
 * us — a phone an hour fast used to show a live hold as already expired.
 */
function AnswerBy({
  expiresAt,
  timezone,
}: {
  expiresAt: string;
  timezone: string;
}) {
  const [left, setLeft] = useState(() => msUntil(expiresAt, clockOffsetMs()));

  useEffect(() => {
    const t = setInterval(
      () => setLeft(msUntil(expiresAt, clockOffsetMs())),
      1000,
    );
    return () => clearInterval(t);
  }, [expiresAt]);

  const when = new Date(expiresAt);
  const deadline = new Intl.DateTimeFormat("en-IN", {
    timeZone: timezone,
    weekday: "long",
    day: "numeric",
    month: "long",
    hour: "2-digit",
    minute: "2-digit",
    hour12: false,
  }).format(when);

  return (
    <Panel className="mt-6" role="timer" aria-live="off">
      <p className="label text-forest/75">The operator has until</p>
      <p className="mt-1 text-lg font-bold">{deadline}</p>
      <p className="text-forest/70 mt-2 text-sm">
        {left > 0
          ? `${formatCountdown(left)} left to answer. Nothing has been charged, and you can withdraw the ask at any time.`
          : "That has passed. If they do not answer, the request lapses on its own and nothing is charged."}
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
function CashBooked({
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

        <p className="border-cream-line text-forest/80 mt-5 border-t pt-4 text-sm">
          {formatDeparture(status.slot)}
          {meeting ? ` · ${meeting}` : null}
        </p>
      </Panel>
    </div>
  );
}

function formatDeparture(slot: BookingStatus["slot"]): string {
  const when = new Date(slot.startsAt);
  const date = new Intl.DateTimeFormat("en-IN", {
    timeZone: slot.timezone,
    weekday: "long",
    day: "numeric",
    month: "long",
  }).format(when);
  const time = new Intl.DateTimeFormat("en-IN", {
    timeZone: slot.timezone,
    hour: "2-digit",
    minute: "2-digit",
    hour12: false,
  }).format(when);
  return `${time} on ${date}`;
}

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

/** True after hydration. `useSyncExternalStore` is the honest way to ask. */
function useHasMounted(): boolean {
  return useSyncExternalStore(
    () => () => {},
    () => true,
    () => false,
  );
}

function Shell({ children }: { children: React.ReactNode }) {
  return (
    <Screen back={BACK} stageLabel="Your booking">
      {children}
    </Screen>
  );
}
