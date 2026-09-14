import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { screen, cleanup, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { http, HttpResponse } from "msw";
import { renderWithQuery } from "@/test/render";
import { AccountScreen } from "./account-screen";
import { server } from "../../../mocks/server";
import { __resetAppRouteMocks } from "../../../mocks/app-route-handlers";

const BASE = process.env.NEXT_PUBLIC_API_URL ?? "http://localhost:8099/v1";

const nav = vi.hoisted(() => ({ replaced: [] as string[] }));

/*
  `next` is read off `window.location` in the submit handler, not with
  `useSearchParams`: the hook would bail `/account` out of static rendering,
  and a Suspense boundary around the screen empties the prerendered HTML that
  carries the privacy and terms links (`e2e/audit.spec.ts` caught that). So a
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
 * Signing in — yuvoy-app#34, and the owner's two complaints.
 *
 * "They could not sign in: the right code, and 'That code did not work'." Both
 * causes were the endpoint: recovery refuses a correct code for a number that
 * has never booked, and every successful recovery revokes the booking links
 * already on the phone.
 */
describe("the sign-in", () => {
  it("asks the SIGN-IN endpoint, never booking recovery", async () => {
    /*
      The whole of the first fix. Recovery is for a lost link and refuses a
      number that has never booked; this one takes any number. Asserting on
      which URL is called is the only way to pin that, because both answer the
      same shape.
    */
    const called: string[] = [];
    server.use(
      http.post(`${BASE}/me/sign-in/request`, async ({ request }) => {
        called.push(new URL(request.url).pathname);
        return HttpResponse.json(
          { sent: true, message: "On its way.", devCode: "123456" },
          { status: 202 },
        );
      }),
      http.post(`${BASE}/bookings/recovery/request`, () => {
        called.push("RECOVERY");
        return HttpResponse.json({ sent: true, message: "" }, { status: 202 });
      }),
    );

    const user = userEvent.setup();
    renderWithQuery(<AccountScreen />);
    await user.type(
      await screen.findByLabelText("Your WhatsApp number"),
      "9000000000",
    );
    await user.click(screen.getByRole("button", { name: "Send me a code" }));

    await waitFor(() => expect(called.length).toBeGreaterThan(0));
    expect(called).not.toContain("RECOVERY");
    expect(called[0]).toMatch(/\/me\/sign-in\/request$/);
  });

  it("sends the number as E.164, with +91 already in the field", async () => {
    let sentPhone = "";
    server.use(
      http.post(`${BASE}/me/sign-in/request`, async ({ request }) => {
        sentPhone = ((await request.json()) as { phone: string }).phone;
        return HttpResponse.json({ sent: true, message: "" }, { status: 202 });
      }),
    );

    const user = userEvent.setup();
    renderWithQuery(<AccountScreen />);
    // The prefix is a value, not a placeholder that vanishes on the first
    // keystroke — which is how a number reached the API with no country code.
    expect(await screen.findByLabelText("Country code")).toHaveValue("+91");
    await user.type(
      screen.getByLabelText("Your WhatsApp number"),
      "9000000000",
    );
    await user.click(screen.getByRole("button", { name: "Send me a code" }));

    await waitFor(() => expect(sentPhone).toBe("+919000000000"));
  });

  it("will not send an empty number", async () => {
    renderWithQuery(<AccountScreen />);
    expect(
      await screen.findByRole("button", { name: "Send me a code" }),
    ).toBeDisabled();
  });

  it("signs in, and the session is what unlocks the trips", async () => {
    const user = userEvent.setup();
    renderWithQuery(<AccountScreen />);

    await user.type(
      await screen.findByLabelText("Your WhatsApp number"),
      "9000000000",
    );
    await user.click(screen.getByRole("button", { name: "Send me a code" }));
    await user.type(await screen.findByLabelText("The code we sent"), "123456");
    await user.click(screen.getByRole("button", { name: "Show me my trips" }));

    expect(await screen.findByText("You are signed in")).toBeInTheDocument();
    expect(
      screen.getByRole("link", { name: "Go to my trips" }),
    ).toHaveAttribute("href", "/trips");
  });
});

describe("the two ways out of the code step", () => {
  async function reachCodeStep(user: ReturnType<typeof userEvent.setup>) {
    renderWithQuery(<AccountScreen />);
    await user.type(
      await screen.findByLabelText("Your WhatsApp number"),
      "9000000000",
    );
    await user.click(screen.getByRole("button", { name: "Send me a code" }));
    await screen.findByLabelText("The code we sent");
  }

  it("offers both as buttons, not as underlined words in small print", async () => {
    /*
      "The owner took a while to find both." They were two underlined words
      inside a sentence of 12px grey text, and the number field was simply
      disabled once a code had been sent — so a wrong number had no visible way
      back at all.
    */
    const user = userEvent.setup();
    await reachCodeStep(user);
    expect(
      screen.getByRole("button", { name: "Send another code" }),
    ).toBeInTheDocument();
    expect(
      screen.getByRole("button", { name: "Change number" }),
    ).toBeInTheDocument();
  });

  it("Change number really gives the number back", async () => {
    const user = userEvent.setup();
    await reachCodeStep(user);
    await user.click(screen.getByRole("button", { name: "Change number" }));

    const field = await screen.findByLabelText("Your WhatsApp number");
    expect(field).toBeEnabled();
    // And the digits are still there to correct, rather than cleared.
    expect(field).toHaveValue("9000000000");
  });
});

describe("what it says when something goes wrong", () => {
  it("names the code, on the code field, and offers the way out", async () => {
    /*
      "Just basic AI generated, make it proper. Say what happened, what to do
      next and where, with the field it concerns."

      The API answers 401 for wrong, expired, used and over-attempted with one
      message, so this must not guess which — but it can say the three things
      true of all four.
    */
    const user = userEvent.setup();
    renderWithQuery(<AccountScreen />);
    await user.type(
      await screen.findByLabelText("Your WhatsApp number"),
      "9000000000",
    );
    await user.click(screen.getByRole("button", { name: "Send me a code" }));
    await user.type(await screen.findByLabelText("The code we sent"), "000000");
    await user.click(screen.getByRole("button", { name: "Show me my trips" }));

    const message = await screen.findByText(
      /It may be wrong, it may have expired/,
    );
    expect(message).toBeInTheDocument();
    // On the FIELD, not in a panel below the button.
    expect(screen.getByLabelText("The code we sent")).toHaveAttribute(
      "aria-invalid",
      "true",
    );
  });

  it("says a rate limit is not the traveller's fault", async () => {
    server.use(
      http.post(`${BASE}/me/sign-in/request`, () =>
        HttpResponse.json(
          { error: { code: "rate_limited", message: "slow down" } },
          { status: 429 },
        ),
      ),
    );

    const user = userEvent.setup();
    renderWithQuery(<AccountScreen />);
    await user.type(
      await screen.findByLabelText("Your WhatsApp number"),
      "9000000000",
    );
    await user.click(screen.getByRole("button", { name: "Send me a code" }));

    expect(await screen.findByText("Too many tries")).toBeInTheDocument();
    expect(
      screen.getByText(/Nothing is wrong with your account/),
    ).toBeInTheDocument();
  });

  it("offers the trips on this phone when it cannot reach us at all", async () => {
    // Not the traveller's fault and not their problem to diagnose, so it says
    // so and offers the one thing that still works with no session.
    server.use(
      http.post(`${BASE}/me/sign-in/request`, () =>
        HttpResponse.json(
          { error: { code: "internal_error", message: "boom" } },
          { status: 500 },
        ),
      ),
    );

    const user = userEvent.setup();
    renderWithQuery(<AccountScreen />);
    await user.type(
      await screen.findByLabelText("Your WhatsApp number"),
      "9000000000",
    );
    await user.click(screen.getByRole("button", { name: "Send me a code" }));

    expect(
      await screen.findByText("We could not reach us"),
    ).toBeInTheDocument();
    expect(
      screen.getByRole("link", { name: /trips on this phone/ }),
    ).toHaveAttribute("href", "/trips");
  });
});

/**
 * Coming back to where Login was pressed (yuvoy-app#56 item 5).
 *
 * The happy path is small. The refusals are the feature: `next` arrives from
 * the query string, so a link to `/account?next=https://evil.example/login`
 * would hand a traveller who has just signed in on OUR domain, with our form,
 * to somebody else's page in the same tab, already trusting what they see.
 * `safeNextPath` is what stands between that and a traveller, and its own
 * unit tests cover the shapes; this proves the screen actually consults it.
 */
describe("where signing in lands", () => {
  const signIn = async () => {
    const user = userEvent.setup();
    renderWithQuery(<AccountScreen />);
    await screen.findByText("There is no account to make");
    await user.type(
      screen.getByLabelText("Your WhatsApp number"),
      "9111111111",
    );
    await user.click(screen.getByRole("button", { name: "Send me a code" }));
    await user.type(await screen.findByLabelText("The code we sent"), "123456");
    await user.click(screen.getByRole("button", { name: "Show me my trips" }));
  };

  it("returns to a path on this origin", async () => {
    atAccount("next=%2Fsearch%3Fq%3Ddiving");
    await signIn();
    await waitFor(() => expect(nav.replaced).toEqual(["/search?q=diving"]));
  });

  it("stays on Account when there is no next at all", async () => {
    await signIn();
    await screen.findByText("You are signed in");
    expect(nav.replaced).toEqual([]);
  });

  it("REFUSES an absolute URL and stays on Account", async () => {
    atAccount("next=https%3A%2F%2Fevil.example%2Flogin");
    await signIn();
    await screen.findByText("You are signed in");
    expect(nav.replaced).toEqual([]);
  });

  it("REFUSES a protocol-relative URL, which starts with a slash", async () => {
    // The bypass a "must start with /" check waves through.
    atAccount("next=%2F%2Fevil.example");
    await signIn();
    await screen.findByText("You are signed in");
    expect(nav.replaced).toEqual([]);
  });

  it("REFUSES a javascript: scheme", async () => {
    atAccount("next=javascript%3Aalert(1)");
    await signIn();
    await screen.findByText("You are signed in");
    expect(nav.replaced).toEqual([]);
  });
});
