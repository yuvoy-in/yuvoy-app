import { describe, it, expect, vi, beforeEach } from "vitest";
import { http, HttpResponse } from "msw";
import { server } from "../../../../../mocks/server";

/**
 * Adding a way in (yuvoy-app#229): the cookie goes to the API as the bearer,
 * and nothing but `{ linked: true }` or the API's error envelope comes back.
 * Above all, never a token.
 */

const BASE = process.env.NEXT_PUBLIC_API_URL ?? "http://localhost:8099/v1";
const TOKEN = "sess_919000003210";

const jar = vi.hoisted(() => ({ token: null as string | null, cleared: 0 }));
vi.mock("@/lib/auth/session-cookie", () => ({
  readSessionCookie: async () => jar.token,
  clearSessionCookie: async () => {
    jar.cleared += 1;
  },
}));

const { POST } = await import("./route");

function own(body: unknown): Request {
  const text = JSON.stringify(body);
  return new Request("https://app.yuvoy.in/api/session/link", {
    method: "POST",
    headers: {
      "sec-fetch-site": "same-origin",
      "content-type": "application/json",
      "content-length": String(text.length),
    },
    body: text,
  });
}

/** `POST /me/sign-in/verify` answering `status` and `body`; returns what it saw. */
function verify(status: number, body: unknown) {
  const seen: { auth: string | null; body: unknown }[] = [];
  server.use(
    http.post(`${BASE}/me/sign-in/verify`, async ({ request }) => {
      seen.push({
        auth: request.headers.get("authorization"),
        body: await request.json(),
      });
      return HttpResponse.json(body as object, { status });
    }),
  );
  return seen;
}

beforeEach(() => {
  jar.token = TOKEN;
  jar.cleared = 0;
});

describe("adding a way in", () => {
  it("sends the cookie as the bearer and answers linked", async () => {
    const seen = verify(201, { linked: true });
    const answer = await POST(
      own({ email: "asha@example.com", code: "123456" }),
    );

    expect(answer.status).toBe(201);
    expect(await answer.json()).toEqual({ linked: true });
    expect(seen).toEqual([
      {
        auth: `Bearer ${TOKEN}`,
        body: { email: "asha@example.com", code: "123456" },
      },
    ]);
  });

  it("refuses with no cookie, and asks the API nothing", async () => {
    jar.token = null;
    const seen = verify(201, { linked: true });
    const answer = await POST(own({ phone: "+919811122233", code: "123456" }));

    expect(answer.status).toBe(401);
    expect((await answer.json()).error.code).toBe("unauthorized");
    expect(seen).toEqual([]);
  });

  it("never passes a token on, even inside a 201", async () => {
    verify(201, { linked: true, sessionToken: "sess_new", expiresAt: "x" });
    const answer = await POST(
      own({ email: "asha@example.com", code: "123456" }),
    );
    const text = await answer.text();

    expect(answer.status).toBe(201);
    expect(JSON.parse(text)).toEqual({ linked: true });
    expect(text).not.toContain("sess_new");
    expect(text).not.toContain("sessionToken");
  });

  it("treats a session minted instead of a link as a failure, and drops it", async () => {
    verify(200, {
      sessionToken: "sess_new",
      expiresAt: "2026-11-16T00:00:00Z",
    });
    const answer = await POST(
      own({ email: "asha@example.com", code: "123456" }),
    );
    const text = await answer.text();

    expect(answer.status).toBe(502);
    expect(text).not.toContain("sess_new");
  });

  it("passes the API's refusals on as an envelope, and keeps the cookie", async () => {
    for (const [status, code, message] of [
      [409, "identity_taken", "That already signs in to another account."],
      [409, "identity_kind_taken", "This account already has one."],
      [401, "fresh_sign_in_required", "Sign in again, then add this."],
      [401, "unauthorized", "That code did not work. Ask for a new one."],
      [503, "sign_in_unavailable", "Signing in this way is not open yet."],
    ] as const) {
      verify(status, { error: { code, message }, sessionToken: "sess_x" });
      const answer = await POST(
        own({ email: "asha@example.com", code: "123456" }),
      );
      const text = await answer.text();
      expect(answer.status).toBe(status);
      expect(JSON.parse(text)).toEqual({ error: { code, message } });
      expect(text).not.toContain("sess_x");
    }
    expect(jar.cleared).toBe(0);
  });

  it("refuses both ways at once, or no code, before asking the API", async () => {
    const seen = verify(201, { linked: true });
    for (const body of [
      { phone: "+919811122233", email: "a@example.com", code: "123456" },
      { email: "a@example.com" },
      {},
    ]) {
      expect((await POST(own(body))).status).toBe(400);
    }
    expect(seen).toEqual([]);
  });
});
