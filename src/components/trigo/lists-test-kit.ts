import { http, HttpResponse } from "msw";
import type { DateAlert, TripDraft } from "@/lib/trigo/lists-words";
import { server } from "../../../mocks/server";
import { __signInAppRouteMock } from "../../../mocks/app-route-handlers";

/**
 * Shared answers for the date alerts and Drafts unit tests (yuvoy-app#220).
 * The lists' routes also have default answers in `trigo-list-handlers.ts`;
 * a test that cares what the list holds answers it here.
 */

export const BASE =
  process.env.NEXT_PUBLIC_API_URL ?? "http://localhost:8099/v1";

/** The API's error envelope, at a status. */
export function refuse(status: number, code: string, message: string) {
  return HttpResponse.json(
    { error: { code, message, requestId: "01JTESTLISTS" } },
    { status },
  );
}

export const noContent = () => new HttpResponse(null, { status: 204 });

/** `GET /app-config` with `trigo` at a stage, and `GET /me` answering. */
export function release(stage: "off" | "all" = "all") {
  server.use(
    http.get(`${BASE}/app-config`, () =>
      HttpResponse.json({
        minimumVersion: { ios: "0.0.0", android: "0.0.0" },
        features: { payments: "coming_soon", inviteOnly: false },
        support: { whatsappE164: null, hours: "" },
        deliveryHost: null,
        releases: { trigo: stage },
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
      }),
    ),
  );
}

/** Signed in, with `trigo` at a stage. */
export function signedIn(stage: "off" | "all" = "all") {
  release(stage);
  __signInAppRouteMock("sess_test");
}

type Answer = () => Response | Promise<Response>;

/** How often a route was asked, and the ids a change was asked for. */
export type Asked = { count: number; ids: string[] };

/**
 * Answers one route with each answer in turn (the last one repeats), and
 * counts the asks.
 */
function serve(
  method: "get" | "delete",
  path: string,
  answers: Answer[],
): Asked {
  const asked: Asked = { count: 0, ids: [] };
  server.use(
    http[method](`${BASE}${path}`, ({ params }) => {
      asked.count += 1;
      if (typeof params.id === "string") asked.ids.push(params.id);
      return answers[Math.min(asked.count - 1, answers.length - 1)]();
    }),
  );
  return asked;
}

const alertsOf = (alerts: DateAlert[]) => () => HttpResponse.json({ alerts });
const draftsOf = (drafts: TripDraft[]) => () => HttpResponse.json({ drafts });

/** `GET /me/date-alerts`: each list in turn, or an answer of its own. */
export function serveAlerts(...answers: (DateAlert[] | Answer)[]): Asked {
  return serve(
    "get",
    "/me/date-alerts",
    answers.map((a) => (typeof a === "function" ? a : alertsOf(a))),
  );
}

/** `GET /me/trip-drafts`: each list in turn, or an answer of its own. */
export function serveDrafts(...answers: (TripDraft[] | Answer)[]): Asked {
  return serve(
    "get",
    "/me/trip-drafts",
    answers.map((a) => (typeof a === "function" ? a : draftsOf(a))),
  );
}

/** `DELETE /me/date-alerts/{id}`. */
export function serveStop(...answers: Answer[]): Asked {
  return serve("delete", "/me/date-alerts/:id", answers);
}

/** `DELETE /me/trip-drafts/{id}`. */
export function serveDelete(...answers: Answer[]): Asked {
  return serve("delete", "/me/trip-drafts/:id", answers);
}

/** Every route of the lists, counting, for a test that says none was read. */
export function countEveryList(): Asked[] {
  return [
    serveAlerts([]),
    serveDrafts([]),
    serveStop(noContent),
    serveDelete(noContent),
  ];
}
