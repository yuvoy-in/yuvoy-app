import { describe, it, expect, vi, afterEach, beforeEach } from "vitest";
import { screen, cleanup, waitFor } from "@testing-library/react";
import { http, HttpResponse } from "msw";
import { renderWithQuery } from "@/test/render";
import { AccountScreen } from "./account-screen";
import { useRelease } from "@/lib/site/use-release";
import { server } from "../../../mocks/server";
import {
  __resetAppRouteMocks,
  __signInAppRouteMock,
} from "../../../mocks/app-route-handlers";
import { meRoutes, openMe, page, trip } from "../me/me-test-kit";

// Its own file because `account-screen.test.tsx` is already past the 500 line cap.

const BASE = process.env.NEXT_PUBLIC_API_URL ?? "http://localhost:8099/v1";

vi.mock("next/navigation", () => ({
  useRouter: () => ({ push: vi.fn(), replace: vi.fn() }),
  usePathname: () => "/account",
  useSearchParams: () => new URLSearchParams(window.location.search),
}));

beforeEach(() => {
  window.history.replaceState({}, "", "/account");
  __resetAppRouteMocks();
});
afterEach(cleanup);

/**
 * Me on Account (yuvoy-mobile#444): with `me` closed the screen is the one
 * before Me and asks no `me` route; open, it carries the header row, the life
 * list, the badges and the two settings. Their own states are tested in
 * `components/me/`.
 */
describe("me on the account", () => {
  function signedInAs() {
    server.use(
      http.get(`${BASE}/me`, () =>
        HttpResponse.json({
          phone: "+919000000000",
          name: "Asha Menon",
          email: null,
          interests: [],
          onboardingRequired: false,
          memberSince: null,
          trips: { total: 1, upcoming: 0, completed: 1 },
          reviews: { count: 0 },
          support: { whatsappE164: null, hours: "" },
          creatorToolsOn: false,
          cohort: null,
        }),
      ),
    );
    __signInAppRouteMock();
  }

  function MeProbe() {
    const release = useRelease("me");
    return (
      <p data-testid="me-release">
        {release.pending ? "pending" : `${release.stage} ${release.open ? "open" : "shut"}`}
      </p>
    );
  }

  it("is the screen as before, asking no me route, while me is closed", async () => {
    signedInAs();
    const at = meRoutes();
    renderWithQuery(
      <>
        <MeProbe />
        <AccountScreen />
      </>,
    );
    await screen.findByText("Asha Menon");
    await waitFor(() =>
      expect(screen.getByTestId("me-release")).toHaveTextContent("off shut"),
    );
    expect(screen.queryByText(/^Done \d/)).toBeNull();
    expect(screen.queryByRole("tablist")).toBeNull();
    expect(screen.queryByRole("heading", { name: "Badges" })).toBeNull();
    expect(screen.queryByText("Languages I'm happy with")).toBeNull();
    expect(at.list.count + at.badges.count + at.settings.count).toBe(0);
    // Everything that was there is still there.
    expect(screen.getByRole("link", { name: "Go to my trips" })).toBeInTheDocument();
    expect(
      screen.getByRole("button", { name: "Sign out on this device" }),
    ).toBeInTheDocument();
  });

  it("carries the header row, the life list, the badges and the settings while open", async () => {
    signedInAs();
    openMe();
    meRoutes({ list: page([trip()]) });
    renderWithQuery(<AccountScreen />);
    expect(
      await screen.findByText("Done 1 · Bucket list 0 · Badges 1"),
    ).toBeInTheDocument();
    expect(
      await screen.findByRole("article", { name: "Try-dive at Nemo Reef" }),
    ).toBeInTheDocument();
    expect(screen.getByRole("tablist", { name: "Done or bucket list" })).toBeInTheDocument();
    expect(await screen.findByRole("heading", { name: "Badges" })).toBeInTheDocument();
    expect(
      await screen.findByRole("group", { name: "Languages I'm happy with" }),
    ).toBeInTheDocument();
    expect(screen.getByRole("switch", { name: "Show them in my lists" })).toBeInTheDocument();
    expect(screen.getByRole("link", { name: "Go to my trips" })).toBeInTheDocument();
  });

  it("keeps the rest of Account working when the life list fails", async () => {
    signedInAs();
    openMe();
    meRoutes({ list: 500 });
    renderWithQuery(<AccountScreen />);
    expect(
      await screen.findByText(
        "We couldn't load your life list just now. Everything else here still works.",
        undefined,
        // The transport's own backoff on a failed read runs first.
        { timeout: 5_000 },
      ),
    ).toBeInTheDocument();
    expect(screen.getByRole("link", { name: "Go to my trips" })).toBeInTheDocument();
    expect(
      screen.getByRole("button", { name: "Sign out on this device" }),
    ).toBeInTheDocument();
  });
});
