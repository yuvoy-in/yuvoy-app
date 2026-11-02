import { http, HttpResponse } from "msw";
import { server } from "../../../mocks/server";
import type { Badge, BadgeProgress, LifeEntry, MySettings } from "@/lib/me/types";

/*
  What the Me tests share (yuvoy-mobile#444): the app config with `me` (and
  `tables`) open, small builders for the shapes the `me` routes answer, and
  stand-ins for those routes that count what reached them and keep each body,
  so a test can say exactly what was sent, and that nothing was.

  Each test installs its own answers with `server.use`; `mocks/` is not
  touched. Stage `all` needs no cohort, so no `/me` read is needed to open it.
*/

export const BASE = process.env.NEXT_PUBLIC_API_URL ?? "http://localhost:8099/v1";

/** `GET /app-config` with the given release stages; the rest are off. */
export function releases(stages: Record<string, string>) {
  server.use(
    http.get(`${BASE}/app-config`, () =>
      HttpResponse.json({
        minimumVersion: { ios: "0.0.0", android: "0.0.0" },
        features: { payments: "coming_soon", inviteOnly: false },
        support: { whatsappE164: null, hours: "" },
        deliveryHost: null,
        releases: stages,
      }),
    ),
  );
}

/** Me open to everybody, with tables open too unless said otherwise. */
export function openMe(tables = true) {
  releases(tables ? { me: "all", tables: "all" } : { me: "all" });
}

export const TRIP_ID = "trip:11111111-1111-4111-8111-111111111111";
export const WENT_ID = "went:22222222-2222-4222-8222-222222222222";
export const PLAN_ID = "plan:33333333-3333-4333-8333-333333333333";
export const EVENT_ID = "44444444-4444-4444-8444-444444444444";
export const ASKED_EVENT = "55555555-5555-4555-8555-555555555555";
export const PHOTO = "https://media.yuvoy.test/private/photo.jpg?sig=abc";

export function trip(over: Partial<LifeEntry> = {}): LifeEntry {
  return {
    entryId: TRIP_ID,
    kind: "trip",
    title: "Try-dive at Nemo Reef",
    // 10:00 in the market's zone on 16 Sep 2026.
    happenedAt: "2026-09-16T04:30:00Z",
    photoUrl: null,
    destinationKey: "andaman/havelock",
    category: "adventure",
    experienceSlug: "try-dive-nemo-reef",
    proof: "checked_in",
    checked: true,
    rating: 4,
    visibility: "friends",
    cheers: 2,
    cheeredBy: [
      { personId: "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa", shortName: "Priya S.", initial: "P" },
      { personId: "bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb", shortName: "Ravi K.", initial: "R" },
    ],
    ...over,
  };
}

export function went(over: Partial<LifeEntry> = {}): LifeEntry {
  return {
    entryId: WENT_ID,
    kind: "went",
    title: "Jazz at the Fort",
    happenedAt: "2026-09-02T14:00:00Z",
    photoUrl: null,
    destinationKey: null,
    category: null,
    eventId: EVENT_ID,
    proof: "said_you_went",
    checked: false,
    rating: null,
    visibility: "friends",
    cheers: 1,
    cheeredBy: [],
    ...over,
  };
}

export function plan(over: Partial<LifeEntry> = {}): LifeEntry {
  return {
    entryId: PLAN_ID,
    kind: "plan",
    title: "Sunday breakfast crew",
    happenedAt: "2026-08-30T03:00:00Z",
    photoUrl: null,
    destinationKey: null,
    category: null,
    proof: "with_friends",
    checked: false,
    rating: null,
    visibility: "only_me",
    cheers: 0,
    cheeredBy: [],
    ...over,
  };
}

/** One page of `GET /me/life-list`. */
export function page(
  entries: LifeEntry[],
  over: {
    didYouGo?: { eventId: string; title: string; startsAt: string }[];
    nextCursor?: string | null;
    done?: number;
  } = {},
) {
  return {
    entries,
    didYouGo: over.didYouGo ?? [],
    counts: { done: over.done ?? entries.length, checked: 0 },
    nextCursor: over.nextCursor ?? null,
  };
}

export function badge(over: Partial<Badge> = {}): Badge {
  return {
    key: "first_trip",
    name: "First trip",
    emoji: "🧭",
    description: "Your first trip with Yuvoy.",
    earnedAt: "2026-09-16T10:00:00Z",
    checked: true,
    seen: true,
    evidence: [
      { entryId: TRIP_ID, title: "Try-dive at Nemo Reef", happenedAt: "2026-09-16T04:30:00Z" },
    ],
    ...over,
  };
}

export function progress(over: Partial<BadgeProgress> = {}): BadgeProgress {
  return {
    key: "monsoon_three",
    name: "Monsoon three",
    emoji: "🌧️",
    description: "Three things done this monsoon.",
    have: 1,
    need: 3,
    endsOn: "2026-09-30",
    ...over,
  };
}

export function settings(over: Partial<MySettings> = {}): MySettings {
  return {
    analyticsConsent: null,
    reminderEmails: true,
    didYouGoEmails: true,
    languages: ["en"],
    showWomenOnlyTables: true,
    ...over,
  };
}

/** A route's stand-in: how often it was asked, and each body it was sent. */
export type Seen = { count: number; bodies: unknown[]; urls: string[] };

const seen = (): Seen => ({ count: 0, bodies: [], urls: [] });

async function note(at: Seen, request: Request) {
  at.count += 1;
  at.urls.push(request.url);
  if (request.method !== "GET") {
    try {
      at.bodies.push(await request.json());
    } catch {
      at.bodies.push(undefined);
    }
  }
}

type Answer = (request: Request) => Response | Promise<Response>;
const json = (body: unknown, status = 200) => () => HttpResponse.json(body, { status });
const failure = (status: number) => () =>
  HttpResponse.json(
    { error: { code: status === 404 ? "not_found" : "unavailable", message: "No." } },
    { status },
  );

/**
 * Stands in for every `me` route Me calls. Pass an answer (a body, or a
 * status number for a failure) per route; any not given answers as a plain
 * account would.
 */
export function meRoutes(
  over: {
    list?: unknown | number | Answer;
    badges?: unknown | number | Answer;
    seen?: number;
    settings?: unknown | number;
    patchSettings?: number;
    patchEntry?: number;
    patchWent?: number;
    answer?: number;
  } = {},
) {
  const at = {
    list: seen(),
    badges: seen(),
    seen: seen(),
    settings: seen(),
    patchSettings: seen(),
    patchEntry: seen(),
    patchWent: seen(),
    answer: seen(),
  };
  const pick = (v: unknown, fallback: unknown): Answer =>
    typeof v === "function"
      ? (v as Answer)
      : typeof v === "number"
        ? failure(v)
        : json(v === undefined ? fallback : v);

  const list = pick(over.list, page([trip()]));
  // A body (or none) is held, as the server would: Nice marks its badges
  // seen and Languages changes what the next read answers, so a test can
  // render again and see what a restart would.
  let heldBadges = (over.badges ?? { earned: [badge()], inProgress: [] }) as {
    earned: Badge[];
    inProgress: BadgeProgress[];
  };
  const badges: Answer =
    typeof over.badges === "function" || typeof over.badges === "number"
      ? pick(over.badges, undefined)
      : () => HttpResponse.json(heldBadges);
  let held = (over.settings && typeof over.settings === "object"
    ? over.settings
    : settings()) as MySettings;

  server.use(
    http.get(`${BASE}/me/life-list`, async ({ request }) => {
      await note(at.list, request);
      return list(request);
    }),
    http.get(`${BASE}/me/badges`, async ({ request }) => {
      await note(at.badges, request);
      return badges(request);
    }),
    http.post(`${BASE}/me/badges/seen`, async ({ request }) => {
      await note(at.seen, request);
      if (over.seen) return failure(over.seen)();
      const keys = (at.seen.bodies.at(-1) as { keys?: string[] } | undefined)?.keys ?? [];
      heldBadges = {
        ...heldBadges,
        earned: heldBadges.earned.map((b) => (keys.includes(b.key) ? { ...b, seen: true } : b)),
      };
      return new HttpResponse(null, { status: 204 });
    }),
    http.get(`${BASE}/me/settings`, async ({ request }) => {
      await note(at.settings, request);
      return typeof over.settings === "number"
        ? failure(over.settings)()
        : HttpResponse.json(held);
    }),
    http.patch(`${BASE}/me/settings`, async ({ request }) => {
      await note(at.patchSettings, request);
      if (over.patchSettings) return failure(over.patchSettings)();
      held = { ...held, ...(at.patchSettings.bodies.at(-1) as Partial<MySettings>) };
      return HttpResponse.json(held);
    }),
    http.patch(`${BASE}/me/life-list/:entryId`, async ({ request, params }) => {
      await note(at.patchEntry, request);
      if (over.patchEntry) return failure(over.patchEntry)();
      const body = at.patchEntry.bodies.at(-1) as { visibility: LifeEntry["visibility"] };
      return HttpResponse.json(
        trip({ entryId: decodeURIComponent(String(params.entryId)), ...body }),
      );
    }),
    http.patch(`${BASE}/me/went/:eventId`, async ({ request }) => {
      await note(at.patchWent, request);
      if (over.patchWent) return failure(over.patchWent)();
      return HttpResponse.json(at.patchWent.bodies.at(-1));
    }),
    http.post(`${BASE}/me/went/:eventId`, async ({ request }) => {
      await note(at.answer, request);
      if (over.answer) return failure(over.answer)();
      // The contract's 200 WentAnswer, though the page reads none of it.
      const went = (at.answer.bodies.at(-1) as { went?: boolean } | undefined)?.went ?? true;
      return HttpResponse.json({
        went,
        rating: null,
        tags: [],
        proof: "self",
        answeredAt: "2026-10-30T12:00:00Z",
        visibility: "friends",
      });
    }),
  );
  return at;
}
