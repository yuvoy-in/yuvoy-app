import { http, HttpResponse, delay } from "msw";
import {
  EXPERIENCES,
  REELS,
  LONG_REEL_FEED,
  OPERATORS,
  operatorProfileFor,
  mockHeaders,
} from "./fixtures";
import { FOUND_FILTER_ROWS } from "./found-fixtures";
import {
  KNOWN_CATEGORIES,
  bookableRangeOf,
  commonFailure,
  envelope,
  inRange,
  requestId,
  scenarioOf,
  url,
} from "./handlers-support";

/* The catalog, operator page, word list and feed handlers, moved word for word out of handlers.ts (yuvoy-app#243). */
export const catalogRoutes = [
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

      And REFUSED outside the contract's 1 to 50, with the API's own 400 and
      words, never quietly paged at two. Clamping is what let the sitemap ask
      for 100 here, page happily, and list no business in production, where
      the same request is a 400 (yuvoy-app#116).
    */
    const cursor = u.searchParams.get("cursor");
    const start = cursor ? Number(atob(cursor)) : 0;
    const rawLimit = u.searchParams.get("limit");
    const asked = Number(rawLimit);
    if (
      rawLimit !== null &&
      (!/^\d+$/.test(rawLimit) || asked < 1 || asked > 50)
    ) {
      return HttpResponse.json(
        {
          error: {
            code: "invalid_input",
            message: "limit must be a whole number between 1 and 50",
            details: { limit: rawLimit },
          },
        },
        { status: 400, headers: mockHeaders(requestId()) },
      );
    }
    const pageSize = rawLimit === null ? 2 : asked;
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
        foundFilters: FOUND_FILTER_ROWS,
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
    if (scenario === "slow-reels") await delay(1500);
    if (scenario === "stalled-reels") await delay(4500);
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
    const range = bookableRangeOf(u);
    if (range instanceof Response) return range;

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
      if (!inRange(e.nextAvailable, range)) return false;
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
];
