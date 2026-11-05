import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { screen, cleanup, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { delay, http, HttpResponse } from "msw";
import { renderWithQuery } from "@/test/render";
import { AccountScreen } from "./account-screen";
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
 * The account itself (yuvoy-app#38 items 9 and 10).
 *
 * This screen was a sentence and a sign-out button until now, because
 * everything it might have shown lived somewhere else. It reads `GET /me`,
 * which is the one endpoint that knows the traveller rather than the booking.
 */
describe("before it knows which screen it is", () => {
  /*
    Two waits: the device's session, then, signed in, the account. They were
    two different skeletons, and only the first had the policy links, so a
    signed-in visit went shape, other shape without the links, then the screen
    with them (stability audit, 6 Oct 2026).
  */
  const shapeOf = (status: HTMLElement) =>
    Array.from(status.querySelectorAll(".skeleton")).map(
      (bar) => bar.className,
    );

  it("draws both waits as one shape, with the policy links in both", async () => {
    // The session route proves the cookie against `GET /me` first; the
    // account's own read of it is the one held open.
    let reads = 0;
    server.use(
      http.get(`${BASE}/me`, async () => {
        reads += 1;
        if (reads === 1) return undefined;
        await delay("infinite");
        return HttpResponse.json({});
      }),
    );
    __signInAppRouteMock();
    renderWithQuery(<AccountScreen />);

    const device = screen.getByRole("status", { name: "Checking this device" });
    const first = shapeOf(device);
    expect(screen.getByRole("link", { name: "Privacy" })).toBeInTheDocument();

    const account = await screen.findByRole("status", {
      name: "Loading your account",
    });
    expect(shapeOf(account)).toEqual(first);
    expect(screen.getByRole("link", { name: "Privacy" })).toBeInTheDocument();
  });
});

describe("the account", () => {
  const signedIn = () => {
    __signInAppRouteMock();
    renderWithQuery(<AccountScreen />);
  };

  it("says who you are, since when, and what you have done", async () => {
    signedIn();
    expect(await screen.findByText("Asha Menon")).toBeInTheDocument();
    expect(screen.getByText("+919000000000")).toBeInTheDocument();
    /*
      `memberSince` is "2026-07-02T04:30:00Z" in the fixture. Asserted as the
      exact string because the month name comes from our own table now, not
      from the runtime's CLDR (yuvoy-app#67), and this screen is prerendered.
    */
    expect(screen.getByText("Member since Jul 2026")).toBeInTheDocument();
    expect(screen.getByText("3 trips · 1 review")).toBeInTheDocument();
  });

  it("opens the guides beside Saved, the only way in on a phone", async () => {
    // yuvoy-app#116 item 3: the desktop rail is the other door, and a phone
    // never draws it.
    signedIn();
    expect(await screen.findByRole("link", { name: "Guides" })).toHaveAttribute(
      "href",
      "/guides",
    );
    expect(
      screen.getByRole("link", { name: "Saved experiences" }),
    ).toBeInTheDocument();
  });

  /*
    Since the email door (yuvoy-api#304) an account can have no number: `phone`
    is null on GET /me, and the proven email is the way in (yuvoy-app#181).
  */
  it("shows the email when there is no number", async () => {
    server.use(
      http.get(`${BASE}/me`, () =>
        HttpResponse.json({
          phone: null,
          name: "Asha Menon",
          email: null,
          emailProven: true,
          provenEmail: "asha@example.com",
          interests: [],
          onboardingRequired: false,
          memberSince: null,
          trips: { total: 0, upcoming: 0, completed: 0 },
          reviews: { count: 0 },
          support: { whatsappE164: null, hours: "" },
        }),
      ),
    );
    signedIn();
    expect(await screen.findByText("Asha Menon")).toBeInTheDocument();
    expect(screen.getByText("asha@example.com")).toBeInTheDocument();
    expect(screen.queryByText("+919000000000")).toBeNull();
  });

  it("shows neither a number nor an email when it has neither", async () => {
    server.use(
      http.get(`${BASE}/me`, () =>
        HttpResponse.json({
          phone: null,
          name: "Asha Menon",
          email: "typed@example.com",
          emailProven: false,
          provenEmail: null,
          interests: [],
          onboardingRequired: false,
          memberSince: null,
          trips: { total: 0, upcoming: 0, completed: 0 },
          reviews: { count: 0 },
          support: { whatsappE164: null, hours: "" },
        }),
      ),
    );
    signedIn();
    expect(await screen.findByText("Asha Menon")).toBeInTheDocument();
    // The typed email is not a way in, so it is not shown as one.
    expect(screen.queryByText("typed@example.com")).toBeNull();
    expect(screen.queryByText("null")).toBeNull();
  });

  it("uses the singular where there is one of something", async () => {
    server.use(
      http.get(`${BASE}/me`, () =>
        HttpResponse.json({
          phone: "+919000000000",
          name: "Asha Menon",
          email: null,
          interests: [],
          onboardingRequired: false,
          memberSince: null,
          trips: { total: 1, upcoming: 1, completed: 0 },
          reviews: { count: 1 },
          support: { whatsappE164: null, hours: "" },
        }),
      ),
    );
    signedIn();
    expect(await screen.findByText("1 trip · 1 review")).toBeInTheDocument();
  });

  it("drops the member line rather than saying Member since nothing", async () => {
    server.use(
      http.get(`${BASE}/me`, () =>
        HttpResponse.json({
          phone: "+919000000000",
          name: "Asha Menon",
          email: null,
          interests: [],
          onboardingRequired: false,
          memberSince: null,
          trips: { total: 0, upcoming: 0, completed: 0 },
          reviews: { count: 0 },
          support: { whatsappE164: null, hours: "" },
        }),
      ),
    );
    signedIn();
    await screen.findByText("Asha Menon");
    expect(screen.queryByText(/Member since/)).toBeNull();
    expect(screen.getByText("0 trips · 0 reviews")).toBeInTheDocument();
  });

  it("offers a way to add a name rather than inventing a greeting", async () => {
    server.use(
      http.get(`${BASE}/me`, () =>
        HttpResponse.json({
          phone: "+919000000000",
          name: null,
          email: null,
          interests: [],
          onboardingRequired: false,
          memberSince: null,
          trips: { total: 0, upcoming: 0, completed: 0 },
          reviews: { count: 0 },
          support: { whatsappE164: null, hours: "" },
        }),
      ),
    );
    signedIn();
    expect(
      await screen.findByRole("button", { name: "Add your name" }),
    ).toBeInTheDocument();
  });

  it("keeps working when the profile cannot be read", async () => {
    /*
      A failed read is not a failed session. Everything below the header works
      without it, and an error page here would also hide Sign out, which is the
      one thing somebody with a broken account definitely wants.
    */
    server.use(
      http.get(`${BASE}/me`, () =>
        HttpResponse.json(
          { error: { code: "service_unavailable", message: "later" } },
          { status: 503 },
        ),
      ),
    );
    signedIn();
    expect(
      await screen.findByRole("button", { name: "Sign out on this device" }),
    ).toBeInTheDocument();
    expect(
      screen.getByRole("link", { name: "Go to my trips" }),
    ).toBeInTheDocument();
  });

  it("saves only the fields that changed", async () => {
    /*
      The contract's rule, and not a saving: "an absent field is left alone".
      Sending the whole form would mean somebody fixing a typo in their name
      also rewrote their interests with whatever the tiles happened to show.
    */
    let body: Record<string, unknown> | null = null;
    server.use(
      http.patch(`${BASE}/me`, async ({ request }) => {
        body = (await request.json()) as Record<string, unknown>;
        return HttpResponse.json({
          phone: "+919000000000",
          name: "Asha M",
          email: "asha@example.com",
          interests: ["adventure", "scuba-diving"],
          onboardingRequired: false,
          memberSince: "2026-07-02T04:30:00Z",
          trips: { total: 3, upcoming: 1, completed: 2 },
          reviews: { count: 1 },
          support: { whatsappE164: null, hours: "" },
        });
      }),
    );

    const user = userEvent.setup();
    signedIn();
    await user.click(
      await screen.findByRole("button", { name: "Edit profile" }),
    );

    const nameField = await screen.findByLabelText("Your name");
    await user.clear(nameField);
    await user.type(nameField, "Asha M");
    await user.click(screen.getByRole("button", { name: "Save" }));

    await waitFor(() => expect(body).toEqual({ name: "Asha M" }));
  });

  it("sends nothing at all when nothing changed", async () => {
    // A no-op PATCH still costs a round trip and can still fail, which would
    // report a problem with a change nobody made.
    let called = false;
    server.use(
      http.patch(`${BASE}/me`, () => {
        called = true;
        return HttpResponse.json({});
      }),
    );

    const user = userEvent.setup();
    signedIn();
    await user.click(
      await screen.findByRole("button", { name: "Edit profile" }),
    );
    await screen.findByLabelText("Your name");
    await user.click(screen.getByRole("button", { name: "Save" }));

    await new Promise((r) => setTimeout(r, 60));
    expect(called).toBe(false);
  });

  it("clears an email with null rather than an empty string", async () => {
    let body: Record<string, unknown> | null = null;
    server.use(
      http.patch(`${BASE}/me`, async ({ request }) => {
        body = (await request.json()) as Record<string, unknown>;
        return HttpResponse.json({
          phone: "+919000000000",
          name: "Asha Menon",
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
    signedIn();
    await user.click(
      await screen.findByRole("button", { name: "Edit profile" }),
    );
    await user.clear(await screen.findByLabelText("Email (optional)"));
    await user.click(screen.getByRole("button", { name: "Save" }));

    await waitFor(() => expect(body).toEqual({ email: null }));
  });
});
