import { describe, it, expect, vi, beforeEach } from "vitest";
import { http, HttpResponse, delay } from "msw";
import { server } from "../../../../mocks/server";

/**
 * The session routes when the API is slow, silent or gone (production
 * readiness, 6 Oct 2026).
 *
 * The cookie jar is `next/headers`, which needs a request scope only a running
 * server has, so it is stood in for here; `e2e/session-cookie.spec.ts` covers
 * the real cookie. `after` is captured rather than run, so a test can tell
 * what was answered from what was left for later.
 */

const BASE = process.env.NEXT_PUBLIC_API_URL ?? "http://localhost:8099/v1";
const TOKEN = "sess_919000003210";

const jar = vi.hoisted(() => ({
  token: null as string | null,
  cleared: 0,
  written: 0,
}));
vi.mock("@/lib/auth/session-cookie", () => ({
  readSessionCookie: async () => jar.token,
  clearSessionCookie: async () => {
    jar.cleared += 1;
  },
  writeSessionCookie: async () => {
    jar.written += 1;
  },
  touchSessionCookie: async () => {},
}));

const later = vi.hoisted(() => ({ tasks: [] as (() => Promise<unknown>)[] }));
vi.mock("next/server", async (importOriginal) => {
  const actual = await importOriginal<typeof import("next/server")>();
  return {
    ...actual,
    after: (task: () => Promise<unknown>) => {
      later.tasks.push(task);
    },
  };
});

const { DELETE, GET, POST } = await import("./route");

function own(method: string, body?: unknown): Request {
  return new Request("https://app.yuvoy.in/api/session", {
    method,
    headers: {
      "sec-fetch-site": "same-origin",
      ...(body === undefined
        ? {}
        : {
            "content-type": "application/json",
            "content-length": String(JSON.stringify(body).length),
          }),
    },
    body: body === undefined ? undefined : JSON.stringify(body),
  });
}

beforeEach(() => {
  jar.token = TOKEN;
  jar.cleared = 0;
  jar.written = 0;
  later.tasks = [];
});

describe("signing out", () => {
  it("signs this phone out at once, even while the API says nothing", async () => {
    let told = 0;
    server.use(
      http.delete(`${BASE}/me/session`, async () => {
        told += 1;
        await delay("infinite");
      }),
    );

    const answer = await DELETE(own("DELETE"));
    expect(answer.status).toBe(204);
    expect(jar.cleared).toBe(1);
    expect(told).toBe(0);
    expect(later.tasks).toHaveLength(1);
  });

  it("then tells the API which session ended", async () => {
    let authorization: string | null = null;
    server.use(
      http.delete(`${BASE}/me/session`, ({ request }) => {
        authorization = request.headers.get("authorization");
        return new HttpResponse(null, { status: 204 });
      }),
    );

    await DELETE(own("DELETE"));
    await later.tasks[0]();
    expect(authorization).toBe(`Bearer ${TOKEN}`);
  });

  it("does not fail later when the API cannot be reached", async () => {
    vi.spyOn(console, "error").mockImplementation(() => {});
    server.use(http.delete(`${BASE}/me/session`, () => HttpResponse.error()));

    await DELETE(own("DELETE"));
    await expect(later.tasks[0]()).resolves.toBeUndefined();
  });
});

describe("signing in, when the API cannot be reached", () => {
  it("answers in the envelope the form reads, not a bare 500", async () => {
    vi.spyOn(console, "error").mockImplementation(() => {});
    server.use(
      http.post(`${BASE}/me/sign-in/verify`, () => HttpResponse.error()),
    );

    const answer = await POST(
      own("POST", { phone: "+919000003210", code: "123456" }),
    );
    expect(answer.status).toBe(502);
    expect(await answer.json()).toEqual({
      error: {
        code: "internal_error",
        message: "Signing in did not complete. Try again in a moment.",
      },
    });
    expect(jar.written).toBe(0);
  });
});

describe("asking whether this phone is signed in, when the API cannot answer", () => {
  it("still says signed in, and keeps the cookie", async () => {
    vi.spyOn(console, "error").mockImplementation(() => {});
    server.use(http.get(`${BASE}/me`, () => HttpResponse.error()));

    const answer = await GET(own("GET"));
    expect(await answer.json()).toEqual({ signedIn: true });
    expect(jar.cleared).toBe(0);
  });
});
