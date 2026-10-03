import { describe, expect, it } from "vitest";
import { http, HttpResponse } from "msw";
import { server } from "../../mocks/server";
import { EXPERIENCES } from "../../mocks/fixtures";
import sitemap from "./sitemap";

/*
  The sitemap's reads of the API, end to end against the contract's mocks.

  The business entries (yuvoy-app#116 item 5) shipped asking for 100
  listings a page. The contract's most is 50 and the API answers 100 with a
  400, so production would have listed no business; the mock clamped instead
  of refusing, and the derivation's own tests never made a request. This
  makes the request.
*/

const BASE = process.env.NEXT_PUBLIC_API_URL ?? "http://localhost:8099/v1";

async function paths(): Promise<string[]> {
  return (await sitemap()).map((entry) => new URL(entry.url).pathname);
}

describe("sitemap", () => {
  it("lists every business with a listing on sale", async () => {
    const businesses = (await paths()).filter((p) => p.startsWith("/o/"));

    const expected = new Set(
      EXPERIENCES.flatMap((e) => (e.operator?.slug ? [e.operator.slug] : [])),
    );
    expect(expected.size).toBeGreaterThan(0);
    expect(businesses.sort()).toEqual(
      [...expected].map((slug) => `/o/${slug}`).sort(),
    );
  });

  it("still lists everything else when the listings are refused", async () => {
    server.use(
      http.get(`${BASE}/experiences`, () =>
        HttpResponse.json(
          {
            error: {
              code: "invalid_input",
              message: "limit must be a whole number between 1 and 50",
            },
          },
          { status: 400 },
        ),
      ),
    );

    const all = await paths();
    expect(all).toContain("/");
    expect(all).toContain("/guides");
    expect(all.some((p) => p.startsWith("/e/"))).toBe(true);
    expect(all.some((p) => p.startsWith("/o/"))).toBe(false);
  });
});
