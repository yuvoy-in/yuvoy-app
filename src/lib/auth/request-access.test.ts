import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { http, HttpResponse } from "msw";
import { server } from "../../../mocks/server";

/**
 * The server's half of the invite gate (yuvoy-api#195).
 *
 * A gated page asks this before it renders anything, so it is held to three
 * promises: with the switch off it costs NOTHING (no cookie read, which would
 * make a static page dynamic, and no call); one page render makes one
 * `GET /me`; and any failure opens the page rather than locking a traveller
 * out of browsing over a slow second.
 */

const BASE = process.env.NEXT_PUBLIC_API_URL ?? "http://localhost:8099/v1";

/** The cookie jar, as `next/headers` would hold it, and how often it is read. */
const jar = vi.hoisted(() => ({ token: null as string | null, reads: 0 }));
vi.mock("./session-cookie", () => ({
  readSessionCookie: async () => {
    jar.reads += 1;
    return jar.token;
  },
}));

/**
 * React's `cache()` lasts one server request, and outside one it memoises
 * nothing. The request is modelled as a scope a test opens.
 */
const request = vi.hoisted(() => ({
  memo: null as Map<string, unknown> | null,
}));
vi.mock("react", async (importOriginal) => {
  const actual = await importOriginal<typeof import("react")>();
  return {
    ...actual,
    cache:
      <A extends unknown[], R>(fn: (...args: A) => R) =>
      (...args: A): R => {
        if (!request.memo) return fn(...args);
        const key = JSON.stringify(args);
        if (!request.memo.has(key)) request.memo.set(key, fn(...args));
        return request.memo.get(key) as R;
      },
  };
});

/** `GET /me` answering `body` with `status`, counting the calls it gets. */
function me(status: number, body: unknown) {
  const seen = {
    calls: 0,
    auth: [] as (string | null)[],
    scenario: [] as (string | null)[],
  };
  server.use(
    http.get(`${BASE}/me`, ({ request: req }) => {
      seen.calls += 1;
      seen.auth.push(req.headers.get("authorization"));
      seen.scenario.push(req.headers.get("x-yuvoy-scenario"));
      return HttpResponse.json(body as object, { status });
    }),
  );
  return seen;
}

const ACCOUNT = {
  phone: "+919000003210",
  name: "Asha Menon",
  admitted: true,
};

async function load(flag: string) {
  vi.resetModules();
  vi.stubEnv("NEXT_PUBLIC_INVITE_ONLY", flag);
  return import("./request-access");
}

beforeEach(() => {
  jar.token = null;
  jar.reads = 0;
  request.memo = null;
});

afterEach(() => {
  vi.unstubAllEnvs();
  vi.restoreAllMocks();
});

describe("with the switch off", () => {
  it("opens every page without reading the cookie or calling the API", async () => {
    /*
      The whole promise of the switch. A cookie read is what makes Next render
      a page per request, and `/saved` is static today; a `GET /me` would be a
      round trip in front of every feed load for nothing.
    */
    const seen = me(200, ACCOUNT);
    jar.token = "sess_919000003210";
    const { accessForRequest } = await load("false");

    expect(await accessForRequest()).toEqual({ access: "open", phone: null });
    expect(jar.reads).toBe(0);
    expect(seen.calls).toBe(0);
  });
});

describe("with the switch on", () => {
  it("answers signed-out from a missing cookie, without asking the API", async () => {
    const seen = me(200, ACCOUNT);
    const { accessForRequest } = await load("true");

    expect(await accessForRequest()).toEqual({
      access: "signed-out",
      phone: null,
    });
    expect(seen.calls).toBe(0);
  });

  it("asks GET /me with the session, and reads admitted and the number", async () => {
    const seen = me(200, ACCOUNT);
    jar.token = "sess_919000003210";
    const { accessForRequest } = await load("true");

    expect(await accessForRequest()).toEqual({
      access: "admitted",
      phone: "+919000003210",
    });
    expect(seen.auth).toEqual(["Bearer sess_919000003210"]);
  });

  it("answers not-admitted when the number has no code", async () => {
    me(200, { ...ACCOUNT, admitted: false });
    jar.token = "sess_919000003210";
    const { accessForRequest } = await load("true");

    expect((await accessForRequest()).access).toBe("not-admitted");
  });

  it("opens the page when the API does not say, as one from before #195 would", async () => {
    const { admitted: _admitted, ...older } = ACCOUNT;
    void _admitted;
    me(200, older);
    jar.token = "sess_919000003210";
    const { accessForRequest } = await load("true");

    expect((await accessForRequest()).access).toBe("open");
  });

  it("reads a refused cookie as signed out", async () => {
    me(401, { error: { code: "unauthorized", message: "Sign in first." } });
    jar.token = "sess_revoked";
    const { accessForRequest } = await load("true");

    expect(await accessForRequest()).toEqual({
      access: "signed-out",
      phone: null,
    });
  });

  it("fails OPEN on a server error, rather than locking browsing", async () => {
    for (const status of [500, 502, 503]) {
      me(status, { error: { code: "internal_error", message: "No." } });
      jar.token = "sess_919000003210";
      const { accessForRequest } = await load("true");
      expect((await accessForRequest()).access, String(status)).toBe("open");
    }
  });

  it("fails OPEN when the network does", async () => {
    vi.spyOn(console, "error").mockImplementation(() => {});
    server.use(http.get(`${BASE}/me`, () => HttpResponse.error()));
    jar.token = "sess_919000003210";
    const { accessForRequest } = await load("true");

    expect(await accessForRequest()).toEqual({ access: "open", phone: null });
  });

  it("gives up on a slow API after ACCESS_TIMEOUT_MS, and opens the page", async () => {
    /*
      The wait is the API's own `AbortSignal.timeout`, which runs on Node's
      internal timers, so it is observed rather than waited out: the signal
      handed to the call is an already-aborted one.
    */
    vi.spyOn(console, "error").mockImplementation(() => {});
    const timeout = vi
      .spyOn(AbortSignal, "timeout")
      .mockReturnValue(AbortSignal.abort());
    me(200, ACCOUNT);
    jar.token = "sess_919000003210";
    const { accessForRequest, ACCESS_TIMEOUT_MS } = await load("true");

    expect((await accessForRequest()).access).toBe("open");
    expect(timeout).toHaveBeenCalledWith(ACCESS_TIMEOUT_MS);
    expect(ACCESS_TIMEOUT_MS).toBeLessThanOrEqual(3_000);
  });

  it("makes ONE call however many parts of a page ask", async () => {
    const seen = me(200, ACCOUNT);
    jar.token = "sess_919000003210";
    const { accessForRequest } = await load("true");

    request.memo = new Map();
    const [a, b] = await Promise.all([accessForRequest(), accessForRequest()]);
    await accessForRequest();

    expect(a).toEqual(b);
    expect(seen.calls).toBe(1);
  });

  it("carries the page's scenario to the mocks in a mocked build", async () => {
    vi.stubEnv("NEXT_PUBLIC_API_MOCKING", "enabled");
    const seen = me(200, { ...ACCOUNT, admitted: false });
    jar.token = "sess_919000003210";
    const { accessForRequest } = await load("true");

    await accessForRequest("not-admitted");
    expect(seen.scenario).toEqual(["not-admitted"]);
  });
});
