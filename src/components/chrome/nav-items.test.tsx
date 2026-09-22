import { describe, it, expect, vi, afterEach } from "vitest";
import { act } from "react";
import { renderToString } from "react-dom/server";
import { hydrateRoot } from "react-dom/client";
import { screen, cleanup } from "@testing-library/react";
import { http, HttpResponse } from "msw";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { renderWithQuery } from "@/test/render";
import { qk } from "@/lib/query/policy";
import { NavList } from "./nav-items";
import { server } from "../../../mocks/server";
import { __signInAppRouteMock } from "../../../mocks/app-route-handlers";

const BASE = process.env.NEXT_PUBLIC_API_URL ?? "http://localhost:8099/v1";

vi.mock("next/navigation", () => ({
  usePathname: () => "/",
  useSearchParams: () => new URLSearchParams(),
  useRouter: () => ({ push: vi.fn(), replace: vi.fn() }),
}));

afterEach(cleanup);

/** One row of `GET /me/bookings`, with only what these tests vary. */
function row(over: Record<string, unknown> = {}) {
  return {
    reference: "YV-SERVER11",
    reservationId: "res_server",
    experience: "Snorkel trip to Elephant Beach",
    operator: "Sample Boat Operator",
    localDate: "2026-12-24",
    localTime: "09:00",
    state: "confirmed",
    guests: 2,
    statusToken: "tok_server",
    experienceSlug: "snorkel-elephant-beach",
    operatorSlug: "sample-boat-operator",
    heroImageUrl: null,
    destination: "Havelock",
    startsAt: "2026-12-24T03:30:00Z",
    timezone: "Asia/Kolkata",
    createdAt: "2026-09-14T06:00:00Z",
    price: { totalPaise: 900000, currency: "INR" },
    reviewed: false,
    canReview: false,
    ...over,
  };
}

/** Answers the trips list and records every query it was asked. */
function serveTrips(rows: Record<string, unknown>[], asked: URLSearchParams[]) {
  server.use(
    http.get(`${BASE}/me/bookings`, ({ request }) => {
      asked.push(new URL(request.url).searchParams);
      return HttpResponse.json({ bookings: rows, nextCursor: null });
    }),
  );
}

const settle = () => new Promise((r) => setTimeout(r, 60));

/**
 * The dot on the Trips destination (yuvoy-api#207).
 *
 * The nav is on every page, which is what makes it worth guarding three ways:
 * it must light for an unread reply, it must cost a signed-out visitor nothing,
 * and it must not make the server's HTML and the first client render disagree.
 */
describe("the Trips destination", () => {
  it("carries a dot, and says so in words, when a trip has a reply", async () => {
    __signInAppRouteMock("sess_test");
    const asked: URLSearchParams[] = [];
    serveTrips([row({ unreadCount: 0 }), row({ unreadCount: 2 })], asked);

    const { container } = renderWithQuery(<NavList orientation="bar" />);

    // The words are the dot's text alternative: "Trips, new messages".
    expect(
      await screen.findByRole("link", { name: "Trips, new messages" }),
    ).toHaveAttribute("href", "/trips");
    expect(container.querySelector('[data-dot="unread"]')).not.toBeNull();

    // The Trips tab's own first answer, so the two share one cache entry.
    expect(asked[0]?.get("tab")).toBe("upcoming");
    expect(asked[0]?.get("cursor")).toBeNull();
  });

  it("carries nothing when every trip is read", async () => {
    __signInAppRouteMock("sess_test");
    const asked: URLSearchParams[] = [];
    serveTrips([row({ unreadCount: 0 })], asked);

    const { container } = renderWithQuery(<NavList orientation="rail" />);
    await settle();
    expect(asked.length).toBeGreaterThan(0);

    expect(screen.getByRole("link", { name: "Trips" })).toBeInTheDocument();
    expect(container.querySelector('[data-dot="unread"]')).toBeNull();
  });

  it("carries nothing when the API sends no count at all", async () => {
    /*
      An API a deploy behind the contract sends rows with no `unreadCount`.
      That must read as "nothing new", never as a dot nobody can clear.
    */
    __signInAppRouteMock("sess_test");
    const asked: URLSearchParams[] = [];
    serveTrips([row()], asked);

    const { container } = renderWithQuery(<NavList orientation="bar" />);
    await settle();
    expect(asked.length).toBeGreaterThan(0);

    expect(screen.getByRole("link", { name: "Trips" })).toBeInTheDocument();
    expect(container.querySelector('[data-dot="unread"]')).toBeNull();
  });

  it("asks nothing about trips for a visitor who is not signed in", async () => {
    /*
      The nav is on every page, including the feed a stranger lands on from a
      shared reel. Signed out there is no list to ask for: the request would be
      a guaranteed 401 through the proxy, on every page, for nobody.

      Counted at the proxy, which is where the request would have to go.
    */
    let proxied = 0;
    server.use(
      http.get("*/api/v1/me/bookings", () => {
        proxied += 1;
        return HttpResponse.json({ bookings: [], nextCursor: null });
      }),
    );

    const { container } = renderWithQuery(<NavList orientation="bar" />);
    await settle();

    expect(proxied).toBe(0);
    expect(screen.getByRole("link", { name: "Trips" })).toBeInTheDocument();
    expect(container.querySelector('[data-dot="unread"]')).toBeNull();
  });
});

describe("the Trips destination, hydrating", () => {
  it("draws what the server drew first, even when the cache already knows", async () => {
    /*
      The server knows nothing about who is signed in and draws no dot. The
      client hydrates with a cache a sibling boundary has ALREADY filled (every
      feed card reads the session), which is the state that threw React #418
      for the Login button. Here it must not: the first client render matches
      the server's, and the dot arrives one render later.
    */
    function page(client: QueryClient) {
      return (
        <QueryClientProvider client={client}>
          <NavList orientation="bar" />
        </QueryClientProvider>
      );
    }

    const html = renderToString(page(new QueryClient()));
    expect(html).not.toContain("new messages");
    expect(html).not.toContain('data-dot="unread"');

    const container = document.createElement("div");
    container.innerHTML = html;
    document.body.appendChild(container);

    const client = new QueryClient({
      defaultOptions: { queries: { retry: false, staleTime: Infinity } },
    });
    client.setQueryData(qk.session(), { signedIn: true });
    client.setQueryData(qk.myBookings("upcoming"), {
      pages: [{ bookings: [row({ unreadCount: 1 })], nextCursor: null }],
      pageParams: [undefined],
    });

    const mismatches: unknown[] = [];
    const root = await act(async () =>
      hydrateRoot(container, page(client), {
        onRecoverableError: (error) => mismatches.push(error),
      }),
    );

    expect(mismatches).toEqual([]);
    expect(container.querySelector('[data-dot="unread"]')).not.toBeNull();
    expect(container.textContent).toContain("new messages");

    act(() => root.unmount());
    container.remove();
  });
});
