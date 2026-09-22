"use client";

import { useState } from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { useSupportRequest } from "@/lib/support/use-support-requests";
import {
  describeLookupFailure,
  isBeingHandled,
  requestDay,
  supportStatusWords,
} from "@/lib/support/requests";
import { Button } from "@/components/ui/button";
import { Chip } from "@/components/ui/chip";

/**
 * A reference, and where that request is now (yuvoy-api#196).
 *
 * ## Why it asks only when asked
 *
 * Straight after sending, the answer is always "received", so a read on
 * mount would spend a round trip on island signal to say what the send
 * already said. The traveller taps, and the tap is the question.
 *
 * ## What it never says
 *
 * That a reply will appear here. None will: the API stores the traveller's
 * own message and no staff replies, because the conversation happens on
 * WhatsApp. The caller keeps that sentence on screen beside this, and this
 * says only where the request is and when it last moved.
 *
 * ## Which credential asks
 *
 * `token` is a booking's status token, the one the booking page already sends
 * with, and it can open only requests raised about that booking. Without it
 * the check goes through this app's proxy on the session. That is also why a
 * failure is described per credential: see `describeLookupFailure`.
 */
export function RequestStatus({
  reference,
  token,
  showReference = true,
  className,
}: {
  reference: string;
  token?: string | null;
  /**
   * `false` where the caller already shows the reference, inside the live
   * region that announces the receipt: a screen reader should hear it as part
   * of "we have your message", and hear it once.
   */
  showReference?: boolean;
  className?: string;
}) {
  const [asked, setAsked] = useState(false);
  const request = useSupportRequest(reference, { token, enabled: asked });
  const pathname = usePathname() ?? "/help";

  const words = supportStatusWords(request.data?.status);
  const changed = requestDay(request.data?.updatedAt);
  const failure = request.isError
    ? describeLookupFailure(request.error, token ? "token" : "session")
    : null;
  const canAsk = !failure || failure.canRetry;

  return (
    <div className={className}>
      {showReference ? (
        <p className="font-mono text-sm tracking-wider">
          Reference {reference}
        </p>
      ) : null}

      {/*
        Polite, so the answer to a tap is read out without anybody having to
        go looking for it, and without interrupting what they were doing.
      */}
      <div aria-live="polite">
        {request.data ? (
          <p className="mt-2 flex flex-wrap items-center gap-2 text-sm">
            {words ? (
              <Chip
                size="sm"
                tone={
                  isBeingHandled(request.data.status) ? "accent" : "neutral"
                }
              >
                {words}
              </Chip>
            ) : null}
            {changed ? (
              <span className="text-forest/70">Last change {changed}</span>
            ) : null}
          </p>
        ) : null}

        {failure ? (
          <p className="text-terra-deep mt-2 text-sm">
            {failure.body}
            {failure.signIn ? (
              <>
                {" "}
                <Link
                  href={`/account?next=${encodeURIComponent(pathname)}`}
                  className="tap-target font-bold underline underline-offset-4"
                >
                  Sign in
                </Link>
              </>
            ) : null}
          </p>
        ) : null}
      </div>

      {canAsk ? (
        <Button
          variant="outline"
          size="sm"
          className="mt-3"
          disabled={request.isFetching}
          onClick={() => {
            if (asked) void request.refetch();
            else setAsked(true);
          }}
        >
          {request.isFetching
            ? "Checking…"
            : request.data
              ? "Check again"
              : "Check its status"}
        </Button>
      ) : null}
    </div>
  );
}
