import { describe, it, expect, vi, afterEach } from "vitest";
import { renderToString } from "react-dom/server";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { http, HttpResponse, delay } from "msw";
import { server } from "../../mocks/server";

/**
 * The feed's server-side first page, when the API is slow to give it
 * (production readiness, 6 Oct 2026).
 *
 * The render waited on it without limit, so a stalled API was a blank screen
 * for every visitor, held for as long as the platform would hold it. It now
 * gives up after `FIRST_PAGE_TIMEOUT_MS` and renders the feed without a first
 * page, which the browser then asks for itself.
 */

const BASE = process.env.NEXT_PUBLIC_API_URL ?? "http://localhost:8099/v1";

vi.mock("@/lib/auth/request-access", () => ({
  accessForRequest: async () => ({ access: "open", phone: null }),
}));
vi.mock("@/components/feed/feed", () => ({
  Feed: ({ initialPage }: { initialPage: unknown }) => (
    <p>{`FEED ${initialPage ? "with a first page" : "without a first page"}`}</p>
  ),
}));

afterEach(() => {
  vi.restoreAllMocks();
});

describe("the feed's first page", () => {
  it("is given up on after FIRST_PAGE_TIMEOUT_MS, and the feed renders without it", async () => {
    /*
      `AbortSignal.timeout` runs on Node's own timers, so the wait is observed
      rather than sat through: the signal it hands the read is one that has
      already fired, which is what it would be three seconds in.
    */
    vi.spyOn(console, "error").mockImplementation(() => {});
    const timeout = vi
      .spyOn(AbortSignal, "timeout")
      .mockReturnValue(AbortSignal.abort());
    server.use(
      http.get(`${BASE}/reels`, async () => {
        await delay("infinite");
        return HttpResponse.json({ items: [], complete: true });
      }),
    );
    const { default: FeedPage } = await import("./page");
    const { FIRST_PAGE_TIMEOUT_MS } = await import("@/lib/feed/first-page");

    const html = renderToString(
      <QueryClientProvider client={new QueryClient()}>
        {await FeedPage({ searchParams: Promise.resolve({}) })}
      </QueryClientProvider>,
    );
    expect(html).toContain("FEED without a first page");
    expect(timeout).toHaveBeenCalledWith(FIRST_PAGE_TIMEOUT_MS);
    expect(FIRST_PAGE_TIMEOUT_MS).toBeLessThanOrEqual(3_000);
  });

  it("is still in the HTML when the API answers in time", async () => {
    server.use(
      http.get(`${BASE}/reels`, () =>
        HttpResponse.json({ items: [], nextCursor: null, complete: true }),
      ),
    );
    const { default: FeedPage } = await import("./page");

    const html = renderToString(
      <QueryClientProvider client={new QueryClient()}>
        {await FeedPage({ searchParams: Promise.resolve({}) })}
      </QueryClientProvider>,
    );
    expect(html).toContain("FEED with a first page");
  });
});
