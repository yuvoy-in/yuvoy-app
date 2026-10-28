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

  it("lists each found card the API calls indexable, daily at 0.6", async () => {
    server.use(
      http.get(`${BASE}/events/index`, () =>
        HttpResponse.json({
          entries: [
            {
              id: "0f6d2a52-6a77-4c39-9a52-6b1c3a8e2f10",
              destinationKey: "karnataka/bengaluru",
              lastModified: "2026-10-28T06:00:00Z",
            },
          ],
        }),
      ),
    );

    const found = (await sitemap()).filter((e) =>
      new URL(e.url).pathname.startsWith("/f/"),
    );
    expect(found).toHaveLength(1);
    expect(new URL(found[0].url).pathname).toBe(
      "/f/0f6d2a52-6a77-4c39-9a52-6b1c3a8e2f10",
    );
    expect(found[0].changeFrequency).toBe("daily");
    expect(found[0].priority).toBe(0.6);
    expect(found[0].lastModified).toEqual(new Date("2026-10-28T06:00:00Z"));
  });

  it("lists no found card while the index is empty, or not answering", async () => {
    for (const answer of [
      () => HttpResponse.json({ entries: [] }),
      () =>
        HttpResponse.json(
          { error: { code: "unavailable", message: "down" } },
          { status: 503 },
        ),
    ]) {
      server.use(http.get(`${BASE}/events/index`, answer));
      const all = await paths();
      expect(all.some((p) => p.startsWith("/f/"))).toBe(false);
      // The rest of the sitemap stands either way.
      expect(all).toContain("/");
    }
  });
});
