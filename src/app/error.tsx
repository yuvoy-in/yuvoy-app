"use client";

import { useEffect } from "react";
import { ErrorState } from "@/components/states";
import { Screen } from "@/components/chrome/screen";
import { captureError } from "@/lib/observability/report";

export default function AppError({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  useEffect(() => {
    // Through the seam, so the URL is scrubbed before anything sees it.
    captureError(error, { scope: "route-boundary", digest: error.digest });
  }, [error]);

  return (
    <Screen>
      <ErrorState error={error} onRetry={reset} />
    </Screen>
  );
}
