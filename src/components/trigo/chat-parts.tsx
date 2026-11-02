"use client";

import { useSyncExternalStore } from "react";
import { Button, ButtonLink } from "@/components/ui/button";
import { nextParamFor } from "@/lib/site/next-path";
import type { TrigoFailure, TrigoMessage } from "@/lib/trigo/api";
import {
  CHIPS_ANDAMAN,
  CHIPS_GENERAL,
  CHIPS_LISTING,
  FAILURE_LINE,
  IN_PROGRESS_LINE,
  OFFLINE_LINE,
  SIGNED_OUT_LINE,
  TRY_AGAIN,
} from "@/lib/trigo/words";
import { CHAT_FAILED, SIGN_IN } from "./ui-words";

/** The small pieces of the Trigo sheet, kept apart so it reads as its states. */

/* ------------------------------------------------------------- helpers -- */

function subscribeOnline(onChange: () => void) {
  window.addEventListener("online", onChange);
  window.addEventListener("offline", onChange);
  return () => {
    window.removeEventListener("online", onChange);
    window.removeEventListener("offline", onChange);
  };
}

export function useOnline(): boolean {
  return useSyncExternalStore(
    subscribeOnline,
    () => navigator.onLine,
    () => true,
  );
}

/** Never the text: only how long it was, in a few wide bands. */
export function lengthBucket(n: number): string {
  if (n <= 20) return "1-20";
  if (n <= 100) return "21-100";
  if (n <= 300) return "101-300";
  return "301-1000";
}

export function latencyBucket(ms: number): string {
  if (ms < 2_000) return "0-2s";
  if (ms < 5_000) return "2-5s";
  if (ms < 10_000) return "5-10s";
  if (ms < 20_000) return "10-20s";
  return "20s+";
}

export function cardsIn(messages: TrigoMessage[]): number {
  return messages
    .filter((m) => m.role === "trigo")
    .reduce((n, m) => n + m.cards.length, 0);
}

/** The reply a timed-out turn left, where its Try again goes. */
export function lastReplySeq(messages: TrigoMessage[]): number | null {
  const replies = messages.filter((m) => m.role === "trigo");
  return replies.at(-1)?.seq ?? null;
}

export function chipsFor(
  aboutCardId: string | null,
  destinationKey: string | null,
) {
  if (aboutCardId?.startsWith("exp:")) return CHIPS_LISTING;
  if (destinationKey?.startsWith("andaman")) return CHIPS_ANDAMAN;
  return CHIPS_GENERAL;
}

/* ---------------------------------------------------------- the parts -- */

export function SignedOut() {
  // Back to this address after signing in, `?trigo=` included, so the sheet reopens.
  const next = nextParamFor(window.location.pathname, window.location.search);
  return (
    <div className="flex flex-col gap-4">
      <p className="text-forest text-body">{SIGNED_OUT_LINE}</p>
      <div>
        <ButtonLink href={`/account?next=${encodeURIComponent(next)}`}>
          {SIGN_IN}
        </ButtonLink>
      </div>
    </div>
  );
}

export function Failed({ onRetry }: { onRetry: () => void }) {
  return (
    <div role="alert" className="flex flex-col gap-3">
      <p className="text-forest text-body">{CHAT_FAILED}</p>
      <div>
        <Button variant="outline" size="sm" onClick={onRetry}>
          {TRY_AGAIN}
        </Button>
      </div>
    </div>
  );
}

/** The one line under the chat that says why a message did not go. */
export function StatusLine({
  failure,
  online,
  busy,
  onRetry,
}: {
  failure: TrigoFailure | null;
  online: boolean;
  busy: boolean;
  onRetry: () => void;
}) {
  if (!online || failure?.kind === "offline") {
    return (
      <p role="status" className="text-forest text-body">
        {OFFLINE_LINE}
      </p>
    );
  }
  if (!failure || busy) return null;

  switch (failure.kind) {
    case "failure":
    case "busy":
      return (
        <div role="alert" className="flex flex-col gap-2">
          <p className="text-forest text-body">
            {failure.kind === "busy" ? failure.message : FAILURE_LINE}
          </p>
          <div>
            <Button variant="outline" size="sm" onClick={onRetry}>
              {TRY_AGAIN}
            </Button>
          </div>
        </div>
      );
    case "rate_limited":
      return (
        <p role="alert" className="text-forest text-body">
          {failure.message}
        </p>
      );
    case "in_progress":
    case "idempotency_in_progress":
      return (
        <p role="status" className="text-forest text-body">
          {IN_PROGRESS_LINE}
        </p>
      );
    default:
      return null;
  }
}
