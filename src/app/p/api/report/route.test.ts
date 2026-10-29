import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { HttpResponse } from "msw";
import {
  KEY,
  OTHER_KEY,
  OTHER_SERIES,
  SERIES,
  TOKEN,
  apiError,
  guestRequest,
  keys,
  watchApi,
} from "../../../../test/plan-link";

/**
 * "Report this plan" by link (yuvoy-mobile#373, R7-T4): anybody with the
 * link may report, so the key and the session go when there are any and
 * neither is required; `202` comes back empty.
 */

const session = vi.hoisted(() => ({ token: null as string | null }));
vi.mock("@/lib/auth/session-cookie", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@/lib/auth/session-cookie")>()),
  readSessionCookie: async () => session.token,
  touchSessionCookie: async () => {},
  clearSessionCookie: async () => {},
}));

const { POST } = await import("./route");

const REPORT = {
  reason: "harassment",
  personName: "Kiran",
  note: "Rude in the group.",
};
const received = () => new HttpResponse(null, { status: 202 });

beforeEach(() => {
  session.token = null;
});
afterEach(() => vi.unstubAllEnvs());

describe("reporting a plan", () => {
  it("sends the report as it is to reportPlanByLink, and answers 202 empty", async () => {
    const seen = watchApi(received);
    const response = await POST(
      guestRequest("report", { token: TOKEN, report: REPORT }),
    );
    expect(seen[0].method).toBe("POST");
    expect(seen[0].path).toBe(`/v1/plans/by-token/${TOKEN}/reports`);
    expect(JSON.parse(seen[0].body)).toEqual(REPORT);
    expect(response.status).toBe(202);
    expect(await response.text()).toBe("");
  });

  it("takes a visitor's report: no key and no session", async () => {
    const seen = watchApi(received);
    await POST(
      guestRequest("report", { token: TOKEN, report: { reason: "spam" } }),
    );
    expect(seen[0].headers.get("x-yuvoy-plan-key")).toBeNull();
    expect(seen[0].headers.get("authorization")).toBeNull();
  });

  it("sends the key for the series named, and the session", async () => {
    session.token = "sess_919000000042";
    const seen = watchApi(received);
    await POST(
      guestRequest(
        "report",
        { token: TOKEN, seriesId: SERIES, report: REPORT },
        { cookie: keys({ [OTHER_SERIES]: OTHER_KEY, [SERIES]: KEY }) },
      ),
    );
    expect(seen[0].headers.get("x-yuvoy-plan-key")).toBe(KEY);
    expect(seen[0].headers.get("authorization")).toBe(
      "Bearer sess_919000000042",
    );
  });

  it("from the 404 page, which never learned the series, sends the only key held", async () => {
    const seen = watchApi(received);
    await POST(
      guestRequest(
        "report",
        { token: TOKEN, report: REPORT },
        { cookie: keys({ [SERIES]: KEY }) },
      ),
    );
    expect(seen[0].headers.get("x-yuvoy-plan-key")).toBe(KEY);
  });

  it("refuses a body with no report in it, without asking", async () => {
    const seen = watchApi(received);
    const response = await POST(guestRequest("report", { token: TOKEN }));
    expect(response.status).toBe(400);
    expect(seen).toHaveLength(0);
  });

  it.each([
    [400, "invalid_input", { personName: "That name is not on this plan." }],
    [404, "not_found", undefined],
    [429, "rate_limited", undefined],
    [503, "plans_unavailable", undefined],
  ])("passes a %i %s on as the API wrote it", async (status, code, details) => {
    watchApi(() => apiError(status, code, details));
    const response = await POST(
      guestRequest("report", { token: TOKEN, report: REPORT }),
    );
    expect(response.status).toBe(status);
    const body = await response.json();
    expect(body.error.code).toBe(code);
    expect(body.error.details).toEqual(details);
  });
});

describe("against the by-link mocks", () => {
  beforeEach(() => vi.stubEnv("NEXT_PUBLIC_API_MOCKING", "enabled"));

  it("refuses a name that is not on the plan, and a note over 300", async () => {
    const stranger = await POST(
      guestRequest("report", {
        token: TOKEN,
        report: { reason: "other", personName: "Zed" },
      }),
    );
    expect((await stranger.json()).error.details.personName).toBeTruthy();
    const long = await POST(
      guestRequest("report", {
        token: TOKEN,
        report: { reason: "other", note: "x".repeat(301) },
      }),
    );
    expect(long.status).toBe(400);
  });

  it("is paused like every plan route under plans-paused", async () => {
    const response = await POST(
      guestRequest(
        "report",
        { token: TOKEN, report: REPORT },
        { headers: { "x-yuvoy-scenario": "plans-paused" } },
      ),
    );
    expect(response.status).toBe(503);
    expect((await response.json()).error.code).toBe("plans_unavailable");
  });
});
