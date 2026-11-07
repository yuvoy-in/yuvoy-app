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
    // One table has a Back to the feed on every branch (yuvoy-app#194).
    ["/tables/7d3f9a2e-4c1b-4e8a-9f60-2b5d8c1e7a40", true],
    // A plan has its own Back, and its reply button at the foot of the form.
    ["/plans/8d2f6a10-3c4b-4e5f-8a9b-0c1d2e3f4a52", true],
    // A crew and its editor: a Back to People, and Save at the foot of a
    // long list (yuvoy-app#227).
    ["/people/crews/new", true],
    ["/people/crews/7b4d2e9f-3c5a-4d2b-8f1e-2e3d4c5b6a71", true],
    ["/people/crews/7b4d2e9f-3c5a-4d2b-8f1e-2e3d4c5b6a71/edit", true],
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
    // Organiser pages (yuvoy-app#224): a Back on every screen, from Account.
    ["/organiser", true],
    ["/organiser/new", true],
    ["/organiser/6f1c2a10-1b2c-4d3e-8f40-0a1b2c3d4e02/helpers", true],
    // The door (yuvoy-app#226), reached from the organiser pages.
    ["/door", true],
    // Date alerts (yuvoy-app#220): a Back to Account, which keeps the bar.
    ["/account/date-alerts", true],
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
