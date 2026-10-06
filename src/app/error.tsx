"use client";

import { useEffect, useState, useTransition } from "react";
import { ErrorState } from "@/components/states";
import { Screen } from "@/components/chrome/screen";
import { NetworkError } from "@/lib/api/errors";
import { captureError } from "@/lib/observability/report";

export default function AppError({
  error,
  retry,
}: {
  error: Error & { digest?: string };
  retry: () => void;
}) {
  useEffect(() => {
    // Through the seam, so the URL is scrubbed before anything sees it.
    captureError(error, { scope: "route-boundary", digest: error.digest });
  }, [error]);

  /*
    Try again asks the server again (`retry`, Next 16.3). It called `reset`,
    which draws the segment again from what is already here, so an error the
    server rendered came straight back on every tap (stability audit,
    6 Oct 2026).

    Never with no signal. A re-fetch that cannot reach the server makes Next
    load the whole page instead, and the service worker answers that with the
    offline page, a dead end, in place of this one. So a tap with no signal
    says so, in the words a failed read already uses, and asks again once,
    the moment the signal is back, as a paused query does.

    The re-fetch runs in this screen's own transition, so Try again turns
    busy until the answer lands rather than looking as if the tap was lost.
  */
  const [retrying, startRetry] = useTransition();
  const [awaitingSignal, setAwaitingSignal] = useState(false);
  useEffect(() => {
    if (!awaitingSignal) return;
    const back = () => {
      setAwaitingSignal(false);
      startRetry(() => retry());
    };
    // Once: a second `online` can land before this screen has redrawn.
    window.addEventListener("online", back, { once: true });
    return () => window.removeEventListener("online", back);
  }, [awaitingSignal, retry]);

  return (
    <Screen>
      <ErrorState
        error={awaitingSignal ? new NetworkError() : error}
        onRetry={() =>
          navigator.onLine ? startRetry(() => retry()) : setAwaitingSignal(true)
        }
        retrying={retrying}
      />
    </Screen>
  );
}
