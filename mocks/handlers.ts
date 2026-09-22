import { http, HttpResponse, delay } from "msw";
import type { components } from "../src/lib/api/schema.gen";
import {
  EXPERIENCES,
  REELS,
  LONG_REEL_FEED,
  EXPERIENCE_DETAIL,
  OPERATORS,
  operatorProfileFor,
  availabilityFor,
  FIXTURE_NOW,
  mockHeaders,
} from "./fixtures";
import { bookingHandlers } from "./booking-handlers";
import { savedHandlers } from "./saved-handlers";

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
  /*
    The word list alone is unavailable (yuvoy-app#37 item 7).

    `server-error` cannot reach this state: it fails every read, so the screen
    goes to its own error panel and the sheet never opens. Where and What have
    to fail while the search box, the grid and the When chips keep working, and
    that is a state only a per-endpoint scenario can produce.
  */
  | "vocabulary-unavailable"
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
  /*
    A listing whose `cancellationPolicy` is absent — yuvoy-app#28.

    Not a hypothetical: the field is `omitempty` and the API populated it with
    nothing, so this was the shape of EVERY listing in production from launch
    until 9 Sep 2026, and checkout could never be submitted for any of them.
    The fixtures all carry the field, which is precisely why the suite stayed
    green throughout — so the absent case has to be reachable on purpose.

    An optional field that is never populated passes every check either side
    has. This scenario is the standing answer to that.
  */
  | "no-cancellation-policy"
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

/**
 * The twelve categories the contract declares, for the 400 an unknown one gets.
 *
 * Typed off the schema rather than written out, so the day the enum grows this
 * mock grows with it instead of refusing a value production accepts — which is
 * the exact drift `pnpm contract:check` exists to prevent one layer up.
 */
const KNOWN_CATEGORIES = new Set<string>([
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
] satisfies components["schemas"]["Category"][]);

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
  /* ----------------------------------------------------- operator page */

  /*
    A business, and everything it sells — yuvoy-app#30.

    One request for the whole first paint: header, listings and the first
    screen of the grid. `?__scenario=not-bookable` pauses the whole business,
    which must RENDER with one honest line rather than error — somebody was
    sent the link.
  */
  http.get(url("/operators/:slug"), async ({ request, params }) => {
    const failed = await commonFailure(request);
    if (failed) return failed;

    // Any fixture business: every card links to its own operator now.
    const slug = String(params.slug);
    if (!OPERATORS.some((o) => o.slug === slug)) {
      return envelope("not_found", "No such operator.", 404);
    }

    const profile = operatorProfileFor(slug);
    return HttpResponse.json(
      {
        ...profile,
        bookable: scenarioOf(request) !== "not-bookable",
      },
      { headers: mockHeaders(requestId()) },
    );
  }),

  /*
    The grid beyond the first screen. `complete` is TOLD, never inferred from a
    short page — the client is contractually forbidden from stopping on length,
    and a mock that only ever returned complete pages would never exercise it.
  */
  http.get(url("/operators/:slug/reels"), async ({ request, params }) => {
    const failed = await commonFailure(request);
    if (failed) return failed;

    const operator = OPERATORS.find((o) => o.slug === String(params.slug));
    if (!operator) {
      return envelope("not_found", "No such operator.", 404);
    }

    const all = REELS.filter((r) => r.experience.operator.id === operator.id);
    const u = new URL(request.url);
    const cursor = Number(u.searchParams.get("cursor") ?? 0);
    const limit = Number(u.searchParams.get("limit") ?? 12);
    const page = all.slice(cursor, cursor + limit);
    const end = cursor + page.length;

    return HttpResponse.json(
      {
        items: page,
        complete: end >= all.length,
        ...(end < all.length ? { nextCursor: String(end) } : {}),
      },
      { headers: mockHeaders(requestId()) },
    );
  }),

  /*
    The filter chips' word list — yuvoy-app#37, api#173.

    The ACTIVE vocabulary, not the populated one, which is what the contract
    publishes and is the behaviour worth mocking: a value with no listing
    behind it today is still offered, and filtering by it answers an empty
    page. Deriving this from `EXPERIENCES` would quietly mock the OLD
    behaviour — the derived chips this replaces — and the one state the new
    screen has to handle well (a chip that finds nothing) would be unreachable.
  */
  http.get(url("/catalog/vocabulary"), async ({ request }) => {
    const failed = await commonFailure(request);
    if (failed) return failed;
    if (scenarioOf(request) === "vocabulary-unavailable") {
      return envelope("unavailable", "The word list is not answering.", 503);
    }

    return HttpResponse.json(
      {
        categories: [
          { key: "adventure", label: "Adventure" },
          { key: "nature_wildlife", label: "Nature and wildlife" },
          { key: "food_drink", label: "Food and drink" },
          // Offered with nothing behind it, on purpose. See above.
          { key: "wellness", label: "Wellness" },
        ],
        activityTypes: [
          { key: "scuba", label: "Scuba diving", category: "adventure" },
          { key: "snorkelling", label: "Snorkelling", category: "adventure" },
          { key: "kayaking", label: "Kayaking", category: "adventure" },
          {
            key: "private_charter",
            label: "Private charter",
            category: "adventure",
          },
          {
            key: "birdwatching",
            label: "Birdwatching",
            category: "nature_wildlife",
          },
          { key: "tasting", label: "Tasting", category: "food_drink" },
        ],
        destinations: [
          { key: "andaman/havelock", label: "Havelock (Swaraj Dweep)" },
          { key: "andaman/neil", label: "Neil (Shaheed Dweep)" },
          { key: "andaman/port_blair", label: "Port Blair" },
        ],
      },
      { headers: mockHeaders(requestId()) },
    );
  }),

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
    const unfiltered =
      scenario === "empty"
        ? []
        : scenario === "long-feed"
          ? LONG_REEL_FEED
          : REELS;

    /*
      Filters — yuvoy-app#37, api#173. They NARROW; they never reorder. The
      rotation is counted within the filtered set, so the surviving order is
      the source order, which is what slicing preserves.

      An unknown `category` is a 400 and an unknown `activityType` is an empty
      page. The asymmetry is the contract's and is deliberate on its side —
      `category` is a closed enum, so an unknown value means the client and the
      server disagree about a fixed vocabulary; `activityType` grows by INSERT,
      so today's unknown is tomorrow's real one. Mocked faithfully because a
      client that cannot tell them apart is the failure the contract is
      guarding against.
    */
    const q = u.searchParams.get("q")?.trim().toLowerCase();
    const destinationKey = u.searchParams.get("destinationKey");
    const category = u.searchParams.get("category");
    const activityType = u.searchParams.get("activityType");
    const bookableOn = u.searchParams.get("bookableOn");

    if (category && !KNOWN_CATEGORIES.has(category)) {
      return HttpResponse.json(
        {
          error: {
            code: "invalid_input",
            message: `category is not one this API knows — got ${JSON.stringify(category)}.`,
          },
        },
        { status: 400, headers: mockHeaders(requestId()) },
      );
    }

    /*
      The four ranges (yuvoy-api#197), inclusive, and refused the way the API
      refuses them: a negative or non-integer bound is a 400 naming that
      parameter, and a minimum above its maximum is a 400 naming both. A mock
      that ignored them would let a client that sent an inverted range pass.
    */
    const bounds: Record<string, number | undefined> = {};
    for (const name of [
      "minDurationMinutes",
      "maxDurationMinutes",
      "minPriceMinor",
      "maxPriceMinor",
    ]) {
      const raw = u.searchParams.get(name);
      if (raw === null) continue;
      const n = Number(raw);
      if (!/^\d+$/.test(raw) || !Number.isSafeInteger(n)) {
        return HttpResponse.json(
          {
            error: {
              code: "invalid_input",
              message: `${name} must be a whole number of zero or more.`,
              details: { [name]: raw },
            },
          },
          { status: 400, headers: mockHeaders(requestId()) },
        );
      }
      bounds[name] = n;
    }
    for (const [lo, hi] of [
      ["minDurationMinutes", "maxDurationMinutes"],
      ["minPriceMinor", "maxPriceMinor"],
    ] as const) {
      const min = bounds[lo];
      const max = bounds[hi];
      if (min !== undefined && max !== undefined && min > max) {
        return HttpResponse.json(
          {
            error: {
              code: "invalid_input",
              message: `${lo} cannot be more than ${hi}`,
              details: { [lo]: min, [hi]: max },
            },
          },
          { status: 400, headers: mockHeaders(requestId()) },
        );
      }
    }
    const priced =
      bounds.minPriceMinor !== undefined || bounds.maxPriceMinor !== undefined;
    const within = (value: number, min?: number, max?: number) =>
      (min === undefined || value >= min) &&
      (max === undefined || value <= max);

    const all = unfiltered.filter((reel) => {
      const e = reel.experience;
      if (q) {
        const hay = `${e.title} ${e.location ?? ""} ${e.activityTypeLabel ?? ""}`;
        if (!hay.toLowerCase().includes(q)) return false;
      }
      if (destinationKey && e.destinationKey !== destinationKey) return false;
      if (category && e.category !== category) return false;
      if (activityType && e.activityType !== activityType) return false;
      // Only reels of listings bookable that day. `nextAvailable` is the only
      // date this fixture carries, so it stands in for the departure list.
      if (bookableOn && e.nextAvailable !== bookableOn) return false;
      if (
        !within(
          e.durationMinutes,
          bounds.minDurationMinutes,
          bounds.maxDurationMinutes,
        )
      ) {
        return false;
      }
      if (priced) {
        // The owner's decision: a price for the whole boat is never compared
        // with a price for one person, so group-priced listings are left out,
        // and so is a listing with no price to compare at all.
        if (e.pricingUnit === "per_group" || !e.fromPrice) return false;
        if (
          !within(
            e.fromPrice.amountMinor,
            bounds.minPriceMinor,
            bounds.maxPriceMinor,
          )
        ) {
          return false;
        }
      }
      return true;
    });

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

  /*
    One reel, by its own media id — yuvoy-app#36, api#173.

    Declared BEFORE `/reels` would be a problem in a router that matched
    loosely; MSW matches the whole path, so `/reels/:id` and `/reels` cannot
    collide. It is placed after them for reading order only.

    A reel the feed would not show and one that never existed answer the same
    404, exactly as the contract says, so nothing here can tell them apart
    either. `LONG_REEL_FEED` is deliberately NOT searched: it is a scenario
    fixture for paging, and a share link minted from it would resolve against
    the real feed's ids in a way production never would.
  */
  http.get(url("/reels/:id"), async ({ request, params }) => {
    const failed = await commonFailure(request);
    if (failed) return failed;

    const reel = REELS.find((r) => r.media.id === String(params.id));
    if (!reel) return envelope("not_found", "No such reel.", 404);

    return HttpResponse.json(reel, { headers: mockHeaders(requestId()) });
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
    const scenario = scenarioOf(request);
    /*
      `omitempty` means the key is GONE, not null and not empty — so the mock
      deletes it rather than blanking it. A client that only ever met `""`
      would still not be meeting what production sent.
    */
    const withoutPolicy = Object.fromEntries(
      Object.entries(detail).filter(([k]) => k !== "cancellationPolicy"),
    );
    return HttpResponse.json(
      {
        ...(scenario === "no-cancellation-policy" ? withoutPolicy : detail),
        bookable: scenario !== "not-bookable",
      },
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
  ...savedHandlers,
];
