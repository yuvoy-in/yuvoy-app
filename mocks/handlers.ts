import { http, HttpResponse, delay } from "msw";
import type { components } from "../src/lib/api/schema.gen";
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
  /*
    A listing that answers 200 and cannot be bought — yuvoy-app#19.

    Deliberately NOT a 404: the card is already gone from every feed and from
    search, so the only way to this page is a link, a bookmark or a search
    result, and telling that person the business does not exist is worse than
    telling them it is not selling. Unreachable from the fixture otherwise, and
    it is the state the whole flag exists to make visible.
  */
  | "not-bookable"
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

/**
 * The closed browse vocabulary, so the mock can tell an unknown category from
 * one that simply matches nothing.
 *
 * Kept in step with `Category` in the contract by the type below: adding a
 * value there without adding it here is a build failure, which is the only
 * way a set written twice stays written once.
 */
const CATEGORIES: ReadonlySet<string> = new Set<
  components["schemas"]["Category"]
>([
  "adventure",
  "nature_wildlife",
  "food_drink",
  "arts_creativity",
  "learning",
  "culture_heritage",
  "wellness",
  "entertainment",
  "community",
  "sports",
  "local_life",
  "events",
]);

export const handlers = [
  /* ------------------------------------------------------------- catalog */

  http.get(url("/experiences"), async ({ request }) => {
    const failed = await commonFailure(request);
    if (failed) return failed;

    const u = new URL(request.url);
    const scenario = scenarioOf(request);
    const category = u.searchParams.get("category");
    const destinationKey = u.searchParams.get("destinationKey");
    const bookableOn = u.searchParams.get("bookableOn");

    let items = EXPERIENCES;
    if (scenario === "empty") items = [];
    if (category) items = items.filter((e) => e.category === category);
    /*
      `destinationKey` and `bookableOn` were implemented from the beginning and
      documented only on 9 Sep (yuvoy-api#133). Modelled now that they are on
      the contract.

      **`q` and `mode` are NOT handled, and that is the fix rather than an
      omission.** This mock used to filter by `q` and the real handler has
      never read it — so a client sending `q` here got a filtered list from the
      mock and an unfiltered one from production, believing it had searched.
      Both parameters were removed from the contract in the same change, for
      that reason.
    */
    if (destinationKey) {
      items = items.filter((e) => e.destinationKey === destinationKey);
    }
    if (bookableOn) items = items.filter((e) => e.nextAvailable === bookableOn);

    /*
      Two per page by default, so infinite scroll and the `complete` flag are
      both exercised in development rather than only in theory — but `limit` is
      honoured when asked for, because the contract takes it and the Search
      tab's chip rail depends on one read returning the catalogue rather than
      the first two rows of it.
    */
    const cursor = u.searchParams.get("cursor");
    const start = cursor ? Number(atob(cursor)) : 0;
    const asked = Number(u.searchParams.get("limit") ?? "");
    const pageSize =
      Number.isInteger(asked) && asked >= 1 && asked <= 50 ? asked : 2;
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
    /*
      Still a 200 when not bookable. See the `not-bookable` scenario's note:
      a 404 here would tell somebody holding a link that the business does not
      exist, which is worse than telling them it is not selling right now.
    */
    return HttpResponse.json(
      { ...detail, bookable: scenarioOf(request) !== "not-bookable" },
      { headers: mockHeaders(requestId()) },
    );
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

      /*
        `bookable: false` ALWAYS comes with `slots: []` — the contract is
        explicit, and a mock that sent slots alongside it would let a client
        ship a screen that renders bookable rows on a listing nobody can buy.
      */
      const bookable = scenario !== "not-bookable";
      const slots =
        !bookable || scenario === "empty" ? [] : availabilityFor(slug);

      return HttpResponse.json(
        {
          bookable,
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
    const destinationKey = u.searchParams.get("destinationKey");
    const category = u.searchParams.get("category");
    const activityType = u.searchParams.get("activityType");
    const filtered = Boolean(
      bookableOn || destinationKey || category || activityType,
    );

    /*
      "An empty `q` WITH NO FILTERS returns nothing, not everything" — the
      semantics as of yuvoy-api#133. An empty `q` with any filter set returns
      that filtered set: "a traveller who taps Havelock and types nothing is
      not asking for everything, they are asking for Havelock, and answering
      that with a blank screen makes every chip look like a control that does
      nothing."

      Before that fix the API returned before reading either filter, so every
      chip tapped without text answered an empty page over real departures.
      This mock never modelled that defect — it honoured `bookableOn` — which
      is why the screen shipped a design the live API contradicted for a month.
    */
    if (!q && !filtered) {
      return HttpResponse.json(
        { items: [], nextCursor: null, complete: true },
        { headers: mockHeaders(requestId()) },
      );
    }

    /*
      An unknown `category` is a **400**, not an empty page: the contract is
      explicit that the two must be distinguishable, because "no results" is
      the wrong thing to tell somebody whose filter was never going to match.

      `activityType` is the opposite — an unknown value is an empty page,
      because that set grows by INSERT and refusing it would make the API stale
      between deploys. Both are modelled, or a client cannot have been tested
      against the difference.
    */
    if (category && !CATEGORIES.has(category)) {
      return HttpResponse.json(
        {
          error: {
            code: "invalid_input",
            message: "Unknown category.",
            details: { category },
          },
        },
        { status: 400, headers: mockHeaders(requestId()) },
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
    if (destinationKey) {
      items = items.filter((e) => e.destinationKey === destinationKey);
    }
    if (category) items = items.filter((e) => e.category === category);
    if (activityType) {
      items = items.filter((e) => e.activityType === activityType);
    }

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
  /**
   * A printed card — and where it was printed (yuvoy-app#27).
   *
   * Three shapes, because `/go/[code]` has three branches and each must be
   * reachable:
   *
   *   - `HAVELOCK…` — a card printed for one listing. `target` wins and the
   *     destination is not used to widen it.
   *   - `ISLAND…`   — a card printed for a place. No specific target, so the
   *     destination opens Search on that place.
   *   - anything else — unknown or market-wide. **No `destinationKey` at
   *     all**, which is the contract's shape for both: absent means "no
   *     destination", and an empty string would have meant "a destination
   *     whose key is blank", which is a filter matching nothing.
   */
  http.post(url("/scans"), async ({ request }) => {
    const { code } = (await request.json()) as { code: string };
    const upper = code.toUpperCase();
    const forListing = upper.startsWith("HAVELOCK");
    const forPlace = upper.startsWith("ISLAND");
    return HttpResponse.json(
      {
        target: forListing ? "/e/try-dive-nemo-reef" : "/",
        known: forListing || forPlace,
        marketKey: "andaman",
        ...(forListing || forPlace
          ? { destinationKey: "andaman/havelock" }
          : {}),
      },
      { headers: mockHeaders(requestId()) },
    );
  }),

  ...bookingHandlers,
];
