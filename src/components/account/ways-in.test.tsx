import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { screen, cleanup, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { http, HttpResponse } from "msw";
import { renderWithQuery } from "@/test/render";
import { qk } from "@/lib/query/policy";
import { ADD_WAY_WORDS as A, WAYS_IN_WORDS as W } from "@/lib/auth/use-add-way";
import { EMAIL_SIGN_IN } from "@/components/auth/use-sign-in-flow";
import { refuse } from "@/components/people/people-test-kit";
import { AccountScreen } from "./account-screen";
import { server } from "../../../mocks/server";
import {
  __resetAppRouteMocks,
  __signInAppRouteMock,
} from "../../../mocks/app-route-handlers";

/**
 * Ways in on Account (yuvoy-app#229, the web half of yuvoy-mobile#340): the
 * rows, adding the kind an account lacks, and every answer the add can get.
 */

const BASE = process.env.NEXT_PUBLIC_API_URL ?? "http://localhost:8099/v1";
const ADDRESS = "asha@example.com";
const NUMBER = "+919811122233";
const DEV_HINT = "Development build: the code is 123456.";

vi.mock("next/navigation", () => ({
  useRouter: () => ({ push: vi.fn(), replace: vi.fn(), refresh: vi.fn() }),
  usePathname: () => "/account",
  useSearchParams: () => new URLSearchParams(),
}));

/** `GET /me` with only what a test varies. */
const me = (over: Record<string, unknown> = {}) => ({
  phone: "+919000000000",
  name: "Asha Menon",
  email: null,
  emailProven: false,
  provenEmail: null,
  googleSignIn: false,
  interests: [],
  onboardingRequired: false,
  memberSince: null,
  trips: { total: 0, upcoming: 0, completed: 0 },
  reviews: { count: 0 },
  support: { whatsappE164: null, hours: "" },
  admitted: true,
  ageConfirmed: true,
  ...over,
});

const withEmail = { emailProven: true, provenEmail: ADDRESS };
const emailOnly = { phone: null, ...withEmail };

/**
 * The API for one test, signed in: the email door, the account `/me` reads,
 * the code requests and sign-outs it saw. A test changes the fields as the
 * API would change.
 */
function signedIn(account: Record<string, unknown>, door = true) {
  const api = {
    door,
    configReads: 0,
    account,
    meStatus: 200,
    meReads: 0,
    /** Set to hold every `/me` read until it resolves. */
    gate: null as Promise<void> | null,
    held: false,
    devCode: "123456" as string | undefined,
    requests: [] as Array<{ body: unknown; authorization: string | null }>,
    signOuts: 0,
  };
  server.use(
    http.get(`${BASE}/app-config`, () => {
      api.configReads += 1;
      return HttpResponse.json({
        minimumVersion: { ios: "0.0.0", android: "0.0.0" },
        features: {
          payments: "coming_soon",
          inviteOnly: false,
          signIn: { email: api.door, google: false, apple: false },
        },
        support: { whatsappE164: null, hours: "" },
        deliveryHost: null,
        releases: {},
      });
    }),
    http.get(`${BASE}/me`, async () => {
      api.meReads += 1;
      if (api.gate) {
        api.held = true;
        await api.gate;
      }
      return api.meStatus === 401
        ? refuse(401, "unauthorized", "Sign in first.")
        : HttpResponse.json(api.account);
    }),
    http.post(`${BASE}/me/sign-in/request`, async ({ request }) => {
      const body = (await request.json()) as Record<string, unknown>;
      api.requests.push({
        body,
        authorization: request.headers.get("authorization"),
      });
      return HttpResponse.json(
        {
          sent: true,
          message: body.email
            ? "A code is on its way to that address."
            : "If this number can get a code, it is on its way.",
          ...(api.devCode ? { devCode: api.devCode } : {}),
        },
        { status: 202 },
      );
    }),
    http.delete(`${BASE}/me/session`, () => {
      api.signOuts += 1;
      return new HttpResponse(null, { status: 204 });
    }),
  );
  __signInAppRouteMock("sess_test");
  return api;
}

/** `POST /api/session/link` answering with `reply`, keeping what it was sent. */
function link(reply: () => Response) {
  const sent: unknown[] = [];
  server.use(
    http.post("*/api/session/link", async ({ request }) => {
      sent.push(await request.json());
      return reply();
    }),
  );
  return sent;
}

async function show() {
  const user = userEvent.setup();
  const view = renderWithQuery(<AccountScreen />);
  const region = await screen.findByRole("region", { name: W.title });
  return { ...view, user, region };
}

type View = Awaited<ReturnType<typeof show>>;

/** Add an email, as far as its code step, or with `andCode` its code too. */
async function sendEmail(view: View, andCode = false) {
  const { user, region } = view;
  await user.click(
    await within(region).findByRole("button", { name: W.addEmail }),
  );
  await user.type(within(region).getByLabelText(A.emailLabel), ADDRESS);
  await user.click(
    within(region).getByRole("button", { name: "Send me a code" }),
  );
  await within(region).findByRole("heading", { name: "Check your email" });
  if (andCode) await enterCode(view, "email");
}

/**
 * Add a number, as far as its code step. Send me a code stays off until
 * there is more than the dial code.
 */
async function sendNumber({ user, region }: View) {
  await user.click(
    await within(region).findByRole("button", { name: W.addNumber }),
  );
  const send = within(region).getByRole("button", { name: "Send me a code" });
  expect(send).toBeDisabled();
  await user.type(within(region).getByLabelText(W.number), "9811122233");
  expect(send).toBeEnabled();
  await user.click(send);
  await within(region).findByLabelText(A.codeLabel);
}

async function enterCode({ user, region }: View, kind: "email" | "phone") {
  await user.type(within(region).getByLabelText(A.codeLabel), "123456");
  await user.click(
    within(region).getByRole("button", { name: A.submit[kind] }),
  );
}

beforeEach(() => __resetAppRouteMocks());
afterEach(cleanup);

describe("the rows", () => {
  it("an email account with the door shut: both rows, no add button", async () => {
    signedIn(me(withEmail), false);
    const { client, region } = await show();
    await waitFor(() =>
      expect(client.getQueryState(qk.appConfig())?.status).toBe("success"),
    );
    expect(within(region).getByText(ADDRESS)).toBeInTheDocument();
    expect(within(region).getByText("+919000000000")).toBeInTheDocument();
    expect(within(region).queryAllByRole("button")).toEqual([]);
  });

  it("says Added for an email /me does not name", async () => {
    signedIn(me({ emailProven: true, provenEmail: null }), false);
    const { region } = await show();
    expect(within(region).getByText(W.emailAdded)).toBeInTheDocument();
  });
});

describe("adding", () => {
  it("adds an email to a number-only account", async () => {
    const api = signedIn(me());
    const sent = link(() => {
      api.account = me(withEmail);
      return HttpResponse.json({ linked: true }, { status: 201 });
    });
    const view = await show();
    await sendEmail(view);
    // The sign-in's own request, straight to the API with no session.
    expect(api.requests).toEqual([
      { body: { email: ADDRESS }, authorization: null },
    ]);

    const reads = api.meReads;
    await enterCode(view, "email");
    expect(await within(view.region).findByRole("status")).toHaveTextContent(
      A.added,
    );
    expect(sent).toEqual([{ email: ADDRESS, code: "123456" }]);
    expect(api.meReads).toBeGreaterThan(reads);
    expect(within(view.region).getByText(ADDRESS)).toBeInTheDocument();
  });

  it("adds a number, and asks for a code only once there is more than the dial code", async () => {
    const api = signedIn(me(emailOnly));
    const sent = link(() => {
      api.account = me({ ...emailOnly, phone: NUMBER });
      return HttpResponse.json({ linked: true }, { status: 201 });
    });
    const view = await show();
    await sendNumber(view);
    expect(api.requests.map((r) => r.body)).toEqual([{ phone: NUMBER }]);

    await enterCode(view, "phone");
    expect(await within(view.region).findByRole("status")).toHaveTextContent(
      A.added,
    );
    expect(sent).toEqual([{ phone: NUMBER, code: "123456" }]);
  });
});

describe("refusals", () => {
  it("409 identity_taken: Use another email goes back to the address, the code gone", async () => {
    signedIn(me());
    link(() =>
      refuse(
        409,
        "identity_taken",
        "That already signs in to another account. Sign in with it there instead.",
      ),
    );
    const view = await show();
    await sendEmail(view, true);
    const alert = await within(view.region).findByRole("alert");
    expect(alert).toHaveTextContent("That address is taken");

    await view.user.click(
      within(alert).getByRole("button", { name: EMAIL_SIGN_IN.useAnother }),
    );
    expect(within(view.region).getByLabelText(A.emailLabel)).toHaveValue(
      ADDRESS,
    );
    expect(within(view.region).queryByLabelText(A.codeLabel)).toBeNull();
    expect(within(view.region).queryByRole("alert")).toBeNull();
  });

  it("409 identity_kind_taken: reads /me again, and Close closes", async () => {
    const api = signedIn(me());
    link(() =>
      refuse(
        409,
        "identity_kind_taken",
        "This account already has one. An account holds one number and one email.",
      ),
    );
    const view = await show();
    await sendEmail(view);
    const reads = api.meReads;
    await enterCode(view, "email");
    const alert = await within(view.region).findByRole("alert");
    expect(alert).toHaveTextContent("Nothing was added");
    await waitFor(() => expect(api.meReads).toBeGreaterThan(reads));

    await view.user.click(within(alert).getByRole("button", { name: "Close" }));
    expect(within(view.region).queryByLabelText(A.codeLabel)).toBeNull();
  });

  it("401 fresh_sign_in_required: Sign out and sign in again signs out", async () => {
    const api = signedIn(me());
    link(() =>
      refuse(401, "fresh_sign_in_required", "Sign in again, then add this."),
    );
    const view = await show();
    await sendEmail(view, true);
    const alert = await within(view.region).findByRole("alert");
    expect(alert).toHaveTextContent("Sign in again first");

    await view.user.click(
      within(alert).getByRole("button", { name: "Sign out and sign in again" }),
    );
    await waitFor(() => expect(api.signOuts).toBe(1));
    await waitFor(() =>
      expect(
        screen.queryByRole("button", { name: "Sign out on this device" }),
      ).toBeNull(),
    );
  });
});

describe("a plain 401", () => {
  it("with /me still answering: the code field says so and the form stays", async () => {
    const api = signedIn(me());
    link(() =>
      refuse(401, "unauthorized", "That code did not work. Ask for a new one."),
    );
    const view = await show();
    await sendEmail(view);
    const reads = api.meReads;
    await enterCode(view, "email");
    expect(await within(view.region).findByRole("alert")).toHaveTextContent(
      "It may be wrong, it may have expired, or it may already have been used.",
    );
    // The account, then the session check, which asks `/me` too.
    await waitFor(() => expect(api.meReads).toBeGreaterThanOrEqual(reads + 2));
    expect(within(view.region).getByLabelText(A.codeLabel)).toBeInTheDocument();
    expect(
      screen.getByRole("button", { name: "Sign out on this device" }),
    ).toBeInTheDocument();
  });

  it("with /me refused too: the screen becomes the sign-in form", async () => {
    const api = signedIn(me());
    link(() => {
      api.meStatus = 401;
      return refuse(401, "unauthorized", "Sign in again to add a way in.");
    });
    const view = await show();
    await sendEmail(view, true);
    expect(
      await screen.findByRole("button", { name: EMAIL_SIGN_IN.door }),
    ).toBeInTheDocument();
    expect(screen.queryByRole("region", { name: W.title })).toBeNull();
  });
});

describe("the door shuts", () => {
  it("503 sign_in_unavailable: reads the config again, and the add buttons go", async () => {
    const api = signedIn(me(emailOnly));
    link(() => {
      api.door = false;
      return refuse(
        503,
        "sign_in_unavailable",
        "Signing in this way is not open yet. Sign in with your WhatsApp number.",
      );
    });
    const view = await show();
    await sendNumber(view);
    const reads = api.configReads;
    await enterCode(view, "phone");
    const alert = await within(view.region).findByRole("alert");
    expect(alert).toHaveTextContent("Adding a way in is closed right now");
    await waitFor(() => expect(api.configReads).toBeGreaterThan(reads));

    await view.user.click(within(alert).getByRole("button", { name: "Close" }));
    await waitFor(() =>
      expect(
        within(view.region).queryByRole("button", { name: W.addNumber }),
      ).toBeNull(),
    );
    expect(within(view.region).getByText(ADDRESS)).toBeInTheDocument();
  });
});

describe("no answer from the link", () => {
  it("says Added when /me now names the way in", async () => {
    const api = signedIn(me());
    link(() => {
      api.account = me(withEmail);
      return HttpResponse.error();
    });
    const view = await show();
    await sendEmail(view, true);
    expect(await within(view.region).findByRole("status")).toHaveTextContent(
      A.added,
    );
    expect(within(view.region).queryByRole("alert")).toBeNull();
  });

  it("says it could not confirm when /me does not", async () => {
    signedIn(me());
    link(() => HttpResponse.error());
    const view = await show();
    await sendEmail(view, true);
    expect(await within(view.region).findByRole("alert")).toHaveTextContent(
      "We could not confirm that",
    );
    expect(within(view.region).queryByText(A.added)).toBeNull();
  });
});

describe("leaving the form", () => {
  it("Not now closes it", async () => {
    signedIn(me());
    const { user, region } = await show();
    await user.click(
      await within(region).findByRole("button", { name: W.addEmail }),
    );
    expect(within(region).getByLabelText(A.emailLabel)).toBeInTheDocument();
    await user.click(within(region).getByRole("button", { name: A.cancel }));
    expect(within(region).queryByLabelText(A.emailLabel)).toBeNull();
    expect(
      within(region).getByRole("button", { name: W.addEmail }),
    ).toBeInTheDocument();
  });

  it("Use another email clears the code and the development hint", async () => {
    const api = signedIn(me());
    const view = await show();
    const { user, region } = view;
    await sendEmail(view);
    expect(within(region).getByText(DEV_HINT)).toBeInTheDocument();
    await user.type(within(region).getByLabelText(A.codeLabel), "12");

    await user.click(
      within(region).getByRole("button", { name: EMAIL_SIGN_IN.useAnother }),
    );
    expect(within(region).queryByLabelText(A.codeLabel)).toBeNull();
    expect(within(region).queryByText(DEV_HINT)).toBeNull();
    expect(within(region).getByLabelText(A.emailLabel)).toHaveValue(ADDRESS);
    api.devCode = undefined;
    await user.click(
      within(region).getByRole("button", { name: "Send me a code" }),
    );
    expect(await within(region).findByLabelText(A.codeLabel)).toHaveValue("");
    expect(
      within(region).getByText(EMAIL_SIGN_IN.codeHint),
    ).toBeInTheDocument();
    expect(within(region).queryByText(DEV_HINT)).toBeNull();
    expect(api.requests).toHaveLength(2);
  });
});

describe("what the link answer leaves behind", () => {
  it("a stray sessionToken is nowhere in the page or the caches", async () => {
    const api = signedIn(me());
    link(() => {
      api.account = me(withEmail);
      return HttpResponse.json(
        { linked: true, sessionToken: "sess_stray" },
        { status: 201 },
      );
    });
    const view = await show();
    await sendEmail(view, true);
    await within(view.region).findByText(A.added);

    expect(document.body.innerHTML).not.toContain("sess_stray");
    const { client } = view;
    const queries = client.getQueryCache().getAll();
    const mutations = client.getMutationCache().getAll();
    const held = [...queries, ...mutations].map((entry) => entry.state);
    expect(JSON.stringify(held)).not.toContain("sess_stray");
  });

  it("shows no add button for the kind just added while /me is slow", async () => {
    const api = signedIn(me());
    let release: () => void = () => undefined;
    link(() => {
      api.account = me(withEmail);
      api.gate = new Promise<void>((resolve) => {
        release = resolve;
      });
      return HttpResponse.json({ linked: true }, { status: 201 });
    });
    const view = await show();
    await sendEmail(view, true);

    // The account is being read again and has not answered.
    await waitFor(() => expect(api.held).toBe(true));
    expect(
      within(view.region).queryByRole("button", { name: W.addEmail }),
    ).toBeNull();
    expect(within(view.region).queryByText(A.added)).toBeNull();
    api.gate = null;
    release();
    await within(view.region).findByText(A.added);
    expect(
      within(view.region).queryByRole("button", { name: W.addEmail }),
    ).toBeNull();
    expect(within(view.region).getByText(ADDRESS)).toBeInTheDocument();
  });
});
