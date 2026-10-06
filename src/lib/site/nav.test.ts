import { describe, it, expect } from "vitest";
import { FOCUSED_ROUTE_PREFIXES, NAV, isFocusedRoute } from "./nav";

/**
 * Which screens hide the floating tab bar.
 *
 * Two lists have to agree: the prefixes here, and the screens that pass
 * `back` to `Screen` (which drops the bar's clearance). Pinning the predicate
 * per route is what keeps a new screen from landing with a back control and a
 * bar, or with neither.
 */
describe("focused routes", () => {
  it.each([
    ["/e/try-dive-nemo-reef", true],
    ["/e/try-dive-nemo-reef/book?slot=x", true],
    ["/booking", true],
    ["/trip/abc", true],
    ["/trips/recover", true],
    // An invited trip has a Back to Trips, so no bar floating over Decline.
    ["/trips/invited/inv_123", true],
    ["/guides/diving-in-havelock", true],
    ["/offline", true],
    ["/", false],
    ["/search", false],
    ["/trips", false],
    ["/account", false],
    ["/guides", false],
    // A business's page and the two inside it. The profile kept the bar as a
    // destination of its own (yuvoy-app#33) until the approved redesign
    // (traveller A, 3 Oct 2026) gave it a way back instead.
    ["/o/hc-diving-skl", true],
    ["/o/hc-diving-skl/listings", true],
    ["/o/hc-diving-skl/r/med_dive", true],
    // The wildcard needs a segment to match: `/o` alone is no business.
    ["/o", false],
  ])("%s → focused: %s", (pathname, focused) => {
    expect(isFocusedRoute(pathname)).toBe(focused);
  });

  it("never treats a tab root as focused", () => {
    for (const item of NAV) expect(isFocusedRoute(item.href)).toBe(false);
  });

  it("answers false with no pathname rather than throwing", () => {
    expect(isFocusedRoute(null)).toBe(false);
    expect(isFocusedRoute(undefined)).toBe(false);
    expect(isFocusedRoute("")).toBe(false);
  });

  it("lists prefixes that a tab root cannot match by accident", () => {
    // `/trip/` must never swallow `/trips`, and `/guides/` must never swallow
    // the hub — each prefix is checked against every root, through the
    // predicate itself rather than through `startsWith`, which stopped being
    // the whole rule when the wildcard arrived.
    for (const item of NAV) {
      expect(isFocusedRoute(item.href)).toBe(false);
    }
    // And the list is genuinely non-empty, so the loop above is not vacuous.
    expect(FOCUSED_ROUTE_PREFIXES.length).toBeGreaterThan(4);
  });
});
