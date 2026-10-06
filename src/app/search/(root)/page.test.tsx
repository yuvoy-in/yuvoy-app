import { describe, it, expect, vi } from "vitest";
import { renderToString } from "react-dom/server";
import { http, HttpResponse } from "msw";
import { server } from "../../../../mocks/server";
import { reelFilterKey } from "@/lib/search/filters";

/**
 * The search grid's first page, fetched by the server render for the address
 * it was asked for (production readiness, 6 Oct 2026).
 */

const BASE = process.env.NEXT_PUBLIC_API_URL ?? "http://localhost:8099/v1";

vi.mock("@/lib/auth/request-access", () => ({
  accessForRequest: async () => ({ access: "open", phone: null }),
}));
vi.mock("@/components/search/search-screen", () => ({
  SearchScreen: ({ initial }: { initial?: { page: unknown; key: string } }) => (
    <p>{`SEARCH ${initial?.page ? "with" : "without"} a first page for ${initial?.key}`}</p>
  ),
}));

describe("the search page", () => {
  it("fetches the first page for the filters in the address, and says which", async () => {
    const asked: URLSearchParams[] = [];
    server.use(
      http.get(`${BASE}/reels`, ({ request }) => {
        asked.push(new URL(request.url).searchParams);
        return HttpResponse.json({
          items: [],
          nextCursor: null,
          complete: true,
        });
      }),
    );
    const { default: SearchPage } = await import("./page");

    const html = renderToString(
      await SearchPage({
        searchParams: Promise.resolve({ q: "dive", place: "andaman/havelock" }),
      }),
    );

    expect(asked).toHaveLength(1);
    expect(asked[0].get("q")).toBe("dive");
    expect(asked[0].get("destinationKey")).toBe("andaman/havelock");
    expect(asked[0].get("cursor")).toBeNull();
    const key = reelFilterKey({
      q: "dive",
      destinationKey: "andaman/havelock",
    });
    expect(html).toContain(
      `SEARCH with a first page for ${key}`.replace(/"/g, "&quot;"),
    );
  });

  it("still renders, without a first page, when the API cannot give one", async () => {
    vi.spyOn(console, "error").mockImplementation(() => {});
    server.use(http.get(`${BASE}/reels`, () => HttpResponse.error()));
    const { default: SearchPage } = await import("./page");

    const html = renderToString(
      await SearchPage({ searchParams: Promise.resolve({}) }),
    );
    expect(html).toContain("SEARCH without a first page");
  });
});
