import { describe, it, expect } from "vitest";
import { prerenderProblems } from "../../scripts/prerender-signoff.mjs";

/**
 * The rules `pnpm prerender:check` holds a build to, tested without a build.
 *
 * The check signed off every prerendered path by name, which held until a
 * route's paths became live data: `/e/[slug]` prerenders one page per
 * experience in the catalog, so every push whose build could reach a catalog
 * failed (yuvoy-app#168). These pin both halves of the fix: any number of
 * catalog pages pass, and the properties that make them safe still fail
 * loudly.
 *
 * The manifest shapes are what Next 16.3 writes to
 * `.next/prerender-manifest.json`; see prerender-signoff.mjs.
 */

const SIGN_OFF = {
  allowed: { "/offline": "The service worker's fallback." },
  mustBeDynamic: { "/": "The feed." },
  liveData: {
    "/e/[slug]": { maxRevalidateSeconds: 300, reason: "Catalog pages." },
  },
};

const STATIC = { srcRoute: "/offline", initialRevalidateSeconds: false };

function experience(slug: string, initialRevalidateSeconds: number | false) {
  return {
    [`/e/${slug}`]: { srcRoute: "/e/[slug]", initialRevalidateSeconds },
  };
}

function build({
  routes = {},
  dynamicRoutes = { "/e/[slug]": { fallback: null } },
}: {
  routes?: Record<string, object>;
  dynamicRoutes?: Record<string, object>;
} = {}) {
  return { routes: { "/offline": STATIC, ...routes }, dynamicRoutes };
}

describe("prerender sign-off", () => {
  it("passes a build that reached no catalog", () => {
    expect(prerenderProblems(build(), SIGN_OFF)).toEqual([]);
  });

  it("passes however many experiences the catalog lists", () => {
    // The five that failed the check on 9 Oct 2026: the mock catalog.
    const routes = Object.assign(
      {},
      ...[
        "try-dive-nemo-reef",
        "snorkel-elephant-beach",
        "private-boat-charter",
        "mangrove-kayak-at-dawn",
        "night-fishing-with-a-local-crew",
      ].map((slug) => experience(slug, 300)),
    );

    expect(prerenderProblems(build({ routes }), SIGN_OFF)).toEqual([]);
  });

  it("fails a catalog page that never revalidates", () => {
    const problems = prerenderProblems(
      build({ routes: experience("frozen", false) }),
      SIGN_OFF,
    );

    expect(problems).toHaveLength(1);
    expect(problems[0]).toMatch(/^"\/e\/frozen", a page of \/e\/\[slug\]/);
    expect(problems[0]).toContain("never revalidates");
  });

  it("fails a catalog page cached for longer than the sign-off allows", () => {
    const problems = prerenderProblems(
      build({ routes: experience("slow", 3600) }),
      SIGN_OFF,
    );

    expect(problems).toHaveLength(1);
    expect(problems[0]).toContain("revalidates every 3600s");
    expect(problems[0]).toContain("allows 300s");
  });

  it("passes a catalog page that revalidates sooner than it must", () => {
    expect(
      prerenderProblems(build({ routes: experience("fresh", 60) }), SIGN_OFF),
    ).toEqual([]);
  });

  it("fails when the route is no longer cached, even with no pages", () => {
    const problems = prerenderProblems(build({ dynamicRoutes: {} }), SIGN_OFF);

    expect(problems).toHaveLength(1);
    expect(problems[0]).toMatch(/^"\/e\/\[slug\]" is no longer cached/);
  });

  it("fails when a listing published after the build would answer 404", () => {
    const problems = prerenderProblems(
      build({ dynamicRoutes: { "/e/[slug]": { fallback: false } } }),
      SIGN_OFF,
    );

    expect(problems).toHaveLength(1);
    expect(problems[0]).toContain("answers 404 for every page");
    expect(problems[0]).toContain("dynamicParams = true");
  });

  it("still fails any other route that starts being prerendered", () => {
    const problems = prerenderProblems(
      build({
        routes: {
          "/new": { srcRoute: "/new", initialRevalidateSeconds: false },
        },
      }),
      SIGN_OFF,
    );

    expect(problems).toHaveLength(1);
    expect(problems[0]).toMatch(/^"\/new" is newly prerendered/);
    expect(problems[0]).not.toContain("LIVE_DATA_ROUTES");
  });

  it("points a page of a route nobody signed off at the route sign-off", () => {
    const problems = prerenderProblems(
      build({
        routes: {
          "/o/coral-divers": {
            srcRoute: "/o/[slug]",
            initialRevalidateSeconds: 300,
          },
        },
      }),
      SIGN_OFF,
    );

    expect(problems).toHaveLength(1);
    expect(problems[0]).toMatch(/^"\/o\/coral-divers" is newly prerendered/);
    expect(problems[0]).toContain("It is a page of /o/[slug]");
    expect(problems[0]).toContain("LIVE_DATA_ROUTES");
  });

  it("still fails a signed-off route that stops being prerendered", () => {
    const problems = prerenderProblems(
      { routes: {}, dynamicRoutes: { "/e/[slug]": { fallback: null } } },
      SIGN_OFF,
    );

    expect(problems).toHaveLength(1);
    expect(problems[0]).toMatch(/^"\/offline" is no longer prerendered/);
  });

  it("still fails a route that must stay dynamic", () => {
    const problems = prerenderProblems(
      build({
        routes: { "/": { srcRoute: "/", initialRevalidateSeconds: false } },
      }),
      SIGN_OFF,
    );

    expect(problems).toHaveLength(1);
    expect(problems[0]).toMatch(
      /^"\/" was prerendered and must not be: The feed\./,
    );
  });
});
