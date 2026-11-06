import { http, HttpResponse } from "msw";
import {
  EXPERIENCES,
  mockHeaders,
  mockNow,
  PLACES,
  SAMPLE_SECOND_MARKET,
} from "./fixtures";
import { exploreStageOf, checkedStageOf } from "./found-handlers";
import {
  KARNATAKA_FOR_ALL,
  KARNATAKA_MARKET,
  isFoundId,
} from "./found-fixtures";
import { checkedSampleById } from "./found-checked-fixtures";
import { statedSampleById } from "./found-stated-fixtures";
import { creatorStageOf } from "./creator-link-handlers";
import { peopleStageOf } from "./people-state";
import { trigoStageOf } from "./trigo-handlers";
import { trigoActionsStageOf } from "./trigo-card-handlers";
import { organiserSupplyOf } from "./organiser-handlers";
import { meStageOf, meTablesStageOf } from "./me-handlers";
import { followPeopleStageOf } from "./follow-state";
import { clubPeopleStageOf } from "./club-handlers";
import { plansStageOf } from "./my-plans-handlers";
import {
  commonFailure,
  envelope,
  recordedOutcomes,
  requestId,
  scenarioOf,
  url,
} from "./handlers-support";

/* The places, app config, outcomes and scans handlers, moved word for word out of handlers.ts (yuvoy-app#243). */
export const placeRoutes = [
  /* ------------------------------------------------- places and releases */

  /*
    Markets and their destinations (yuvoy-app#181, `listPlaces`): Andaman
    alone, as production answers. No session, the same for everybody.

    A discover market joins only once `explore` is open to everybody
    (`explore-all`, yuvoy-app#179): at `staff` the public list stays
    Andaman's, as the API's does, and staff read `/me/places` instead.
  */
  http.get(url("/places"), async ({ request }) => {
    const failed = await commonFailure(request);
    if (failed) return failed;
    const scenario = scenarioOf(request);
    if (scenario === "places-unavailable" || scenario === "places-error") {
      return envelope("unavailable", "Places are not answering.", 503);
    }
    if (exploreStageOf(scenario) === "all") {
      // Markets by name, as the API sends them.
      return HttpResponse.json(
        { markets: [...PLACES.markets, KARNATAKA_FOR_ALL] },
        { headers: mockHeaders(requestId()) },
      );
    }
    return HttpResponse.json(
      scenario === "two-markets"
        ? { markets: [...PLACES.markets, SAMPLE_SECOND_MARKET] }
        : PLACES,
      { headers: mockHeaders(requestId()) },
    );
  }),

  /*
    The places this traveller may see (`listMyPlaces`): the public list until
    a cohort sees places still opening. Signed in only, as the API asks.

    Under yuvoy-app#179's scenarios a staff caller also sees Karnataka, its
    places `visibleTo: staff`; under `explore-all` the same places open to
    all. Both failure scenarios fail this list too, so a signed-in page meets
    the same outage a signed-out one does.
  */
  http.get(url("/me/places"), async ({ request }) => {
    if (!request.headers.get("authorization")) {
      return envelope("unauthorized", "Sign in first.", 401);
    }
    const scenario = scenarioOf(request);
    if (scenario === "places-unavailable" || scenario === "places-error") {
      return envelope("unavailable", "Places are not answering.", 503);
    }
    const stage = exploreStageOf(scenario);
    if (stage) {
      return HttpResponse.json(
        {
          markets: [
            ...PLACES.markets,
            stage === "all" ? KARNATAKA_FOR_ALL : KARNATAKA_MARKET,
          ],
        },
        { headers: mockHeaders(requestId()) },
      );
    }
    return HttpResponse.json(PLACES, { headers: mockHeaders(requestId()) });
  }),

  /*
    The app's config, with how far each release has reached (R0-T2): every
    release `off`, as on dev and production today, unless a scenario moves
    `explore`, `checkedCities` (yuvoy-app#180's, at `staff`), `creator`
    (yuvoy-app#207's, at `staff`), `people` (yuvoy-app#222's, at `staff`,
    or `all` under `people-all`), `trigo` (yuvoy-app#223's, at `staff`),
    or `me`, `going` and `tables` (yuvoy-mobile#444's, at `staff`).
    `trigoActions` is the one at `all`, so a card's buttons show wherever
    Trigo does; `trigo-card-actions-off` turns it `off`.
  */
  http.get(url("/app-config"), async ({ request }) => {
    const failed = await commonFailure(request);
    if (failed) return failed;
    const scenario = scenarioOf(request);
    // yuvoy-app#179's scenarios open `explore` at `staff`, `explore-all` at all.
    const explore =
      exploreStageOf(scenario) ??
      (scenario === "explore-early" ? "early" : "off");
    return HttpResponse.json(
      {
        minimumVersion: { ios: "0.0.0", android: "0.0.0" },
        features: {
          payments: "coming_soon",
          inviteOnly: false,
          // Off as on dev and production today, unless a scenario opens it.
          signIn: {
            email: scenario.startsWith("email-sign-in"),
            google: false,
            apple: false,
          },
        },
        support: {
          whatsappE164: "+919000000001",
          hours: "9am to 7pm, every day",
        },
        deliveryHost: null,
        releases: {
          explore,
          checkedCities: checkedStageOf(scenario) ?? "off",
          creator: creatorStageOf(scenario) ?? "off",
          trigo: trigoStageOf(scenario) ?? "off",
          trigoActions: trigoActionsStageOf(scenario),
          supply: organiserSupplyOf(scenario),
          // yuvoy-mobile#444: Did you go asks only while `going` is open.
          me: meStageOf(scenario) ?? "off",
          going: meStageOf(scenario) ?? "off",
          tables: meTablesStageOf(scenario) ?? "off",
          people:
            peopleStageOf(scenario) ??
            clubPeopleStageOf(scenario) ??
            followPeopleStageOf(scenario) ??
            "off",
          plans: plansStageOf(scenario) ?? "off",
        },
      },
      { headers: mockHeaders(requestId()) },
    );
  }),

  /*
    What people did with a card (R0-T4, `recordOutcomes`), validated as the
    API validates it: only a body that is not a batch of 1 to 50 is a 400, and
    every other problem drops ONE event, named by its position, while the rest
    are kept. The same `eventId` twice is stored once and answered as
    accepted, which is what makes sending a whole batch again safe.

    Stored nowhere but this process, and nothing about who sent it: a batch
    that carries an `Authorization` header is refused outright here, because
    the app must never send one (the API would link it to the traveller).
  */
  http.post(url("/outcomes"), async ({ request }) => {
    const scenario = scenarioOf(request);
    if (scenario === "outcomes-down") {
      return envelope("unavailable", "Nothing was stored.", 503);
    }
    if (scenario === "outcomes-slow-down") {
      return envelope("rate_limited", "Slow down.", 429);
    }
    if (request.headers.get("authorization")) {
      return envelope(
        "invalid_input",
        "Outcomes from this app are sent with no session.",
        400,
      );
    }

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
        { events: "Between 1 and 50 events." },
      );
    }

    const kinds = new Set([
      "shown",
      "opened",
      "saved",
      "shared",
      "link_out",
      "problem_reported",
    ]);
    const surfaces = new Set([
      "feed",
      "search",
      "listing",
      "saved",
      "business",
      "shared_link",
      "found_feed",
      "found_detail",
    ]);
    const known = new Set(EXPERIENCES.map((experience) => experience.id));
    /*
      A found card is a subject too (`subjectType: event`, yuvoy-app#179),
      known when it is one of the found fixtures' cards. Each kind of subject
      is looked up only among its own kind, as the API looks it up.
    */
    const knownSubject = (event: Record<string, unknown>) =>
      event.subjectType === "event"
        ? isFoundId(event.subjectId as string, mockNow()) ||
          checkedSampleById(event.subjectId as string) !== null ||
          statedSampleById(event.subjectId as string) !== null
        : known.has(event.subjectId as string);
    const uuid =
      /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
    const now = mockNow();
    const droppedEvents: { index: number; reason: string }[] = [];
    let accepted = 0;

    events.forEach((raw, index) => {
      const event = raw as Record<string, unknown> | null;
      const occurredAt =
        typeof event?.occurredAt === "string"
          ? Date.parse(event.occurredAt)
          : NaN;
      const position = event?.position;
      const reason =
        !event ||
        typeof event !== "object" ||
        typeof event.subjectId !== "string" ||
        (event.subjectType !== "experience" && event.subjectType !== "event") ||
        typeof event.occurredAt !== "string"
          ? "invalid_event"
          : typeof event.eventId !== "string" || !uuid.test(event.eventId)
            ? "invalid_event_id"
            : typeof event.kind !== "string" || !kinds.has(event.kind)
              ? "unknown_kind"
              : typeof event.surface !== "string" ||
                  !surfaces.has(event.surface)
                ? "unknown_surface"
                : !knownSubject(event)
                  ? "unknown_subject"
                  : position !== undefined &&
                      (!Number.isInteger(position) ||
                        (position as number) < 0 ||
                        (position as number) > 999)
                    ? "position_out_of_range"
                    : !Number.isFinite(occurredAt)
                      ? "invalid_occurred_at"
                      : occurredAt > now + 5 * 60_000
                        ? "occurred_at_in_future"
                        : occurredAt < now - 24 * 60 * 60_000
                          ? "occurred_at_too_old"
                          : null;
      if (reason) {
        droppedEvents.push({ index, reason });
        return;
      }
      recordedOutcomes.add(event!.eventId as string);
      accepted += 1;
    });

    return HttpResponse.json(
      { accepted, dropped: droppedEvents.length, droppedEvents },
      { status: 202, headers: mockHeaders(requestId()) },
    );
  }),

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
   *   - `C-…`: a traveller's own link (R12-T2), `kind: creator`, to a
   *     listing.
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
    const creator = upper.startsWith("C-");
    return HttpResponse.json(
      {
        target: forListing || creator ? "/e/try-dive-nemo-reef" : "/",
        known: forListing || forPlace || creator,
        marketKey: "andaman",
        ...(forListing || forPlace
          ? { destinationKey: "andaman/havelock", kind: "printed" as const }
          : {}),
        ...(creator ? { kind: "creator" as const } : {}),
      },
      { headers: mockHeaders(requestId()) },
    );
  }),
];
