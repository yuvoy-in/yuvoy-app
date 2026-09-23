import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { screen, cleanup, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { http, HttpResponse } from "msw";
import { renderWithQuery } from "@/test/render";
import { server } from "../../../mocks/server";
import {
  __resetAppRouteMocks,
  __signInAppRouteMock,
} from "../../../mocks/app-route-handlers";
import { MOCK_INVITE_CODES } from "../../../mocks/booking-handlers";

/**
 * Account, with the invite gate on (yuvoy-api#195).
 *
 * Two things live here and nowhere else. A number that was given a code and
 * has not used it has nowhere else to type it, because every screen that would
 * ask is behind the gate and shows the landing instead. And the sign-in copy
 * promises "booking never needs one", which is the most reassuring true thing
 * this product says and is simply untrue once the gate is on.
 *
 * Both are asserted with the switch OFF as well, because the rule for the
 * whole feature is that a deployment with the gate off is the app it was.
 */

const BASE = process.env.NEXT_PUBLIC_API_URL ?? "http://localhost:8099/v1";

const nav = vi.hoisted(() => ({ calls: [] as string[] }));
vi.mock("next/navigation", () => ({
  useRouter: () => ({
    push: vi.fn(),
    refresh: () => nav.calls.push("refresh"),
    replace: (href: string) => nav.calls.push(`replace ${href}`),
  }),
  usePathname: () => "/account",
  useSearchParams: () => new URLSearchParams(window.location.search),
}));

const atAccount = (search = "") =>
  window.history.replaceState({}, "", `/account${search ? `?${search}` : ""}`);

/** `GET /me` for a signed-in number, saying whether it is in, or not saying. */
function meSays(admitted: boolean | undefined) {
  server.use(
    http.get(`${BASE}/me`, () =>
      HttpResponse.json({
        phone: "+919000003210",
        name: "Asha Menon",
        email: null,
        interests: [],
        onboardingRequired: false,
        memberSince: "2026-07-02T04:30:00Z",
        trips: { total: 0, upcoming: 0, completed: 0 },
        reviews: { count: 0 },
        support: { whatsappE164: null, hours: "9am to 7pm" },
        ...(admitted === undefined ? {} : { admitted }),
      }),
    ),
  );
}

/** The screen, built with the switch in the state this case needs. */
async function account(inviteOnly: string) {
  vi.resetModules();
  vi.stubEnv("NEXT_PUBLIC_INVITE_ONLY", inviteOnly);
  const { AccountScreen } = await import("./account-screen");
  renderWithQuery(<AccountScreen />);
  return userEvent.setup();
}

const entry = () => screen.queryByText("Enter your invite code");

beforeEach(() => {
  atAccount();
  nav.calls = [];
  __resetAppRouteMocks();
});

afterEach(() => {
  cleanup();
  vi.unstubAllEnvs();
  vi.resetModules();
});

describe("the sign-in copy", () => {
  it("still promises booking needs nothing, with the switch off", async () => {
    await account("false");
    expect(
      await screen.findByText(/^Booking never needs one\./),
    ).toBeInTheDocument();
  });

  it("stops promising it with the switch on, and says what booking needs", async () => {
    /*
      The claim itself is what is wrong, not its tone: with the gate on,
      booking needs a signed-in number that has redeemed a code. Leaving the
      sentence up would send somebody to checkout to find out otherwise, from
      the screen that exists to explain how signing in works.
    */
    await account("true");
    expect(
      await screen.findByText(/Yuvoy is by invitation for now/),
    ).toBeInTheDocument();
    expect(screen.queryByText(/^Booking never needs one\./)).toBeNull();
    // What is still true is still said: one number, every trip on it.
    expect(
      screen.getByText(/every trip on that number is in one place/),
    ).toBeInTheDocument();
  });
});

describe("where a traveller types the code they were given", () => {
  it("offers it to a signed-in number that is not in", async () => {
    __signInAppRouteMock("sess_919000003210");
    meSays(false);
    await account("true");

    expect(await screen.findByText("Enter your invite code")).toBeVisible();
    expect(await screen.findByLabelText("Invite code")).toBeInTheDocument();
  });

  it("offers nothing to a number that is already in", async () => {
    __signInAppRouteMock("sess_919000003210");
    meSays(true);
    await account("true");

    await screen.findByRole("link", { name: "Go to my trips" });
    expect(entry()).toBeNull();
  });

  it("offers nothing when the API does not say, because absent is not a no", async () => {
    /*
      An API from before #195. `admitted` absent means "not asked", never
      "no", so a traveller on a deployment whose API predates the field is
      never told they need a code they were never issued.
    */
    __signInAppRouteMock("sess_919000003210");
    meSays(undefined);
    await account("true");

    await screen.findByRole("link", { name: "Go to my trips" });
    expect(entry()).toBeNull();
  });

  it("offers nothing at all with the switch off", async () => {
    /*
      `admitted` is on `GET /me` in production today, so without this the
      switch being off would still put an invite panel in front of every
      number that has not redeemed a code, on an app where nothing is by
      invitation. Somebody the API refuses while this switch is off is met at
      checkout, which is where the refusal actually happens.
    */
    __signInAppRouteMock("sess_919000003210");
    meSays(false);
    await account("false");

    await screen.findByRole("link", { name: "Go to my trips" });
    expect(entry()).toBeNull();
  });

  it("stays on screen after the code is accepted, and offers somewhere to go", async () => {
    /*
      Redeeming writes `admitted: true` straight into the cached account, so
      the condition that put this panel on screen stops being true the instant
      it succeeds. Without the latch the panel would vanish mid-sentence,
      taking "you are in" and the way onward with it.
    */
    __signInAppRouteMock("sess_919000003210");
    meSays(false);
    const user = await account("true");

    await user.type(
      await screen.findByLabelText("Invite code"),
      MOCK_INVITE_CODES.valid,
    );
    await user.click(screen.getByRole("button", { name: "Use this code" }));

    /*
      Either 200 shape says the same thing to this screen, that the number is
      in: the mock's number is already admitted, so it answers
      `alreadyAdmitted` without spending the code, exactly as production does
      for a number that already holds a booking.
    */
    expect(
      await screen.findByText(/You are in\.|was already in/),
    ).toBeVisible();
    const onward = await screen.findByRole("link", { name: "Start looking" });
    expect(onward).toHaveAttribute("href", "/");
  });
});

describe("coming back to a gated page after signing in", () => {
  async function signIn(user: ReturnType<typeof userEvent.setup>) {
    await user.type(
      await screen.findByLabelText("Your WhatsApp number"),
      "9000003210",
    );
    await user.click(screen.getByRole("button", { name: "Send me a code" }));
    await user.type(await screen.findByLabelText("The code we sent"), "123456");
    await user.click(screen.getByRole("button", { name: "Show me my trips" }));
  }

  it("clears the router cache BEFORE the redirect, with the switch on", async () => {
    /*
      The page `?next=` names was decided on the server for a visitor who was
      signed out, and the client router may hold that decision from a
      prefetch. Replacing into it would paint the gate at somebody who has
      just signed in, and the page would then ask for itself again.
    */
    atAccount("next=%2Fsearch");
    meSays(true);
    const user = await account("true");
    await signIn(user);

    await waitFor(() => expect(nav.calls).toContain("replace /search"));
    expect(nav.calls).toEqual(["refresh", "replace /search"]);
  });

  it("asks for nothing extra with the switch off", async () => {
    atAccount("next=%2Fsearch");
    const user = await account("false");
    await signIn(user);

    await waitFor(() => expect(nav.calls).toContain("replace /search"));
    expect(nav.calls).toEqual(["replace /search"]);
  });
});
