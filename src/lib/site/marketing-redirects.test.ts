import { describe, it, expect } from "vitest";
import {
  CAMPAIGN_SOURCES,
  MARKETING_ORIGIN,
  ROOT_HOST,
  marketingRedirects,
} from "./marketing-redirects";
import { INDEXABLE_DYNAMIC_ROUTES, INDEXABLE_FIXED_ROUTES } from "./inventory";
import { NON_PAGE_ROUTES, PRIVATE_ROUTES } from "./indexing";

const rules = marketingRedirects();
const firstSegment = (path: string) => `/${path.split("/")[1] ?? ""}`;

describe("the marketing redirects (D-102, option A)", () => {
  it("fire on the root domain and on nothing else this app serves", () => {
    /*
      `has.value` is an anchored regex in Next. app.yuvoy.in today, every
      preview, and the marketing host itself must all fall outside it — an
      ungated rule on app.yuvoy.in is a two-hop chain back to the marketing
      site, and on www it would be a loop.
    */
    expect(ROOT_HOST).toBe("yuvoy.in");
    for (const r of rules) {
      expect(r.has).toHaveLength(1);
      expect(r.has?.[0]).toMatchObject({ type: "host" });
      const re = new RegExp(`^${r.has?.[0].value}$`);
      expect(re.test("yuvoy.in")).toBe(true);
      expect(re.test("app.yuvoy.in")).toBe(false);
      expect(re.test("www.yuvoy.in")).toBe(false);
      expect(re.test("yuvoy-app.vercel.app")).toBe(false);
      expect(re.test("yuvoyXin")).toBe(false);
    }
  });

  it("send everything to the marketing host, which is never the root host", () => {
    // The loop guard. A destination on this app's own host would redirect
    // to itself the moment the domain moved.
    expect(new URL(MARKETING_ORIGIN).host).not.toBe(ROOT_HOST);
    for (const r of rules) {
      expect(r.destination.startsWith(`${MARKETING_ORIGIN}/`)).toBe(true);
    }
  });

  it("are temporary, so a page can still move into this app without a cached loop", () => {
    // 307, not 308 — see the module comment. Promote deliberately, later.
    for (const r of rules) expect(r.permanent).toBe(false);
  });

  it("never shadow one of this app's own routes, except the five campaign words under /go", () => {
    /*
      The plan of record still migrates marketing pages into this app one at a
      time. The day `/about` becomes a real page here, this test fails until
      its redirect is deleted — a redirect in front of a page is a page nobody
      can reach.
    */
    const own = new Set(
      [
        ...INDEXABLE_FIXED_ROUTES.map((r) => r.path),
        ...INDEXABLE_DYNAMIC_ROUTES,
        ...PRIVATE_ROUTES,
        ...NON_PAGE_ROUTES,
      ].map(firstSegment),
    );
    const campaign = new Set(CAMPAIGN_SOURCES.map((s) => `/go/${s}`));

    for (const r of rules) {
      if (firstSegment(r.source) === "/go") {
        expect(campaign.has(r.source)).toBe(true);
        continue;
      }
      expect(own.has(firstSegment(r.source))).toBe(false);
    }
  });

  it("list exact paths before the wildcard trees that would otherwise swallow them", () => {
    const index = (source: string) =>
      rules.findIndex((r) => r.source === source);
    expect(index("/destinations")).toBeLessThan(index("/destinations/:path*"));
    expect(index("/destinations/neil")).toBeLessThan(
      index("/destinations/:path*"),
    );
    expect(index("/experiences")).toBeLessThan(index("/experiences/:slug*"));
    expect(index("/journal")).toBeLessThan(index("/journal/:path*"));
  });

  it("forward legacy paths to where the marketing site sends them, not to its redirect", () => {
    // One hop, not two. Mirrors yuvoy-web's next.config; a drift here shows
    // up in `pnpm cutover:check` as a chain.
    const dest = (source: string) =>
      rules.find((r) => r.source === source)?.destination;
    expect(dest("/how-it-works")).toBe(`${MARKETING_ORIGIN}/#how`);
    expect(dest("/travellers")).toBe(`${MARKETING_ORIGIN}/explore`);
    expect(dest("/experiences")).toBe(
      `${MARKETING_ORIGIN}/explore#experiences`,
    );
    expect(dest("/destinations")).toBe(`${MARKETING_ORIGIN}/#destinations`);
    expect(dest("/destinations/neil")).toBe(
      `${MARKETING_ORIGIN}/destinations/neil-island`,
    );
  });

  it("mirror yuvoy-web's five campaign sources exactly", () => {
    // `src/lib/leads/registry.ts` there. These are reserved words for scan
    // codes on yuvoy-api for the same reason.
    expect([...CAMPAIGN_SOURCES]).toEqual([
      "ferry",
      "kiosk",
      "hotel",
      "instagram",
      "direct",
    ]);
  });
});
