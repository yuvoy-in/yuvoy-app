import { http, HttpResponse } from "msw";
import type { components } from "../src/lib/api/schema.gen";
import { EXPERIENCE_DETAIL, mockHeaders, mockNow } from "./fixtures";
import { CREATOR_LINKS } from "./creator-link-fixtures";

/**
 * A traveller's share links (yuvoy-app#207, R12-T2): `GET` and
 * `POST /me/creator-links`, behind the `creator` release.
 *
 * With no scenario `creator` is `off`, as in production, and both routes
 * answer `404` as the API does outside the release. Each scenario below opens
 * it at `staff`:
 *
 *   - `creator-links`: the caller is staff, `creatorToolsOn` is true and the
 *     list holds `CREATOR_LINKS`, one with bookings and one whose listing is
 *     no longer listed. A new link is `201` and the same experience again is
 *     `200` with the same link. Only the trip the traveller went on
 *     (`PAST_TRIP`, the completed sunset cruise) gets one: anything else,
 *     the missed birdwatching trip included, is `403 not_went`. The web
 *     offers no button on a `no_show`, so that refusal has a scenario too.
 *   - `creator-links-empty`: the same, with no links yet.
 *   - `creator-links-not-went`, `creator-links-not-open-yet`,
 *     `creator-links-rate-limited`, `creator-links-down`: `creator-links`,
 *     except that a new link is refused with `403 not_went`,
 *     `403 not_open_yet`, `429 rate_limited` or `503`. Down fails the list
 *     as well.
 *   - `creator-tools-off`: the caller is staff with `creatorToolsOn` false
 *     and no links, so Your links has nothing to show.
 *   - `creator-outside`: `creator` at `staff` and the caller is not staff,
 *     with `creatorToolsOn` true: both routes are `404`.
 *
 * The links made are kept per session (the `Authorization` header), so two
 * e2e projects signed in as different numbers never see each other's.
 */

type CreatorLink = components["schemas"]["CreatorLink"];
type Experience = components["schemas"]["Experience"];

const BASE = process.env.NEXT_PUBLIC_API_URL ?? "http://localhost:8099/v1";
const url = (p: string) => `${BASE}${p}`;

let seq = 0;
const rid = () =>
  `01J${(++seq).toString(36).toUpperCase().padStart(6, "0")}MOCK`;

function envelope(code: string, message: string, status: number) {
  return HttpResponse.json(
    { error: { code, message, requestId: rid() } },
    { status, headers: mockHeaders(rid()) },
  );
}

function scenarioOf(request: Request): string {
  return (
    request.headers.get("x-yuvoy-scenario") ??
    new URL(request.url).searchParams.get("__scenario") ??
    "ok"
  );
}

/** The scenarios that open `creator` at `staff`. See above for each. */
export const CREATOR_SCENARIOS: ReadonlySet<string> = new Set([
  "creator-links",
  "creator-links-empty",
  "creator-links-not-went",
  "creator-links-not-open-yet",
  "creator-links-rate-limited",
  "creator-links-down",
  "creator-tools-off",
  "creator-outside",
]);

/** The stage a scenario gives `creator`; null is `off`. */
export function creatorStageOf(scenario: string): "staff" | null {
  return CREATOR_SCENARIOS.has(scenario) ? "staff" : null;
}

/** Whether `GET /me` answers `cohort: staff` under the scenario. */
export function creatorStaffCohort(scenario: string): boolean {
  return creatorStageOf(scenario) !== null && scenario !== "creator-outside";
}

/** `creatorToolsOn` on `GET /me`: false unless a scenario turns it on. */
export function creatorToolsOnFor(scenario: string): boolean {
  return creatorStageOf(scenario) !== null && scenario !== "creator-tools-off";
}

/**
 * The two listings past trips name that the catalog fixtures do not have, so
 * Get my link can read each one's id by its slug as the trip carries it
 * (`getExperience`). Not in any feed: only the trips link to them.
 */
const TRIP_ONLY_EXPERIENCES: Record<string, Experience> = {
  "sunset-cruise-off-radhanagar": {
    ...EXPERIENCE_DETAIL["snorkel-elephant-beach"],
    id: "exp_sunset_cruise",
    slug: "sunset-cruise-off-radhanagar",
    title: "Sunset cruise off Radhanagar",
  },
  "dawn-birdwatching-at-chidiya-tapu": {
    ...EXPERIENCE_DETAIL["mangrove-kayak-at-dawn"],
    id: "exp_birdwatching",
    slug: "dawn-birdwatching-at-chidiya-tapu",
    title: "Dawn birdwatching at Chidiya Tapu",
    location: "Port Blair",
    destinationKey: "andaman/port_blair",
  },
};

/** The experiences this traveller went on, once over: the completed trip. */
const WENT_ON = new Set(["exp_sunset_cruise"]);

/** Links made in this process, newest first, by session. */
const made = new Map<string, CreatorLink[]>();

function linksOf(auth: string, scenario: string): CreatorLink[] {
  const base =
    scenario === "creator-links-empty" || scenario === "creator-tools-off"
      ? []
      : CREATOR_LINKS;
  return [...(made.get(`${scenario}|${auth}`) ?? []), ...base];
}

/** A code the same every time for one session and listing. */
function codeFor(auth: string, experienceId: string): string {
  const alphabet = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789";
  let h = 2166136261;
  for (const ch of `${auth}|${experienceId}`) {
    h = Math.imul(h ^ ch.charCodeAt(0), 16777619) >>> 0;
  }
  let code = "";
  for (let i = 0; i < 8; i++) {
    code += alphabet[h % alphabet.length];
    h = Math.imul(h ^ (i + 1), 2654435761) >>> 0;
  }
  return `C-${code}`;
}

/**
 * The refusals both routes share, in the API's words (yuvoy-mobile#389):
 * no session, a session that is not a full sign-in, and the release closed
 * to the caller.
 */
function refused(request: Request, scenario: string): Response | null {
  const auth = request.headers.get("authorization");
  if (!auth) {
    return envelope(
      "unauthorized",
      "Sign in with your WhatsApp number to see your trips.",
      401,
    );
  }
  // A recovery link, not a session (the verify handler mints `sess_`).
  if (!auth.includes("Bearer sess_")) {
    return envelope(
      "unauthorized",
      "Sign in to get a link to something you went on.",
      401,
    );
  }
  if (!creatorStaffCohort(scenario)) {
    return envelope("not_found", "We could not find your links.", 404);
  }
  return null;
}

const UNAVAILABLE = "Links cannot be made on this service right now.";

export const creatorLinkHandlers = [
  /*
    Answers only the trip-only listings above and falls through for every
    other slug, so the catalog's own handler is untouched.
  */
  http.get(url("/experiences/:slug"), ({ params }) => {
    const detail = TRIP_ONLY_EXPERIENCES[String(params.slug)];
    if (!detail) return undefined;
    return HttpResponse.json(
      { ...detail, bookable: true },
      { headers: mockHeaders(rid()) },
    );
  }),

  // "Never cached": the counts move with every open.
  http.get(url("/me/creator-links"), ({ request }) => {
    const scenario = scenarioOf(request);
    const no = refused(request, scenario);
    if (no) return no;
    if (scenario === "creator-links-down") {
      return envelope("unavailable", UNAVAILABLE, 503);
    }
    const auth = request.headers.get("authorization")!;
    return HttpResponse.json(
      { items: linksOf(auth, scenario) },
      { headers: { ...mockHeaders(rid()), "cache-control": "no-store" } },
    );
  }),

  http.post(url("/me/creator-links"), async ({ request }) => {
    const scenario = scenarioOf(request);
    const no = refused(request, scenario);
    if (no) return no;

    type Body = { experienceId?: unknown; eventId?: unknown };
    let body: Body | null = null;
    try {
      body = (await request.json()) as Body | null;
    } catch {
      body = null;
    }
    const experienceId =
      typeof body?.experienceId === "string" ? body.experienceId : null;
    const eventId = typeof body?.eventId === "string" ? body.eventId : null;
    if (!experienceId && !eventId) {
      return envelope(
        "invalid_input",
        "Send experienceId or eventId, as the API contract describes it.",
        400,
      );
    }
    if (experienceId && eventId) {
      return envelope(
        "invalid_input",
        "Send exactly one of experienceId and eventId.",
        400,
      );
    }

    if (scenario === "creator-links-down") {
      return envelope("unavailable", UNAVAILABLE, 503);
    }

    const auth = request.headers.get("authorization")!;
    const targetId = (experienceId ?? eventId)!;
    // One link per person per listing: asking again is the same link.
    const had = linksOf(auth, scenario).find((l) => l.target.id === targetId);
    if (had) {
      return HttpResponse.json(had, {
        status: 200,
        headers: mockHeaders(rid()),
      });
    }

    if (scenario === "creator-links-not-open-yet") {
      return envelope(
        "not_open_yet",
        "You can get a link once the event is over.",
        403,
      );
    }
    // A link already had is never counted, so only a new one reaches this.
    if (scenario === "creator-links-rate-limited") {
      return envelope(
        "rate_limited",
        "You have made 20 links today. You can make more tomorrow.",
        429,
      );
    }
    if (
      scenario === "creator-links-not-went" ||
      !experienceId ||
      !WENT_ON.has(experienceId)
    ) {
      return envelope(
        "not_went",
        "You can get a link only to something you went on, once it is over.",
        403,
      );
    }

    const experience = Object.values(TRIP_ONLY_EXPERIENCES).find(
      (e) => e.id === experienceId,
    )!;
    const code = codeFor(auth, experienceId);
    const link: CreatorLink = {
      code,
      link: `https://app.yuvoy.in/go/${code}`,
      target: {
        kind: "experience",
        id: experienceId,
        slug: experience.slug,
        title: experience.title,
      },
      createdAt: new Date(mockNow()).toISOString(),
      opens30Days: 0,
      opensTotal: 0,
      bookings: 0,
    };
    const key = `${scenario}|${auth}`;
    made.set(key, [link, ...(made.get(key) ?? [])]);
    return HttpResponse.json(link, {
      status: 201,
      headers: mockHeaders(rid()),
    });
  }),
];

/** Test-only: forget the links made between cases. */
export function __resetCreatorLinkMocks(): void {
  made.clear();
}
