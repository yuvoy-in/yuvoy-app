import { http, HttpResponse, delay } from "msw";
import { mockHeaders, mockNow } from "./fixtures";
import {
  BENGALURU,
  FOUND_IDS,
  FOUND_PLACES,
  REPORT_RECEIPTS,
  REPORT_REFERENCE,
  foundDetail,
  foundSamples,
  listCard,
  sampleById,
  type FoundShape,
} from "./found-fixtures";
import { checkedWeek } from "./found-checked-fixtures";
import { statedSamples } from "./found-stated-fixtures";
import { NO_R3, askKey, narrow, readR3, refused, windowOf } from "./found-r3";
import {
  type FoundItemList,
  type FoundItemIndex,
  type EventReportReceipt,
  url,
  STATED_SCENARIOS,
  exploreStageOf,
  checkedStageOf,
  foundNow,
  r3SampleById,
  signedIn,
  exploreOpenFor,
  scenarioOf,
  rid,
  envelope,
  unavailable,
  PLACE_NOT_VISIBLE,
  EVENT_NOT_FOUND,
  CARD_NOT_SHOWING,
  commonFailure,
  DESTINATION_KEY,
  UUID,
  CATEGORIES,
  REASONS,
  mintCursor,
  readCursor,
  headersAt,
} from "./found-support";
export {
  CHECKED_STAFF_SCENARIOS,
  EXPLORE_STAFF_SCENARIOS,
  exploreStageOf,
  checkedStageOf,
  onR3Clock,
} from "./found-support";

/**
 * What was found in a discover place, and reports on it (yuvoy-app#179,
 * R2-T4): `GET /events` (`listEvents`), `GET /events/index`
 * (`getEventIndex`), `GET /events/{id}` (`getEvent`) and
 * `POST /events/{id}/reports` (`reportEvent`), judged as the API judges them
 * and typed from the pinned contract. Mobile's twin is
 * yuvoy-mobile `packages/mocks/src/found-handlers.ts`; the scenario names here
 * are the web issue's, so a few differ from mobile's.
 *
 * ## Who sees what
 *
 * The API's audience rule: a place shows while `explore` is open to the
 * caller, and otherwise every route answers the same 404, whatever the place.
 * With no scenario chosen `explore` is `off`, exactly as on dev and
 * production, so every one of these routes answers 404 and nothing the app
 * does today can reach a found card by accident.
 *
 * ## The scenarios
 *
 * Every one below except `explore-all` opens `explore` at `staff`: the
 * app-config says `staff`, `GET /me` puts the number in the staff group, and
 * `GET /me/places` adds Karnataka, while a caller with no session still gets
 * Andaman alone and a 404 here. On top of that, each is one fault or one shape
 * of answer:
 *
 *   - `explore-staff`: nothing more, the healthy staff world;
 *   - `found-empty`: every place answers no cards;
 *   - `found-error`: `GET /events` and `GET /events/{id}` fail (503);
 *   - `found-page-error`: every page after the first fails (503);
 *   - `found-stopped`: the first page ends `complete: false` with no cursor;
 *   - `found-long`: each place has 45 cards, so the list pages;
 *   - `found-slow`: `GET /events` answers 1.5 s late, inside the 3 s a server
 *     render waits, so the wait is the route's and the chips' to draw;
 *   - `found-dept-empty`: any department answers no cards, "All" answers all;
 *   - `places-error`: `GET /places` and `GET /me/places` fail (503);
 *   - `report-throttled`: a report is past the day's limit (429, Retry-After);
 *   - `report-too-fast`: a report is too fast (429 with no Retry-After);
 *   - `report-gone`: the card is no longer showing (404);
 *   - `item-ended`: every card's page answers `status: ended`;
 *   - `item-merged`: every card's page answers with the card it was merged
 *     into, under that card's id (`FOUND_IDS.merged` always does).
 *
 * The three list faults ride on the long list, because a fault on page two
 * needs a page two.
 *
 * ## Checked cities (yuvoy-app#180, R3-T2)
 *
 * `checkedCities` is `off` with no scenario, exactly as on dev and
 * production. Five scenarios open it at `staff` as well as `explore`. Each
 * starts `found-`, since the server render reads places only under the
 * prefixes `src/lib/site/my-places.ts` lists (`PLACE_SCENARIO`), so mobile's
 * `checked-staff` is `found-checked` here:
 *
 *   - `found-checked`: the healthy staff world. Bengaluru answers its week
 *     (`found-checked-fixtures.ts`), and `GET /events` narrows by `when`,
 *     `free`, `q`, `asText`, `budget`, `timeOfDay` and R3-T6's four, says
 *     what `q` was taken to mean ("dive saturday" is an Adventure chip and a
 *     Saturday chip, each with its `from`) and, for a `when`, its window
 *     (`found-r3.ts`);
 *   - `found-weekend-thin`: This weekend finds one card, so Coming up follows;
 *   - `found-free-empty`: Free (`free=true` or `budget=free`) finds nothing;
 *   - `found-search-empty`: a search finds nothing, and what it understood is
 *     still said;
 *   - `found-stated-facts` (yuvoy-app#195, R3-T6): Bengaluru and Coorg add
 *     cards whose pages state facts (`found-stated-fixtures.ts`), which
 *     `duration`, `setting`, `suits` and `difficulty` narrow, and whose pages
 *     send them in `stated`.
 *
 * `found-stated-closed` is that last world with `checkedCities` left `off`:
 * the same cards and pages, `stated` included, and every R3 parameter
 * ignored, so the app's own gate is what hides the rows and "As listed".
 *
 * Under all six every found route reads `CHECKED_NOW`, Friday 21 August
 * 2026 at 17:30 in Kolkata, and every mocked answer says it in its `Date`
 * header (`checked-clock.ts`), so the app's measured offset is one clock. While
 * `checkedCities` is closed to the caller, every R3 parameter is ignored
 * without being checked and the answer is R2's, `understood: []`.
 *
 * `explore-all` opens `explore` to everybody: Karnataka is on `GET /places`
 * too, open to all, a signed-out caller reads its cards and reports on them,
 * and `GET /events/index` lists the cards a search engine may index.
 *
 * ## Stored nothing
 *
 * Mobile takes a card down for everyone after a signed-in report on a card
 * nobody checked. Here that receipt is answered and nothing is remembered:
 * one Next server serves every Playwright worker, so a card taken down by one
 * test would vanish from another running beside it.
 */

export const foundHandlers = [
  http.get(url("/events"), async ({ request }) => {
    const failed = await commonFailure(request);
    if (failed) return failed;

    const scenario = scenarioOf(request);
    const params = new URL(request.url).searchParams;
    const key = params.get("destinationKey") ?? "";
    if (!DESTINATION_KEY.test(key)) {
      return envelope(
        "invalid_input",
        "destinationKey should look like karnataka/bengaluru",
        400,
        { destinationKey: key },
      );
    }
    // A closed enum: an unknown value is a 400, never an empty page.
    const category = params.get("category") ?? "";
    if (category && !CATEGORIES.has(category)) {
      return envelope("invalid_input", "that is not a category we have", 400, {
        category,
      });
    }
    const rawLimit = params.get("limit");
    const limit = rawLimit === null ? 20 : Number(rawLimit);
    if (!Number.isInteger(limit) || limit < 1 || limit > 30) {
      return envelope(
        "invalid_input",
        "limit must be a whole number between 1 and 30",
        400,
        { limit: rawLimit },
      );
    }
    const cursor = params.get("cursor");
    if (cursor !== null && cursor.length > 512) {
      return envelope("invalid_input", "that cursor is too long", 400);
    }

    // Unknown, bookable (Andaman) and not visible to this caller: one 404.
    const place = FOUND_PLACES[key];
    if (!place || !exploreOpenFor(request, scenario)) {
      return envelope("not_found", PLACE_NOT_VISIBLE, 404);
    }
    if (scenario === "found-error") return unavailable();
    if (scenario === "found-slow") await delay(1500);

    /*
      R3, only while `checkedCities` is open to the caller (the same rule as
      `explore`'s). Closed, nothing below is read, so nothing can be a 400.
    */
    const r3 = checkedStageOf(scenario) !== null && signedIn(request);
    const ask = r3 ? readR3(params) : NO_R3;
    if (refused(ask)) {
      return envelope("invalid_input", ask.message, 400, ask.details);
    }
    const filters = askKey(category, ask);

    const shape: FoundShape =
      scenario === "found-long" ||
      scenario === "found-stopped" ||
      scenario === "found-page-error"
        ? "long"
        : "full";
    const now = foundNow(scenario);
    const all =
      scenario === "found-empty"
        ? []
        : STATED_SCENARIOS.has(scenario)
          ? statedSamples(key)!
          : checkedStageOf(scenario) && key === BENGALURU
            ? checkedWeek()
            : foundSamples(key, now, shape)!;

    let offset = 0;
    if (cursor !== null) {
      if (scenario === "found-page-error") return unavailable();
      const at = readCursor(cursor, filters);
      if (at === "mismatch") {
        return envelope(
          "invalid_input",
          "that cursor was for different filters, so start again from the first page",
          400,
          { cursor: "minted under different filters" },
        );
      }
      if (at === null) {
        return envelope(
          "invalid_input",
          "that cursor can no longer be used, so start again from the first page",
          400,
        );
      }
      offset = at;
    }

    const found = narrow(
      all.filter((s) => !category || s.card.department === category),
      place,
      ask,
      now,
    );
    /*
      A home city lists only cards whose check counts: never a found card,
      nor one whose check lapsed (yuvoy-api `found_items_public.go`). So
      #195's "an unchecked card stating hard is never Hard" in a local place
      can only hold this way, by no such card being listed there at all.
    */
    const listed =
      place.kind === "local"
        ? found.samples.filter((s) => s.card.check.tier !== "found")
        : found.samples;
    let narrowed = scenario === "found-dept-empty" && category ? [] : listed;
    // R3's scenarios, each one shape of answer (see above).
    if (scenario === "found-weekend-thin" && ask.when === "weekend") {
      narrowed = narrowed.slice(0, 1);
    }
    if (scenario === "found-free-empty" && ask.free) narrowed = [];
    if (scenario === "found-search-empty" && ask.q) narrowed = [];
    // The card page's sentence is on `GET /events/{id}` only.
    const items = narrowed
      .slice(offset, offset + limit)
      .map((s) => listCard(s.card));
    const rest = offset + limit < narrowed.length;
    /*
      The server stopped, without a cursor and without claiming the end. On the
      FIRST page only, so the state is reachable in one request.
    */
    const stopped = scenario === "found-stopped" && cursor === null && rest;
    const body: FoundItemList = {
      place,
      items,
      complete: !rest && !stopped,
      // Spread rather than a `null`: the key is absent on the last page.
      ...(rest && !stopped
        ? { nextCursor: mintCursor(offset + limit, filters) }
        : {}),
      // Only when `when` applied: a day chip from the words has no window.
      ...(ask.when ? { window: windowOf(ask.when, now) } : {}),
      understood: found.understood,
    };
    return HttpResponse.json(body, { headers: headersAt(now) });
  }),

  /*
    Declared BEFORE `/events/:id`, which would otherwise take `index` for an
    id: MSW matches `:id` against any one path segment.

    Empty unless `explore` is at `all`, as the API's is, so the sitemap adds
    nothing in every other world, today's included.
  */
  http.get(url("/events/index"), async ({ request }) => {
    const failed = await commonFailure(request);
    if (failed) return failed;

    const exploreAll = exploreStageOf(scenarioOf(request)) === "all";
    const now = mockNow();
    const entries: FoundItemIndex["entries"] = [];
    if (exploreAll) {
      for (const [key, place] of Object.entries(FOUND_PLACES)) {
        for (const sample of foundSamples(key, now)!) {
          const detail = foundDetail(sample, place, true);
          if (!detail.indexable || !detail.check.checkedAt) continue;
          entries.push({
            id: detail.id,
            destinationKey: key,
            lastModified: detail.check.checkedAt,
          });
        }
      }
      // Latest change first.
      entries.sort((a, b) => b.lastModified.localeCompare(a.lastModified));
    }
    return HttpResponse.json({ entries } satisfies FoundItemIndex, {
      headers: mockHeaders(rid()),
    });
  }),

  /*
    One card's page. A merged card answers with the one kept, under ITS id,
    which is the only way the page can tell it should redirect; an ended one
    answers 200 with `status: ended` while it is kept. A malformed id, an
    unknown one and one this caller may not see are the same 404.
  */
  http.get(url("/events/:id"), async ({ request, params }) => {
    const failed = await commonFailure(request);
    if (failed) return failed;

    const scenario = scenarioOf(request);
    const asked = String(params.id).toLowerCase();
    if (!UUID.test(asked) || !exploreOpenFor(request, scenario)) {
      return envelope("not_found", EVENT_NOT_FOUND, 404);
    }
    if (scenario === "found-error") return unavailable();

    const now = foundNow(scenario);
    const merged =
      asked === FOUND_IDS.merged ||
      (scenario === "item-merged" && sampleById(asked, now) !== null);
    const found =
      r3SampleById(scenario, asked) ??
      sampleById(merged ? FOUND_IDS.mergedInto : asked, now);
    if (!found) return envelope("not_found", EVENT_NOT_FOUND, 404);

    const detail = foundDetail(
      found.sample,
      found.place,
      exploreStageOf(scenario) === "all",
    );
    return HttpResponse.json(
      scenario === "item-ended"
        ? { ...detail, status: "ended" as const, indexable: false }
        : detail,
      { headers: headersAt(now) },
    );
  }),

  /*
    A report (`reportEvent`), judged as the API judges it: one JSON object
    with `reason` and `note` and nothing else, a `deviceId` refused by name,
    a note of 3 or more characters when the reason is `other`.

    The receipt is the API's: signed in on a card nobody checked, taken down
    for everyone; signed in otherwise, hidden for you; signed out, always
    hidden on this device. Only a signed-in reporter has a `reference`.
  */
  http.post(url("/events/:id/reports"), async ({ request, params }) => {
    const failed = await commonFailure(request);
    if (failed) return failed;

    const scenario = scenarioOf(request);
    const id = String(params.id).toLowerCase();
    if (!UUID.test(id) || !exploreOpenFor(request, scenario)) {
      return envelope("not_found", CARD_NOT_SHOWING, 404);
    }

    let body: unknown;
    try {
      body = await request.json();
    } catch {
      body = null;
    }
    const fields =
      body && typeof body === "object" && !Array.isArray(body)
        ? (body as Record<string, unknown>)
        : null;
    if ("deviceId" in (fields ?? {})) {
      return envelope(
        "invalid_input",
        "deviceId is gone: send only reason and note, and keep hidden cards on the device",
        400,
        { deviceId: "no longer accepted" },
      );
    }
    const extra = Object.keys(fields ?? {}).filter(
      (k) => k !== "reason" && k !== "note",
    );
    if (
      !fields ||
      extra.length > 0 ||
      (fields.note !== undefined && typeof fields.note !== "string")
    ) {
      return envelope(
        "invalid_input",
        "send a report as one JSON object with only reason and note",
        400,
      );
    }
    const reason = fields.reason;
    if (typeof reason !== "string" || !REASONS.has(reason)) {
      return envelope("invalid_input", "that is not a reason we have", 400, {
        reason,
      });
    }
    const note = typeof fields.note === "string" ? fields.note.trim() : "";
    if ([...note].length > 500) {
      return envelope(
        "invalid_input",
        "a note can be at most 500 characters",
        400,
        { note: "at most 500 characters" },
      );
    }
    if (reason === "other" && [...note].length < 3) {
      return envelope(
        "invalid_input",
        "say what is wrong in a note of at least 3 characters when the reason is other",
        400,
        { note: "3 to 500 characters" },
      );
    }

    if (scenario === "report-throttled") {
      // Past a day's limit: the seconds until midnight UTC, on the mock clock.
      const now = mockNow();
      const midnight = Math.ceil((now + 1) / 86_400_000) * 86_400_000;
      return HttpResponse.json(
        {
          error: {
            code: "rate_limited",
            message: "You've sent a lot of reports today. Try again tomorrow.",
            requestId: rid(),
          },
        },
        {
          status: 429,
          headers: {
            ...mockHeaders(rid()),
            "Retry-After": String(
              Math.max(1, Math.ceil((midnight - now) / 1000)),
            ),
          },
        },
      );
    }
    if (scenario === "report-too-fast") {
      // The limiter in front of the route: no Retry-After, and its own words.
      return envelope(
        "rate_limited",
        "too many problem reports. Slow down and try again shortly",
        429,
      );
    }
    if (scenario === "report-gone") {
      return envelope("not_found", CARD_NOT_SHOWING, 404);
    }

    const found =
      r3SampleById(scenario, id) ?? sampleById(id, foundNow(scenario));
    if (!found) return envelope("not_found", CARD_NOT_SHOWING, 404);

    const unchecked = found.sample.card.check.tier === "found";
    const receipt: EventReportReceipt = !signedIn(request)
      ? { hidden: "you", message: REPORT_RECEIPTS.device }
      : unchecked
        ? {
            hidden: "everyone",
            message: REPORT_RECEIPTS.everyone,
            reference: REPORT_REFERENCE,
          }
        : {
            hidden: "you",
            message: REPORT_RECEIPTS.you,
            reference: REPORT_REFERENCE,
          };
    return HttpResponse.json(receipt, {
      status: 202,
      headers: mockHeaders(rid()),
    });
  }),
];
