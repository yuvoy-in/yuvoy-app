import { http, HttpResponse } from "msw";
import {
  EXPERIENCES,
  REELS,
  LONG_REEL_FEED,
  EXPERIENCE_DETAIL,
  availabilityFor,
  FIXTURE_NOW,
  mockHeaders,
  mockNow,
} from "./fixtures";
import {
  CATEGORIES,
  bookableRangeOf,
  commonFailure,
  envelope,
  inRange,
  recordedViews,
  requestId,
  scenarioOf,
  url,
} from "./handlers-support";

/* The reel views, one reel, one listing, its availability, search and the catalog index handlers, moved word for word out of handlers.ts (yuvoy-app#243). */
export const listingRoutes = [
  /*
    Reel views and watch time (yuvoy-app#96, yuvoy-api#214), judged the way
    the API judges them: a body that is not 1 to 50 events is a 400, and
    every other problem drops ONE event, named by its position, while the
    rest are kept. The same `eventId` twice is stored once and answered as
    accepted, which is what makes retrying a whole batch safe.

    Stored nowhere but this process, and nothing about who sent it.
  */
  http.post(url("/reel-views"), async ({ request }) => {
    let body: { events?: unknown } | null = null;
    try {
      body = (await request.json()) as { events?: unknown };
    } catch {
      body = null;
    }
    const events = Array.isArray(body?.events) ? body.events : null;
    if (!events || events.length < 1 || events.length > 50) {
      return envelope(
        "invalid_input",
        "Send between 1 and 50 events in one call.",
        400,
        { events: "Between 1 and 50 events, each one view of one reel." },
      );
    }

    const known = new Set(
      [...REELS, ...LONG_REEL_FEED].map((reel) => reel.media.id),
    );
    const uuid =
      /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
    const now = mockNow();
    const droppedEvents: { index: number; reason: string }[] = [];
    let accepted = 0;

    events.forEach((raw, index) => {
      const event = raw as Record<string, unknown> | null;
      const viewedAt =
        typeof event?.viewedAt === "string" ? Date.parse(event.viewedAt) : NaN;
      const reason =
        !event ||
        typeof event !== "object" ||
        typeof event.reelId !== "string" ||
        typeof event.watchedMs !== "number" ||
        typeof event.completed !== "boolean" ||
        typeof event.viewedAt !== "string"
          ? "invalid_event"
          : typeof event.eventId !== "string" || !uuid.test(event.eventId)
            ? "invalid_event_id"
            : !known.has(event.reelId)
              ? "unknown_reel"
              : event.watchedMs < 0 || event.watchedMs > 600_000
                ? "watched_ms_out_of_range"
                : !Number.isFinite(viewedAt)
                  ? "invalid_viewed_at"
                  : viewedAt > now + 5 * 60_000
                    ? "viewed_at_in_future"
                    : viewedAt < now - 24 * 60 * 60_000
                      ? "viewed_at_too_old"
                      : null;
      if (reason) {
        droppedEvents.push({ index, reason });
        return;
      }
      recordedViews.add(event!.eventId as string);
      accepted += 1;
    });

    return HttpResponse.json(
      { accepted, dropped: droppedEvents.length, droppedEvents },
      { status: 202, headers: mockHeaders(requestId()) },
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
    const range = bookableRangeOf(u);
    if (range instanceof Response) return range;
    const filtered = Boolean(
      bookableOn || range || destinationKey || category || activityType,
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
    items = items.filter((e) => inRange(e.nextAvailable, range));
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
];
