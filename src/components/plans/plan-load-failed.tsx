"use client";

import { useTransition } from "react";
import { useRouter } from "next/navigation";
import { YuvoyError } from "@/lib/api/errors";
import { planWords } from "@/lib/plans/words";
import { ErrorState } from "@/components/states";
import { Button } from "@/components/ui/button";

/**
 * The signed-in plan page when the server's read did not bring a plan back
 * (yuvoy-app#193).
 *
 * Paused (`503 plans_unavailable`) says so in the plan's own words: it is a
 * switch somebody at Yuvoy turned, not a fault, and "Something went wrong"
 * would be untrue. Anything else is the app's usual error state, with the
 * request id so a report can be found in the logs.
 *
 * Try again re-renders the page on the server (`router.refresh`), which reads
 * the plan again with the session: the read lives there, so this repeats it
 * rather than keeping a second copy of it in the browser.
 */
export function PlanLoadFailed({
  paused,
  status,
  requestId,
}: {
  paused: boolean;
  status?: number;
  requestId?: string;
}) {
  const router = useRouter();
  const [retrying, startRetry] = useTransition();
  const retry = () => startRetry(() => router.refresh());

  if (paused) {
    return (
      <div role="alert" className="py-16 text-center">
        <p className="font-display tracking-display leading-display text-2xl text-balance">
          {planWords.paused}
        </p>
        <p className="text-forest/70 mt-3 text-sm">{planWords.pausedNext}</p>
        <Button
          className="mt-6"
          pending={retrying}
          pendingLabel="Trying again"
          onClick={retry}
        >
          Try again
        </Button>
      </div>
    );
  }

  const error = new YuvoyError({
    code: "internal_error",
    message: "The plan did not load.",
    status: status ?? 502,
    requestId,
  });
  return <ErrorState error={error} onRetry={retry} retrying={retrying} />;
}
