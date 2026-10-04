import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import {
  BAR_MOTION,
  MOTION,
  PICTURE_MOTION,
  REEL_MOTION,
  SHEET_MOTION,
  STAGE_MOTION,
  pathOf,
  pictureName,
  routeMotion,
} from "./route-motion";

/**
 * Which screen change moves which way (T01 C and A, T02 C, T03 B; approved
 * 4 Oct 2026). The table is the decision; the screens only answer it.
 */
describe("routeMotion", () => {
  const cases: [string, string, string | null, boolean?][] = [
    // T01 C: into a focused screen, from a tab root or another focused one.
    ["/trips", "/booking", MOTION.deeper],
    ["/account", "/saved", MOTION.deeper],
    ["/account", "/help", MOTION.deeper],
    ["/e/try-dive", "/e/try-dive/book", MOTION.deeper],
    ["/e/try-dive", "/o/havelock-divers", MOTION.deeper],
    ["/search", "/search/r/abc", MOTION.deeper],
    ["/guides", "/guides/first-dive", MOTION.deeper],
    // T01 C reversed, by a Back control.
    ["/booking", "/trips", MOTION.back, true],
    ["/help", "/account", MOTION.back, true],
    ["/e/try-dive/book", "/e/try-dive", MOTION.back, true],
    // T01 A: between tab roots, and forward out of a focused screen.
    ["/", "/search", MOTION.sideways],
    ["/search", "/trips", MOTION.sideways],
    ["/trips", "/account", MOTION.sideways],
    ["/account", "/", MOTION.sideways],
    ["/booking", "/trips", MOTION.sideways],
    ["/r/abc", "/", MOTION.sideways],
    // A reel has no sheet to drop: leaving one by Back is a change of place.
    ["/search/r/abc", "/search", MOTION.sideways, true],
    // T02 C: a reel and the page to its right, from every reel screen.
    ["/", "/e/try-dive", MOTION.reelOpen],
    ["/search/r/abc", "/e/try-dive", MOTION.reelOpen],
    ["/saved/r/abc", "/e/try-dive", MOTION.reelOpen],
    ["/o/havelock-divers/r/abc", "/e/try-dive", MOTION.reelOpen],
    ["/r/abc", "/e/try-dive", MOTION.reelOpen],
    ["/e/try-dive", "/", MOTION.reelBack, true],
    ["/e/try-dive", "/search/r/abc", MOTION.reelBack, true],
    ["/o/havelock-divers", "/", MOTION.reelBack, true],
    // T03 B: a saved picture and its listing.
    ["/saved", "/e/try-dive", MOTION.picture],
    ["/e/try-dive", "/saved", MOTION.pictureBack, true],
    // A query on the same screen, and anything not an in-app path: still.
    ["/search", "/search?q=dive", null],
    ["/trips", "/trips", null],
    ["/e/try-dive", "#cancellation", null],
    ["/e/try-dive", "https://www.google.com/maps", null],
    ["/e/try-dive", "//evil.example/x", null],
  ];

  it.each(cases)("%s to %s is %s", (from, to, expected, back) => {
    expect(routeMotion(from, to, { back })).toBe(expected);
  });

  it("does not move without a screen to move from", () => {
    expect(routeMotion(null, "/search")).toBeNull();
    expect(routeMotion(undefined, "/search")).toBeNull();
  });

  it("reads the path out of an href with a query or a fragment", () => {
    expect(pathOf("/e/try-dive?from=feed#dates")).toBe("/e/try-dive");
    expect(pathOf("/?__scenario=slow")).toBe("/");
    expect(pathOf("#top")).toBeNull();
    expect(pathOf("mailto:help@yuvoy.in")).toBeNull();
  });
});

describe("pictureName", () => {
  it("is a safe CSS identifier for any media id", () => {
    expect(pictureName("m_123-abc")).toBe("picture-m_123-abc");
    expect(pictureName("a b/c:d")).toBe("picture-a_b_c_d");
  });
});

/*
  The maps name classes the stylesheet must draw, and types the policy must
  produce. A typo on either side is a screen change that silently stops
  moving, so both are read from the source rather than trusted.
*/
describe("the screen-change classes", () => {
  const css = readFileSync(join(process.cwd(), "src/app/globals.css"), "utf8");
  const maps = {
    STAGE_MOTION,
    SHEET_MOTION,
    REEL_MOTION,
    BAR_MOTION,
    PICTURE_MOTION,
  } as const;
  const types = new Set<string>([...Object.values(MOTION), "default"]);

  for (const [name, map] of Object.entries(maps)) {
    for (const [prop, byType] of Object.entries(map)) {
      if (typeof byType === "string") {
        it(`${name}.${prop} leaves everything unnamed alone`, () => {
          expect(byType).toBe("none");
        });
        continue;
      }
      it(`${name}.${prop} answers only real types, and ends in none`, () => {
        for (const type of Object.keys(byType)) expect(types).toContain(type);
        expect((byType as Record<string, string>).default).toBe("none");
      });
      for (const cls of Object.values(byType as Record<string, string>)) {
        if (cls === "none") continue;
        it(`${name}.${prop}: .${cls} is drawn by the stylesheet`, () => {
          expect(css).toMatch(
            new RegExp(`::view-transition-[a-z-]+\\(\\.${cls}\\)`),
          );
        });
      }
    }
  }

  it("defines every keyframe the screen changes use", () => {
    const used = new Set(
      [...css.matchAll(/animation:\s*(vt-[a-z-]+)/g)].map((m) => m[1]),
    );
    expect(used.size).toBeGreaterThan(5);
    for (const name of used) expect(css).toContain(`@keyframes ${name} {`);
  });

  it("never animates the root, so an untyped change does not move", () => {
    expect(css).toMatch(/::view-transition-old\(root\)\s*\{\s*display: none;/);
    expect(css).toMatch(
      /::view-transition-new\(root\)\s*\{\s*animation: none;/,
    );
  });
});
