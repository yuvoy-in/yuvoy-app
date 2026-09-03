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
    ["/guides/diving-in-havelock", true],
    ["/offline", true],
    ["/", false],
    ["/search", false],
    ["/trips", false],
    ["/account", false],
    ["/guides", false],
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
    // the hub — each prefix is checked against every root.
    for (const prefix of FOCUSED_ROUTE_PREFIXES) {
      for (const item of NAV) {
        expect(item.href.startsWith(prefix)).toBe(false);
      }
    }
  });
});
