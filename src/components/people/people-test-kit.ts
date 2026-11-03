import { http, HttpResponse, type JsonBodyType } from "msw";
import type { PeopleHome } from "@/lib/people/people-words";
import { server } from "../../../mocks/server";
import { __signInAppRouteMock } from "../../../mocks/app-route-handlers";

/**
 * Shared answers for the People unit tests (yuvoy-app#222). Every endpoint a
 * test reaches is answered here or in the test itself: the server refuses
 * anything unmocked.
 */

export const BASE =
  process.env.NEXT_PUBLIC_API_URL ?? "http://localhost:8099/v1";

/** The API's error envelope, at a status. */
export function refuse(status: number, code: string, message: string) {
  return HttpResponse.json({ error: { code, message } }, { status });
}

/** A request one handler saw: its body (or null) and its query. */
export type Seen = { body: unknown; query: URLSearchParams };

type Method = "get" | "post" | "put" | "patch" | "delete";

/**
 * Answers one endpoint with each answer in turn (the last one repeats) and
 * keeps every request it saw.
 */
export function answer(
  method: Method,
  path: string,
  ...answers: (() => Response | Promise<Response>)[]
): Seen[] {
  const seen: Seen[] = [];
  server.use(
    http[method](`${BASE}${path}`, async ({ request }) => {
      const text = await request.text();
      seen.push({
        body: text ? JSON.parse(text) : null,
        query: new URL(request.url).searchParams,
      });
      const next = answers[Math.min(seen.length - 1, answers.length - 1)];
      return next();
    }),
  );
  return seen;
}

/** A JSON answer, for `answer`. */
export const json =
  (body: JsonBodyType, status = 200) =>
  () =>
    HttpResponse.json(body, { status });

/** A `204`, for `answer`. */
export const noContent = () => () => new HttpResponse(null, { status: 204 });

/** The People home with only what a test varies. */
export function home(over: Partial<PeopleHome> = {}): PeopleHome {
  return {
    ageConfirmed: true,
    standing: "ok",
    sharing: "friends",
    needsName: false,
    requestEmails: true,
    friendCount: 0,
    requestsIn: [],
    requestsOut: [],
    friendLink: null,
    privateUpcomingGoing: 0,
    ...over,
  };
}

/**
 * `GET /app-config` with `people` at a stage, and `GET /me` (which the
 * session check reads) with `people` as given, or without it for null.
 */
export function account({
  stage = "all",
  people = { standing: "ok", requestsWaiting: 0 },
}: {
  stage?: "off" | "staff" | "all";
  people?: { standing: string; requestsWaiting: number } | null;
} = {}) {
  server.use(
    http.get(`${BASE}/app-config`, () =>
      HttpResponse.json({
        minimumVersion: { ios: "0.0.0", android: "0.0.0" },
        features: { payments: "coming_soon", inviteOnly: false },
        support: { whatsappE164: null, hours: "" },
        deliveryHost: null,
        releases: { people: stage },
      }),
    ),
    http.get(`${BASE}/me`, () =>
      HttpResponse.json({
        phone: "+919000000000",
        name: "Asha Menon",
        email: null,
        interests: [],
        onboardingRequired: false,
        memberSince: null,
        trips: { total: 0, upcoming: 0, completed: 0 },
        reviews: { count: 0 },
        support: { whatsappE164: null, hours: "" },
        cohort: null,
        ...(people ? { people } : {}),
      }),
    ),
    // A sign-out tells the API; nothing a test reads.
    http.delete(
      `${BASE}/me/session`,
      () => new HttpResponse(null, { status: 204 }),
    ),
  );
}

/** Signed in, with `GET /me` answering. */
export function signedIn(
  people?: { standing: string; requestsWaiting: number } | null,
) {
  account(people === undefined ? {} : { people });
  __signInAppRouteMock("sess_test");
}

/** An empty first page of friends, for screens that do not test the list. */
export function noFriends() {
  return answer("get", "/me/friends", json({ friends: [], nextCursor: null }));
}

/** A person who is not a friend. */
export function person(n: number, shortName: string) {
  return {
    personId: `00000000-0000-4000-8000-${String(n).padStart(12, "0")}`,
    shortName,
    initial: shortName[0],
  };
}

/** A friend as `GET /me/friends` lists them. */
export function friend(n: number, name: string) {
  return {
    personId: `00000000-0000-4000-8000-${String(n).padStart(12, "0")}`,
    name,
    firstName: name.split(" ")[0],
    initial: name[0],
    since: "2026-10-20T10:00:00Z",
  };
}

/** A friend request, incoming unless said. */
export function request(
  n: number,
  shortName: string,
  over: Record<string, unknown> = {},
) {
  return {
    requestId: `10000000-0000-4000-8000-${String(n).padStart(12, "0")}`,
    direction: "incoming" as const,
    person: person(n, shortName),
    source: "friend_link" as const,
    requestedAt: "2026-10-30T10:00:00Z",
    ...over,
  };
}
