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

/**
 * "Remove my reply" by link (yuvoy-mobile#373): the key goes with the call,
 * a `204` comes back empty and takes the key's cookie with it, and the
 * planner's refusal reaches the page as the API wrote it.
 */

const session = vi.hoisted(() => ({ token: null as string | null }));
vi.mock("@/lib/auth/session-cookie", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@/lib/auth/session-cookie")>()),
  readSessionCookie: async () => session.token,
  touchSessionCookie: async () => {},
  clearSessionCookie: async () => {},
}));

const { POST } = await import("./route");

const gone = () => new HttpResponse(null, { status: 204 });

beforeEach(() => {
  session.token = null;
});

describe("removing a reply", () => {
  it("asks leaveByLink with the key kept for the series", async () => {
    const seen = watchApi(gone);
    await POST(
      guestRequest("leave", { token: TOKEN, seriesId: SERIES }, { cookie: keys({ [SERIES]: KEY }) }),
    );
    expect(seen[0].method).toBe("DELETE");
    expect(seen[0].path).toBe(`/v1/plans/by-token/${TOKEN}/reply`);
    expect(seen[0].headers.get("x-yuvoy-plan-key")).toBe(KEY);
    expect(seen[0].body).toBe("");
  });

  it("answers 204 with nothing in it, and forgets the key", async () => {
    watchApi(gone);
    const response = await POST(
      guestRequest("leave", { token: TOKEN, seriesId: SERIES }, { cookie: keys({ [SERIES]: KEY }) }),
    );
    expect(response.status).toBe(204);
    expect(await response.text()).toBe("");
    const cookie = response.cookies.get(KEY_COOKIE);
    expect(cookie?.value).toBe("");
    expect(cookie?.maxAge).toBe(0);
    expect(cookie?.path).toBe("/p/");
  });

  it("keeps a key it only guessed at, which may be another plan's", async () => {
    const seen = watchApi(gone);
    const response = await POST(
      guestRequest("leave", { token: TOKEN }, { cookie: keys({ [SERIES]: KEY }) }),
    );
    expect(seen[0].headers.get("x-yuvoy-plan-key")).toBe(KEY);
    expect(response.cookies.getAll()).toEqual([]);
  });

  it("sends the session, so a signed-in planner is known", async () => {
    session.token = "sess_919000000001";
    const seen = watchApi(() => apiError(409, "conflict", { reason: "planner_leaves" }));
    const response = await POST(guestRequest("leave", { token: TOKEN, seriesId: SERIES }));
    expect(seen[0].headers.get("authorization")).toBe("Bearer sess_919000000001");
    expect(response.status).toBe(409);
    expect((await response.json()).error.details.reason).toBe("planner_leaves");
    expect(response.cookies.getAll()).toEqual([]);
  });

  it("passes a 404 on, and keeps the key, which the report route still takes", async () => {
    watchApi(() => apiError(404, "not_found"));
    const response = await POST(
      guestRequest("leave", { token: TOKEN, seriesId: SERIES }, { cookie: keys({ [SERIES]: KEY }) }),
    );
    expect(response.status).toBe(404);
    expect(response.cookies.getAll()).toEqual([]);
  });
});
