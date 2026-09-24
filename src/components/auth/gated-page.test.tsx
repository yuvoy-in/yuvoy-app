import { describe, it, expect, vi, beforeEach } from "vitest";
import { act } from "react";
import { screen, waitFor } from "@testing-library/react";
import { renderToString } from "react-dom/server";
import { hydrateRoot } from "react-dom/client";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { http, HttpResponse } from "msw";
import { renderWithQuery } from "@/test/render";
import { qk } from "@/lib/query/policy";
import { GatedPage, InviteGatePage, gateViewFor } from "./gated-page";
import { server } from "../../../mocks/server";
import {
  __resetAppRouteMocks,
  __signInAppRouteMock,
} from "../../../mocks/app-route-handlers";

/**
 * A gated page, kept in step with what the device knows (yuvoy-api#195).
 *
 * The server decides what a gated route renders; the browser can learn
 * something newer (a sign-in on the page, a code accepted, a sign-out on
 * Account, a page the router kept from before). The page then asks the server
 * again, once, and never takes away what the server rendered on the browser's
 * word alone.
 */

const BASE = process.env.NEXT_PUBLIC_API_URL ?? "http://localhost:8099/v1";

const nav = vi.hoisted(() => {
  const refresh = vi.fn();
  return { refresh, router: { refresh, replace: () => {}, push: () => {} } };
});
vi.mock("next/navigation", () => ({
  useRouter: () => nav.router,
  usePathname: () => "/",
  useSearchParams: () => new URLSearchParams(),
}));

function me(status: number, admitted?: boolean) {
  server.use(
    http.get(`${BASE}/me`, () =>
      status === 200
        ? HttpResponse.json({
            phone: "+919000003210",
            name: "Asha Menon",
            ...(admitted === undefined ? {} : { admitted }),
          })
        : HttpResponse.json(
            { error: { code: "unavailable", message: "Not now." } },
            { status },
          ),
    ),
  );
}

/** Lets every pending read settle, so "no refresh" is a real answer. */
const settle = () => new Promise((r) => setTimeout(r, 50));

beforeEach(() => {
  nav.refresh.mockReset();
  __resetAppRouteMocks();
});

describe("asking the server again", () => {
  it("asks when the device knows the page should be a different screen", async () => {
    // Served the landing; signed in since, and the number has no code.
    __signInAppRouteMock("sess_919000003210");
    me(200, false);
    renderWithQuery(
      <GatedPage rendered="signed-out">
        <p>the landing</p>
      </GatedPage>,
    );

    await waitFor(() => expect(nav.refresh).toHaveBeenCalledTimes(1));
  });

  it("does not ask when the two agree", async () => {
    __signInAppRouteMock("sess_919000003210");
    me(200, false);
    renderWithQuery(
      <GatedPage rendered="not-admitted">
        <p>the code screen</p>
      </GatedPage>,
    );

    await settle();
    expect(nav.refresh).not.toHaveBeenCalled();
  });

  it("counts open and admitted as the same screen", async () => {
    __signInAppRouteMock("sess_919000003210");
    me(200, true);
    renderWithQuery(
      <GatedPage rendered="open">
        <p>the feed</p>
      </GatedPage>,
    );

    await settle();
    expect(nav.refresh).not.toHaveBeenCalled();
  });

  it("has nothing to add when its own GET /me failed", async () => {
    /*
      The server opened the page; the browser could not ask. A failed read
      says nothing about the number, so it is not a reason to ask again.
    */
    __signInAppRouteMock("sess_919000003210");
    me(503);
    renderWithQuery(
      <GatedPage rendered="open">
        <p>the feed</p>
      </GatedPage>,
    );

    await settle();
    expect(nav.refresh).not.toHaveBeenCalled();
  });

  it("never takes away what the server rendered, on the browser's word alone", async () => {
    /*
      A session read that failed on an island connection reads as signed out.
      The feed somebody is reading must not vanish over it: the page asks, the
      server reads the cookie, and the server decides.
    */
    me(200, true);
    renderWithQuery(
      <GatedPage rendered="admitted">
        <p>the feed</p>
      </GatedPage>,
    );

    await waitFor(() => expect(nav.refresh).toHaveBeenCalledTimes(1));
    expect(screen.getByText("the feed")).toBeInTheDocument();
  });

  it("asks once per disagreement, so a server that still disagrees is not a loop", async () => {
    __signInAppRouteMock("sess_919000003210");
    me(200, false);
    const { rerender } = renderWithQuery(
      <GatedPage rendered="signed-out">
        <p>the landing</p>
      </GatedPage>,
    );
    await waitFor(() => expect(nav.refresh).toHaveBeenCalledTimes(1));

    // The server answered the same again (it could not read the session).
    rerender(
      <GatedPage rendered="signed-out">
        <p>the landing, again</p>
      </GatedPage>,
    );
    await settle();
    expect(nav.refresh).toHaveBeenCalledTimes(1);
  });

  it("asks again for a NEW disagreement", async () => {
    __signInAppRouteMock("sess_919000003210");
    me(200, false);
    const { client, rerender } = renderWithQuery(
      <GatedPage rendered="signed-out">
        <p>the landing</p>
      </GatedPage>,
    );
    await waitFor(() => expect(nav.refresh).toHaveBeenCalledTimes(1));

    // The refresh landed as the code screen, and then a code was accepted.
    rerender(
      <GatedPage rendered="not-admitted">
        <p>the code screen</p>
      </GatedPage>,
    );
    await settle();
    expect(nav.refresh).toHaveBeenCalledTimes(1);

    me(200, true);
    await act(async () => {
      client.setQueryData(qk.myAccount(), {
        phone: "+919000003210",
        admitted: true,
      });
    });
    await waitFor(() => expect(nav.refresh).toHaveBeenCalledTimes(2));
  });
});

describe("which view a gated page draws", () => {
  it("is the server's until the device knows better", () => {
    expect(gateViewFor(undefined, "signed-out")).toBe("signed-out");
    expect(gateViewFor(undefined, "not-admitted")).toBe("code");
  });

  it("never moves on the strength of a read that failed", () => {
    expect(gateViewFor("unknown", "not-admitted")).toBe("code");
    expect(gateViewFor("unknown", "signed-out")).toBe("signed-out");
  });

  it("follows the device when it does know", () => {
    expect(gateViewFor("not-admitted", "signed-out")).toBe("code");
    expect(gateViewFor("signed-out", "not-admitted")).toBe("signed-out");
    // Admitted: the page is on its way, never a form asking again.
    expect(gateViewFor("admitted", "not-admitted")).toBe("in");
    expect(gateViewFor("admitted", "signed-out")).toBe("in");
  });
});

describe("the gate as a page, hydrating", () => {
  function page(client: QueryClient) {
    return (
      <QueryClientProvider client={client}>
        <GatedPage rendered="not-admitted">
          <InviteGatePage
            rendered="not-admitted"
            phone="+919000003210"
            purpose="browse"
          />
        </GatedPage>
      </QueryClientProvider>
    );
  }

  it("draws exactly the server's HTML first, whatever the cache already knows", async () => {
    const html = renderToString(page(new QueryClient()));
    expect(html).toContain('data-invite-gate="page"');
    expect(html).toContain("Enter your invite code");

    const container = document.createElement("div");
    container.innerHTML = html;
    document.body.appendChild(container);

    /*
      A sibling that hydrated first has already learned MORE than the server
      said: this number is in. The first client render must still be the
      server's, or React throws #418.
    */
    __signInAppRouteMock("sess_919000003210");
    me(200, true);
    const client = new QueryClient({
      defaultOptions: { queries: { retry: false } },
    });
    client.setQueryData(qk.session(), { signedIn: true });
    client.setQueryData(qk.myAccount(), {
      phone: "+919000003210",
      admitted: true,
    });

    const mismatches: unknown[] = [];
    const root = await act(async () =>
      hydrateRoot(container, page(client), {
        onRecoverableError: (error) => mismatches.push(error),
      }),
    );

    expect(mismatches).toEqual([]);
    // One render later, the truth: this number is in, and the page is asked for.
    await waitFor(() => expect(nav.refresh).toHaveBeenCalled());
    expect(container.textContent).toContain("You are in");

    act(() => root.unmount());
    container.remove();
  });
});
