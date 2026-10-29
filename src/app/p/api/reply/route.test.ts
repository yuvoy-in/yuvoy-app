import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
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
import {
  PLAN_IDS,
  guestMe,
  openPlanView,
} from "../../../../../mocks/plan-link-fixtures";

/**
 * A reply by link (yuvoy-mobile#373): the first one's guest key goes into an
 * httpOnly cookie and nowhere else, the nonce reaches the API as the
 * `Idempotency-Key` the page made, and a later reply carries the key.
 */

const session = vi.hoisted(() => ({ token: null as string | null }));
vi.mock("@/lib/auth/session-cookie", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@/lib/auth/session-cookie")>()),
  readSessionCookie: async () => session.token,
  touchSessionCookie: async () => {},
  clearSessionCookie: async () => {},
}));

const { POST } = await import("./route");

const NONCE = "N0nce_of-the-form_0123456789";
const FIRST = {
  name: "Ravi",
  adult: true,
  answers: [{ optionId: PLAN_IDS.times[0], answer: "can" }],
  claims: [PLAN_IDS.items[2]],
  paid: [],
};

const created = () =>
  HttpResponse.json({ ...openPlanView("member", guestMe()), guestKey: KEY }, { status: 201 });

beforeEach(() => {
  session.token = null;
});
afterEach(() => {
  vi.unstubAllEnvs();
  vi.restoreAllMocks();
});

describe("a first reply", () => {
  it("keeps the new guest key in an httpOnly cookie named after the series", async () => {
    watchApi(created);
    const response = await POST(
      guestRequest("reply", { token: TOKEN, nonce: NONCE, reply: FIRST }),
    );
    expect(response.status).toBe(201);
    const cookie = response.cookies.get(KEY_COOKIE);
    expect(cookie?.value).toBe(KEY);
    expect(cookie?.httpOnly).toBe(true);
    expect(cookie?.path).toBe("/p/");
    expect(cookie?.sameSite).toBe("lax");
    expect(cookie?.maxAge).toBe(90 * 24 * 60 * 60);
  });

  it("answers the plan without the key, anywhere in the body", async () => {
    watchApi(created);
    const response = await POST(
      guestRequest("reply", { token: TOKEN, nonce: NONCE, reply: FIRST }),
    );
    const text = await response.text();
    expect(text).not.toContain("ypk_");
    expect(text).not.toContain("guestKey");
    expect(JSON.parse(text).me.name).toBe("Ravi");
  });

  it("sends the form's nonce as Idempotency-Key, exactly", async () => {
    const seen = watchApi(created);
    await POST(guestRequest("reply", { token: TOKEN, nonce: NONCE, reply: FIRST }));
    expect(seen[0].method).toBe("PUT");
    expect(seen[0].path).toBe(`/v1/plans/by-token/${TOKEN}/reply`);
    expect(seen[0].headers.get("idempotency-key")).toBe(NONCE);
  });

  it("sends the reply as it is, and nothing of the envelope around it", async () => {
    const seen = watchApi(created);
    await POST(
      guestRequest("reply", { token: TOKEN, seriesId: SERIES, nonce: NONCE, reply: FIRST }),
    );
    expect(JSON.parse(seen[0].body)).toEqual(FIRST);
  });

  it("never forwards an Idempotency-Key the page put in its own headers", async () => {
    const seen = watchApi(created);
    await POST(
      guestRequest(
        "reply",
        { token: TOKEN, reply: FIRST },
        { headers: { "idempotency-key": "from_the_page_headers_000" } },
      ),
    );
    expect(seen[0].headers.get("idempotency-key")).toBeNull();
  });

  it("refuses a nonce of the wrong shape as the API does, without sending it", async () => {
    const seen = watchApi(created);
    for (const nonce of ["short", "x".repeat(65), "has spaces in it, twenty-two+", 42]) {
      const response = await POST(
        guestRequest("reply", { token: TOKEN, nonce, reply: FIRST }),
      );
      expect(response.status).toBe(400);
      expect((await response.json()).error.details.idempotencyKey).toBeTruthy();
    }
    expect(seen).toHaveLength(0);
  });

  it("refuses a body with no reply in it, without asking", async () => {
    const seen = watchApi(created);
    const response = await POST(guestRequest("reply", { token: TOKEN, nonce: NONCE }));
    expect(response.status).toBe(400);
    expect(seen).toHaveLength(0);
  });

  it("passes the API's refusals on unchanged, and sets no cookie", async () => {
    for (const [status, code, details] of [
      [400, "invalid_input", { adult: "Tick that you are 18 or older." }],
      [409, "conflict", { reason: "nonce" }],
      [409, "plan_full", undefined],
      [409, "plan_closed", { reason: "started" }],
      [429, "rate_limited", undefined],
    ] as const) {
      watchApi(() => apiError(status, code, details));
      const response = await POST(
        guestRequest("reply", { token: TOKEN, nonce: NONCE, reply: FIRST }),
      );
      expect(response.status).toBe(status);
      const body = await response.json();
      expect(body.error.code).toBe(code);
      expect(body.error.details).toEqual(details);
      expect(response.cookies.getAll()).toEqual([]);
    }
  });

  it("with a session, belongs to the account: no key, and no cookie", async () => {
    session.token = "sess_919000000042";
    const seen = watchApi(() => HttpResponse.json(openPlanView("member", guestMe())));
    const response = await POST(
      guestRequest("reply", { token: TOKEN, nonce: NONCE, reply: FIRST }),
    );
    expect(seen[0].headers.get("authorization")).toBe("Bearer sess_919000000042");
    expect(response.status).toBe(200);
    expect(response.cookies.getAll()).toEqual([]);
  });
});

describe("a later reply", () => {
  it("carries the key kept for the series, and refreshes it", async () => {
    const seen = watchApi(() => HttpResponse.json(openPlanView("member", guestMe())));
    const response = await POST(
      guestRequest(
        "reply",
        { token: TOKEN, seriesId: SERIES, reply: { paid: [PLAN_IDS.costs[0]] } },
        { cookie: keys({ [SERIES]: KEY }) },
      ),
    );
    expect(seen[0].headers.get("x-yuvoy-plan-key")).toBe(KEY);
    expect(response.status).toBe(200);
    expect(response.cookies.get(KEY_COOKIE)?.maxAge).toBe(90 * 24 * 60 * 60);
  });
});

/*
  Through the by-link mocks rather than a stand-in, so the mock that the page
  and e2e run against is held to the same promises.
*/
describe("against the by-link mocks", () => {
  beforeEach(() => vi.stubEnv("NEXT_PUBLIC_API_MOCKING", "enabled"));

  it("gives a double tap one guest: the same nonce and name, the same key", async () => {
    const send = () =>
      POST(guestRequest("reply", { token: TOKEN, nonce: NONCE, reply: FIRST }));
    const first = await send();
    const second = await send();
    expect(first.status).toBe(201);
    expect(second.status).toBe(201);
    const key = first.cookies.get(KEY_COOKIE)?.value;
    expect(key).toMatch(/^ypk_[A-Za-z0-9_-]{43}$/);
    expect(second.cookies.get(KEY_COOKIE)?.value).toBe(key);
  });

  it("says send again for the same nonce with another name", async () => {
    await POST(guestRequest("reply", { token: TOKEN, nonce: NONCE, reply: FIRST }));
    const again = await POST(
      guestRequest("reply", {
        token: TOKEN,
        nonce: NONCE,
        reply: { ...FIRST, name: "Meera" },
      }),
    );
    expect(again.status).toBe(409);
    expect((await again.json()).error.details.reason).toBe("nonce");
  });

  it("asks for the name and the 18+ tick on a first reply", async () => {
    const noName = await POST(
      guestRequest("reply", { token: TOKEN, nonce: NONCE, reply: { ...FIRST, name: "" } }),
    );
    expect((await noName.json()).error.details.name).toBeTruthy();
    const noTick = await POST(
      guestRequest("reply", { token: TOKEN, nonce: NONCE, reply: { ...FIRST, adult: false } }),
    );
    expect((await noTick.json()).error.details.adult).toBeTruthy();
  });

  it("answers plan_full in that scenario", async () => {
    const response = await POST(
      guestRequest(
        "reply",
        { token: TOKEN, nonce: NONCE, reply: FIRST },
        { headers: { "x-yuvoy-scenario": "plan-guest-full" } },
      ),
    );
    expect(response.status).toBe(409);
    expect((await response.json()).error.code).toBe("plan_full");
  });
});
