import type { Reporter } from "@/lib/observability/report";
import { scrubUrl } from "@/lib/booking/scrub";

/**
 * PostHog, as an adapter of the reporting seam.
 *
 * Deliberately not wired directly into components. Everything goes through
 * `captureEvent`, which scrubs the URL fragment before an adapter ever sees it
 * — and PostHog's `$current_url` is one of the two places the booking status
 * token would otherwise leak.
 *
 * Belt and braces: `sanitize_properties` scrubs again at the SDK boundary, so
 * autocapture and pageviews — which never pass through our seam — are covered
 * too.
 */
export async function createPostHogReporter(
  key: string,
  host: string,
): Promise<Reporter | null> {
  const { default: posthog } = await import("posthog-js");

  posthog.init(key, {
    api_host: host,
    // Manual: an autocaptured pageview on /booking would carry the fragment
    // before any of our code runs.
    capture_pageview: false,
    autocapture: false,
    persistence: "memory",
    sanitize_properties: (properties) => {
      const clean: Record<string, unknown> = { ...properties };
      for (const k of ["$current_url", "$referrer", "$pathname", "url"]) {
        if (typeof clean[k] === "string")
          clean[k] = scrubUrl(clean[k] as string);
      }
      return clean;
    },
  });

  return {
    captureError() {
      // Errors go to the error reporter, not to product analytics. Sending
      // them here would put a stack trace in a marketing tool.
    },
    captureEvent(name, properties) {
      posthog.capture(name, properties);
    },
  };
}
