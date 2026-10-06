import { describe, it, expect, vi, afterEach } from "vitest";
import {
  isSecureRequest,
  maxAgeFrom,
  readSessionCookie,
  readSessionToEnd,
  signOutOwed,
  SESSION_MAX_AGE,
  SESSION_COOKIE,
} from "./session-cookie";
import { OWED, SIGN_OUT_OWED_COOKIE } from "./sign-out-owed";

/**
 * The decisions the session cookie makes on its own (yuvoy-app#57).
 *
 * The writers are not here: they call `next/headers`, which needs a request
 * scope that only a running server has. What they do with the cookie jar is
 * asserted end to end in `e2e/session-cookie.spec.ts`, against the real
 * server. What is testable in isolation is the arithmetic, the protocol
 * decision and what the readers make of a jar, and each has a way of being
 * quietly wrong.
 */

/** The request's cookies, as `next/headers` hands them to the readers. */
const jar = vi.hoisted(() => new Map<string, string>());
vi.mock("next/headers", () => ({
  cookies: async () => ({
    get: (name: string) =>
      jar.has(name) ? { name, value: jar.get(name)! } : undefined,
  }),
}));

afterEach(() => vi.useRealTimers());

describe("the Secure attribute", () => {
  const req = (url: string, headers: Record<string, string> = {}) =>
    new Request(url, { headers });

  it("is on for https", () => {
    expect(isSecureRequest(req("https://app.yuvoy.in/api/session"))).toBe(true);
  });

  it("is OFF for plain http, so e2e can sign in at all", () => {
    /*
      This is the one that would have cost a day. e2e runs a PRODUCTION build
      over http://127.0.0.1:3100, and a `Secure` cookie is refused over plain
      HTTP: every signed-in test would fail looking exactly like a broken
      sign-in rather than a cookie attribute.
    */
    expect(isSecureRequest(req("http://127.0.0.1:3100/api/session"))).toBe(
      false,
    );
  });

  it("trusts x-forwarded-proto over the request's own scheme", () => {
    /*
      Vercel terminates TLS and forwards plain HTTP inwards. Reading only the
      request's protocol would drop `Secure` in production, which is the
      opposite failure and a silent one: the cookie still works, it is simply
      sendable over a downgraded connection.
    */
    expect(
      isSecureRequest(
        req("http://internal/api/session", { "x-forwarded-proto": "https" }),
      ),
    ).toBe(true);
    expect(
      isSecureRequest(
        req("https://internal/api/session", { "x-forwarded-proto": "http" }),
      ),
    ).toBe(false);
  });

  it("reads only the first hop of a chained x-forwarded-proto", () => {
    expect(
      isSecureRequest(
        req("http://internal/x", { "x-forwarded-proto": "https, http" }),
      ),
    ).toBe(true);
  });
});

describe("how long the cookie lives", () => {
  it("falls back to fourteen days when the API states no horizon", () => {
    expect(maxAgeFrom(null)).toBe(SESSION_MAX_AGE);
    expect(maxAgeFrom(undefined)).toBe(SESSION_MAX_AGE);
    expect(maxAgeFrom("")).toBe(SESSION_MAX_AGE);
  });

  it("follows the API's own expiry when it is shorter", () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2026-09-14T12:00:00Z"));
    // Three days out. The contract says to keep the cookie in step with this.
    expect(maxAgeFrom("2026-09-17T12:00:00Z")).toBe(3 * 24 * 60 * 60);
  });

  it("never outlives fourteen days, whatever the API says", () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2026-09-14T12:00:00Z"));
    /*
      A cookie that outlives the session it names is a signed-in screen whose
      first call 401s. The clamp is the difference between "the session ended"
      and "the app is broken".
    */
    expect(maxAgeFrom("2027-09-14T12:00:00Z")).toBe(SESSION_MAX_AGE);
  });

  it("falls back rather than writing a cookie that expires in the past", () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2026-09-14T12:00:00Z"));
    /*
      A skewed device clock, or a value already stale by the time it arrives.
      Zero or negative would delete the cookie on the very response that was
      meant to extend it, signing the traveller out mid-session.
    */
    expect(maxAgeFrom("2026-09-14T11:59:59Z")).toBe(SESSION_MAX_AGE);
    expect(maxAgeFrom("2020-01-01T00:00:00Z")).toBe(SESSION_MAX_AGE);
  });

  it("falls back on a value it cannot read", () => {
    expect(maxAgeFrom("not a date")).toBe(SESSION_MAX_AGE);
  });
});

describe("a sign-out still owed", () => {
  /*
    `yv_signed_out` (`sign-out-owed.ts`): while it is owed, nothing on this
    server acts for the person who signed out (production readiness,
    6 Oct 2026).
  */
  afterEach(() => jar.clear());

  it("counts no session while it is owed, and still names the one to end", async () => {
    jar.set(SESSION_COOKIE, "sess_919000000000");
    jar.set(SIGN_OUT_OWED_COOKIE, OWED);

    expect(await signOutOwed()).toBe(true);
    expect(await readSessionCookie()).toBeNull();
    expect(await readSessionToEnd()).toBe("sess_919000000000");
  });

  it("is not owed by a cleared one that is still reported, empty", async () => {
    /*
      The server clears it with an empty value and `Max-Age=0`, and an empty
      one can still be reported: by a browser that keeps it, or by the jar
      later in the same request. Counting it by its name alone would sign out,
      on every request, the person who has just signed in.
    */
    jar.set(SESSION_COOKIE, "sess_919000000000");
    jar.set(SIGN_OUT_OWED_COOKIE, "");

    expect(await signOutOwed()).toBe(false);
    expect(await readSessionCookie()).toBe("sess_919000000000");
  });
});

describe("the name", () => {
  it("is the one the issue specified, because DevTools is the acceptance test", () => {
    // "DevTools shows `yv_session` as HttpOnly" is how #57 says it is done.
    expect(SESSION_COOKIE).toBe("yv_session");
    expect(SESSION_MAX_AGE).toBe(1_209_600);
  });
});
