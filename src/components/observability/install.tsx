"use client";

import { useEffect } from "react";
import {
  installReporter,
  consoleReporter,
  captureError,
} from "@/lib/observability/report";
import { observeResponses } from "@/lib/api/client";

/**
 * Installs the reporter and the global error hooks.
 *
 * There is deliberately no Sentry SDK in the bundle yet. The seam, the
 * scrubbing and the tests are all here, so adding it is one adapter file the
 * day a DSN exists — but shipping ~100 KB of SDK that no-ops without one, over
 * a 0.5 Mbps connection, would be paying the cost with none of the benefit.
 *
 * What IS wired now: every unhandled error and rejection is captured, and the
 * requestId of every failing API response is tagged, so a report can be matched
 * to a line in the backend's logs.
 */
export function InstallObservability() {
  useEffect(() => {
    installReporter(consoleReporter);

    // Tag failures with the requestId from the error envelope — it is the
    // difference between finding the exact request and guessing.
    const stopObserving = observeResponses(({ requestId, status, path }) => {
      if (status >= 500) {
        captureError(new Error(`API ${status} ${path}`), {
          scope: "api",
          requestId,
        });
      }
    });

    const onError = (event: ErrorEvent) => {
      captureError(event.error ?? event.message, { scope: "window" });
    };
    const onRejection = (event: PromiseRejectionEvent) => {
      captureError(event.reason, { scope: "unhandled-rejection" });
    };

    window.addEventListener("error", onError);
    window.addEventListener("unhandledrejection", onRejection);

    return () => {
      stopObserving();
      window.removeEventListener("error", onError);
      window.removeEventListener("unhandledrejection", onRejection);
    };
  }, []);

  return null;
}
