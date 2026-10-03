import { describe, expect, it } from "vitest";
import { http, HttpResponse } from "msw";
import { server } from "../../../mocks/server";
import {
  firstListings,
  guideListings,
  GUIDE_LISTINGS,
} from "./matching-listings";

/*
  The listings at the foot of a guide (yuvoy-app#116 item 4), read through
  the feed endpoint Search uses, each once.
*/

const BASE = process.env.NEXT_PUBLIC_API_URL ?? "http://localhost:8099/v1";

const reel = (slug: string) => ({
  media: { id: `m_${slug}` },
  experience: { slug, title: slug } as never,
});

/** Records what each read of the feed asked, and lets the mock answer it. */
function recordReads(): URLSearchParams[] {
  const asked: URLSearchParams[] = [];
  server.use(
    http.get(`${BASE}/reels`, ({ request }) => {
      asked.push(new URL(request.url).searchParams);
    }),
  );
  return asked;
}

describe("guideListings", () => {
  it("asks the feed with the guide's own activity type", async () => {
    const asked = recordReads();

    const listings = await guideListings({ activityType: "scuba" });

    expect(asked.map((q) => Object.fromEntries(q))).toEqual([
      { limit: "30", activityType: "scuba" },
    ]);
    // The mock's one scuba listing, once, though it has more than one reel.
    expect(listings.map((l) => l.slug)).toEqual(["try-dive-nemo-reef"]);
  });

  it("asks the feed with the guide's own category", async () => {
    const asked = recordReads();

    await guideListings({ category: "adventure" });

    expect(asked.map((q) => Object.fromEntries(q))).toEqual([
      { limit: "30", category: "adventure" },
    ]);
  });

  it("throws when the feed refuses, so a failure is never cached as nothing", async () => {
    server.use(
      http.get(`${BASE}/reels`, () =>
        HttpResponse.json(
          { error: { code: "invalid_input", message: "Not a category." } },
          { status: 400 },
        ),
      ),
    );

    await expect(guideListings({ category: "adventure" })).rejects.toThrow();
  });
});

describe("firstListings", () => {
  it("takes each listing once, in reel order, up to what a guide shows", () => {
    const items = ["a", "b", "a", "c", "d", "b", "e"].map(reel);
    expect(firstListings(items).map((l) => l.slug)).toEqual(
      ["a", "b", "c", "d", "e"].slice(0, GUIDE_LISTINGS),
    );
  });

  it("skips a reel with no listing on it", () => {
    expect(
      firstListings([{ experience: undefined }, reel("a")]).map((l) => l.slug),
    ).toEqual(["a"]);
  });
});
