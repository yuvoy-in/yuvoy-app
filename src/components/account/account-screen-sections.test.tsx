import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { screen, cleanup, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { http, HttpResponse } from "msw";
import { renderWithQuery } from "@/test/render";
import { AccountScreen } from "./account-screen";
import { useRelease } from "@/lib/site/use-release";
import { server } from "../../../mocks/server";
import {
  __resetAppRouteMocks,
  __signInAppRouteMock,
} from "../../../mocks/app-route-handlers";

const BASE = process.env.NEXT_PUBLIC_API_URL ?? "http://localhost:8099/v1";

const nav = vi.hoisted(() => ({ replaced: [] as string[] }));

/*
  `next` is read off `window.location` in the submit handler, not with
  `useSearchParams`: the hook would bail `/account` out of static rendering,
  and a Suspense boundary around the screen empties the prerendered HTML that
  carries the privacy and terms links (`e2e/audit-pages.spec.ts` caught that). So a
  test sets the real address rather than a mocked hook.
*/
const atAccount = (search = "") =>
  window.history.replaceState({}, "", `/account${search ? `?${search}` : ""}`);
vi.mock("next/navigation", () => ({
  useRouter: () => ({
    push: vi.fn(),
    replace: (href: string) => nav.replaced.push(href),
  }),
  usePathname: () => "/account",
  useSearchParams: () => new URLSearchParams(window.location.search),
}));

beforeEach(() => {
  atAccount();
  nav.replaced = [];
  /*
    Start signed out. The session is an HttpOnly cookie now (yuvoy-app#57), so
    there is nothing in browser storage to clear; the app-route mock keeps a
    flag where the real route keeps the cookie.
  */
  __resetAppRouteMocks();
});
afterEach(cleanup);

/**
 * The first-sign-in screen (item 10).
 *
 * "**It is never a gate.**" It is mounted on Account and nowhere else, which
 * is how "never shown during checkout, the Ask pop-up or an invite" is
 * enforced: not by a flag, but by the screen not existing in those places.
 */
describe("first sign-in", () => {
  const fresh = () => {
    __signInAppRouteMock();
    server.use(
      http.get(`${BASE}/me`, () =>
        HttpResponse.json({
          phone: "+919000000000",
          name: null,
          email: null,
          interests: [],
          onboardingRequired: true,
          memberSince: null,
          trips: { total: 0, upcoming: 0, completed: 0 },
          reviews: { count: 0 },
          support: { whatsappE164: null, hours: "" },
        }),
      ),
    );
    renderWithQuery(<AccountScreen />);
  };

  it("asks the two questions when the server says it is required", async () => {
    fresh();
    expect(await screen.findByText("Welcome to Yuvoy")).toBeInTheDocument();
    expect(screen.getByLabelText("Your name")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Skip" })).toBeInTheDocument();
  });

  it("skips with onboarded on its own, and does not come back", async () => {
    /*
      A client-side dismissal would bring this back on the next visit and on
      the next device, because the server would still say it was required.
      The answer is written into the cache from the PATCH response, so the
      screen behind it is correct with no second request.
    */
    let body: Record<string, unknown> | null = null;
    server.use(
      http.patch(`${BASE}/me`, async ({ request }) => {
        body = (await request.json()) as Record<string, unknown>;
        return HttpResponse.json({
          phone: "+919000000000",
          name: null,
          email: null,
          interests: [],
          onboardingRequired: false,
          memberSince: null,
          trips: { total: 0, upcoming: 0, completed: 0 },
          reviews: { count: 0 },
          support: { whatsappE164: null, hours: "" },
        });
      }),
    );

    const user = userEvent.setup();
    fresh();
    await user.click(await screen.findByRole("button", { name: "Skip" }));

    await waitFor(() => expect(body).toEqual({ onboarded: true }));
    expect(
      await screen.findByRole("button", { name: "Sign out on this device" }),
    ).toBeInTheDocument();
  });

  it("will not continue without a name", async () => {
    let called = false;
    server.use(
      http.patch(`${BASE}/me`, () => {
        called = true;
        return HttpResponse.json({});
      }),
    );

    const user = userEvent.setup();
    fresh();
    await user.click(await screen.findByRole("button", { name: "Continue" }));

    expect(
      await screen.findByText("We need a name to continue."),
    ).toBeInTheDocument();
    expect(called).toBe(false);
  });

  it("sends the name and the interests, and no onboarded flag", async () => {
    /*
      It does not need one: "Saving a name also marks the screen answered".
      Sending both would be two statements of one fact.
    */
    let body: Record<string, unknown> | null = null;
    server.use(
      http.patch(`${BASE}/me`, async ({ request }) => {
        body = (await request.json()) as Record<string, unknown>;
        return HttpResponse.json({
          phone: "+919000000000",
          name: "Asha",
          email: null,
          interests: ["scuba"],
          onboardingRequired: false,
          memberSince: null,
          trips: { total: 0, upcoming: 0, completed: 0 },
          reviews: { count: 0 },
          support: { whatsappE164: null, hours: "" },
        });
      }),
    );

    const user = userEvent.setup();
    fresh();
    await user.type(await screen.findByLabelText("Your name"), "Asha");
    await user.click(
      await screen.findByRole("button", { name: "Scuba diving" }),
    );
    await user.click(screen.getByRole("button", { name: "Continue" }));

    await waitFor(() =>
      expect(body).toEqual({ name: "Asha", interests: ["scuba"] }),
    );
  });
});

/**
 * Your links on Account (yuvoy-app#207): drawn for a traveller with creator
 * tools on while the `creator` release is open to them, and not otherwise.
 * The section's own states are tested in `creator/your-links.test.tsx`.
 */
describe("your links on the account", () => {
  function account(over: { creatorToolsOn: boolean; cohort: string | null }) {
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
          ...over,
        }),
      ),
      http.get(`${BASE}/app-config`, () =>
        HttpResponse.json({
          minimumVersion: { ios: "0.0.0", android: "0.0.0" },
          features: { payments: "coming_soon", inviteOnly: false },
          support: { whatsappE164: null, hours: "" },
          deliveryHost: null,
          releases: { creator: "staff" },
        }),
      ),
    );
  }

  /** The creator release as Your links reads it, once it is known. */
  function ReleaseProbe() {
    const release = useRelease("creator");
    return (
      <p data-testid="release">
        {release.pending
          ? "pending"
          : `${release.stage} ${release.open ? "open" : "shut"}`}
      </p>
    );
  }

  function links() {
    const asked = { count: 0 };
    server.use(
      http.get(`${BASE}/me/creator-links`, () => {
        asked.count += 1;
        return HttpResponse.json({ items: [] });
      }),
    );
    return asked;
  }

  it("is drawn for staff with the tools on", async () => {
    account({ creatorToolsOn: true, cohort: "staff" });
    links();
    __signInAppRouteMock();
    renderWithQuery(<AccountScreen />);
    expect(
      await screen.findByRole("region", { name: "Your links" }),
    ).toBeInTheDocument();
    expect(
      await screen.findByText("No links yet. Get one from a trip you went on."),
    ).toBeInTheDocument();
  });

  it("is not drawn, and asks nothing, outside the release", async () => {
    account({ creatorToolsOn: true, cohort: null });
    const asked = links();
    __signInAppRouteMock();
    renderWithQuery(
      <>
        <ReleaseProbe />
        <AccountScreen />
      </>,
    );
    await screen.findByText("Asha Menon");
    // The stage and the cohort have both answered, and it is closed to them.
    await waitFor(() =>
      expect(screen.getByTestId("release")).toHaveTextContent("staff shut"),
    );
    expect(screen.queryByRole("region", { name: "Your links" })).toBeNull();
    expect(asked.count).toBe(0);
  });
});

describe("organiser pages on the account (yuvoy-app#224)", () => {
  function SupplyProbe() {
    const release = useRelease("supply");
    return (
      <p data-testid="supply">
        {release.pending ? "pending" : release.open ? "open" : "shut"}
      </p>
    );
  }

  it("opens the organiser pages while supply is open", async () => {
    __signInAppRouteMock();
    renderWithQuery(<AccountScreen />);
    expect(
      await screen.findByRole("link", { name: "Organiser pages" }),
    ).toHaveAttribute("href", "/organiser");
  });

  it("is not drawn while supply is off", async () => {
    server.use(
      http.get(`${BASE}/app-config`, () =>
        HttpResponse.json({
          minimumVersion: { ios: "0.0.0", android: "0.0.0" },
          features: { payments: "coming_soon", inviteOnly: false },
          support: { whatsappE164: null, hours: "" },
          deliveryHost: null,
          releases: { supply: "off" },
        }),
      ),
    );
    __signInAppRouteMock();
    renderWithQuery(
      <>
        <SupplyProbe />
        <AccountScreen />
      </>,
    );
    expect(await screen.findByRole("link", { name: "Guides" })).toBeTruthy();
    await waitFor(() =>
      expect(screen.getByTestId("supply")).toHaveTextContent("shut"),
    );
    expect(screen.queryByRole("link", { name: "Organiser pages" })).toBeNull();
  });
});
