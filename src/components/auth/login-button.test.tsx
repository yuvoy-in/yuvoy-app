import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { screen, cleanup, waitFor } from "@testing-library/react";
import { http, HttpResponse, delay } from "msw";
import { renderWithQuery } from "@/test/render";
import { LoginButton } from "./login-button";
import { server } from "../../../mocks/server";
import {
  __resetAppRouteMocks,
  __signInAppRouteMock,
} from "../../../mocks/app-route-handlers";

const nav = vi.hoisted(() => ({ pathname: "/", search: "" }));
vi.mock("next/navigation", () => ({
  useRouter: () => ({ push: vi.fn(), replace: vi.fn() }),
  usePathname: () => nav.pathname,
  useSearchParams: () => new URLSearchParams(nav.search),
}));

beforeEach(() => {
  __resetAppRouteMocks();
  nav.pathname = "/";
  nav.search = "";
});
afterEach(cleanup);

const login = () => screen.queryByRole("link", { name: "Login" });

/**
 * A way in, top right, for anybody not signed in (yuvoy-app#56).
 *
 * The owner asked for it on 14 September. It is the answer to the one thing
 * an HttpOnly cookie cannot fix: WhatsApp and Instagram each open links in
 * their own browser with their own cookie jar, so somebody signed in in
 * Safari opens a shared reel from a message and is a stranger again.
 */
describe("the Login button", () => {
  it("shows for a traveller who is not signed in", async () => {
    renderWithQuery(<LoginButton />);
    await waitFor(() => expect(login()).toBeInTheDocument());
    // The copy is exactly this word. The issue says so.
    expect(login()).toHaveTextContent("Login");
  });

  it("does not show for a traveller who is signed in", async () => {
    __signInAppRouteMock();
    renderWithQuery(<LoginButton />);

    /*
      Waited out rather than asserted immediately. An assertion that runs
      before `/api/session` answers would pass while the component was still
      in its loading branch, and would keep passing if the signed-in branch
      were deleted.
    */
    await new Promise((r) => setTimeout(r, 50));
    expect(login()).toBeNull();
  });

  it("never flashes while the session is still being read", async () => {
    /*
      `signedIn` is `undefined` until `/api/session` answers, and `undefined`
      is falsy. Rendering through it would show Login to somebody who IS
      signed in, on every page load, and then take it away. The issue names
      that: "no page flashes it while loading."
    */
    __signInAppRouteMock();
    server.use(
      http.get("*/api/session", async () => {
        await delay(200);
        return HttpResponse.json({ signedIn: true });
      }),
    );

    renderWithQuery(<LoginButton />);
    expect(login()).toBeNull();
    // And still not, once it settles.
    await new Promise((r) => setTimeout(r, 300));
    expect(login()).toBeNull();
  });

  it("holds its space while loading, so the header does not jump", async () => {
    server.use(
      http.get("*/api/session", async () => {
        await delay(200);
        return HttpResponse.json({ signedIn: false });
      }),
    );

    const { container } = renderWithQuery(<LoginButton />);
    const held = container.querySelector('[aria-hidden="true"]');
    expect(held, "nothing holds the button's place").not.toBeNull();
    expect(held).toHaveClass("h-11");
  });

  it("is not drawn on Account, which is the sign-in form", async () => {
    nav.pathname = "/account";
    renderWithQuery(<LoginButton />);
    await new Promise((r) => setTimeout(r, 50));
    expect(login()).toBeNull();
    // Not even the held space: there is no button coming.
    expect(document.querySelector('[aria-hidden="true"]')).toBeNull();
  });
});

describe("where it sends a traveller back to", () => {
  it("carries the current path", async () => {
    nav.pathname = "/trips";
    renderWithQuery(<LoginButton />);
    await waitFor(() => expect(login()).toBeInTheDocument());
    expect(login()).toHaveAttribute(
      "href",
      `/account?next=${encodeURIComponent("/trips")}`,
    );
  });

  it("carries the query too, because search lives entirely in it", async () => {
    /*
      Dropping the query would land somebody back on an unfiltered grid and
      call it "where you were".
    */
    nav.pathname = "/search";
    nav.search = "q=diving&place=andaman%2Fhavelock";
    renderWithQuery(<LoginButton />);
    await waitFor(() => expect(login()).toBeInTheDocument());

    const href = login()!.getAttribute("href")!;
    const next = new URLSearchParams(href.split("?")[1]).get("next");
    expect(next).toBe("/search?q=diving&place=andaman%2Fhavelock");
  });

  it("encodes the value, so the query cannot break out of the parameter", async () => {
    nav.pathname = "/search";
    nav.search = "q=a+b&on=2026-09-20";
    renderWithQuery(<LoginButton />);
    await waitFor(() => expect(login()).toBeInTheDocument());

    const href = login()!.getAttribute("href")!;
    // One `?`, and everything after `next=` is one parameter.
    expect(href.split("?").length).toBe(2);
    expect(href).not.toContain("next=/search?");
  });
});
