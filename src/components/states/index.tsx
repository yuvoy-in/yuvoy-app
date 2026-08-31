"use client";

import type { ReactNode } from "react";
import { cn } from "@/lib/cn";
import { YuvoyError, NetworkError } from "@/lib/api/errors";

/**
 * The seven states, as composable shells.
 *
 *   loading · empty · partial · error+retry · offline · stale-refresh · success
 *
 * Every screen ships all seven. They live here so a screen DECLARES its states
 * rather than reimplementing them, and so a screen that renders `null` for one
 * of them is visible in review as a missing prop rather than as nothing.
 */

/* ---------------------------------------------------------------- loading */

/**
 * A skeleton, never a spinner.
 *
 * A spinner says "wait" and gives no information. A skeleton says "here is the
 * shape of what is coming", which on a 0.5–3 Mbps connection is the more
 * honest message and measurably reduces abandonment.
 */
export function Skeleton({ className }: { className?: string }) {
  return (
    <div
      className={cn("skeleton rounded-edge", className)}
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
  tone?: "cream" | "abyss";
}) {
  return (
    <div
      className={cn(
        "flex flex-col items-center justify-center px-6 py-16 text-center",
        tone === "abyss" ? "text-cream" : "text-forest",
      )}
    >
      <p className="font-display tracking-display text-2xl leading-tight">
        {title}
      </p>
      <p
        className={cn(
          "mt-3 max-w-sm text-sm",
          tone === "abyss" ? "text-cream/70" : "text-forest/70",
        )}
      >
        {body}
      </p>
      {action ? <div className="mt-6">{action}</div> : null}
    </div>
  );
}

/* ------------------------------------------------------------ error/retry */

/**
 * Turns any thrown value into copy a traveller can act on.
 *
 * Three rules encoded here, each from the brief:
 *   - Branch on `code`, never on `message`.
 *   - A 503 is often DELIBERATE. `booking_disabled` and `operator_not_bookable`
 *     mean somebody stopped sales on purpose — calm and true, not a crash.
 *   - Always show `requestId`. Small and grey is fine; it is the difference
 *     between finding the request in the logs and guessing.
 */
export function describeError(error: unknown): {
  title: string;
  body: string;
  requestId?: string;
  canRetry: boolean;
  deliberate: boolean;
} {
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
}: {
  error: unknown;
  onRetry?: () => void;
  tone?: "cream" | "abyss";
}) {
  const d = describeError(error);
  const dark = tone === "abyss";

  return (
    <div
      role="alert"
      className={cn(
        "flex flex-col items-center justify-center px-6 py-16 text-center",
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

      {d.canRetry && onRetry ? (
        <button
          type="button"
          onClick={onRetry}
          className={cn(
            "rounded-edge label mt-6 h-11 px-6 font-bold transition-transform",
            "active:scale-[0.98]",
            dark
              ? "bg-cream text-forest hover:-translate-y-px"
              : "bg-forest text-cream hover:-translate-y-px",
          )}
        >
          Try again
        </button>
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

/* ---------------------------------------------------------------- offline */

export function OfflineNotice({ className }: { className?: string }) {
  return (
    <div
      role="status"
      className={cn(
        "rounded-edge border-cream-line bg-cream-deep text-forest/75 border px-4 py-3 text-xs",
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
        "rounded-edge border-cream-line bg-cream-deep flex items-center gap-3 border px-4 py-3",
        className,
      )}
    >
      <span className="text-forest/75 text-xs">{children}</span>
      {onRefresh ? (
        <button
          type="button"
          onClick={onRefresh}
          className="label tap-target text-terra-deep ml-auto font-bold underline underline-offset-2"
        >
          Refresh
        </button>
      ) : null}
    </div>
  );
}
