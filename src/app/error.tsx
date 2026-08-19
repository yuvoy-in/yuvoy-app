"use client";

import { useEffect } from "react";
import { ErrorState } from "@/components/states";

export default function AppError({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  useEffect(() => {
    // Sentry goes here once wired. Logged rather than swallowed either way.
    console.error(error);
  }, [error]);

  return (
    <div className="bg-abyss flex min-h-[60vh] items-center">
      <ErrorState error={error} onRetry={reset} tone="abyss" />
    </div>
  );
}
