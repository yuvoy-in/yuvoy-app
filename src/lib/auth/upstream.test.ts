import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { callUpstream, FORWARDED_REQUEST_HEADERS } from "./upstream";

/**
 * What the proxy sends upstream, and what it refuses to (yuvoy-app#75).
 *
 * The defect this covers was invisible from every direction that was being
 * looked at. Checkout sent `Idempotency-Key` correctly, the contract made it
 * required so omitting it was a type error rather than a runtime one, and the
 * API's refusal was accurate. The header was lost in between: `callUpstream`
 * builds a FRESH header set and forwarded nothing of the caller's, so a
 * signed-in checkout reached the API with no key and was refused with
 * `idempotency_key_malformed`. A guest checkout calls the API directly, so
 * the guest path kept working and the e2e stayed green.
 *
 * The route handler itself is not unit-tested, per this repo's convention:
 * it calls `next/headers`, which needs a request scope only a running server
 * has, so the cookie half is asserted in `e2e/`. What is testable in
 * isolation is exactly where the defect lived.
 */

const fetchMock = vi.fn();

/** The headers the last `fetch` was called with. */
function sentHeaders(): Record<string, string> {
  const init = fetchMock.mock.calls.at(-1)?.[1] as RequestInit | undefined;
  return (init?.headers ?? {}) as Record<string, string>;
}

function ok(headers: Record<string, string> = {}) {
  return new Response(JSON.stringify({ reservationId: "res_1" }), {
    status: 201,
    headers: { "Content-Type": "application/json", ...headers },
  });
}

beforeEach(() => {
  fetchMock.mockReset();
  fetchMock.mockResolvedValue(ok());
  vi.stubGlobal("fetch", fetchMock);
});

afterEach(() => vi.unstubAllGlobals());

describe("headers the proxy forwards", () => {
  it("passes Idempotency-Key through with the exact value the caller sent", async () => {
    /*
      THE PRODUCTION DEFECT. The key is derived from the body so a retry on
      ferry wifi reuses it; a key minted at the proxy would be different on
      every attempt and would defeat the mechanism it is named after. So the
      assertion is the exact value, not merely that something arrived.
    */
    const key = "chk_0123456789abcdef0123456789abcdef";
    await callUpstream({
      method: "POST",
      path: "/reservations",
      body: { slotId: "slot_1" },
      from: new Request("https://app.yuvoy.in/api/v1/reservations", {
        method: "POST",
        headers: { "Idempotency-Key": key },
      }),
    });

    expect(sentHeaders()["Idempotency-Key"]).toBe(key);
  });

  it("forwards nothing else off the caller's request", async () => {
    /*
      The allowlist is the point. A proxy attaches the traveller's session to
      what it forwards, so a header it was not asked to forward is how a
      credential reaches somewhere nobody intended.
    */
    await callUpstream({
      method: "POST",
      path: "/reservations",
      token: "sess_abc",
      body: { slotId: "slot_1" },
      from: new Request("https://app.yuvoy.in/api/v1/reservations", {
        method: "POST",
        headers: {
          "Idempotency-Key": "chk_0123456789abcdef0123456789abcdef",
          cookie: "yuvoy_session=sess_abc; other=1",
          "user-agent": "Mozilla/5.0 (iPhone)",
          "x-forwarded-for": "203.0.113.9",
          referer: "https://app.yuvoy.in/e/try-dive/book",
        },
      }),
    });

    const sent = sentHeaders();
    const names = Object.keys(sent).map((n) => n.toLowerCase());
    expect(names).not.toContain("cookie");
    expect(names).not.toContain("user-agent");
    expect(names).not.toContain("x-forwarded-for");
    expect(names).not.toContain("referer");

    // The session travels as the proxy's own Authorization, never the cookie.
    expect(sent.Authorization).toBe("Bearer sess_abc");
  });

  it("sends no key at all when the caller sent none", async () => {
    /*
      Absent stays absent. An empty string would turn "the caller did not send
      one" into "the caller sent nothing", and the API answers those the same
      way for the wrong reason.
    */
    await callUpstream({
      method: "GET",
      path: "/me",
      token: "sess_abc",
      from: new Request("https://app.yuvoy.in/api/v1/me"),
    });

    expect("Idempotency-Key" in sentHeaders()).toBe(false);
  });

  it("forwards nothing when there is no incoming request", async () => {
    await callUpstream({ method: "GET", path: "/me", token: "sess_abc" });
    expect("Idempotency-Key" in sentHeaders()).toBe(false);
  });
});

describe("the replay marker on the way back", () => {
  it("reports a replayed response", async () => {
    /*
      A retry after a dropped connection answers 201 with the ORIGINAL
      response, so the status cannot tell a caller their second tap did
      nothing. This header is the only thing that can, and the proxy used to
      swallow it.
    */
    fetchMock.mockResolvedValue(ok({ "Idempotent-Replay": "true" }));
    const answer = await callUpstream({
      method: "POST",
      path: "/reservations",
      body: {},
    });
    expect(answer.idempotentReplay).toBe(true);
  });

  it("reads the header whatever case the API chose", async () => {
    fetchMock.mockResolvedValue(ok({ "idempotent-replay": "true" }));
    const answer = await callUpstream({
      method: "POST",
      path: "/reservations",
      body: {},
    });
    expect(answer.idempotentReplay).toBe(true);
  });

  it("is false for an ordinary first answer", async () => {
    const answer = await callUpstream({
      method: "POST",
      path: "/reservations",
      body: {},
    });
    expect(answer.idempotentReplay).toBe(false);
  });
});

describe("the allowlist itself", () => {
  it("names Idempotency-Key", () => {
    // `scripts/qa.mjs` proves this list covers every required header the
    // contract declares on a proxied path; this pins the one it found.
    expect(FORWARDED_REQUEST_HEADERS).toContain("Idempotency-Key");
  });

  it("carries no credential-bearing header", () => {
    /*
      A guard on the list rather than on a call. Adding `Cookie` or
      `Authorization` here would silently turn the proxy back into a relay for
      whatever the browser holds.
    */
    const banned = ["cookie", "authorization", "host", "x-forwarded-for"];
    for (const name of FORWARDED_REQUEST_HEADERS) {
      expect(banned).not.toContain(name.toLowerCase());
    }
  });
});

describe("the scenario switch, for a call a page makes", () => {
  /*
    yuvoy-api#195. The invite gate asks `GET /me` from a Server Component,
    which has no incoming Request to read `x-yuvoy-scenario` off, so the
    page's own `?__scenario=` is handed over by value. It must reach the mocks
    in a mocked build and nothing anywhere else: the real API does not honour
    it, and should never be offered the chance.
  */
  afterEach(() => vi.unstubAllEnvs());

  it("forwards a page's scenario in a mocked build", async () => {
    vi.stubEnv("NEXT_PUBLIC_API_MOCKING", "enabled");
    await callUpstream({
      method: "GET",
      path: "/me",
      token: "sess_abc",
      scenario: "not-admitted",
    });
    expect(sentHeaders()["x-yuvoy-scenario"]).toBe("not-admitted");
  });

  it("drops it in any build that is not mocked", async () => {
    vi.stubEnv("NEXT_PUBLIC_API_MOCKING", "disabled");
    await callUpstream({
      method: "GET",
      path: "/me",
      token: "sess_abc",
      scenario: "not-admitted",
      from: new Request("https://app.yuvoy.in/api/v1/me", {
        headers: { "x-yuvoy-scenario": "not-admitted" },
      }),
    });
    expect("x-yuvoy-scenario" in sentHeaders()).toBe(false);
  });

  it("still reads the incoming request's header when no scenario is given", async () => {
    vi.stubEnv("NEXT_PUBLIC_API_MOCKING", "enabled");
    await callUpstream({
      method: "GET",
      path: "/me",
      token: "sess_abc",
      from: new Request("https://app.yuvoy.in/api/v1/me", {
        headers: { "x-yuvoy-scenario": "session-expired" },
      }),
    });
    expect(sentHeaders()["x-yuvoy-scenario"]).toBe("session-expired");
  });
});
