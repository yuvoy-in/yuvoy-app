"use client";

import { useState } from "react";
import { useMutation } from "@tanstack/react-query";
import { createApiClient } from "@/lib/api/client";
import { formatMoney } from "@/lib/format/money";
import { describeError, FailurePanel } from "@/components/states";
import { openHostedCheckout } from "@/lib/booking/payment-handoff";
import { YuvoyError, isCheckoutDeadEnd } from "@/lib/api/errors";
import { isBooked, readPayAtCounter } from "@/lib/booking/cash-booking";
import { Button, ButtonLink } from "@/components/ui/button";
import { Panel } from "@/components/ui/panel";
import { formatTotal } from "./trip-copy";
import { CashBooked } from "./trip-progress";
import type { components } from "@/lib/api/schema.gen";

type BookingStatus = components["schemas"]["BookingStatus"];

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
export function PayButton({
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
export function ReleaseButton({
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
