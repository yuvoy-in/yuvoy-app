"use client";

import { useEffect, useState, useSyncExternalStore } from "react";
import Link from "next/link";
import { useMutation } from "@tanstack/react-query";
import { createApiClient } from "@/lib/api/client";
import { useBookingStatus } from "@/lib/booking/use-booking-status";
import { useFragmentToken } from "@/lib/booking/use-fragment-token";
import { formatMoney } from "@/lib/format/money";
import { formatCountdown, msUntil, formatAge } from "@/lib/format/time";
import {
  describeError,
  ErrorState,
  LoadingState,
  Skeleton,
} from "@/components/states";
import { CancelSheet } from "./cancel-sheet";
import { ShareButton } from "./share-button";
import { ReviewForm } from "./review-form";
import { cn } from "@/lib/cn";
import type { components } from "@/lib/api/schema.gen";

type BookingStatus = components["schemas"]["BookingStatus"];

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
          and from the message we sent. It is the only way in — we cannot look
          it up from a name.
        </p>
        <Link
          href="/trips"
          className="rounded-edge label bg-forest text-cream mt-6 inline-flex h-11 items-center px-5 font-bold"
        >
          Bookings on this device
        </Link>
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
          className="rounded-edge border-cream-line bg-cream-deep mb-6 border px-4 py-3 text-xs"
        >
          You are offline. This is what we saved on your device, last checked{" "}
          {formatAge(snapshot.fetchedAt)}.
        </div>
        <StatusBody status={snapshot.status} live={false} />
      </Shell>
    );
  }

  if (isError) {
    return (
      <Shell>
        <ErrorState error={error} onRetry={() => void refetch()} />
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
  const copy = STATE_COPY[status.state];
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

  return (
    <div>
      <p className="eyebrow text-terra-deep">{copy.eyebrow}</p>
      <h1 className="font-display tracking-display mt-3 text-3xl leading-tight sm:text-4xl">
        {copy.title}
      </h1>
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

      {status.state === "holding" ? <PayButton status={status} /> : null}

      {/* Everything needed for the day, on the page. Not in a message that
          may never arrive. */}
      <dl className="border-cream-line mt-8 space-y-4 border-t pt-6 text-sm">
        {status.bookingReference ? (
          <Row label="Reference">
            <span className="font-mono text-base font-bold tracking-wider">
              {status.bookingReference}
            </span>
            <p className="text-forest/60 mt-1 text-xs">
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
        <Row label="Guests">{status.guests}</Row>
        <Row label="Paid">{formatTotal(status.price)}</Row>
      </dl>

      {status.refund ? <RefundProgress refund={status.refund} /> : null}

      {/* Actions need the network, so they are absent on an offline snapshot. */}
      {token && upcoming ? <ShareButton token={token} /> : null}

      {token && upcoming && !cancelling ? (
        <button
          type="button"
          onClick={() => setCancelling(true)}
          className="label text-forest/60 tap-target hover:text-forest mt-4 underline underline-offset-2"
        >
          I need to cancel
        </button>
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
        <p className="text-forest/50 mt-6 text-xs" role="status">
          This page updates itself. You can leave it open.
        </p>
      ) : null}

      <p className="text-forest/60 border-cream-line mt-8 border-t pt-6 text-xs">
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
  BookingStatus["state"],
  { eyebrow: string; title: string; body: string }
> = {
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
    title: "We are checking with your bank",
    body: "If money left your account it is safe. This usually settles in a minute or two, and this page will update itself when it does.",
  },
  confirmed: {
    eyebrow: "Confirmed",
    title: "You are going",
    body: "Everything you need is on this page. Save the link — it works from any device, and you do not need an account or a password.",
  },
  declined: {
    eyebrow: "Refunded",
    title: "We could not get you the seat",
    body: "Money was taken and the seat could not be delivered, so a full refund is already on its way. You do not need to ask for it.",
  },
  cancelled: {
    eyebrow: "Cancelled",
    title: "This trip was called off",
    body: "Your refund has already started. If the sea called it off, rebooking is a fresh booking rather than a silent move — the price you see will be the price you pay.",
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

/* ------------------------------------------------------------- fragments */

function HoldCountdown({ expiresAt }: { expiresAt: string }) {
  const [left, setLeft] = useState(() => msUntil(expiresAt));

  useEffect(() => {
    const t = setInterval(() => setLeft(msUntil(expiresAt)), 1000);
    return () => clearInterval(t);
  }, [expiresAt]);

  const urgent = left < 120_000;

  return (
    <div
      className={cn(
        "rounded-edge mt-6 border-l-2 p-4",
        urgent ? "border-terra-deep bg-cream-deep" : "border-cream-line",
      )}
      role="timer"
      aria-live="off"
    >
      <p className="label text-forest/75">Time left to pay</p>
      <p className="mt-1 font-mono text-2xl font-bold tabular-nums">
        {formatCountdown(left)}
      </p>
      {left === 0 ? (
        <p className="text-forest/70 mt-2 text-sm">
          The hold has run out. If you pay now it may still work, but the seat
          is no longer reserved — and if it has gone we refund you in full,
          automatically.
        </p>
      ) : null}
    </div>
  );
}

/**
 * T8 — opening checkout.
 *
 * Today this answers `503 payments_unavailable`, which is not a crash: no
 * processor has been chosen yet. The whole flow is built so that when one
 * lands only the hosted-checkout handoff changes.
 */
function PayButton({ status }: { status: BookingStatus }) {
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
  });

  const failure = order.error ? describeError(order.error) : null;

  return (
    <div className="mt-6">
      <button
        type="button"
        onClick={() => order.mutate()}
        disabled={order.isPending}
        className="rounded-edge label bg-forest text-cream h-13 w-full font-bold transition-transform active:scale-[0.99] disabled:opacity-40"
      >
        {order.isPending ? "Opening…" : `Pay ${formatTotal(status.price)}`}
      </button>

      {failure ? (
        <div
          role="alert"
          className="rounded-edge border-terra-deep mt-4 border-l-2 p-4"
        >
          <p className="text-sm font-bold">{failure.title}</p>
          <p className="text-forest/70 mt-1.5 text-sm">{failure.body}</p>
          {failure.requestId ? (
            <p className="text-forest/40 mt-3 font-mono text-[10px]">
              {failure.requestId}
            </p>
          ) : null}
        </div>
      ) : null}
    </div>
  );
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
    <div className="rounded-edge border-cream-line bg-cream-deep mt-8 border p-5">
      <p className="label text-forest/75">Your refund</p>

      {failed ? (
        /* A failed refund tells the truth and promises a human, rather than
           hiding behind a spinner. */
        <p className="text-forest/80 mt-2 text-sm">
          The refund did not go through. That is ours to fix, not yours to chase
          — someone is on it and will message you.
        </p>
      ) : (
        <ol className="mt-3 space-y-2">
          {STEPS.map((step, i) => (
            <li key={step} className="flex items-center gap-3 text-sm">
              <span
                aria-hidden="true"
                className={cn(
                  "size-1.5 shrink-0",
                  i <= at ? "bg-terra-deep" : "bg-forest/20",
                )}
              />
              <span className={i <= at ? "text-forest" : "text-forest/50"}>
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
        <p className="text-forest/60 mt-3 text-xs">
          {formatMoney({ amountMinor: refund.amountPaise, currency: "INR" })}.
          Banks usually take 5 to 7 working days.
        </p>
      ) : null}
    </div>
  );
}

/** The ceiling. Stop, and put a person in front of them. */
function HandOver({ status }: { status: BookingStatus }) {
  return (
    <div
      role="alert"
      className="rounded-edge border-terra-deep mt-8 border-l-2 p-4"
    >
      <p className="text-sm font-bold">This is taking longer than it should</p>
      <p className="text-forest/70 mt-1.5 text-sm">
        We have stopped checking automatically. Nothing is lost — your booking
        reference is{" "}
        <span className="font-mono font-bold">
          {status.bookingReference ?? status.reservationId}
        </span>
        . Send us that on WhatsApp and someone will sort it out.
      </p>
    </div>
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
    <div className="flex flex-wrap justify-between gap-x-6 gap-y-1">
      <dt className="label text-forest/75">{label}</dt>
      <dd className="text-right">{children}</dd>
    </div>
  );
}

function Loading() {
  return (
    <LoadingState label="Loading your booking">
      <div className="space-y-4">
        <Skeleton className="h-8 w-2/3" />
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
    <div className="bg-cream text-forest min-h-full">
      <div className="container-page max-w-xl py-8">{children}</div>
    </div>
  );
}
