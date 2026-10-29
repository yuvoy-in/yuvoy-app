import { describe, it, expect, vi, beforeEach } from "vitest";
import { APP, TOKEN, guestRequest, watchApi } from "../../../test/plan-link";

/**
 * What every plan guest route refuses before it asks the API anything
 * (yuvoy-mobile#373): a request this site's page did not send, a body that is
 * not declared JSON, a body that is not JSON, and a token of the wrong shape.
 * Table-driven over all five, so a sixth route, or one that forgets its
 * wrapper, fails here by name.
 */

vi.mock("@/lib/auth/session-cookie", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@/lib/auth/session-cookie")>()),
  readSessionCookie: async () => null,
  touchSessionCookie: async () => {},
  clearSessionCookie: async () => {},
}));

const ROUTES = {
  view: (await import("./view/route")).POST,
  reply: (await import("./reply/route")).POST,
  leave: (await import("./leave/route")).POST,
  link: (await import("./link/route")).POST,
  report: (await import("./report/route")).POST,
};

/** A body each route would otherwise send on. */
const BODIES: Record<keyof typeof ROUTES, unknown> = {
  view: { token: TOKEN },
  reply: { token: TOKEN, reply: { answers: [] } },
  leave: { token: TOKEN },
  link: { token: TOKEN },
  report: { token: TOKEN, report: { reason: "spam" } },
};

const NAMES = Object.keys(ROUTES) as (keyof typeof ROUTES)[];

let seen: ReturnType<typeof watchApi>;
beforeEach(() => {
  seen = watchApi();
});

describe.each(NAMES)("/p/api/%s", (name) => {
  const POST = ROUTES[name];
  const send = (
    options: Parameters<typeof guestRequest>[2],
    body = BODIES[name],
  ) => POST(guestRequest(name, body, options));

  async function refusedWith(response: Response, status: number) {
    expect(response.status).toBe(status);
    expect(seen).toHaveLength(0);
    const body = await response.json();
    expect(typeof body.error.code).toBe("string");
  }

  it("refuses another site, by Fetch Metadata", async () => {
    await refusedWith(
      await send({ headers: { "sec-fetch-site": "cross-site" } }),
      403,
    );
  });

  it("refuses a sibling on the same site, which is not the same origin", async () => {
    await refusedWith(
      await send({ headers: { "sec-fetch-site": "same-site" } }),
      403,
    );
  });

  it("refuses a link followed to it", async () => {
    await refusedWith(
      await send({ headers: { "sec-fetch-mode": "navigate" } }),
      403,
    );
  });

  it("without Fetch Metadata, refuses another Origin", async () => {
    await refusedWith(
      await send({
        omit: ["sec-fetch-site"],
        headers: { origin: "https://evil.example" },
      }),
      403,
    );
  });

  it("without Fetch Metadata, refuses a request with no Origin either", async () => {
    await refusedWith(await send({ omit: ["sec-fetch-site"] }), 403);
  });

  it("without Fetch Metadata, takes an Origin that is this host", async () => {
    const response = await send({
      omit: ["sec-fetch-site"],
      headers: { origin: APP },
    });
    expect(response.status).not.toBe(403);
  });

  it("refuses a body a form could send", async () => {
    for (const type of [
      "text/plain",
      "application/x-www-form-urlencoded",
      "multipart/form-data; boundary=x",
    ]) {
      await refusedWith(await send({ headers: { "content-type": type } }), 403);
    }
  });

  it("refuses a body with no content type", async () => {
    await refusedWith(await send({ omit: ["content-type"] }), 403);
  });

  it("takes JSON with a charset", async () => {
    const response = await send({
      headers: { "content-type": "application/json; charset=utf-8" },
    });
    expect(response.status).not.toBe(403);
  });

  it("refuses a body that is not JSON, or not an object", async () => {
    await refusedWith(await send({}, "{not json"), 400);
    await refusedWith(await send({}, [TOKEN]), 400);
    await refusedWith(await send({}, ""), 400);
  });

  it("answers a token of the wrong shape as the API would, without asking it", async () => {
    await refusedWith(
      await send({}, { ...(BODIES[name] as object), token: "yp_short" }),
      404,
    );
    await refusedWith(
      await send({}, { ...(BODIES[name] as object), token: undefined }),
      404,
    );
  });

  it("reads the token from the body only, never the address", async () => {
    const response = await send(
      { url: `${APP}/p/api/${name}?token=${TOKEN}` },
      { ...(BODIES[name] as object), token: undefined },
    );
    await refusedWith(response, 404);
  });

  it("is never cached, refused or not", async () => {
    const refused = await send({ headers: { "sec-fetch-site": "cross-site" } });
    expect(refused.headers.get("cache-control")).toBe("private, no-store");
    const answered = await send({});
    expect(answered.headers.get("cache-control")).toBe("private, no-store");
  });
});
