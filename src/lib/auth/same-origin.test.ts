import { describe, it, expect } from "vitest";
import { foreignRequest, sameOriginOnly, declaresJson } from "./same-origin";

const APP = "https://app.yuvoy.in";

function request(
  method: string,
  headers: Record<string, string>,
  body?: string,
): Request {
  return new Request(`${APP}/api/session`, {
    method,
    headers: {
      host: "app.yuvoy.in",
      ...(body !== undefined ? { "content-length": String(body.length) } : {}),
      ...headers,
    },
    body,
  });
}

/**
 * The login forgery (production readiness, 6 Oct 2026): a page on another
 * site auto-submits a text/plain form whose body happens to parse as JSON,
 * and the answer to that navigation sets the session cookie.
 */
const FORGED_BODY = '{"sessionToken":"ATTACKER","x":"="}';

describe("foreignRequest", () => {
  it("refuses the cross-site text/plain form that forged a sign-in", () => {
    const refused = foreignRequest(
      request(
        "POST",
        {
          "sec-fetch-site": "cross-site",
          "sec-fetch-mode": "navigate",
          origin: "https://evil.example",
          "content-type": "text/plain",
        },
        FORGED_BODY,
      ),
    );
    expect(refused?.status).toBe(403);
  });

  it("refuses a no-cors write from a sibling *.yuvoy.in host", () => {
    const refused = foreignRequest(
      request(
        "POST",
        {
          "sec-fetch-site": "same-site",
          "sec-fetch-mode": "no-cors",
          origin: "https://staging.yuvoy.in",
          "content-type": "text/plain",
        },
        "{}",
      ),
    );
    expect(refused?.status).toBe(403);
  });

  it("lets this app's own JSON write through", () => {
    expect(
      foreignRequest(
        request(
          "POST",
          {
            "sec-fetch-site": "same-origin",
            "sec-fetch-mode": "cors",
            origin: APP,
            "content-type": "application/json",
          },
          '{"phone":"+919999999999","code":"123456"}',
        ),
      ),
    ).toBeNull();
  });

  it("lets a bodiless write through with no Content-Type", () => {
    expect(
      foreignRequest(
        request("POST", { "sec-fetch-site": "same-origin", origin: APP }),
      ),
    ).toBeNull();
  });

  it("refuses a body not declared JSON, even from this origin", () => {
    const refused = foreignRequest(
      request(
        "POST",
        { "sec-fetch-site": "same-origin", "content-type": "text/plain" },
        FORGED_BODY,
      ),
    );
    expect(refused?.status).toBe(415);
  });

  describe("on an engine that sends no Fetch Metadata", () => {
    it("refuses a write whose Origin is another host", () => {
      const refused = foreignRequest(
        request(
          "POST",
          {
            origin: "https://staging.yuvoy.in",
            "content-type": "application/json",
          },
          "{}",
        ),
      );
      expect(refused?.status).toBe(403);
    });

    it("refuses an opaque Origin", () => {
      const refused = foreignRequest(
        request(
          "POST",
          { origin: "null", "content-type": "application/json" },
          "{}",
        ),
      );
      expect(refused?.status).toBe(403);
    });

    it("accepts this host's own Origin, under the name the platform forwards", () => {
      expect(
        foreignRequest(
          request(
            "POST",
            {
              origin: APP,
              host: "internal.vercel",
              "x-forwarded-host": "app.yuvoy.in",
              "content-type": "application/json",
            },
            "{}",
          ),
        ),
      ).toBeNull();
    });
  });

  it("refuses a document load, which is how a link gets a Lax cookie onto a GET", () => {
    const refused = foreignRequest(
      request("GET", {
        "sec-fetch-site": "cross-site",
        "sec-fetch-mode": "navigate",
      }),
    );
    expect(refused?.status).toBe(403);
  });

  it("lets this app's own reads through", () => {
    expect(
      foreignRequest(
        request("GET", {
          "sec-fetch-site": "same-origin",
          "sec-fetch-mode": "cors",
        }),
      ),
    ).toBeNull();
  });
});

describe("declaresJson", () => {
  it("reads the media type and ignores its parameters", () => {
    expect(declaresJson("application/json")).toBe(true);
    expect(declaresJson("Application/JSON; charset=utf-8")).toBe(true);
    expect(declaresJson("text/plain")).toBe(false);
    expect(declaresJson("application/x-www-form-urlencoded")).toBe(false);
    expect(declaresJson(null)).toBe(false);
  });
});

describe("sameOriginOnly", () => {
  const handler = sameOriginOnly(async () => Response.json({ signedIn: true }));

  it("never runs the handler for a refused request", async () => {
    let ran = false;
    const guarded = sameOriginOnly(async () => {
      ran = true;
      return Response.json({ adopted: true });
    });
    const answer = await guarded(
      request(
        "POST",
        { "sec-fetch-site": "cross-site", "content-type": "text/plain" },
        FORGED_BODY,
      ),
    );
    expect(answer.status).toBe(403);
    expect(ran).toBe(false);
  });

  it("marks every answer private and uncacheable, refusals included", async () => {
    const ok = await handler(
      request("GET", { "sec-fetch-site": "same-origin" }),
    );
    expect(ok.headers.get("cache-control")).toBe("private, no-store");
    const refused = await handler(
      request("GET", { "sec-fetch-mode": "navigate" }),
    );
    expect(refused.headers.get("cache-control")).toBe("private, no-store");
  });
});
