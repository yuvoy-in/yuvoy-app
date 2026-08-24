import { scrubUrl, scrubDeep } from "@/lib/booking/scrub";

/**
 * Error and event reporting, behind one seam.
 *
 * The seam exists because of a specific hazard rather than for tidiness: the
 * booking status token lives in the URL fragment, and every reporting SDK
 * captures `location.href` by default. Sentry does it on every event,
 * breadcrumb and navigation transaction; PostHog does it on `$current_url`.
 *
 * Routing everything through here means the scrubbing is applied ONCE, is
 * unit-tested, and a new tool is a new adapter rather than a new leak.
 */

export interface ReportContext {
  /** From the API's error envelope. The one field worth having in a report. */
  requestId?: string;
  /** A short label for where this happened — "checkout", "feed". */
  scope?: string;
  [key: string]: unknown;
}

export interface Reporter {
  captureError(error: unknown, context?: ReportContext): void;
  captureEvent(name: string, properties?: Record<string, unknown>): void;
}

/** Drops everything. The default until a reporter is installed. */
const noopReporter: Reporter = {
  captureError: () => {},
  captureEvent: () => {},
};

let reporter: Reporter = noopReporter;

export function installReporter(next: Reporter): void {
  reporter = next;
}

/**
 * Sanitises anything heading for a reporter.
 *
 * Applied at THIS layer rather than in each adapter, so an adapter cannot
 * forget. Two things happen: URLs lose any fragment carrying a token, and the
 * whole context object is walked in case a token was copied into a field.
 */
function sanitise(context?: ReportContext): ReportContext | undefined {
  if (!context) return undefined;
  return scrubDeep({ ...context, url: currentUrl() });
}

function currentUrl(): string | undefined {
  if (typeof window === "undefined") return undefined;
  return scrubUrl(window.location.href);
}

/**
 * A reporter's own failure must never reach the caller.
 *
 * These are called from checkout and from the booking screen. A monitoring
 * SDK that throws — a bad DSN, a blocked request, a quota — would otherwise
 * take down the one flow that moves money, in order to report that nothing
 * was wrong with it.
 */
function safely(fn: () => void): void {
  try {
    fn();
  } catch {
    // Deliberately swallowed. There is nowhere useful to report a failure of
    // the thing that does the reporting.
  }
}

export function captureError(error: unknown, context?: ReportContext): void {
  safely(() => reporter.captureError(error, sanitise(context)));
}

export function captureEvent(
  name: string,
  properties?: Record<string, unknown>,
): void {
  safely(() =>
    reporter.captureEvent(
      name,
      scrubDeep({ ...properties, url: currentUrl() }),
    ),
  );
}

/**
 * The development reporter: the console, scrubbed exactly as a real one would
 * be. Having it behave identically is the point — a leak that only shows up in
 * production is a leak nobody catches.
 */
export const consoleReporter: Reporter = {
  captureError(error, context) {
    console.error("[yuvoy]", error, context);
  },
  captureEvent(name, properties) {
    console.info("[yuvoy]", name, properties);
  },
};
