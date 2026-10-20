import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { http, HttpResponse } from "msw";
import { server } from "../../../mocks/server";

/**
 * The server's read of who sees releases early (yuvoy-app#181): `cohort` on
 * `GET /me`, with the session cookie. Null for anything but an answer, which
 * keeps a release at `staff` or `early` shut.
 */

const BASE = process.env.NEXT_PUBLIC_API_URL ?? "http://localhost:8099/v1";

const jar = vi.hoisted(() => ({ token: null as string | null }));
vi.mock("./session-cookie", () => ({
  readSessionCookie: async () => jar.token,
}));

beforeEach(() => {
  jar.token = null;
});
afterEach(() => vi.restoreAllMocks());

async function cohort() {
  vi.resetModules();
  const { getCohort } = await import("./request-cohort");
  return getCohort();
}

function me(status: number, body: unknown) {
  const auth: (string | null)[] = [];
  server.use(
    http.get(`${BASE}/me`, ({ request }) => {
      auth.push(request.headers.get("authorization"));
      return HttpResponse.json(body as object, { status });
    }),
  );
  return auth;
}

describe("the cohort of this request", () => {
  it("is null with no session, and asks nothing", async () => {
    const auth = me(200, { cohort: "staff" });
    expect(await cohort()).toBeNull();
    expect(auth).toEqual([]);
  });

  it("reads staff and early from GET /me, with the session", async () => {
    jar.token = "sess_abc";
    const auth = me(200, { cohort: "staff" });
    expect(await cohort()).toBe("staff");
    expect(auth).toEqual(["Bearer sess_abc"]);

    me(200, { cohort: "early" });
    expect(await cohort()).toBe("early");
    me(200, { cohort: null });
    expect(await cohort()).toBeNull();
    // An API from before cohorts sends none.
    me(200, { name: "Asha" });
    expect(await cohort()).toBeNull();
    // A word this build has no rule for is nobody's cohort.
    me(200, { cohort: "admin" });
    expect(await cohort()).toBeNull();
  });

  it("is null for a refused session or a failure, never an error", async () => {
    jar.token = "sess_abc";
    me(401, { error: { code: "unauthorized", message: "x" } });
    expect(await cohort()).toBeNull();

    vi.spyOn(console, "error").mockImplementation(() => {});
    server.use(http.get(`${BASE}/me`, () => HttpResponse.error()));
    expect(await cohort()).toBeNull();
  });
});
