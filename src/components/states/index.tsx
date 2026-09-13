"use client";

import type { ReactNode } from "react";
import { cn } from "@/lib/cn";
import { YuvoyError, NetworkError } from "@/lib/api/errors";
import { Button, ButtonLink } from "@/components/ui/button";
import { Panel } from "@/components/ui/panel";

/**
 * The seven states, as composable shells.
 *
 *   loading · empty · partial · error+retry · offline · stale-refresh · success
 *
 * Every screen ships all seven. They live here so a screen DECLARES its states
 * rather than reimplementing them, and so a screen that renders `null` for one
 * of them is visible in review as a missing prop rather than as nothing.
 *
 * `tone` names the surface a state sits on: `cream` for a sheet, `dark` for
 * the stage or the media ground. The floors are the measured ones from §1.
 */

/* ---------------------------------------------------------------- loading */

/**
 * A skeleton, never a spinner.
 *
 * A spinner says "wait" and gives no information. A skeleton says "here is the
 * shape of what is coming", which on a 0.5–3 Mbps connection is the more
 * honest message and measurably reduces abandonment. It takes the card
 * radius by default, since a card is what it usually stands in for.
 */
export function Skeleton({ className }: { className?: string }) {
  return (
    <div
      className={cn("skeleton rounded-card", className)}
      aria-hidden="true"
    />
  );
}

export function LoadingState({
  label = "Loading",
  children,
}: {
  label?: string;
  children: ReactNode;
}) {
  return (
    <div role="status" aria-busy="true" aria-label={label}>
      <span className="sr-only">{label}</span>
      {children}
    </div>
  );
}

/* ------------------------------------------------------------------ empty */

export function EmptyState({
  title,
  body,
  action,
  tone = "cream",
}: {
  title: string;
  body: string;
  action?: ReactNode;
  tone?: "cream" | "dark";
}) {
  return (
    <div
      className={cn(
        "flex flex-col items-center justify-center px-6 py-16 text-center",
        tone === "dark" ? "text-cream" : "text-forest",
      )}
    >
      <p className="font-display tracking-display text-2xl leading-tight">
        {title}
      </p>
      <p
        className={cn(
          "mt-3 max-w-sm text-sm",
          tone === "dark" ? "text-cream/70" : "text-forest/70",
        )}
      >
        {body}
      </p>
      {action ? (
        <div className="mt-6 flex flex-wrap justify-center gap-3">{action}</div>
      ) : null}
    </div>
  );
}

/* ------------------------------------------------------------ error/retry */

/** Where a traveller goes when the link they hold no longer opens anything. */
export const RECOVER_PATH = "/trips/recover";

export interface DescribedError {
  title: string;
  body: string;
  requestId?: string;
  canRetry: boolean;
  deliberate: boolean;
  /**
   * The token this request carried is dead — expired, or replaced by a newer
   * link. The only way forward is a fresh link to the number that booked, so
   * the screen offers that instead of a retry that can never succeed.
   */
  recover?: boolean;
}

/**
 * Turns any thrown value into copy a traveller can act on.
 *
 * Three rules encoded here, each from the brief:
 *   - Branch on `code`, never on `message`.
 *   - A 503 is often DELIBERATE. `booking_disabled` and `operator_not_bookable`
 *     mean somebody stopped sales on purpose — calm and true, not a crash.
 *   - Always show `requestId`. Small and grey is fine; it is the difference
 *     between finding the request in the logs and guessing.
 *
 * `tokenBearing` says the request was authenticated by a status token. It
 * changes what a 401 means: on a token-bearing call it is the link dying
 * (the contract answers `token_expired` for a link past its life, and the
 * generic `unauthorized` for one it does not know — a revoked one, on
 * purpose, looks identical), and the way forward is recovery. On the
 * recovery flow itself a 401 is a wrong code, and the way forward is another
 * code. Same status, opposite next steps; the screen has to say which.
 */
export function describeError(
  error: unknown,
  context: { tokenBearing?: boolean } = {},
): DescribedError {
  if (error instanceof NetworkError) {
    return {
      title: "No connection",
      body: "We could not reach Yuvoy. This is usually the island signal rather than you.",
      canRetry: true,
      deliberate: false,
    };
  }

  if (error instanceof YuvoyError) {
    const base = {
      requestId: error.requestId,
      deliberate: error.isDeliberateStop,
    };
    switch (error.code) {
      case "token_expired":
        return {
          ...base,
          title: "This link has expired",
          body: "Booking links stop working after a while, and a newer link replaces an older one. We can send a fresh one to the number you booked with. Nothing about the booking itself has changed.",
          canRetry: false,
          recover: true,
        };
      case "unauthorized":
        if (context.tokenBearing) {
          return {
            ...base,
            title: "This link no longer opens anything",
            body: "It may have expired, or a newer link may have replaced it. We can send a fresh one to the number you booked with.",
            canRetry: false,
            recover: true,
          };
        }
        return {
          ...base,
          title: "That code did not work",
          body: "It may be wrong, expired, or already used. Ask for a new one. We answer the same way whatever was wrong with it.",
          canRetry: false,
        };
      /*
        RETIRED, and kept only as a fallback — yuvoy-app#32, yuvoy-api#170.

        The API takes every request now, at any hour and however many are
        already waiting on a departure; `request_window_closed` and
        `request_quota_exhausted` "are no longer returned (since 2026-09-13)".
        They stay in the `Error.code` enum on purpose, so exhaustive handling
        in a deployed client still type-checks.

        The panel that rendered this on the listing is gone. These two entries
        are not: a pinned contract says what the API WILL send, and this map is
        the last thing between an unknown code and a traveller reading a raw
        token. The copy is trimmed to what is still true — nothing was sent,
        and nothing is held — with the "not at this hour" reasoning removed,
        because it is no longer the reason and would be a false explanation.
      */
      case "request_window_closed":
        return {
          ...base,
          title: "That request did not go through",
          body: "Nothing was sent and no seats are held. Try again, or pick another departure.",
          canRetry: true,
        };
      case "cutoff_passed":
        return {
          ...base,
          title: "Booking has closed for this departure",
          body: "It is too close to the departure to take a new booking. Nothing was sent. Another day is still open.",
          canRetry: false,
        };
      case "reservation_not_payable":
        return {
          ...base,
          title: "This one cannot be paid for any more",
          body: "The hold has ended, or the request was not accepted. Nothing was charged. Pick a departure again to start over.",
          canRetry: false,
        };
      // Retired with `request_window_closed` above, and kept for the same
      // reason: a code the API no longer sends is still a code it declares.
      case "request_quota_exhausted":
        return {
          ...base,
          title: "That request did not go through",
          body: "Nothing was sent and no seats are held. Try again, or pick another departure.",
          canRetry: true,
        };
      case "grant_ceiling_exceeded":
        return {
          ...base,
          title: "Those seats are no longer there",
          body: "The operator could not grant that many just now. Nothing was charged. Check the dates again, the count has moved.",
          canRetry: false,
        };
      case "idempotency_in_progress":
        return {
          ...base,
          title: "Still working on your last tap",
          body: "Your previous attempt is still being processed. Give it a moment. It finishes on its own, and trying again continues the same booking rather than starting a second one.",
          canRetry: true,
        };
      case "booking_disabled":
        return {
          ...base,
          title: "Booking is paused",
          body: "We have stopped taking new bookings for a moment while we check something. You can still look around, and it will be back shortly.",
          canRetry: false,
        };
      case "operator_not_bookable":
        return {
          ...base,
          title: "This operator is paused",
          body: "We pause an operator while we re-check a licence or a safety item. Everything else is still bookable.",
          canRetry: false,
        };
      case "payload_too_large":
        /*
          413 from the 64K body limit. `canRetry: false` is the load-bearing
          part: an identical body fails identically, so offering the button
          would be a loop that costs island signal and reaches nothing.
        */
        return {
          ...base,
          title: "That was too much to send",
          body: "Something in what you sent is larger than we can accept. Trying again with the same thing will not work. Shorten it, or send us a message and we will help.",
          canRetry: false,
        };
      case "payments_unavailable":
        return {
          ...base,
          title: "Payment is not available yet",
          body: "We cannot take a payment right now. Nothing has been charged and no seat has been held.",
          canRetry: false,
        };
      case "media_unavailable":
        return {
          ...base,
          title: "Video is unavailable",
          body: "The clips are not loading. Everything else on the page still works.",
          canRetry: true,
        };
      case "stale_availability":
        return {
          ...base,
          title: "We cannot confirm seats",
          body: "Nobody has checked this departure with the operator recently enough for us to sell against it. Try another day, or ask us.",
          canRetry: true,
        };
      case "rate_limited":
        return {
          ...base,
          title: "One moment",
          body: "That was a lot of requests at once. Give it a few seconds.",
          canRetry: true,
        };
      case "not_found":
        return {
          ...base,
          title: "Not found",
          body: "This is not something we have, or it is no longer listed.",
          canRetry: false,
        };
      default:
        return {
          ...base,
          title: "Something went wrong",
          body: "That did not work. It is us, not you, and trying again often fixes it.",
          canRetry: true,
        };
    }
  }

  return {
    title: "Something went wrong",
    body: "That did not work. Trying again often fixes it.",
    canRetry: true,
    deliberate: false,
  };
}

export function ErrorState({
  error,
  onRetry,
  tone = "cream",
  tokenBearing = false,
}: {
  error: unknown;
  onRetry?: () => void;
  tone?: "cream" | "dark";
  /** The failed request carried a status token, so a 401 is a dead link. */
  tokenBearing?: boolean;
}) {
  const d = describeError(error, { tokenBearing });
  const dark = tone === "dark";

  return (
    <div
      role="alert"
      className={cn(
        "flex w-full flex-col items-center justify-center px-6 py-16 text-center",
        dark ? "text-cream" : "text-forest",
      )}
    >
      <p className="font-display tracking-display text-2xl leading-tight">
        {d.title}
      </p>
      <p
        className={cn(
          "mt-3 max-w-sm text-sm",
          dark ? "text-cream/70" : "text-forest/70",
        )}
      >
        {d.body}
      </p>

      {d.recover ? (
        <ButtonLink
          href={RECOVER_PATH}
          variant={dark ? "paper" : "primary"}
          className="mt-6"
        >
          Get a new link
        </ButtonLink>
      ) : d.canRetry && onRetry ? (
        <Button
          onClick={onRetry}
          variant={dark ? "paper" : "primary"}
          className="mt-6"
        >
          Try again
        </Button>
      ) : null}

      {/* Small and grey, always present. Not decoration. */}
      {d.requestId ? (
        <p
          className={cn(
            "mt-8 font-mono text-[10px] tracking-wider",
            dark ? "text-cream/60" : "text-forest/70",
          )}
        >
          {d.requestId}
        </p>
      ) : null}
    </div>
  );
}

/**
 * The inline failure, for a screen that stays on screen.
 *
 * `ErrorState` replaces a whole view; this sits under the button that failed.
 * One component rather than the six hand-rolled copies it replaced, because
 * the recovery link for a dead token has to appear beside every token-bearing
 * action — cancel, share, review, the account list — and a panel written by
 * hand six times is one that forgets it in the seventh.
 *
 * `children` is for the one extra affordance a failure can carry, such as
 * "Book N instead" on `capacity_unavailable`.
 */
export function FailurePanel({
  failure,
  children,
  className,
}: {
  failure: DescribedError;
  children?: ReactNode;
  className?: string;
}) {
  return (
    <Panel tone="alert" role="alert" className={className}>
      <p className="flex items-center gap-2.5 text-sm font-bold">
        <span
          aria-hidden="true"
          className="bg-terra-deep size-1.5 shrink-0 rounded-full"
        />
        {failure.title}
      </p>
      <p className="text-forest/70 mt-1.5 text-sm">{failure.body}</p>
      {children}
      {failure.recover ? (
        <ButtonLink
          href={RECOVER_PATH}
          variant="outline"
          size="sm"
          className="mt-4"
        >
          Get a new link
        </ButtonLink>
      ) : null}
      {/* Small and grey, always present. Not decoration. */}
      {failure.requestId ? (
        <p className="text-forest/70 mt-3 font-mono text-[10px]">
          {failure.requestId}
        </p>
      ) : null}
    </Panel>
  );
}

/* ---------------------------------------------------------------- offline */

export function OfflineNotice({ className }: { className?: string }) {
  return (
    <div
      role="status"
      className={cn(
        "rounded-card border-cream-line bg-cream-deep text-forest/75 border px-4 py-3 text-xs",
        className,
      )}
    >
      You are offline. This is what we saved on your device.
    </div>
  );
}

/* --------------------------------------------------------- stale-refresh */

/**
 * Shown when data on screen is known to be behind. Deliberately quiet: it must
 * not look like an error, because the content is still usable.
 */
export function StaleNotice({
  children,
  onRefresh,
  className,
}: {
  children: ReactNode;
  onRefresh?: () => void;
  className?: string;
}) {
  return (
    <div
      role="status"
      className={cn(
        "rounded-card border-cream-line bg-cream-deep flex items-center gap-3 border px-4 py-3",
        className,
      )}
    >
      <span className="text-forest/75 text-xs">{children}</span>
      {onRefresh ? (
        <Button
          variant="outline"
          size="sm"
          onClick={onRefresh}
          className="ml-auto"
        >
          Refresh
        </Button>
      ) : null}
    </div>
  );
}
