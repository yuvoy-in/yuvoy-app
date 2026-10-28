import { describe, it, expect, vi, afterEach } from "vitest";
import { PLACES } from "../../../mocks/fixtures";
import type { PlaceList, PlaceMarket } from "./places";
import { nearYou } from "./near-you";

/**
 * Near you (DEC-14 A, section 6 point 3): an Indian state from Vercel's
 * headers, then that state's first local place in the server's order.
 */

const KARNATAKA: PlaceMarket = {
  key: "karnataka",
  name: "Karnataka",
  mode: "discover",
  timezone: "Asia/Kolkata",
  currency: "INR",
  destinations: [
    { key: "karnataka/coorg", name: "Coorg", kind: "travel", visibleTo: "all" },
    {
      key: "karnataka/bengaluru",
      name: "Bengaluru",
      kind: "local",
      visibleTo: "all",
    },
    {
      key: "karnataka/mysuru",
      name: "Mysuru",
      kind: "local",
      visibleTo: "all",
    },
  ],
};

const TELANGANA: PlaceMarket = {
  key: "telangana",
  name: "Telangana",
  mode: "discover",
  timezone: "Asia/Kolkata",
  currency: "INR",
  destinations: [
    {
      key: "telangana/hyderabad",
      name: "Hyderabad",
      kind: "local",
      visibleTo: "all",
    },
  ],
};

const LIST: PlaceList = { markets: [...PLACES.markets, TELANGANA, KARNATAKA] };

function from(values: Record<string, string>): Headers {
  return new Headers(values);
}

afterEach(() => vi.restoreAllMocks());

describe("Near you", () => {
  it("maps TG and TS to Telangana", () => {
    for (const region of ["TG", "TS"]) {
      expect(
        nearYou(
          from({
            "x-vercel-ip-country": "IN",
            "x-vercel-ip-country-region": region,
          }),
          LIST,
        ),
      ).toEqual({ key: "telangana/hyderabad", name: "Hyderabad" });
    }
  });

  it("maps KA to Karnataka's first local place, in the server's order", () => {
    // Coorg comes first but is a travel place; Mysuru is local but second.
    expect(
      nearYou(
        from({
          "x-vercel-ip-country": "IN",
          "x-vercel-ip-country-region": "KA",
        }),
        LIST,
      ),
    ).toEqual({ key: "karnataka/bengaluru", name: "Bengaluru" });
  });

  it("offers nothing without the region header", () => {
    expect(nearYou(from({ "x-vercel-ip-country": "IN" }), LIST)).toBeNull();
    expect(nearYou(from({}), LIST)).toBeNull();
    expect(nearYou(null, LIST)).toBeNull();
  });

  it("offers nothing in a country other than India, or with no country", () => {
    // `KA` is also a region code outside India.
    expect(
      nearYou(
        from({
          "x-vercel-ip-country": "US",
          "x-vercel-ip-country-region": "KA",
        }),
        LIST,
      ),
    ).toBeNull();
    expect(
      nearYou(from({ "x-vercel-ip-country-region": "KA" }), LIST),
    ).toBeNull();
  });

  it("offers nothing for a region with no open local place", () => {
    const travelOnly: PlaceMarket = {
      ...KARNATAKA,
      destinations: [KARNATAKA.destinations[0]],
    };
    const headers = from({
      "x-vercel-ip-country": "IN",
      "x-vercel-ip-country-region": "KA",
    });
    expect(nearYou(headers, { markets: [travelOnly] })).toBeNull();
    // A state with no market in this caller's list (explore off: Andaman alone).
    expect(nearYou(headers, PLACES)).toBeNull();
    // A state this does not map.
    expect(
      nearYou(
        from({
          "x-vercel-ip-country": "IN",
          "x-vercel-ip-country-region": "MH",
        }),
        LIST,
      ),
    ).toBeNull();
    expect(nearYou(headers, null)).toBeNull();
  });

  it("keeps and logs nothing", () => {
    const log = vi.spyOn(console, "log").mockImplementation(() => {});
    const info = vi.spyOn(console, "info").mockImplementation(() => {});
    const error = vi.spyOn(console, "error").mockImplementation(() => {});
    const before = document.cookie;
    nearYou(
      from({ "x-vercel-ip-country": "IN", "x-vercel-ip-country-region": "KA" }),
      LIST,
    );
    expect(log).not.toHaveBeenCalled();
    expect(info).not.toHaveBeenCalled();
    expect(error).not.toHaveBeenCalled();
    expect(document.cookie).toBe(before);
  });
});
