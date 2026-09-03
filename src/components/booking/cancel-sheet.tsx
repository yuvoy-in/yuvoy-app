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

/**
 * Cancelling, in two steps that cannot be collapsed into one.
 *
 * The quote is authoritative and the commit ECHOES it back: `expectedRefundPaise`
 * must match what was quoted. If the amount moved in between — a weather tier
 * kicked in, the cutoff passed — the server answers `refund_quote_moved` and
 * we re-quote rather than cancelling for a number the traveller never saw.
 *
 * `selfService: false` means a partial refund, and a partial refund is a
 * person's decision. The button is HIDDEN for those tiers rather than shown
 * and then refused.
 */
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
              "This one needs a person to look at it — the refund is partial, and we would rather a human got that right."}
          </p>
          <p className="text-forest/70 mt-3 text-sm">
            Message us on WhatsApp and we will sort it today.
          </p>
        </div>
      ) : (
        <div className="mt-3">
          <p className="text-forest/70 text-sm">
            {quote.data.refundPaise === quote.data.capturedPaise
              ? "You get everything back."
              : "This is what comes back to you, under the policy you agreed at checkout."}
          </p>

          <p className="mt-3 text-2xl font-bold">
            {formatMoney({
              amountMinor: quote.data.refundPaise ?? 0,
              currency: "INR",
            })}
          </p>
          {quote.data.capturedPaise != null &&
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
