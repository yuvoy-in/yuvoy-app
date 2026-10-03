"use client";

import { useState } from "react";
import { useMutation, useQuery } from "@tanstack/react-query";
import { createApiClient } from "@/lib/api/client";
import { formatMoney } from "@/lib/format/money";
import { qk } from "@/lib/query/policy";
import {
  describeError,
  FailurePanel,
  LoadingState,
  Skeleton,
} from "@/components/states";
import {
  hasPaymentAdapter,
  openHostedCheckout,
} from "@/lib/booking/payment-handoff";
import { YuvoyError, isCheckoutDeadEnd } from "@/lib/api/errors";
import { isBooked, readPayAtCounter } from "@/lib/booking/cash-booking";
import { Button, ButtonLink } from "@/components/ui/button";
import { Panel } from "@/components/ui/panel";
import { cn } from "@/lib/cn";
import { formatTotal } from "./trip-copy";
import { CashBooked } from "./trip-progress";
import type { components } from "@/lib/api/schema.gen";

type BookingStatus = components["schemas"]["BookingStatus"];

/**
 * This hold's payment order. One reservation has at most one by construction,
 * so asking twice returns the same order: the contract's own guarantee, and
 * what makes asking on arrival safe.
 */
async function requestPaymentOrder(reservationId: string) {
  const client = createApiClient();
  const { data, error } = await client.POST(
    "/reservations/{id}/payment-order",
    { params: { path: { id: reservationId } } },
  );
  if (error) throw error;
  return data;
}

/**
 * T8, the pay step: how a held booking is finished.
 *
 * ## Cash leads, because it is the way that finishes (the redesign, 3 Oct 2026)
 *
 * This used to lead with "Pay ₹X" and nothing else. The ways to pay were in
 * the ANSWER to that button, so cash at the counter, the only way any booking
 * can be finished today, appeared only after a traveller had pressed a button
 * that could not take their money: production answers `ready` for a provider
 * this build has no adapter for, so "Pay" opened nothing and cash arrived
 * second, outlined (cited in the redesign's before page).
 *
 * So the page asks on arrival. `POST /reservations/{id}/payment-order` is
 * idempotent per reservation, so asking before the tap costs nothing and
 * commits nothing; the answer says which ways are open, and the page offers
 * them in the order that works:
 *
 *   - Cash, when `payAtCounter` says so, as the primary action, with the
 *     amount in the button: "a traveller deciding whether to commit wants to
 *     know what they are committing to, and 'pay on the day' without a number
 *     reads as a trap." (yuvoy-app#29)
 *   - A card or UPI button only where this build can actually open the
 *     provider's page (`hasPaymentAdapter`). The tap asks for the order again,
 *     so it never opens an order that has lapsed while the page sat open.
 *   - Paying online not open yet is said, never offered as a button: quietly,
 *     in the server's own words, when cash is there to finish with; as the
 *     panel it always was when it is not.
 *
 * The two answers the contract gives are still both rendered: `200
 * coming_soon` is "a deliberate product state, not a failure: the hold is real
 * and still running, so keep showing the countdown", and `201 ready` is an
 * order to pay against. A 503 `payments_unavailable` is still handled,
 * because a transport can always say it.
 */
export function PayButton({
  status,
  onBooked,
}: {
  status: BookingStatus;
  /** Refetch the status once a cash booking lands, so the screen catches up. */
  onBooked?: () => void;
}) {
  const [handoff, setHandoff] = useState<"idle" | "opening">("idle");

  const options = useQuery({
    queryKey: qk.paymentOrder(status.reservationId),
    queryFn: () => requestPaymentOrder(status.reservationId),
    /*
      Asked once per hold. It answers a question about the reservation, not
      about time, and a refetch on focus would be a POST on every glance away.
      No retry: a refusal here is an answer (a lapsed hold, a paused business),
      and the failure panel below offers the retry a person chooses.
    */
    staleTime: Infinity,
    retry: false,
    refetchOnWindowFocus: false,
    refetchOnReconnect: false,
  });

  const order = useMutation({
    retry: false,
    mutationFn: () => requestPaymentOrder(status.reservationId),
    onSuccess: async (answer) => {
      if (answer.state !== "ready") return;
      setHandoff("opening");
      const outcome = await openHostedCheckout(answer);
      if (outcome !== "opened") setHandoff("idle");
    },
  });

  const answer = order.data ?? options.data;

  /*
    PAYING THE OPERATOR IN CASH ON THE DAY (yuvoy-app#29).

    Read by PRESENCE off either answer. `payAtCounter` arrives on the
    `coming_soon` answer AND on `ready`, and production returns `ready`, so
    gating this on `state` would hide it exactly where it is live. See
    `readPayAtCounter`.
  */
  const cashOffer = readPayAtCounter(answer);
  const card = answer?.state === "ready" && hasPaymentAdapter(answer.provider);

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
      `201` the first time, `200` if it was already confirmed: the second tap
      on ferry wifi. Same booking, so both land here and are rendered
      identically.
    */
    onSuccess: () => onBooked?.(),
  });

  const booked = cash.data;
  const busy = order.isPending || handoff === "opening";
  // The question asked on arrival failed: no answer, so no way to pay shown.
  const unanswered = options.isError;
  const refusal = unanswered ? options.error : order.error;
  const error = refusal ?? cash.error;
  const failure = error ? describeError(error) : null;

  /*
    A checkout that cannot be finished, and the way out of it.

    `operator_not_bookable` (yuvoy-app#19 §3): the operator's standing is
    re-checked when a traveller re-enters checkout, which closes the window
    where somebody could hold seats, the operator be switched off, and the
    traveller pay anyway. `reservation_not_payable` is the same shape and much
    commoner: a hold that lapsed while somebody found their card. The dates are
    one link away and `BookingStatus.experience.slug` is required by the
    contract, so the screen simply offers it.
  */
  const deadEnd =
    refusal instanceof YuvoyError && isCheckoutDeadEnd(refusal.code);

  /*
    Somebody has just committed. This is the one screen in the product where
    the absence is NOT the design: here it should feel like something happened.
  */
  if (booked && isBooked(booked)) {
    return <CashBooked booking={booked} status={status} />;
  }

  if (options.isPending) {
    return (
      <div className="mt-6">
        <LoadingState label="Checking how you can pay">
          <Skeleton className="h-13 w-full rounded-full" />
          <Skeleton className="mx-auto mt-2 h-3 w-2/3 rounded-full" />
        </LoadingState>
      </div>
    );
  }

  return (
    <div className="mt-6">
      {cashOffer ? (
        <div>
          <Button
            size="lg"
            block
            disabled={cash.isPending || busy}
            onClick={() => cash.mutate()}
            /*
              Two lines when it needs them. On one line, in the button's
              tracked caps, "Book now, pay ₹12,000 cash on the day" ran to the
              pill's ends on a phone (cited in the before page).
            */
            className="h-auto min-h-13 py-3.5 leading-snug text-balance whitespace-normal"
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

      {card ? (
        <Button
          size="lg"
          block
          variant={cashOffer ? "outline" : "primary"}
          disabled={busy || cash.isPending}
          onClick={() => order.mutate()}
          className={cn(cashOffer && "mt-4")}
        >
          {busy ? "Opening…" : `Pay ${formatTotal(status.price)} now`}
        </Button>
      ) : null}

      {/* Paying online, not open: said, never offered as a button. */}
      {answer && !card ? (
        cashOffer ? (
          <p className="text-forest/70 mt-4 text-center text-xs">
            {answer.state === "coming_soon"
              ? answer.message
              : "Paying by card or UPI is not open in this version of the app yet."}
          </p>
        ) : answer.state === "coming_soon" ? (
          <Panel role="status">
            <p className="text-sm font-bold">Payment is not open yet</p>
            <p className="text-forest/70 mt-1.5 text-sm">{answer.message}</p>
            <p className="text-forest/70 mt-2 text-xs">
              Nothing has been charged.
              {answer.holdStillActive === false
                ? ""
                : " Your seats stay held while the clock above runs."}
            </p>
          </Panel>
        ) : (
          <Panel role="status">
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
        )
      ) : null}

      {answer?.state === "ready" && handoff === "opening" ? (
        <p role="status" className="text-forest/70 mt-4 text-sm">
          Opening payment with {answer.provider}…
        </p>
      ) : null}

      {failure ? (
        <FailurePanel failure={failure} className={cn(answer && "mt-4")}>
          {deadEnd ? (
            <ButtonLink
              href={`/e/${status.experience.slug}`}
              variant="outline"
              size="sm"
              className="mt-4"
            >
              See other dates
            </ButtonLink>
          ) : unanswered ? (
            <Button
              variant="outline"
              size="sm"
              className="mt-4"
              onClick={() => void options.refetch()}
            >
              Try again
            </Button>
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
