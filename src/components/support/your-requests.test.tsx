import { describe, it, expect, vi, afterEach } from "vitest";
import { act } from "react";
import { renderToString } from "react-dom/server";
import { hydrateRoot } from "react-dom/client";
import { screen, cleanup, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { http, HttpResponse } from "msw";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { renderWithQuery } from "@/test/render";
import { qk } from "@/lib/query/policy";
import { HelpCenter } from "./help-center";
import { YourRequests } from "./your-requests";
import { server } from "../../../mocks/server";
import { __signInAppRouteMock } from "../../../mocks/app-route-handlers";

const BASE = process.env.NEXT_PUBLIC_API_URL ?? "http://localhost:8099/v1";

vi.mock("next/navigation", () => ({
  useSearchParams: () => new URLSearchParams(),
  useRouter: () => ({ push: vi.fn(), replace: vi.fn(), back: vi.fn() }),
  usePathname: () => "/help",
}));

afterEach(cleanup);

/** One request as the API sends it, with only what a test varies. */
function request(over: Record<string, unknown> = {}) {
  return {
    reference: "SR-3F9A12C0",
    status: "open",
    topic: "payment",
    createdAt: "2026-09-21T04:00:00Z",
    updatedAt: "2026-09-21T04:00:00Z",
    message: "The operator has not confirmed my dive yet.",
    ...over,
  };
}

/** Answers the list, and records every query it was asked. */
function serveList(
  pages: Record<string, unknown>[][],
  asked: URLSearchParams[] = [],
) {
  server.use(
    http.get(`${BASE}/support/requests`, ({ request: req }) => {
      const query = new URL(req.url).searchParams;
      asked.push(query);
      const at = query.get("cursor") ? Number(query.get("cursor")) : 0;
      const last = at >= pages.length - 1;
      return HttpResponse.json({
        items: pages[at] ?? [],
        complete: last,
        nextCursor: last ? null : String(at + 1),
      });
    }),
  );
}

const section = () => screen.findByRole("region", { name: "Your requests" });

/**
 * "Your requests" on the Help Center (yuvoy-api#196).
 *
 * A traveller used to get a reference and have nowhere to type it. The list is
 * signed in only, and it must never imply a reply will appear in it: the API
 * stores the traveller's own words and no staff replies.
 */
describe("your requests", () => {
  it("lists what this number sent, in the API's order, with where each one is", async () => {
    __signInAppRouteMock("sess_test");
    serveList([
      [
        request({
          reference: "SR-NEWEST1",
          status: "in_progress",
          createdAt: "2026-09-21T04:00:00Z",
          updatedAt: "2026-09-22T06:00:00Z",
          bookingReference: "YV-4K2M9P7Q",
        }),
        request({
          reference: "SR-OLDER22",
          status: "resolved",
          createdAt: "2026-09-02T04:00:00Z",
          updatedAt: "2026-09-02T09:00:00Z",
          message: "How early should we reach the jetty?",
        }),
      ],
    ]);

    renderWithQuery(<HelpCenter />);
    const list = await section();

    const rows = await within(list).findAllByRole("listitem");
    expect(rows).toHaveLength(2);
    // Newest first, as the API sent them. Nothing here re-sorts.
    expect(rows[0]).toHaveTextContent("SR-NEWEST1");
    expect(rows[0]).toHaveTextContent("Someone is on it");
    expect(rows[0]).toHaveTextContent("Sent 21 Sep · updated 22 Sep");
    expect(rows[0]).toHaveTextContent("about YV-4K2M9P7Q");
    expect(rows[0]).toHaveTextContent(
      "The operator has not confirmed my dive yet.",
    );
    expect(rows[1]).toHaveTextContent("Resolved");
    expect(rows[1]).toHaveTextContent("Sent 2 Sep");
  });

  it("says where the reply comes from, and never that it will appear here", async () => {
    __signInAppRouteMock("sess_test");
    serveList([[request()]]);

    renderWithQuery(<HelpCenter />);
    const list = await section();
    await within(list).findByText("Received");

    expect(list).toHaveTextContent(
      "Replies come on WhatsApp, to your number. They are not shown here.",
    );
    // No inbox vocabulary: there is no thread behind a row.
    expect(list.textContent).not.toMatch(/unread|new reply|view reply/i);
  });

  it("says so plainly when nothing has been sent", async () => {
    __signInAppRouteMock("sess_test");
    serveList([[]]);

    renderWithQuery(<HelpCenter />);
    const list = await section();
    expect(
      await within(list).findByText(/Nothing sent yet/),
    ).toBeInTheDocument();
  });

  it("pages with the server's own cursor", async () => {
    __signInAppRouteMock("sess_test");
    const asked: URLSearchParams[] = [];
    serveList(
      [
        [request({ reference: "SR-PAGE1" })],
        [request({ reference: "SR-PAGE2" })],
      ],
      asked,
    );

    const user = userEvent.setup();
    renderWithQuery(<HelpCenter />);
    const list = await section();
    await within(list).findByText(/SR-PAGE1/);
    expect(asked[0].get("cursor")).toBeNull();
    expect(asked[0].get("limit")).toBe("20");

    await user.click(within(list).getByRole("button", { name: "Show more" }));
    expect(await within(list).findByText(/SR-PAGE2/)).toBeInTheDocument();
    expect(asked.at(-1)?.get("cursor")).toBe("1");
  });

  it("draws nothing, and asks nothing, for a visitor who is not signed in", async () => {
    /*
      The Help Center is public and indexable. Signed out there is no list to
      ask for, and asking anyway would be a 401 through the proxy on every
      visit. Counted at the proxy, which is where the request would go.
    */
    let proxied = 0;
    server.use(
      http.get("*/api/v1/support/requests", () => {
        proxied += 1;
        return HttpResponse.json({
          items: [],
          complete: true,
          nextCursor: null,
        });
      }),
    );

    renderWithQuery(<HelpCenter />);
    await screen.findByRole("heading", { name: "Booking" });
    await new Promise((r) => setTimeout(r, 60));

    expect(proxied).toBe(0);
    expect(screen.queryByRole("region", { name: "Your requests" })).toBeNull();
  });

  it("draws nothing on an API that predates the read, which is the page as it was", async () => {
    /*
      `GET /support/requests` answered 405 until yuvoy-api#209 was deployed.
      The Help Center that shipped before it had no list at all, and that is
      exactly what such an API gets: no section, no error panel.
    */
    __signInAppRouteMock("sess_test");
    server.use(
      http.get(`${BASE}/support/requests`, () =>
        HttpResponse.json(
          {
            error: { code: "method_not_allowed", message: "Not allowed." },
          },
          { status: 405 },
        ),
      ),
    );

    renderWithQuery(<HelpCenter />);
    await screen.findByRole("heading", { name: "Booking" });
    await new Promise((r) => setTimeout(r, 80));
    expect(screen.queryByRole("region", { name: "Your requests" })).toBeNull();
    expect(screen.queryByRole("alert")).toBeNull();
  });

  it("offers the way back in when the session has ended underneath it", async () => {
    __signInAppRouteMock("sess_test");
    server.use(
      http.get(`${BASE}/support/requests`, () =>
        HttpResponse.json(
          { error: { code: "unauthorized", message: "raw" } },
          { status: 401 },
        ),
      ),
    );

    renderWithQuery(<HelpCenter />);
    const list = await section();
    expect(
      await within(list).findByText("Your sign-in has ended"),
    ).toBeInTheDocument();
    expect(
      within(list).getByRole("link", { name: "Sign in again" }),
    ).toHaveAttribute("href", "/account?next=/help");
  });

  it("asks for a moment after too many checks, and can try again", async () => {
    __signInAppRouteMock("sess_test");
    let calls = 0;
    server.use(
      http.get(`${BASE}/support/requests`, () => {
        calls += 1;
        return calls === 1
          ? HttpResponse.json(
              { error: { code: "rate_limited", message: "raw" } },
              { status: 429 },
            )
          : HttpResponse.json({
              items: [request()],
              complete: true,
              nextCursor: null,
            });
      }),
    );

    const user = userEvent.setup();
    renderWithQuery(<HelpCenter />);
    const list = await section();
    expect(
      await within(list).findByText(/a lot of checks in a short time/),
    ).toBeInTheDocument();

    await user.click(within(list).getByRole("button", { name: "Try again" }));
    expect(await within(list).findByText("Received")).toBeInTheDocument();
  });

  it("blames the signal, not the traveller, when the list does not arrive", async () => {
    __signInAppRouteMock("sess_test");
    /*
      Failed at the hop the browser makes, to this app's own proxy: that is
      the request a dropped island connection loses.
    */
    server.use(
      http.get("*/api/v1/support/requests", () => HttpResponse.error()),
    );

    renderWithQuery(<HelpCenter />);
    const list = await section();
    expect(
      await within(list).findByText(/usually the island signal/, undefined, {
        timeout: 4000,
      }),
    ).toBeInTheDocument();
  });

  it("shows a request just sent from the Help Center, from the server's own list", async () => {
    /*
      The send invalidates the list rather than appending to it: the API may
      answer with an EXISTING reference and reopen it, which only its own list
      shows correctly. Against the stateful mock, which keeps what was sent.
    */
    __signInAppRouteMock("sess_test");
    const user = userEvent.setup();
    renderWithQuery(<HelpCenter />);
    const list = await section();
    // The mock's seeded history is there first.
    await within(list).findByText(/SR-1B2C3D4E/);

    await user.click(screen.getByRole("button", { name: "Send us a message" }));
    await user.type(
      screen.getByLabelText("Your message"),
      "Can I bring my own mask and snorkel?",
    );
    await user.click(screen.getByRole("button", { name: "Send" }));
    await screen.findByText(/Thanks. We have your message/);

    await waitFor(() =>
      expect(list).toHaveTextContent("Can I bring my own mask and snorkel?"),
    );
  });
});

describe("your requests, hydrating", () => {
  it("draws what the server drew first, even when the cache already knows", async () => {
    /*
      The Help Center is server rendered and the server cannot know who is
      signed in, so it draws no section. Hydrating with a cache a sibling has
      already filled must not draw one on the first client render (React
      #418); it arrives one render later.
    */
    function page(client: QueryClient) {
      return (
        <QueryClientProvider client={client}>
          <YourRequests />
        </QueryClientProvider>
      );
    }

    const html = renderToString(page(new QueryClient()));
    expect(html).not.toContain("Your requests");

    const container = document.createElement("div");
    container.innerHTML = html;
    document.body.appendChild(container);

    const client = new QueryClient({
      defaultOptions: { queries: { retry: false, staleTime: Infinity } },
    });
    client.setQueryData(qk.session(), { signedIn: true });
    client.setQueryData(qk.supportRequests(), {
      pages: [{ items: [request()], complete: true, nextCursor: null }],
      pageParams: [undefined],
    });

    const mismatches: unknown[] = [];
    const root = await act(async () =>
      hydrateRoot(container, page(client), {
        onRecoverableError: (error) => mismatches.push(error),
      }),
    );

    expect(mismatches).toEqual([]);
    expect(container.textContent).toContain("Your requests");
    expect(container.textContent).toContain("SR-3F9A12C0");

    act(() => root.unmount());
    container.remove();
  });
});
