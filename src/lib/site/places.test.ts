import { describe, it, expect, vi, afterEach } from "vitest";
import { http, HttpResponse } from "msw";
import { server } from "../../../mocks/server";
import { PLACES, SAMPLE_SECOND_MARKET } from "../../../mocks/fixtures";
import {
  feedHeading,
  getPlaces,
  marketName,
  marketNames,
  marketPhrase,
  type PlaceList,
} from "./places";

/**
 * Places named from `GET /places` rather than written into the app
 * (yuvoy-app#181, R0-T5). With Andaman the one market, every sentence reads
 * exactly as it did when "the Andaman Islands" was typed into it, which the
 * first test pins word for word.
 */

const BASE = process.env.NEXT_PUBLIC_API_URL ?? "http://localhost:8099/v1";

const TWO: PlaceList = { markets: [...PLACES.markets, SAMPLE_SECOND_MARKET] };

afterEach(() => vi.restoreAllMocks());

describe("place names", () => {
  it("names the one bookable market in the feed heading", () => {
    // Today's words, exactly, now from data.
    expect(feedHeading(PLACES)).toBe("Experiences in the Andaman Islands");
    expect(marketPhrase(PLACES, "andaman")).toBe("the Andaman Islands");
    // A market with no phrase of its own reads as the API names it.
    expect(feedHeading({ markets: [SAMPLE_SECOND_MARKET] })).toBe(
      "Experiences in Goa",
    );
  });

  it("says Experiences you can book when two markets are bookable", () => {
    expect(feedHeading(TWO)).toBe("Experiences you can book");

    // A place for finding things to do, and a market with nothing open to
    // everybody yet, are not markets to book in.
    const discover = { ...SAMPLE_SECOND_MARKET, mode: "discover" as const };
    expect(feedHeading({ markets: [...PLACES.markets, discover] })).toBe(
      "Experiences in the Andaman Islands",
    );
    const empty = { ...SAMPLE_SECOND_MARKET, destinations: [] };
    expect(feedHeading({ markets: [...PLACES.markets, empty] })).toBe(
      "Experiences in the Andaman Islands",
    );
    expect(feedHeading({ markets: [] })).toBe("Experiences you can book");
  });

  it("names a listing's market from the list", () => {
    expect(marketName(PLACES, "andaman")).toBe("Andaman Islands");
    expect(marketName(TWO, "goa")).toBe("Goa");
    expect(marketPhrase(TWO, "goa")).toBe("Goa");
    expect(marketNames(TWO)).toEqual({
      andaman: "Andaman Islands",
      goa: "Goa",
    });
    // A market the list does not have is not guessed at.
    expect(marketName(PLACES, "goa")).toBeNull();
  });

  it("leaves the place out when the list did not load", () => {
    expect(marketName(null, "andaman")).toBeNull();
    expect(marketPhrase(null, "andaman")).toBeNull();
    expect(marketName(PLACES, undefined)).toBeNull();
    expect(marketNames(null)).toEqual({});
    // Never "Andaman" as a fallback: the heading names no place at all.
    expect(feedHeading(null)).toBe("Experiences you can book");
  });
});

describe("reading the list", () => {
  it("asks GET /places, cached for five minutes and with no session", async () => {
    const asked: { url: string; init?: RequestInit }[] = [];
    vi.stubGlobal(
      "fetch",
      vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
        asked.push({ url: String(input), init });
        return HttpResponse.json(PLACES);
      }),
    );
    try {
      expect(await getPlaces()).toEqual(PLACES);
    } finally {
      vi.unstubAllGlobals();
    }
    expect(asked).toHaveLength(1);
    expect(asked[0].url).toBe(`${BASE}/places`);
    // Next's Data Cache keeps it as the API's edge does, so a static page
    // stays static and the feed's server render rarely waits on it.
    expect((asked[0].init as { next?: unknown }).next).toEqual({
      revalidate: 300,
    });
    // The same list for everybody: no credential rides along.
    expect(new Headers(asked[0].init?.headers).get("authorization")).toBeNull();
  });

  it("answers null, never a guess, and logs the outage once", async () => {
    const log = vi.spyOn(console, "error").mockImplementation(() => {});
    server.use(
      http.get(`${BASE}/places`, () =>
        HttpResponse.json(
          { error: { code: "invalid_input", message: "Not now." } },
          { status: 400 },
        ),
      ),
    );
    expect(await getPlaces()).toBeNull();
    expect(await getPlaces()).toBeNull();
    expect(log).toHaveBeenCalledTimes(1);

    // Back again: read, and the next outage is logged afresh.
    server.use(http.get(`${BASE}/places`, () => HttpResponse.json(PLACES)));
    expect(await getPlaces()).toEqual(PLACES);
    server.use(
      http.get(`${BASE}/places`, () => HttpResponse.json({ nope: true })),
    );
    expect(await getPlaces()).toBeNull();
    expect(log).toHaveBeenCalledTimes(2);
  });
});
