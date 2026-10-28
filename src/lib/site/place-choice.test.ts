import { describe, it, expect, afterEach } from "vitest";
import { PLACES } from "../../../mocks/fixtures";
import type { PlaceList, PlaceMarket } from "./places";
import {
  PLACE_COOKIE,
  PLACE_COOKIE_MAX_AGE,
  categoryParam,
  choiceFrom,
  clearPlaceCookie,
  goneAfterAnswer,
  hasDiscoverPlace,
  placeCookie,
  writePlaceCookie,
} from "./place-choice";

/**
 * Which place `/` shows, and the cookie that remembers it (yuvoy-app#179).
 *
 * The cookie's four conditions (section 6 point 11 of the R2-T4 note) each
 * have a test of their own below, by name, because the privacy page's
 * promise rests on every one of them: a later change that breaks one should
 * fail a test that says which.
 */

const KARNATAKA: PlaceMarket = {
  key: "karnataka",
  name: "Karnataka",
  mode: "discover",
  timezone: "Asia/Kolkata",
  currency: "INR",
  destinations: [
    {
      key: "karnataka/bengaluru",
      name: "Bengaluru",
      kind: "local",
      visibleTo: "staff",
    },
    {
      key: "karnataka/coorg",
      name: "Coorg",
      kind: "travel",
      visibleTo: "staff",
    },
  ],
};

const OPEN: PlaceList = { markets: [...PLACES.markets, KARNATAKA] };

/**
 * Every write to `document.cookie`, in order. An own property on the
 * document shadows jsdom's accessor for the test, and is deleted after.
 */
function recordCookies(): string[] {
  const written: string[] = [];
  Object.defineProperty(document, "cookie", {
    configurable: true,
    get: () => "",
    set: (value: string) => void written.push(value),
  });
  return written;
}

afterEach(() => {
  delete (document as { cookie?: string }).cookie;
});

describe("which place / shows", () => {
  it("is the bookable market's reels with nothing remembered", () => {
    const choice = choiceFrom(OPEN, undefined, null);
    expect(choice.shown).toEqual({ kind: "reels", market: PLACES.markets[0] });
    expect(choice.key).toBe("andaman");
    expect(choice.gone).toBeNull();
    expect(choice.cookie).toBeNull();
  });

  it("takes ?place= over the cookie", () => {
    const choice = choiceFrom(OPEN, "karnataka/coorg", "karnataka/bengaluru");
    expect(choice.shown.kind).toBe("found");
    expect(choice.key).toBe("karnataka/coorg");
    // And the browser remembers the link's place.
    expect(choice.cookie).toBe("write");
  });

  it("writes nothing when the link names the place already remembered", () => {
    const choice = choiceFrom(OPEN, "karnataka/coorg", "karnataka/coorg");
    expect(choice.key).toBe("karnataka/coorg");
    expect(choice.cookie).toBeNull();
  });

  it("ignores an unknown ?place= and reads the cookie", () => {
    for (const param of ["karnataka/mysuru", "goa", "<script>", ["andaman"]]) {
      const choice = choiceFrom(OPEN, param, "karnataka/bengaluru");
      expect(choice.key, String(param)).toBe("karnataka/bengaluru");
      expect(choice.cookie).toBeNull();
      expect(choice.gone).toBeNull();
    }
  });

  it("ignores a ?place= the caller's list does not have, even a real one", () => {
    // Andaman alone: a staff link opened by a visitor is just the reels.
    const choice = choiceFrom(PLACES, "karnataka/bengaluru", null);
    expect(choice.shown.kind).toBe("reels");
    expect(choice.cookie).toBeNull();
  });

  it("shows a remembered town", () => {
    const choice = choiceFrom(OPEN, undefined, "karnataka/bengaluru");
    expect(choice.shown).toMatchObject({
      kind: "found",
      market: { key: "karnataka" },
      destination: { key: "karnataka/bengaluru", name: "Bengaluru" },
    });
  });

  it("reads a bookable town as its market's reels, kept as the market", () => {
    const choice = choiceFrom(OPEN, "andaman/havelock", null);
    expect(choice.shown).toEqual({ kind: "reels", market: PLACES.markets[0] });
    expect(choice.key).toBe("andaman");
  });

  it("does not show a discover region with no town", () => {
    expect(choiceFrom(OPEN, "karnataka", null).shown.kind).toBe("reels");
  });

  it("keeps the cookie, and says nothing, when the list failed", () => {
    const choice = choiceFrom(
      null,
      "karnataka/bengaluru",
      "karnataka/bengaluru",
    );
    expect(choice.shown).toEqual({ kind: "reels", market: null });
    expect(choice.gone).toBeNull();
    expect(choice.cookie).toBeNull();
  });

  it("says a remembered place has gone once, and forgets it, when the list answered without it", () => {
    const choice = choiceFrom(PLACES, undefined, "karnataka/bengaluru");
    expect(choice.shown).toEqual({ kind: "reels", market: PLACES.markets[0] });
    // The market's name from the list; the town's is not in it any more.
    expect(choice.gone).toBe(
      `That place isn't available right now, so here's the ${PLACES.markets[0].name}.`,
    );
    expect(choice.cookie).toBe("clear");
  });

  it("forgets a cookie that is not a key, without a gone line", () => {
    const choice = choiceFrom(OPEN, undefined, "Bengaluru; id=7");
    expect(choice.shown.kind).toBe("reels");
    expect(choice.gone).toBeNull();
    expect(choice.cookie).toBe("clear");
  });

  it("names the place when its first page answered 404", () => {
    const found = choiceFrom(OPEN, undefined, "karnataka/coorg");
    const gone = goneAfterAnswer(OPEN, found, "karnataka/coorg");
    expect(gone.shown).toEqual({ kind: "reels", market: PLACES.markets[0] });
    expect(gone.gone).toBe(
      `Coorg isn't available right now, so here's the ${PLACES.markets[0].name}.`,
    );
    expect(gone.cookie).toBe("clear");
    // A link's place that 404s leaves somebody else's remembered place be.
    const linked = choiceFrom(OPEN, "karnataka/coorg", "karnataka/bengaluru");
    expect(
      goneAfterAnswer(OPEN, linked, "karnataka/bengaluru").cookie,
    ).toBeNull();
  });

  it("offers the picker only when the list holds a discover place", () => {
    expect(hasDiscoverPlace(PLACES)).toBe(false);
    expect(hasDiscoverPlace(null)).toBe(false);
    expect(hasDiscoverPlace(OPEN)).toBe(true);
    const empty = { ...KARNATAKA, destinations: [] };
    expect(hasDiscoverPlace({ markets: [...PLACES.markets, empty] })).toBe(
      false,
    );
  });
});

describe("the yv_place cookie (section 6 point 11)", () => {
  it("condition 1: holds the place key alone, checked against the caller's list first", () => {
    const written = recordCookies();
    expect(writePlaceCookie("karnataka/bengaluru", OPEN)).toBe(true);
    expect(written[0].split(";")[0]).toBe(
      `${PLACE_COOKIE}=karnataka/bengaluru`,
    );

    // A bookable market's key, and a bookable town kept as its market.
    expect(writePlaceCookie("andaman/havelock", OPEN)).toBe(true);
    expect(written[1].split(";")[0]).toBe(`${PLACE_COOKIE}=andaman`);

    // Not in this caller's list, or not a key at all: nothing written.
    expect(writePlaceCookie("karnataka/bengaluru", PLACES)).toBe(false);
    expect(writePlaceCookie("karnataka/mysuru", OPEN)).toBe(false);
    expect(writePlaceCookie("x; Path=/admin", OPEN)).toBe(false);
    expect(writePlaceCookie("andaman", null)).toBe(false);
    expect(written).toHaveLength(2);
  });

  it("condition 2: carries no id and nothing about the person", () => {
    const written = recordCookies();
    writePlaceCookie("karnataka/coorg", OPEN);
    const [pair, ...attributes] = written[0].split("; ");
    // One name and one value, and the value is the key.
    expect(pair).toBe("yv_place=karnataka/coorg");
    // Every other part is one of the four attributes, none of them a value
    // anybody could be told apart by.
    for (const attribute of attributes) {
      expect(attribute).toMatch(/^(Path=\/|Max-Age=\d+|SameSite=Lax|Secure)$/);
    }
  });

  it("condition 3: is SameSite=Lax, Path=/ and, on https, Secure", () => {
    const https = placeCookie("andaman", true).split("; ");
    expect(https).toContain("SameSite=Lax");
    expect(https).toContain("Path=/");
    expect(https).toContain("Secure");
    // The same attributes on the page's own protocol, as written.
    const written = recordCookies();
    writePlaceCookie("andaman", OPEN);
    expect(written[0].split("; ")).toEqual(
      expect.arrayContaining(["SameSite=Lax", "Path=/"]),
    );
  });

  it("condition 4: lasts 180 days and no longer", () => {
    expect(PLACE_COOKIE_MAX_AGE).toBe(15552000);
    expect(PLACE_COOKIE_MAX_AGE).toBeLessThanOrEqual(180 * 24 * 60 * 60);
    expect(placeCookie("andaman", true).split("; ")).toContain(
      "Max-Age=15552000",
    );
  });

  it("is forgotten with the same name and path", () => {
    const written = recordCookies();
    clearPlaceCookie();
    expect(written[0]).toMatch(/^yv_place=; Path=\/; Max-Age=0; SameSite=Lax/);
  });
});

describe("?category=", () => {
  it("keeps one of the contract's departments and ignores anything else", () => {
    expect(categoryParam("food_drink")).toBe("food_drink");
    expect(categoryParam("Food & drink")).toBeNull();
    expect(categoryParam(["food_drink"])).toBeNull();
    expect(categoryParam(undefined)).toBeNull();
  });
});
