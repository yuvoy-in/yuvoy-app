import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import {
  callUpstream,
  FORWARDED_REQUEST_HEADERS,
  unreachable,
  visitorAddressHeaders,
} from "./upstream";
import { StalledError } from "@/lib/api/deadline";

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

/*
  The person behind the call, for the API's per-IP limits (yuvoy-api#282
  item 3, yuvoy-api#299). Believed by the API only beside the shared secret,
  so both go or neither does, and the address is the one Vercel wrote.
*/
describe("the visitor's address, for the API's per-IP limits", () => {
  const SECRET = "0123456789abcdef0123456789abcdef0123456789abcdef";
  afterEach(() => vi.unstubAllEnvs());

  function visit(headers: Record<string, string>) {
    return new Request("https://app.yuvoy.in/api/v1/me/invite-codes/redeem", {
      method: "POST",
      headers,
    });
  }

  it("sends Vercel's address with the secret beside it", async () => {
    vi.stubEnv("PROXY_CLIENT_IP_SECRET", SECRET);
    await callUpstream({
      method: "POST",
      path: "/me/invite-codes/redeem",
      token: "sess_abc",
      body: { code: "ISLAND-7" },
      from: visit({
        "x-real-ip": "203.0.113.9",
        // Anybody can write this one, so it is never what is sent.
        "x-forwarded-for": "198.51.100.1, 203.0.113.9",
      }),
    });
    expect(sentHeaders()["X-Yuvoy-Client-IP"]).toBe("203.0.113.9");
    expect(sentHeaders()["X-Yuvoy-Proxy-Secret"]).toBe(SECRET);
  });

  it("takes an IPv6 address as it is", () => {
    vi.stubEnv("PROXY_CLIENT_IP_SECRET", SECRET);
    expect(
      visitorAddressHeaders(new Headers({ "x-real-ip": "2001:db8::1" })),
    ).toEqual({
      "X-Yuvoy-Client-IP": "2001:db8::1",
      "X-Yuvoy-Proxy-Secret": SECRET,
    });
  });

  it("sends neither without the secret, so nothing changes until it is set", async () => {
    await callUpstream({
      method: "GET",
      path: "/me",
      token: "sess_abc",
      from: visit({ "x-real-ip": "203.0.113.9" }),
    });
    const names = Object.keys(sentHeaders()).map((n) => n.toLowerCase());
    expect(names).not.toContain("x-yuvoy-client-ip");
    expect(names).not.toContain("x-yuvoy-proxy-secret");
  });

  it("sends neither with a secret the API would not boot with", () => {
    const quiet = vi.spyOn(console, "warn").mockImplementation(() => {});
    for (const secret of ["short", `${SECRET.slice(0, 20)} ${SECRET}`]) {
      vi.stubEnv("PROXY_CLIENT_IP_SECRET", secret);
      expect(
        visitorAddressHeaders(new Headers({ "x-real-ip": "203.0.113.9" })),
      ).toEqual({});
    }
    // Said by name, never by value.
    for (const call of quiet.mock.calls) {
      expect(String(call[0])).not.toContain(SECRET.slice(0, 20));
    }
    quiet.mockRestore();
  });

  it("sends neither for an address that is not one bare address", () => {
    vi.stubEnv("PROXY_CLIENT_IP_SECRET", SECRET);
    for (const address of [
      "",
      "203.0.113.9, 198.51.100.1",
      "203.0.113.9:443",
      "[2001:db8::1]",
      "fe80::1%en0",
      "not an address",
    ]) {
      expect(
        visitorAddressHeaders(new Headers({ "x-real-ip": address })),
      ).toEqual({});
    }
    expect(visitorAddressHeaders(new Headers())).toEqual({});
    expect(visitorAddressHeaders(undefined)).toEqual({});
  });

  it("reads a page's own headers when there is no incoming request", async () => {
    vi.stubEnv("PROXY_CLIENT_IP_SECRET", SECRET);
    await callUpstream({
      method: "GET",
      path: "/me",
      token: "sess_abc",
      visitor: new Headers({ "x-real-ip": "203.0.113.9" }),
    });
    expect(sentHeaders()["X-Yuvoy-Client-IP"]).toBe("203.0.113.9");
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

/**
 * An API that has gone quiet (production readiness, 6 Oct 2026). The proxy
 * had no deadline, so a stalled call held the function until the platform's
 * own limit, and the throw escaped as a bare 500.
 */
describe("an API that does not answer", () => {
  /** A `fetch` that never answers, and rejects once its signal aborts. */
  function never() {
    return (_input: RequestInfo | URL, init?: RequestInit) =>
      new Promise<Response>((_, reject) => {
        const signal = init?.signal;
        if (signal?.aborted) reject(signal.reason);
        else signal?.addEventListener("abort", () => reject(signal.reason));
      });
  }

  afterEach(() => vi.useRealTimers());

  it("is given up on after eight seconds of silence on a read", async () => {
    vi.useFakeTimers();
    fetchMock.mockImplementation(never());
    const read = callUpstream({ method: "GET", path: "/me", token: "s" }).then(
      () => null,
      (e: unknown) => e,
    );

    await vi.advanceTimersByTimeAsync(7_999);
    await vi.advanceTimersByTimeAsync(1);
    expect(await read).toBeInstanceOf(StalledError);
  });

  it("is waited on longer for a write, whose outcome giving up cannot know", async () => {
    vi.useFakeTimers();
    fetchMock.mockImplementation(never());
    let settled = false;
    const write = callUpstream({
      method: "POST",
      path: "/reservations",
      body: { slotId: "slot_1" },
    }).then(
      () => null,
      (e: unknown) => {
        settled = true;
        return e;
      },
    );

    await vi.advanceTimersByTimeAsync(24_999);
    expect(settled).toBe(false);
    await vi.advanceTimersByTimeAsync(1);
    expect(await write).toBeInstanceOf(StalledError);
  });
});

describe("unreachable", () => {
  it("answers a stall as a 504 and a failed connection as a 502, in the envelope", async () => {
    vi.spyOn(console, "error").mockImplementation(() => {});
    const stalled = unreachable({
      where: "[proxy] GET /me",
      cause: new StalledError(8_000),
    });
    expect(stalled.status).toBe(504);
    expect(await stalled.json()).toEqual({
      error: {
        code: "internal_error",
        message: "We could not reach Yuvoy just now. Try again in a moment.",
      },
    });

    const refused = unreachable({
      where: "[proxy] GET /me",
      cause: new TypeError("fetch failed"),
    });
    expect(refused.status).toBe(502);
  });

  it("logs the cause, but not for a browser that went away first", () => {
    const log = vi.spyOn(console, "error").mockImplementation(() => {});
    const cause = new StalledError(8_000);
    unreachable({ where: "[proxy] GET /me", cause });
    expect(log).toHaveBeenCalledWith(
      "[proxy] GET /me: the API did not answer.",
      cause,
    );

    log.mockClear();
    const gone = new AbortController();
    gone.abort();
    unreachable({
      where: "[proxy] GET /me",
      cause,
      request: new Request("https://app.yuvoy.in/api/v1/me", {
        signal: gone.signal,
      }),
    });
    expect(log).not.toHaveBeenCalled();
  });
});
