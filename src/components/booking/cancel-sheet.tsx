"use client";

import { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { createApiClient } from "@/lib/api/client";
import { formatMoney } from "@/lib/format/money";
import { describeError, FailurePanel, Skeleton } from "@/components/states";
import { YuvoyError, isDeadToken } from "@/lib/api/errors";
import { qk } from "@/lib/query/policy";
import { Button } from "@/components/ui/button";
import { IconButton } from "@/components/ui/icon-button";
import { CloseIcon } from "@/components/ui/icons";
import { Panel } from "@/components/ui/panel";
import type { paths } from "@/lib/api/schema.gen";

/**
 * Cancelling, in two steps that cannot be collapsed into one.
 *
 * The quote is authoritative and the commit ECHOES it back: `expectedRefundPaise`
 * must match what was quoted. If the amount moved in between — a weather tier
 * kicked in, the cutoff passed — the server answers `refund_quote_moved` and
 * we re-quote rather than cancelling for a number the traveller never saw.
 *
 * `selfService: false` means a partial refund OF MONEY PAID ONLINE, and that
 * is a person's decision. The button is HIDDEN for those tiers rather than
 * shown and then refused.
 *
 * The qualifier is the whole of yuvoy-app#48 §3, and it is not pedantry. A
 * partial tier with NOTHING to refund needs nobody and cancels from here
 * (D28), which is where a booking paid in cash lands: 24 to 48 hours ahead it
 * used to quote `selfService: false` and send the traveller to WhatsApp to
 * cancel a booking that owed nothing either way.
 */
type Quote =
  paths["/bookings/cancellation-quote"]["get"]["responses"][200]["content"]["application/json"];

/**
 * Nothing was paid online, so there is nothing that could come back.
 *
 * `capturedPaise === 0` and not `!capturedPaise`: the field is optional, and
 * ABSENT is "we were not told", which is a different thing from "zero". An
 * absent pair falls through to the generic sentence rather than asserting
 * either way.
 */
function nothingPaidOnline(quote: Quote): boolean {
  return quote.capturedPaise === 0;
}

/**
 * The sentence above the figure.
 *
 * Three cases, and the first is yuvoy-app#48 §2. With `capturedPaise` and
 * `refundPaise` both `0` the old equality test printed "You get everything
 * back." above ₹0 — true as arithmetic, and to somebody who paid the operator
 * in cash it reads as a promise of money that was never taken. Every cash tier
 * landed here, not only the 24-to-48-hour one that D28 newly made reachable.
 *
 * "Everything back" is also now gated on actually KNOWING both figures and on
 * the captured amount being above zero, so a quote that carries neither says
 * the neutral thing instead of the confident one.
 */
function describeRefund(quote: Quote): string {
  if (nothingPaidOnline(quote)) {
    return "Nothing was paid online for this booking, so there is nothing to refund.";
  }
  const { capturedPaise, refundPaise } = quote;
  if (
    capturedPaise != null &&
    refundPaise != null &&
    capturedPaise > 0 &&
    refundPaise === capturedPaise
  ) {
    return "You get everything back.";
  }
  return "This is what comes back to you, under the policy you agreed at checkout.";
}

export function CancelSheet({
  token,
  onDone,
  onClose,
}: {
  token: string;
  onDone: () => void;
  onClose: () => void;
}) {
  const qc = useQueryClient();
  const [confirming, setConfirming] = useState(false);

  const quote = useQuery({
    queryKey: ["quoteCancellation", token],
    queryFn: async ({ signal }) => {
      const client = createApiClient();
      const { data, error } = await client.GET("/bookings/cancellation-quote", {
        headers: { Authorization: `Bearer ${token}` },
        signal,
      });
      if (error) throw error;
      return data;
    },
    staleTime: 0,
    retry: false,
  });

  const commit = useMutation({
    retry: false,
    mutationFn: async (expectedRefundPaise: number) => {
      const client = createApiClient();
      const { data, error } = await client.POST("/bookings/cancellation", {
        headers: { Authorization: `Bearer ${token}` },
        body: { expectedRefundPaise },
      });
      if (error) throw error;
      return data;
    },
    onSuccess: async () => {
      await qc.invalidateQueries({ queryKey: qk.bookingStatus(token) });
      onDone();
    },
    onError: async (err) => {
      // The amount moved between quoting and committing. Re-quote and
      // re-show — never cancel for a figure the traveller never saw.
      if (err instanceof YuvoyError && err.code === "refund_quote_moved") {
        setConfirming(false);
        await quote.refetch();
      }
    },
  });

  // Both calls carry the status token, so a 401 is the link dying — and the
  // way forward is a fresh link, said as such rather than "try again".
  const failure = commit.error
    ? describeError(commit.error, { tokenBearing: true })
    : null;

  return (
    <Panel className="mt-8">
      <div className="flex items-start justify-between gap-3">
        <h2 className="pt-2 text-sm font-bold">Cancel this booking</h2>
        <IconButton label="Close" variant="onCream" size="sm" onClick={onClose}>
          <CloseIcon className="size-4" />
        </IconButton>
      </div>

      {quote.isPending ? (
        <Skeleton className="mt-4 h-16 w-full" />
      ) : quote.isError ? (
        isDeadToken(quote.error) ? (
          <FailurePanel
            failure={describeError(quote.error, { tokenBearing: true })}
            className="mt-3"
          />
        ) : (
          <p className="text-forest/70 mt-3 text-sm">
            We could not work out your refund just now. Try again in a moment,
            or message us and we will do it by hand.
          </p>
        )
      ) : !quote.data.cancellable ? (
        <p className="text-forest/70 mt-3 text-sm">
          {quote.data.reason ??
            "This booking cannot be cancelled from here any more."}
        </p>
      ) : !quote.data.selfService ? (
        /* Partial refunds route to a human. Showing a button that will be
           refused is worse than not showing one. */
        <div className="mt-3">
          <p className="text-forest/70 text-sm">
            {quote.data.note ??
              "This one needs a person to look at it. The refund is partial, and we would rather a human got that right."}
          </p>
          <p className="text-forest/70 mt-3 text-sm">
            Message us on WhatsApp and we will sort it today.
          </p>
        </div>
      ) : (
        <div className="mt-3">
          <p className="text-forest/70 text-sm">{describeRefund(quote.data)}</p>

          {/*
            NO FIGURE WHEN NOTHING WAS PAID ONLINE — yuvoy-app#48 §2.

            A large "₹0" under "there is nothing to refund" is the number
            answering a question nobody asked. The sentence is the whole
            answer for a cash booking, and printing the zero beside it reads
            as a loss rather than as a non-event.
          */}
          {nothingPaidOnline(quote.data) ? null : (
            <p className="mt-3 text-2xl font-bold">
              {formatMoney({
                amountMinor: quote.data.refundPaise ?? 0,
                currency: "INR",
              })}
            </p>
          )}
          {quote.data.capturedPaise != null &&
          quote.data.capturedPaise > 0 &&
          quote.data.refundPaise !== quote.data.capturedPaise ? (
            <p className="text-forest/70 mt-1 text-xs">
              of{" "}
              {formatMoney({
                amountMinor: quote.data.capturedPaise,
                currency: "INR",
              })}{" "}
              paid
              {quote.data.hoursBeforeStart != null
                ? ` · ${Math.round(quote.data.hoursBeforeStart)}h before departure`
                : ""}
            </p>
          ) : null}

          {/*
            THE NOTE, WHENEVER THERE IS ONE — yuvoy-app#48 §1.

            It used to render only in the `selfService: false` branch, on the
            reading that a note always meant "a person has to do this". D-032.3
            broke that: a departure the operator moved refunds in full, which
            IS self-service, and `note` is the only place the traveller learns
            why they are getting everything back. Dropping it left them reading
            "You get everything back." with no idea what happened to their trip.
          */}
          {quote.data.note ? (
            <p className="text-forest/70 mt-3 text-sm">{quote.data.note}</p>
          ) : null}

          {confirming ? (
            <div className="mt-5 flex flex-wrap gap-3">
              <Button
                disabled={commit.isPending}
                onClick={() => commit.mutate(quote.data.refundPaise ?? 0)}
                className="flex-1"
              >
                {commit.isPending ? "Cancelling…" : "Yes, cancel it"}
              </Button>
              <Button
                variant="outline"
                onClick={() => setConfirming(false)}
                className="flex-1"
              >
                Keep it
              </Button>
            </div>
          ) : (
            <Button
              variant="outline"
              block
              onClick={() => setConfirming(true)}
              className="mt-5"
            >
              Cancel this booking
            </Button>
          )}
        </div>
      )}

      {failure ? <FailurePanel failure={failure} className="mt-4" /> : null}
    </Panel>
  );
}
