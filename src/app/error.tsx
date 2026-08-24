"use client";

import { useEffect } from "react";
import { ErrorState } from "@/components/states";
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
    <div className="bg-abyss flex min-h-[60vh] items-center">
      <ErrorState error={error} onRetry={reset} tone="abyss" />
    </div>
  );
}
