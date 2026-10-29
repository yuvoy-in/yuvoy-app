import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { HttpResponse } from "msw";
import {
  KEY,
  KEY_COOKIE,
  OTHER_KEY,
  OTHER_SERIES,
  SERIES,
  TOKEN,
  apiError,
  guestRequest,
  keys,
  watchApi,
} from "../../../../test/plan-link";
import { openPlanView, guestMe } from "../../../../../mocks/plan-fixtures";

/**
 * Reading a plan by its link (yuvoy-mobile#373): which guest key goes with
 * the read, what comes back, and what never does.
 */

const session = vi.hoisted(() => ({
  token: null as string | null,
  touched: 0,
}));
vi.mock("@/lib/auth/session-cookie", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@/lib/auth/session-cookie")>()),
  readSessionCookie: async () => session.token,
  touchSessionCookie: async () => {
    session.touched += 1;
  },
  clearSessionCookie: async () => {},
}));

const { POST } = await import("./route");

const NINETY_DAYS = 90 * 24 * 60 * 60;

const member = () => HttpResponse.json(openPlanView("member", guestMe()));
const visitor = () => HttpResponse.json(openPlanView("visitor"));

beforeEach(() => {
  session.token = null;
  session.touched = 0;
});
afterEach(() => {
  vi.unstubAllEnvs();
  vi.restoreAllMocks();
});

describe("the read", () => {
  it("asks getPlanByLink for the token in the body, and answers the plan", async () => {
    const seen = watchApi();
    const response = await POST(guestRequest("view", { token: TOKEN }));

    expect(seen).toHaveLength(1);
    expect(seen[0].method).toBe("GET");
    expect(seen[0].path).toBe(`/v1/plans/by-token/${TOKEN}`);
    expect(response.status).toBe(200);
    expect((await response.json()).title).toBe("Dinner at the beach shack");
  });

  it("sends the visitor's own address, for the API's per-address limits", async () => {
    vi.stubEnv(
      "PROXY_CLIENT_IP_SECRET",
      "0123456789abcdef0123456789abcdef0123456789abcdef",
    );
    const seen = watchApi();
    await POST(
      guestRequest(
        "view",
        { token: TOKEN },
        { headers: { "x-real-ip": "203.0.113.9" } },
      ),
    );
    expect(seen[0].headers.get("x-yuvoy-client-ip")).toBe("203.0.113.9");
    expect(seen[0].headers.get("x-yuvoy-proxy-secret")).toBeTruthy();
  });

  it("sends the session when signed in, and keeps it alive", async () => {
    session.token = "sess_919000000042";
    const seen = watchApi(member);
    await POST(guestRequest("view", { token: TOKEN }));
    expect(seen[0].headers.get("authorization")).toBe(
      "Bearer sess_919000000042",
    );
    expect(session.touched).toBe(1);
  });

  it("sends no session and no key for a stranger", async () => {
    const seen = watchApi();
    await POST(guestRequest("view", { token: TOKEN }));
    expect(seen[0].headers.get("authorization")).toBeNull();
    expect(seen[0].headers.get("x-yuvoy-plan-key")).toBeNull();
  });
});

describe("which guest key goes with it", () => {
  it("the key of the series the page named", async () => {
    const seen = watchApi(member);
    await POST(
      guestRequest(
        "view",
        { token: TOKEN, seriesId: SERIES },
        { cookie: keys({ [OTHER_SERIES]: OTHER_KEY, [SERIES]: KEY }) },
      ),
    );
    expect(seen).toHaveLength(1);
    expect(seen[0].headers.get("x-yuvoy-plan-key")).toBe(KEY);
  });

  it("none, when the page named a series this browser holds no key for", async () => {
    const seen = watchApi();
    await POST(
      guestRequest(
        "view",
        { token: TOKEN, seriesId: SERIES },
        { cookie: keys({ [OTHER_SERIES]: OTHER_KEY }) },
      ),
    );
    expect(seen[0].headers.get("x-yuvoy-plan-key")).toBeNull();
  });

  it("the only key held, when the page has not read the plan yet", async () => {
    const seen = watchApi(member);
    await POST(
      guestRequest(
        "view",
        { token: TOKEN },
        { cookie: keys({ [SERIES]: KEY }) },
      ),
    );
    expect(seen).toHaveLength(1);
    expect(seen[0].headers.get("x-yuvoy-plan-key")).toBe(KEY);
  });

  it("with several, reads without one, then again with the plan's own", async () => {
    const seen = watchApi(({ headers }) =>
      headers.get("x-yuvoy-plan-key") === KEY ? member() : visitor(),
    );
    const response = await POST(
      guestRequest(
        "view",
        { token: TOKEN },
        { cookie: keys({ [OTHER_SERIES]: OTHER_KEY, [SERIES]: KEY }) },
      ),
    );
    expect(seen.map((c) => c.headers.get("x-yuvoy-plan-key"))).toEqual([
      null,
      KEY,
    ]);
    expect((await response.json()).role).toBe("member");
  });

  it("with several and a 404 without one, tries each until the API knows one", async () => {
    // After the link expires a visitor is 404 and a member is not.
    const seen = watchApi(({ headers }) =>
      headers.get("x-yuvoy-plan-key") === KEY
        ? member()
        : apiError(404, "not_found"),
    );
    const response = await POST(
      guestRequest(
        "view",
        { token: TOKEN },
        { cookie: keys({ [OTHER_SERIES]: OTHER_KEY, [SERIES]: KEY }) },
      ),
    );
    expect(seen.map((c) => c.headers.get("x-yuvoy-plan-key"))).toEqual([
      null,
      OTHER_KEY,
      KEY,
    ]);
    expect(response.status).toBe(200);
  });

  it("ignores a cookie that is not a guest key of ours", async () => {
    const seen = watchApi();
    await POST(
      guestRequest(
        "view",
        { token: TOKEN },
        {
          cookie: `ypk_not-a-uuid=${KEY}; ypk_${SERIES}=ypk_short; yv_session=sess_1`,
        },
      ),
    );
    expect(seen).toHaveLength(1);
    expect(seen[0].headers.get("x-yuvoy-plan-key")).toBeNull();
  });
});

describe("the key's cookie", () => {
  it("is refreshed for 90 days when the API knew the key", async () => {
    watchApi(member);
    const response = await POST(
      guestRequest(
        "view",
        { token: TOKEN, seriesId: SERIES },
        { cookie: keys({ [SERIES]: KEY }) },
      ),
    );
    const cookie = response.cookies.get(KEY_COOKIE);
    expect(cookie?.value).toBe(KEY);
    expect(cookie?.httpOnly).toBe(true);
    expect(cookie?.secure).toBe(true);
    expect(cookie?.sameSite).toBe("lax");
    expect(cookie?.path).toBe("/p/");
    expect(cookie?.maxAge).toBe(NINETY_DAYS);
  });

  it("is left alone when the API read the caller as a visitor", async () => {
    watchApi(visitor);
    const response = await POST(
      guestRequest(
        "view",
        { token: TOKEN },
        { cookie: keys({ [OTHER_SERIES]: OTHER_KEY }) },
      ),
    );
    expect(response.cookies.get(KEY_COOKIE)).toBeUndefined();
    expect(response.cookies.getAll()).toEqual([]);
  });

  it("is not Secure over plain http, where a browser would drop it", async () => {
    watchApi(member);
    const response = await POST(
      guestRequest(
        "view",
        { token: TOKEN, seriesId: SERIES },
        {
          cookie: keys({ [SERIES]: KEY }),
          url: "http://127.0.0.1:3100/p/api/view",
        },
      ),
    );
    expect(response.cookies.get(KEY_COOKIE)?.secure).toBe(false);
  });
});

describe("what comes back", () => {
  it("never carries a guest key or the planner's link, whatever the API sent", async () => {
    watchApi(() =>
      HttpResponse.json({
        ...openPlanView("planner"),
        guestKey: KEY,
        link: `https://app.yuvoy.in/p/#${TOKEN}`,
      }),
    );
    const response = await POST(guestRequest("view", { token: TOKEN }));
    const text = await response.text();
    expect(response.status).toBe(200);
    expect(text).not.toContain("ypk_");
    expect(text).not.toContain(TOKEN);
    expect(text).not.toContain("guestKey");
  });

  it("is withheld when a secret is somewhere the scrub cannot see", async () => {
    vi.spyOn(console, "error").mockImplementation(() => {});
    watchApi(() =>
      HttpResponse.json({ ...openPlanView("visitor"), note: `key ${KEY}` }),
    );
    const response = await POST(guestRequest("view", { token: TOKEN }));
    expect(response.status).toBe(502);
    expect(await response.text()).not.toContain("ypk_");
  });

  it.each([
    [404, "not_found"],
    [429, "rate_limited"],
    [503, "plans_unavailable"],
  ])(
    "passes a %i %s on with its envelope and request id",
    async (status, code) => {
      watchApi(() => apiError(status, code));
      const response = await POST(guestRequest("view", { token: TOKEN }));
      expect(response.status).toBe(status);
      expect(response.headers.get("x-request-id")).toBe("01JAPIREQUEST");
      const body = await response.json();
      expect(body.error.code).toBe(code);
      expect(body.error.message).toBe("From the API.");
    },
  );

  it("is a 502 in the envelope when the API cannot be reached, logged without the token", async () => {
    const logged = vi.spyOn(console, "error").mockImplementation(() => {});
    watchApi(() => HttpResponse.error());
    const response = await POST(guestRequest("view", { token: TOKEN }));
    expect(response.status).toBe(502);
    expect((await response.json()).error.code).toBe("internal_error");
    const lines = logged.mock.calls
      .flat()
      .map((part) =>
        part instanceof Error
          ? `${part.name} ${part.message} ${part.stack}`
          : String(part),
      );
    expect(lines.join("\n")).not.toContain(TOKEN);
    expect(lines.join("\n")).toContain("[plan link] view");
  });
});
