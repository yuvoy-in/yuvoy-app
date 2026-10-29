import { describe, it, expect } from "vitest";
import { mapLink, planMoment, planTimeRange, rupees } from "./format";

/**
 * Plan times are read in the plan's zone, never the runner's: the suite runs
 * in whatever zone the server Mac is in, and these must not move with it.
 */

describe("planMoment", () => {
  it("reads the instant in the plan's zone", () => {
    // 13:30 UTC is 19:00 in Kolkata.
    expect(planMoment("2026-08-22T13:30:00Z", "Asia/Kolkata")).toBe(
      "Sat, 22 Aug, 19:00",
    );
    expect(planMoment("2026-08-22T13:30:00Z", "Europe/London")).toBe(
      "Sat, 22 Aug, 14:30",
    );
  });

  it("writes Sep, not Sept", () => {
    expect(planMoment("2026-09-16T12:00:00Z", "Asia/Kolkata")).toBe(
      "Wed, 16 Sep, 17:30",
    );
  });

  it("falls back to Kolkata for a zone this runtime does not know", () => {
    expect(planMoment("2026-08-22T13:30:00Z", "Not/AZone")).toBe(
      "Sat, 22 Aug, 19:00",
    );
  });

  it("has nothing for an instant that does not parse", () => {
    expect(planMoment("soon", "Asia/Kolkata")).toBeNull();
  });
});

describe("planTimeRange", () => {
  const tz = "Asia/Kolkata";

  it("writes the end as a clock time on the same day", () => {
    expect(
      planTimeRange("2026-08-22T13:30:00Z", "2026-08-22T17:30:00Z", tz),
    ).toBe("Sat, 22 Aug, 19:00 to 23:00");
  });

  it("writes the end's day when it is another one", () => {
    expect(
      planTimeRange("2026-08-22T16:30:00Z", "2026-08-22T19:30:00Z", tz),
    ).toBe("Sat, 22 Aug, 22:00 to Sun, 23 Aug, 01:00");
  });

  it("is just the start with no end, or an end that does not parse", () => {
    expect(planTimeRange("2026-08-22T13:30:00Z", undefined, tz)).toBe(
      "Sat, 22 Aug, 19:00",
    );
    expect(planTimeRange("2026-08-22T13:30:00Z", "later", tz)).toBe(
      "Sat, 22 Aug, 19:00",
    );
  });

  it("has no dash in it", () => {
    const line = planTimeRange("2026-08-22T13:30:00Z", "2026-08-22T17:30:00Z", tz);
    expect(line).not.toMatch(/[\u2012-\u2015\u2212]|\s-\s/);
  });
});

describe("rupees", () => {
  it("drops whole-rupee decimals and keeps paise", () => {
    expect(rupees(25000)).toBe("₹250");
    expect(rupees(100000)).toBe("₹1,000");
    expect(rupees(8333)).toBe("₹83.33");
  });
});

describe("mapLink", () => {
  it.each([
    "https://maps.app.goo.gl/AbCdEf123",
    "https://maps.google.com/?q=12.97,77.64",
    "https://www.google.com/maps/place/Indiranagar",
    "https://goo.gl/maps/AbCdEf",
  ])("keeps %s", (url) => {
    expect(mapLink(url)).toBe(new URL(url).href);
  });

  it.each([
    ["no link", undefined],
    ["empty", ""],
    ["javascript", "javascript:alert(1)"],
    ["data", "data:text/html,<b>x</b>"],
    ["plain http", "http://maps.google.com/?q=x"],
    ["another site", "https://example.com/maps"],
    ["a look-alike domain", "https://maps.google.com.example.com/"],
    ["google, not maps", "https://www.google.com/search?q=x"],
    ["a path that only starts with maps", "https://www.google.com/mapsevil"],
    ["a user in the link", "https://me@maps.google.com/"],
    ["a port", "https://maps.google.com:8443/"],
    ["not a link", "Asha's flat"],
  ])("drops %s", (_, url) => {
    expect(mapLink(url)).toBeNull();
  });
});
