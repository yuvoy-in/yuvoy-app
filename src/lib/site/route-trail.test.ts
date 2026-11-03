import { describe, it, expect, vi } from "vitest";
import {
  EMPTY_TRAIL,
  cameFrom,
  originOf,
  visit,
  type TrailState,
} from "./route-trail";

/**
 * The trail behind "Back returns to where you came from" (the approved
 * redesign, traveller A, 3 Oct 2026). Pure: a visit in, a trail out.
 */

const walk = (...hrefs: string[]): TrailState =>
  hrefs.reduce((state, href) => visit(state, href), EMPTY_TRAIL);

const stepBack = (state: TrailState): TrailState => ({
  ...state,
  stepBack: true,
});

const paths = (state: TrailState) => state.trail.map((v) => v.href);

describe("visit", () => {
  it("adds each new screen", () => {
    expect(paths(walk("/", "/search?q=dive", "/e/a"))).toEqual([
      "/",
      "/search?q=dive",
      "/e/a",
    ]);
  });

  it("keeps the latest query for the same screen, rather than a second visit", () => {
    // The search screen writes its query with `router.replace`.
    expect(paths(walk("/search", "/search?q=d", "/search?q=dive"))).toEqual([
      "/search?q=dive",
    ]);
  });

  it("returns the same state for a visit it already has, so nothing re-renders", () => {
    const state = walk("/", "/e/a");
    expect(visit(state, "/e/a")).toBe(state);
  });

  it("takes the current screen off on a step back to the one before", () => {
    const state = walk("/", "/e/a", "/o/op");
    expect(paths(visit(stepBack(state), "/e/a"))).toEqual(["/", "/e/a"]);
  });

  it("treats an ordinary link onto the screen before as a step forward", () => {
    // Listing, then its business, then a tap on that same listing: they are
    // on it FROM the business now, and Back should say so.
    const state = walk("/", "/e/a", "/o/op", "/e/a");
    expect(paths(state)).toEqual(["/", "/e/a", "/o/op", "/e/a"]);
  });

  it("treats a step back that lands elsewhere as a step forward", () => {
    // The browser's forward button also fires popstate.
    const state = walk("/", "/e/a");
    expect(paths(visit(stepBack(state), "/o/op"))).toEqual([
      "/",
      "/e/a",
      "/o/op",
    ]);
  });

  it("clears the step back once it is spent", () => {
    const state = visit(stepBack(walk("/", "/e/a", "/o/op")), "/e/a");
    expect(state.stepBack).toBe(false);
  });

  it("keeps a browser back that beat a recording for the screen it landed on", () => {
    // Back from the business's page before its visit was recorded: that
    // visit is a step forward, and the step back waits for the listing.
    const pending: TrailState = {
      ...walk("/", "/e/a"),
      stepBack: true,
      leaving: "/o/op",
    };
    const left = visit(pending, "/o/op");
    expect(paths(left)).toEqual(["/", "/e/a", "/o/op"]);
    expect(left.stepBack).toBe(true);
    const landed = visit(left, "/e/a");
    expect(paths(landed)).toEqual(["/", "/e/a"]);
    expect(landed.stepBack).toBe(false);
  });

  it("keeps a bounded trail", () => {
    const hrefs = Array.from({ length: 80 }, (_, i) => `/e/${i}`);
    const state = walk(...hrefs);
    expect(state.trail).toHaveLength(50);
    expect(state.trail.at(-1)?.href).toBe("/e/79");
  });
});

describe("cameFrom", () => {
  it("is the screen before this one", () => {
    expect(cameFrom(walk("/search?q=dive", "/e/a"), "/e/a")).toBe(
      "/search?q=dive",
    );
  });

  it("is right on the screen's first render, before the visit is recorded", () => {
    // The page renders before the recorder's effect runs.
    expect(cameFrom(walk("/search?q=dive"), "/e/a")).toBe("/search?q=dive");
  });

  it("is right on the first render after a step back, too", () => {
    // Back from the business's page to the listing: before the recorder runs,
    // the trail still ends on the business. The listing must not offer Back
    // to it, which would be a loop.
    const state = stepBack(walk("/", "/e/a", "/o/op"));
    expect(cameFrom(state, "/e/a")).toBe("/");
  });

  it("is nothing for the first screen of a visit", () => {
    expect(cameFrom(EMPTY_TRAIL, "/e/a")).toBeNull();
    expect(cameFrom(walk("/e/a"), "/e/a")).toBeNull();
  });
});

describe("originOf", () => {
  it.each([
    ["/", "the feed"],
    ["/search?q=dive&days=2", "search"],
    ["/search/r/med_1", "the reel"],
    ["/r/med_1", "the reel"],
    ["/saved", "your saved experiences"],
    ["/e/try-dive", "the listing"],
    ["/o/sample-dive-operator", "the business's page"],
    ["/o/sample-dive-operator/listings", "what they run"],
    ["/o/sample-dive-operator/r/med_1", "their reels"],
    ["/trips", "your trips"],
    ["/booking?ref=YV-1", "your booking"],
    ["/guides", "guides"],
    ["/guides/permits", "the guide"],
    ["/account", "your account"],
    ["/help", "help"],
  ])("%s is %s, and keeps its query", (href, label) => {
    expect(originOf(href)).toEqual({ href, label });
  });

  it.each([
    // Steps nobody wants to be sent back into.
    "/e/try-dive/book?date=2026-10-16",
    "/trips/recover",
    "/offline",
    "/go/instagram",
    "/i/abc123",
    // Nothing deeper than the screens it names.
    "/e/try-dive/extra",
    "/o/op/listings/more",
  ])("%s is not somewhere Back returns to", (href) => {
    expect(originOf(href)).toBeNull();
  });
});

/**
 * The store, in each order the browser's back can reach it. React decides
 * when the recorder's effects run, so each test plays one order by hand.
 */
describe("the browser's back, in any order (yuvoy-app#215)", () => {
  const fresh = async () => {
    vi.resetModules();
    return import("./route-trail");
  };
  type Trail = Awaited<ReturnType<typeof fresh>>;

  // Listing, then the business's page, both drawn and recorded.
  const listingThenBusiness = (t: Trail) => {
    t.noteShown("/e/a");
    t.recordVisit("/e/a");
    t.noteShown("/o/op");
    t.recordVisit("/o/op");
  };

  it("is a step back when it beats the recording of the screen it left", async () => {
    const t = await fresh();
    t.noteShown("/e/a");
    t.recordVisit("/e/a");
    // The business's page is drawn, its visit not yet recorded: with a view
    // transition React runs that effect once the transition is ready.
    t.noteShown("/o/op");
    // The browser's back, seen by the listener inside popstate.
    t.markStepBack("/e/a");
    // Both visits then recorded outside the event.
    t.recordVisit("/o/op");
    t.noteShown("/e/a");
    t.recordVisit("/e/a");

    expect(paths(t.__routeTrail())).toEqual(["/e/a"]);
    expect(cameFrom(t.__routeTrail(), "/e/a")).toBeNull();
  });

  it("is a step back when React draws the listing inside the event", async () => {
    const t = await fresh();
    listingThenBusiness(t);
    t.noteShown("/e/a");
    t.recordVisit("/e/a", true);
    t.markStepBack("/e/a");
    expect(paths(t.__routeTrail())).toEqual(["/e/a"]);
    expect(t.__routeTrail().stepBack).toBe(false);
  });

  it("is a step back when the listing is drawn after the event", async () => {
    const t = await fresh();
    listingThenBusiness(t);
    t.markStepBack("/e/a");
    t.noteShown("/e/a");
    t.recordVisit("/e/a");
    expect(paths(t.__routeTrail())).toEqual(["/e/a"]);
    expect(t.__routeTrail().stepBack).toBe(false);
  });

  it("is no step at all when only the fragment moved", async () => {
    const t = await fresh();
    listingThenBusiness(t);
    t.markStepBack("/o/op");
    expect(t.__routeTrail().stepBack).toBe(false);
    t.noteShown("/e/a");
    t.recordVisit("/e/a");
    expect(paths(t.__routeTrail())).toEqual(["/e/a", "/o/op", "/e/a"]);
  });

  it("is spent by a landing the page sends on to another path", async () => {
    const t = await fresh();
    listingThenBusiness(t);
    t.noteShown("/e/b");
    t.recordVisit("/e/b");
    // A back to the business's page whose landing is never recorded there:
    // the page sends the browser on to another path on the client, as
    // /f/<id> does for a merged card.
    t.markStepBack("/o/op");
    t.noteShown("/o/c");
    t.recordVisit("/o/c");
    expect(t.__routeTrail().stepBack).toBe(false);
    expect(t.steppingBack()).toBe(false);
    // A later tap onto the business's page is a step forward, not the old
    // back finally landing.
    t.noteShown("/o/op");
    t.recordVisit("/o/op");
    expect(paths(t.__routeTrail())).toEqual([
      "/e/a",
      "/o/op",
      "/e/b",
      "/o/c",
      "/o/op",
    ]);
  });

  it("is spent by a redirected landing after the screen it left is recorded", async () => {
    const t = await fresh();
    listingThenBusiness(t);
    // The business's page is drawn, not yet recorded, and the back's landing
    // is sent on to another path.
    t.noteShown("/e/b");
    t.markStepBack("/o/op");
    t.recordVisit("/e/b");
    expect(t.__routeTrail().stepBack).toBe(true);
    t.noteShown("/o/c");
    t.recordVisit("/o/c");
    expect(t.__routeTrail().stepBack).toBe(false);
  });

  it("is a step back inside the event after a redirected landing", async () => {
    const t = await fresh();
    listingThenBusiness(t);
    t.noteShown("/e/b");
    t.recordVisit("/e/b");
    t.markStepBack("/o/op");
    t.noteShown("/o/c");
    t.recordVisit("/o/c");
    // The next back is drawn inside the event: it is the step back.
    t.noteShown("/e/b");
    t.recordVisit("/e/b", true);
    t.markStepBack("/e/b");
    expect(paths(t.__routeTrail())).toEqual(["/e/a", "/o/op", "/e/b"]);
    expect(t.__routeTrail().stepBack).toBe(false);
  });
});
