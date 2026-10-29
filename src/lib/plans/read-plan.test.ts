import { describe, it, expect, vi, beforeEach } from "vitest";
import { http, HttpResponse } from "msw";
import { server } from "../../../mocks/server";
import { PLAN_IDS, decidedPlanView, memberMe } from "../../../mocks/plan-fixtures";
import { readPlanForPage } from "./read-plan";

/**
 * The signed-in plan page's server read (yuvoy-app#193). The two rules worth
 * a test each: nothing is asked of the API without a session or with an id
 * that is not a plan id, and every answer lands on a state the page draws.
 */

const BASE = process.env.NEXT_PUBLIC_API_URL ?? "http://localhost:8099/v1";

const jar = vi.hoisted(() => ({ token: null as string | null }));
vi.mock("@/lib/auth/session-cookie", () => ({
  readSessionCookie: async () => jar.token,
}));

beforeEach(() => {
  jar.token = null;
});

function answer(status: number, body?: unknown) {
  const seen: { auth: string | null; path: string }[] = [];
  server.use(
    http.get(`${BASE}/plans/:id`, ({ request }) => {
      seen.push({
        auth: request.headers.get("authorization"),
        path: new URL(request.url).pathname,
      });
      return body === undefined
        ? new HttpResponse(null, { status })
        : HttpResponse.json(body as object, {
            status,
            headers: { "x-request-id": "req_plan" },
          });
    }),
  );
  return seen;
}

const envelope = (code: string) => ({
  error: { code, message: "x", requestId: "req_plan" },
});

describe("readPlanForPage", () => {
  it("asks nothing with no session", async () => {
    const seen = answer(200, decidedPlanView("member", memberMe()));
    expect(await readPlanForPage(PLAN_IDS.decided)).toEqual({ kind: "signed-out" });
    expect(seen).toEqual([]);
  });

  it("asks nothing for an id that is not a plan id, signed in or not", async () => {
    const seen = answer(200, decidedPlanView("member", memberMe()));
    expect(await readPlanForPage("not-a-plan")).toEqual({ kind: "not-found" });
    jar.token = "sess_abc";
    expect(await readPlanForPage("../me")).toEqual({ kind: "not-found" });
    expect(seen).toEqual([]);
  });

  it("reads the plan with the session", async () => {
    jar.token = "sess_abc";
    const plan = decidedPlanView("member", memberMe());
    const seen = answer(200, plan);
    expect(await readPlanForPage(PLAN_IDS.decided)).toEqual({ kind: "plan", plan });
    expect(seen).toEqual([
      { auth: "Bearer sess_abc", path: expect.stringContaining(`/plans/${PLAN_IDS.decided}`) },
    ]);
  });

  it("drops a guest key the API sent", async () => {
    jar.token = "sess_abc";
    answer(200, { ...decidedPlanView("member", memberMe()), guestKey: "gk_x" });
    const read = await readPlanForPage(PLAN_IDS.decided);
    expect(JSON.stringify(read)).not.toContain("gk_x");
  });

  it("reads 404 as not found, which is also plans closed to this reader", async () => {
    jar.token = "sess_abc";
    answer(404, envelope("not_found"));
    expect(await readPlanForPage(PLAN_IDS.unknown)).toEqual({ kind: "not-found" });
  });

  it("reads 401 as signed out", async () => {
    jar.token = "sess_old";
    answer(401, envelope("unauthorized"));
    expect(await readPlanForPage(PLAN_IDS.decided)).toEqual({ kind: "signed-out" });
  });

  it("reads 503 plans_unavailable as paused", async () => {
    jar.token = "sess_abc";
    answer(503, envelope("plans_unavailable"));
    expect(await readPlanForPage(PLAN_IDS.decided)).toEqual({
      kind: "paused",
      requestId: "req_plan",
    });
  });

  it("reads anything else as failed, with the request id", async () => {
    jar.token = "sess_abc";
    answer(500, envelope("internal_error"));
    expect(await readPlanForPage(PLAN_IDS.decided)).toEqual({
      kind: "failed",
      status: 500,
      requestId: "req_plan",
    });
    // A 200 that is not a plan.
    answer(200, { id: PLAN_IDS.decided });
    expect(await readPlanForPage(PLAN_IDS.decided)).toMatchObject({ kind: "failed" });
  });

  it("reads no answer as failed", async () => {
    jar.token = "sess_abc";
    server.use(http.get(`${BASE}/plans/:id`, () => HttpResponse.error()));
    expect(await readPlanForPage(PLAN_IDS.decided)).toEqual({ kind: "failed" });
  });
});
