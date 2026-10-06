import type { Reporter } from "@/lib/observability/report";
import { scrubDeep } from "@/lib/booking/scrub";

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
    /*
      The SDK writes `location.href` into fields this module never sees:
      heatmap data, replay and web vitals, each switched on from PostHog's
      side rather than here. This strips the fragment, where the status token
      travels, from every one of them (production readiness, 6 Oct 2026).
    */
    disable_capture_url_hashes: true,
    /*
      And nothing the project's settings switch on records a page by itself.
      A replay carries the page's text, names and meeting points included,
      and heatmaps key every tap by the address, `/i/{token}` included.
      Everything this app sends goes through `captureEvent`.
    */
    disable_session_recording: true,
    capture_heatmaps: false,
    /*
      Every property, not a list of four: `$session_entry_url` and
      `$initial_current_url` ride on every event of a visit that began on an
      invitation.
    */
    sanitize_properties: (properties) => scrubDeep(properties),
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
