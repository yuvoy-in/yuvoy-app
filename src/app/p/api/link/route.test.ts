import { describe, it, expect, vi, beforeEach } from "vitest";
import { HttpResponse } from "msw";
import {
  KEY,
  KEY_COOKIE,
  SERIES,
  TOKEN,
  apiError,
  guestRequest,
  keys,
  watchApi,
} from "../../../../test/plan-link";
import { guestMe, openPlanView } from "../../../../../mocks/plan-link-fixtures";

/**
 * "Link my reply to my account" (yuvoy-mobile#373): both the session and the
 * key are needed, each missing one is refused here without a call, and both
 * reach the API when present.
 */

const session = vi.hoisted(() => ({
  token: null as string | null,
  touched: 0,
  cleared: 0,
}));
vi.mock("@/lib/auth/session-cookie", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@/lib/auth/session-cookie")>()),
  readSessionCookie: async () => session.token,
  touchSessionCookie: async () => {
    session.touched += 1;
  },
  clearSessionCookie: async () => {
    session.cleared += 1;
  },
}));

const { POST } = await import("./route");

const linked = () =>
  HttpResponse.json(openPlanView("member", guestMe("Ravi", { linked: true })));

const held = { cookie: keys({ [SERIES]: KEY }) };

beforeEach(() => {
  session.token = "sess_919000000042";
  session.touched = 0;
  session.cleared = 0;
});

describe("linking a reply", () => {
  it("is a 401 with no session, without asking", async () => {
    session.token = null;
    const seen = watchApi(linked);
    const response = await POST(guestRequest("link", { token: TOKEN, seriesId: SERIES }, held));
    expect(response.status).toBe(401);
    expect((await response.json()).error.code).toBe("unauthorized");
    expect(seen).toHaveLength(0);
  });

  it("is a 404 with no key, since there is no reply here to link", async () => {
    const seen = watchApi(linked);
    const response = await POST(guestRequest("link", { token: TOKEN, seriesId: SERIES }));
    expect(response.status).toBe(404);
    expect(seen).toHaveLength(0);
  });

  it("sends the session and the key to linkPlanReplyToAccount", async () => {
    const seen = watchApi(linked);
    const response = await POST(guestRequest("link", { token: TOKEN, seriesId: SERIES }, held));
    expect(seen[0].method).toBe("POST");
    expect(seen[0].path).toBe(`/v1/plans/by-token/${TOKEN}/link-account`);
    expect(seen[0].headers.get("authorization")).toBe("Bearer sess_919000000042");
    expect(seen[0].headers.get("x-yuvoy-plan-key")).toBe(KEY);
    expect(response.status).toBe(200);
    expect((await response.json()).me.linked).toBe(true);
  });

  it("keeps the key and the session alive once linked", async () => {
    watchApi(linked);
    const response = await POST(guestRequest("link", { token: TOKEN, seriesId: SERIES }, held));
    expect(response.cookies.get(KEY_COOKIE)?.value).toBe(KEY);
    expect(session.touched).toBe(1);
  });

  it("passes already_answered on as the API wrote it", async () => {
    watchApi(() => apiError(409, "conflict", { reason: "already_answered" }));
    const response = await POST(guestRequest("link", { token: TOKEN, seriesId: SERIES }, held));
    expect(response.status).toBe(409);
    expect((await response.json()).error.details.reason).toBe("already_answered");
  });

  it("clears a session the API says is finished", async () => {
    watchApi(() => apiError(401, "unauthorized"));
    const response = await POST(guestRequest("link", { token: TOKEN, seriesId: SERIES }, held));
    expect(response.status).toBe(401);
    expect(session.cleared).toBe(1);
    expect(session.touched).toBe(0);
  });
});
