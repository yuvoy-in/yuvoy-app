"use client";

import type { ReactNode } from "react";
import { cn } from "@/lib/cn";
import { Button, ButtonLink } from "@/components/ui/button";
import { Panel } from "@/components/ui/panel";
import {
  describeError,
  RECOVER_PATH,
  type DescribedError,
} from "./describe-error";

/**
 * The seven states, as composable shells.
 *
 *   loading · empty · partial · error+retry · offline · stale-refresh · success
 *
 * Every screen ships all seven. They live here so a screen DECLARES its states
 * rather than reimplementing them, and so a screen that renders `null` for one
 * of them is visible in review as a missing prop rather than as nothing.
 *
 * `tone` names the surface a state sits on: `paper` for a sheet, `dark` for
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
  tone = "paper",
}: {
  title: string;
  /** Left out for a state whose one line says it all (yuvoy-app#180's chip empty lines). */
  body?: string;
  action?: ReactNode;
  tone?: "paper" | "dark";
}) {
  return (
    <div
      className={cn(
        "flex flex-col items-center justify-center px-6 py-16 text-center",
        tone === "dark" ? "text-paper" : "text-forest",
      )}
    >
      <p className="font-display tracking-display leading-display text-2xl text-balance">
        {title}
      </p>
      {body ? (
        <p
          className={cn(
            "text-body mt-3 max-w-sm text-pretty",
            tone === "dark" ? "text-paper/70" : "text-forest/70",
          )}
        >
          {body}
        </p>
      ) : null}
      {action ? (
        <div className="mt-6 flex flex-wrap justify-center gap-3">{action}</div>
      ) : null}
    </div>
  );
}

/* ------------------------------------------------------------ error/retry */

export { describeError, RECOVER_PATH } from "./describe-error";
export type { DescribedError } from "./describe-error";

export function ErrorState({
  error,
  onRetry,
  retrying,
  tone = "paper",
  tokenBearing = false,
}: {
  error: unknown;
  onRetry?: () => void;
  /**
   * The retry is on its way, for a screen that can tell: Try again turns busy
   * rather than looking idle. Left out, the button is drawn as it always was.
   */
  retrying?: boolean;
  tone?: "paper" | "dark";
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
        dark ? "text-paper" : "text-forest",
      )}
    >
      <p className="font-display tracking-display leading-display text-2xl text-balance">
        {d.title}
      </p>
      <p
        className={cn(
          "mt-3 max-w-sm text-sm",
          dark ? "text-paper/70" : "text-forest/70",
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
          pending={retrying}
          pendingLabel={retrying === undefined ? undefined : "Trying again"}
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
            "mt-8 font-mono text-[10px]",
            dark ? "text-paper/60" : "text-forest/70",
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
        "rounded-card border-paper-line bg-paper-deep text-forest/75 border px-4 py-3 text-xs",
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
        "rounded-card border-paper-line bg-paper-deep flex items-center gap-3 border px-4 py-3",
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
