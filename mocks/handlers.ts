import { http, HttpResponse, delay } from "msw";
import {
  EXPERIENCES,
  EXPERIENCE_DETAIL,
  availabilityFor,
  FIXTURE_NOW,
} from "./fixtures";
import { bookingHandlers } from "./booking-handlers";

/**
 * Handlers for every endpoint Phase 1 touches, plus a way to reach every
 * failure branch on purpose.
 *
 * The scenario switch is the point of this file. The states that lose money
 * are the ones nobody can reproduce, so any request can be forced into a
 * specific failure with `?__scenario=<name>` (or the `x-yuvoy-scenario`
 * header, which survives a redirect). Nothing here ships: MSW is dev and test
 * only, and `pnpm build` does not include it.
 */

const BASE = process.env.NEXT_PUBLIC_API_URL ?? "http://localhost:8099/v1";
const url = (p: string) => `${BASE}${p}`;

export type Scenario =
  | "ok"
  | "empty"
  | "slow"
  | "offline"
  | "server-error"
  | "booking-disabled"
  | "operator-not-bookable"
  | "payments-unavailable"
  | "rate-limited"
  | "stale-availability"
  | "capacity-unavailable"
  | "cutoff-passed"
  | "request-window-closed";

function scenarioOf(request: Request): Scenario {
  const fromHeader = request.headers.get("x-yuvoy-scenario");
  if (fromHeader) return fromHeader as Scenario;
  const s = new URL(request.url).searchParams.get("__scenario");
  return (s as Scenario) ?? "ok";
}

let requestSeq = 0;
const requestId = () =>
  `01J${(++requestSeq).toString(36).toUpperCase().padStart(6, "0")}MOCK`;

function envelope(
  code: string,
  message: string,
  status: number,
  details?: Record<string, unknown>,
) {
  return HttpResponse.json(
    { error: { code, message, details, requestId: requestId() } },
    { status, headers: { "x-request-id": requestId() } },
  );
}

/** Failures any endpoint can produce, applied before its own logic. */
async function commonFailure(request: Request) {
  const s = scenarioOf(request);
  switch (s) {
    case "slow":
      await delay(3000);
      return null;
    case "offline":
      return HttpResponse.error();
    case "server-error":
      return envelope(
        "internal_error",
        "Something went wrong at our end.",
        500,
      );
    case "rate-limited":
      return envelope(
        "rate_limited",
        "Too many requests. Try again shortly.",
        429,
      );
    case "booking-disabled":
      return envelope(
        "booking_disabled",
        "Booking is paused right now. Browsing still works.",
        503,
      );
    case "operator-not-bookable":
      return envelope(
        "operator_not_bookable",
        "This operator is paused while we check something.",
        503,
      );
    default:
      return null;
  }
}

export const handlers = [
  /* ------------------------------------------------------------- catalog */

  http.get(url("/experiences"), async ({ request }) => {
    const failed = await commonFailure(request);
    if (failed) return failed;

    const u = new URL(request.url);
    const scenario = scenarioOf(request);
    const category = u.searchParams.get("category");
    const q = (u.searchParams.get("q") ?? "").toLowerCase();

    let items = EXPERIENCES;
    if (scenario === "empty") items = [];
    if (category) items = items.filter((e) => e.category === category);
    if (q) items = items.filter((e) => e.title.toLowerCase().includes(q));

    // Two per page, so infinite scroll and the `complete` flag are both
    // exercised in development rather than only in theory.
    const cursor = u.searchParams.get("cursor");
    const start = cursor ? Number(atob(cursor)) : 0;
    const pageSize = 2;
    const page = items.slice(start, start + pageSize);
    const next = start + pageSize;
    const complete = next >= items.length;

    return HttpResponse.json(
      {
        items: page,
        nextCursor: complete ? null : btoa(String(next)),
        complete,
      },
      { headers: { "x-request-id": requestId() } },
    );
  }),

  http.get(url("/experiences/:slug"), async ({ request, params }) => {
    const failed = await commonFailure(request);
    if (failed) return failed;

    const detail = EXPERIENCE_DETAIL[String(params.slug)];
    if (!detail) {
      return envelope("not_found", "No such experience.", 404);
    }
    return HttpResponse.json(detail, {
      headers: { "x-request-id": requestId() },
    });
  }),

  http.get(
    url("/experiences/:slug/availability"),
    async ({ request, params }) => {
      const failed = await commonFailure(request);
      if (failed) return failed;

      const slug = String(params.slug);
      const scenario = scenarioOf(request);

      if (scenario === "stale-availability") {
        return envelope(
          "stale_availability",
          "We cannot confirm seats for this departure right now.",
          409,
        );
      }
      if (!EXPERIENCE_DETAIL[slug]) {
        return envelope("not_found", "No such experience.", 404);
      }

      const slots = scenario === "empty" ? [] : availabilityFor(slug);

      return HttpResponse.json(
        {
          slots,
          availabilityAsOf: FIXTURE_NOW.toISOString(),
          marketTimezone: "Asia/Kolkata",
          // Non-zero on purpose: an empty day must be distinguishable from an
          // unverified one, and the UI has to say which it is.
          staleSlotsSuppressed: scenario === "empty" ? 2 : 0,
        },
        { headers: { "x-request-id": requestId() } },
      );
    },
  ),

  http.get(url("/search"), async ({ request }) => {
    const failed = await commonFailure(request);
    if (failed) return failed;

    const u = new URL(request.url);
    const q = (u.searchParams.get("q") ?? "").toLowerCase();
    const bookableOn = u.searchParams.get("bookableOn");

    let items = EXPERIENCES;
    if (q) {
      items = items.filter(
        (e) =>
          e.title.toLowerCase().includes(q) ||
          (e.location ?? "").toLowerCase().includes(q),
      );
    }
    // Date-first discovery: only what can actually be booked that day.
    if (bookableOn) items = items.filter((e) => e.nextAvailable === bookableOn);

    return HttpResponse.json(
      { items, nextCursor: null, complete: true },
      { headers: { "x-request-id": requestId() } },
    );
  }),

  http.get(url("/catalog/index"), async () =>
    HttpResponse.json(
      {
        entries: EXPERIENCES.map((e) => ({
          kind: "experience" as const,
          slug: e.slug,
          marketKey: e.marketKey,
          destinationKey: e.destinationKey,
          lastModified: FIXTURE_NOW.toISOString(),
          hasBookableDates: Boolean(e.nextAvailable),
        })),
      },
      { headers: { "x-request-id": requestId() } },
    ),
  ),

  /* ---------------------------------------------------------------- scans */

  // Fire and forget. No cookie, no device id, no user agent — it counts
  // scans, it does not follow people.
  // Always 200 with a usable target, including for an unknown code — the
  // person holding the card needs a destination either way.
  http.post(url("/scans"), async ({ request }) => {
    const { code } = (await request.json()) as { code: string };
    const known = code.toUpperCase().startsWith("HAVELOCK");
    return HttpResponse.json(
      {
        target: known ? "/e/try-dive-nemo-reef" : "/",
        known,
        marketKey: "andaman",
      },
      { headers: { "x-request-id": requestId() } },
    );
  }),

  ...bookingHandlers,
];
