import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import type { ReactNode } from "react";
import { renderToString } from "react-dom/server";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { http, HttpResponse } from "msw";
import { server } from "../../mocks/server";
import type { RequestAccess } from "@/lib/auth/request-access";

/**
 * The five routes behind the invite gate, as the server renders them
 * (yuvoy-api#195): the feed, search, a search result, saves and checkout.
 *
 * What is pinned here is the gate's whole security. With the switch on, a
 * crawler and a signed-out visitor get the invite landing, and a number with
 * no code gets the code screen, and in neither case does the HTML carry the
 * page's content, nor does the server fetch it. With the switch off, every
 * route renders exactly what it did before, without asking anything.
 *
 * Each page's own screen is replaced by a marker, so what is asserted is the
 * decision rather than five screens' worth of rendering.
 */

const BASE = process.env.NEXT_PUBLIC_API_URL ?? "http://localhost:8099/v1";

const decided = vi.hoisted(() => ({
  answer: { access: "open", phone: null } as RequestAccess,
  asked: [] as (string | undefined)[],
}));
vi.mock("@/lib/auth/request-access", () => ({
  accessForRequest: async (scenario?: string) => {
    decided.asked.push(scenario);
    return decided.answer;
  },
}));

vi.mock("next/navigation", () => ({
  useRouter: () => ({ refresh: () => {}, replace: () => {}, push: () => {} }),
  usePathname: () => "/",
  useSearchParams: () => new URLSearchParams(),
}));

/*
  One text node, not two: React separates adjacent children in server HTML with
  a `<!-- -->` marker, and an assertion on a sentence split across two children
  would be matching the marker rather than the decision.
*/
vi.mock("@/components/feed/feed", () => ({
  Feed: ({ initialPage }: { initialPage: unknown }) => (
    <p>{`FEED CONTENT ${initialPage ? "with a first page" : "empty"}`}</p>
  ),
}));
vi.mock("@/components/search/search-screen", () => ({
  SearchScreen: () => <p>SEARCH CONTENT</p>,
}));
vi.mock("@/components/search/search-reel-screen", () => ({
  SearchReelScreen: () => <p>SEARCH RESULT CONTENT</p>,
}));
vi.mock("@/components/saved/saved-screen", () => ({
  SavedScreen: () => <p>SAVED CONTENT</p>,
}));
vi.mock("@/components/checkout/book-screen", () => ({
  BookScreen: () => <p>CHECKOUT CONTENT</p>,
}));

/** Counts the feed's server-side prefetch. */
function watchReels() {
  const seen = { calls: 0 };
  server.use(
    http.get(`${BASE}/reels`, () => {
      seen.calls += 1;
      return HttpResponse.json({ items: [], complete: true });
    }),
  );
  return seen;
}

function html(node: ReactNode): string {
  return renderToString(
    <QueryClientProvider client={new QueryClient()}>
      {node}
    </QueryClientProvider>,
  );
}

const noQuery = () =>
  Promise.resolve({}) as Promise<Record<string, string | string[] | undefined>>;

async function load(flag: string) {
  vi.resetModules();
  vi.stubEnv("NEXT_PUBLIC_INVITE_ONLY", flag);
  return {
    feed: (await import("./page")).default,
    search: (await import("./search/(root)/page")).default,
    result: (await import("./search/r/[id]/page")).default,
    saved: (await import("./saved/page")).default,
    book: (await import("./e/[slug]/book/page")).default,
  };
}

/** Every gated route, rendered to the HTML a visitor would be sent. */
async function renderAll(pages: Awaited<ReturnType<typeof load>>) {
  return {
    feed: html(await pages.feed({ searchParams: noQuery() })),
    search: html(await pages.search({ searchParams: noQuery() })),
    result: html(
      await pages.result({
        params: Promise.resolve({ id: "med_1" }),
        searchParams: noQuery(),
      }),
    ),
    saved: html(await pages.saved({ searchParams: noQuery() })),
    book: html(
      await pages.book({
        params: Promise.resolve({ slug: "try-dive-nemo-reef" }),
        searchParams: noQuery(),
      }),
    ),
  };
}

const CONTENT =
  /FEED CONTENT|SEARCH CONTENT|SEARCH RESULT CONTENT|SAVED CONTENT|CHECKOUT CONTENT/;

beforeEach(() => {
  decided.answer = { access: "open", phone: null };
  decided.asked = [];
});

afterEach(() => {
  vi.unstubAllEnvs();
  vi.resetModules();
});

describe("with the switch off", () => {
  it("renders every route's own content, and asks nothing", async () => {
    const reels = watchReels();
    const out = await renderAll(await load("false"));

    expect(out.feed).toContain("FEED CONTENT with a first page");
    expect(out.search).toContain("SEARCH CONTENT");
    expect(out.result).toContain("SEARCH RESULT CONTENT");
    expect(out.saved).toContain("SAVED CONTENT");
    expect(out.book).toContain("CHECKOUT CONTENT");
    for (const page of Object.values(out)) {
      expect(page).not.toContain("data-invite-gate");
    }
    expect(decided.asked).toEqual([]);
    expect(reels.calls).toBe(1);
  });

  it("does not so much as read the query on a static page", async () => {
    /*
      `/saved` is prerendered today. Awaiting `searchParams` is what would make
      it dynamic, so with the switch off it must never be touched.
    */
    const { saved } = await load("false");
    const then = vi.fn();
    const untouchable = { then } as unknown as Promise<
      Record<string, string | string[] | undefined>
    >;
    const out = html(await saved({ searchParams: untouchable }));
    expect(out).toContain("SAVED CONTENT");
    expect(then).not.toHaveBeenCalled();
  });
});

describe("with the switch on", () => {
  it("serves a signed-out visitor, and a crawler, the landing and nothing gated", async () => {
    decided.answer = { access: "signed-out", phone: null };
    const reels = watchReels();
    const out = await renderAll(await load("true"));

    for (const [route, page] of Object.entries(out)) {
      expect(page, route).toContain('data-invite-gate="page"');
      expect(page, route).toContain("Yuvoy is by invitation for now");
      expect(page, route).not.toMatch(CONTENT);
    }
    // The feed's first page is not even asked for, for somebody who will not see it.
    expect(reels.calls).toBe(0);
  });

  it("serves a number with no code the code screen, naming the number", async () => {
    decided.answer = { access: "not-admitted", phone: "+919000003210" };
    const reels = watchReels();
    const out = await renderAll(await load("true"));

    for (const [route, page] of Object.entries(out)) {
      expect(page, route).toContain("Enter your invite code");
      expect(page, route).toContain("3210");
      expect(page, route).not.toMatch(CONTENT);
    }
    expect(reels.calls).toBe(0);
  });

  it("renders the content for an admitted number, and for an open answer", async () => {
    for (const access of ["admitted", "open"] as const) {
      decided.answer = { access, phone: null };
      const reels = watchReels();
      const out = await renderAll(await load("true"));

      expect(out.feed, access).toContain("FEED CONTENT with a first page");
      expect(out.search, access).toContain("SEARCH CONTENT");
      expect(out.result, access).toContain("SEARCH RESULT CONTENT");
      expect(out.saved, access).toContain("SAVED CONTENT");
      expect(out.book, access).toContain("CHECKOUT CONTENT");
      expect(reels.calls, access).toBe(1);
    }
  });

  it("keeps each route's own way back on its gate", async () => {
    decided.answer = { access: "signed-out", phone: null };
    const out = await renderAll(await load("true"));
    expect(out.book).toContain('href="/e/try-dive-nemo-reef"');
    expect(out.saved).toContain('href="/account"');
    expect(out.result).toContain('href="/search"');
  });

  it("keeps the front door a page the production audit still passes", async () => {
    /*
      `/` stays indexable and in the sitemap with the gate on, so the invite
      landing is audited as a page like any other: `e2e/audit.spec.ts` walks
      every sitemap URL and requires exactly one `<h1>` and no skipped
      heading level. Pinned here as well as there because the audit needs a
      deployed origin and this needs nothing, so a heading added to the gate
      fails at the keyboard rather than after a deploy.
    */
    decided.answer = { access: "signed-out", phone: null };
    const { feed } = await load("true");
    const out = html(await feed({ searchParams: noQuery() }));

    const h1s = [...out.matchAll(/<h1\b[^>]*>([\s\S]*?)<\/h1>/g)];
    expect(h1s.length).toBe(1);
    expect(h1s[0][1].replace(/<[^>]+>/g, "").trim()).not.toBe("");

    const levels = [...out.matchAll(/<h([1-6])\b/g)].map((m) => Number(m[1]));
    let previous = 0;
    for (const level of levels) {
      if (previous !== 0) expect(level - previous).toBeLessThanOrEqual(1);
      previous = level;
    }
  });

  it("hands a mocked build's scenario to the decision", async () => {
    decided.answer = { access: "signed-out", phone: null };
    const { search } = await load("true");
    await search({
      searchParams: Promise.resolve({ __scenario: "not-admitted" }),
    });
    expect(decided.asked).toEqual(["not-admitted"]);
  });
});
