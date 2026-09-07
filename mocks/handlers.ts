import { http, HttpResponse, delay } from "msw";
import {
  EXPERIENCES,
  REELS,
  LONG_REEL_FEED,
  EXPERIENCE_DETAIL,
  availabilityFor,
  FIXTURE_NOW,
  mockHeaders,
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
  | "request-window-closed"
  /*
    A feed long enough to page.

    The `REELS` fixture is six reels — deliberately, because its job is to
    prove the operator rotation is passed through untouched, and six across
    three rounds is what makes that legible. Six is smaller than one page, so
    against the real fixture the scroll never reaches a second request and
    every paging path would be exercised only in unit tests.

    So the length lives in a scenario rather than in the fixture: the rotation
    stays readable, and `/?__scenario=long-feed` walks real cursors through
    real page boundaries in the browser and in Playwright.
  */
  | "long-feed"
  /*
    `complete: false` with NO `nextCursor` — the contract's third case, "a
    different thing from the feed having ended". Unreachable from the fixture
    otherwise, and it is the one tail state that has no test unless something
    can produce it on demand.
  */
  | "feed-stopped";

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
    { status, headers: mockHeaders(requestId()) },
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
      { headers: mockHeaders(requestId()) },
    );
  }),

  /**
   * The feed. Every published reel, each with the listing it sells — paged.
   *
   * The endpoint takes `limit` (1–60, default 30) and a `cursor`, and answers
   * with `complete` and `nextCursor` (yuvoy-api#114). The mock enforces the
   * same bounds the contract states, including the 400, so a client that asks
   * for 100 finds out here rather than in production.
   *
   * ## Three details copied from the real API rather than assumed
   *
   * **`nextCursor` is OMITTED on the last page, not sent as `null`.** Verified
   * against `api.yuvoy.in`: the final page's keys are `complete` and `items`
   * and nothing else. A mock that sent `null` would let a client that only
   * handles `undefined` pass here and stall in production.
   *
   * **The cursor is opaque.** It is base64 here and something else upstream —
   * the point is that a client cannot read it, so nothing in the app is
   * allowed to construct or decode one. In production it carries the round a
   * reel is in for its own operator, which is why client-side paging over this
   * ordering is impossible.
   *
   * **A cursor is honoured even when the page is complete.** A stale cursor
   * pointing past the end answers an empty, complete page rather than 400 —
   * the same thing the API does, and the reason a client refetching an old
   * page does not blow up.
   *
   * The order is the fixture's order, passed through untouched. Nothing here
   * sorts, because nothing in production sorts: reels are numbered within each
   * business so that everyone's first precedes anybody's second, and the
   * ordering "rotates operators, it never ranks them".
   */
  http.get(url("/reels"), async ({ request }) => {
    const failed = await commonFailure(request);
    if (failed) return failed;

    const u = new URL(request.url);
    const raw = u.searchParams.get("limit");
    const limit = raw === null ? 30 : Number(raw);
    if (raw !== null && (!Number.isInteger(limit) || limit < 1 || limit > 60)) {
      return HttpResponse.json(
        {
          error: {
            code: "bad_request",
            message: `limit must be an integer between 1 and 60 — got ${JSON.stringify(raw)}.`,
          },
        },
        { status: 400, headers: mockHeaders(requestId()) },
      );
    }

    const scenario = scenarioOf(request);
    const all =
      scenario === "empty"
        ? []
        : scenario === "long-feed"
          ? LONG_REEL_FEED
          : REELS;

    const rawCursor = u.searchParams.get("cursor");
    const start = rawCursor ? Number(atob(rawCursor)) : 0;
    if (rawCursor && !Number.isInteger(start)) {
      return HttpResponse.json(
        {
          error: {
            code: "invalid_input",
            message: "cursor is not one this API issued.",
          },
        },
        { status: 400, headers: mockHeaders(requestId()) },
      );
    }

    const items = all.slice(start, start + limit);
    const next = start + limit;
    const complete = next >= all.length;

    /*
      The server stopped, without a cursor and without claiming the end. Sent
      on the FIRST page only, so the state is reachable in one request.
    */
    if (scenario === "feed-stopped") {
      return HttpResponse.json(
        { items, complete: false },
        { headers: mockHeaders(requestId()) },
      );
    }

    return HttpResponse.json(
      // Spread rather than a `null`, so the key is genuinely absent.
      {
        items,
        complete,
        ...(complete ? {} : { nextCursor: btoa(String(next)) }),
      },
      { headers: mockHeaders(requestId()) },
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
      headers: mockHeaders(requestId()),
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
        { headers: mockHeaders(requestId()) },
      );
    },
  ),

  http.get(url("/search"), async ({ request }) => {
    const failed = await commonFailure(request);
    if (failed) return failed;

    const u = new URL(request.url);
    const q = (u.searchParams.get("q") ?? "").toLowerCase();
    const bookableOn = u.searchParams.get("bookableOn");

    /*
      "An empty `q` returns nothing, not everything." A day alone is still a
      question — what is bookable on Thursday — so it is answered; nothing at
      all is not. The mock used to answer the whole catalogue here, which is
      how the screen shipped a default state the real API would leave empty.
    */
    if (!q && !bookableOn) {
      return HttpResponse.json(
        { items: [], nextCursor: null, complete: true },
        { headers: mockHeaders(requestId()) },
      );
    }

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
      { headers: mockHeaders(requestId()) },
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
      { headers: mockHeaders(requestId()) },
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
      { headers: mockHeaders(requestId()) },
    );
  }),

  ...bookingHandlers,
];
