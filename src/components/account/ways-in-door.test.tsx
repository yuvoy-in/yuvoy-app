import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { screen, cleanup, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { http, HttpResponse } from "msw";
import { renderWithQuery } from "@/test/render";
import { qk } from "@/lib/query/policy";
import { ADD_WAY_WORDS as A, WAYS_IN_WORDS as W } from "@/lib/auth/use-add-way";
import { refuse } from "@/components/people/people-test-kit";
import { AccountScreen } from "./account-screen";
import { server } from "../../../mocks/server";
import {
  __resetAppRouteMocks,
  __signInAppRouteMock,
} from "../../../mocks/app-route-handlers";

/**
 * Ways in and the email door (yuvoy-app#229; manager, 3 Nov 01:21): a 5xx
 * on the add is a passing failure and leaves the door as it was. Only the
 * API's own door-closed answer (`503 sign_in_unavailable`) reads the config
 * again, and even then the section and its alert stay until Close, on a
 * number-only account too.
 */

const BASE = process.env.NEXT_PUBLIC_API_URL ?? "http://localhost:8099/v1";
const ADDRESS = "asha@example.com";
const SHUT_SENTENCE =
  "Signing in this way is not open yet. Sign in with your WhatsApp number.";

vi.mock("next/navigation", () => ({
  useRouter: () => ({ push: vi.fn(), replace: vi.fn(), refresh: vi.fn() }),
  usePathname: () => "/account",
  useSearchParams: () => new URLSearchParams(),
}));

/** A number-only account, signed in, with the email door open. */
function numberOnly() {
  const api = { door: true, configReads: 0 };
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
    http.get(`${BASE}/me`, () =>
      HttpResponse.json({
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
      }),
    ),
    http.post(`${BASE}/me/sign-in/request`, () =>
      HttpResponse.json({ sent: true, devCode: "123456" }, { status: 202 }),
    ),
  );
  __signInAppRouteMock("sess_test");
  return api;
}

/** Add an email up to the code, then send the code to a link answering `reply`. */
async function addEmail(reply: () => Response) {
  server.use(http.post("*/api/session/link", () => reply()));
  const user = userEvent.setup();
  const { client } = renderWithQuery(<AccountScreen />);
  const region = await screen.findByRole("region", { name: W.title });
  await user.click(
    await within(region).findByRole("button", { name: W.addEmail }),
  );
  await user.type(within(region).getByLabelText(A.emailLabel), ADDRESS);
  await user.click(
    within(region).getByRole("button", { name: "Send me a code" }),
  );
  await user.type(await within(region).findByLabelText(A.codeLabel), "123456");
  await user.click(
    within(region).getByRole("button", { name: A.submit.email }),
  );
  return { user, region, client };
}

beforeEach(() => __resetAppRouteMocks());
afterEach(cleanup);

describe("a 5xx on the add", () => {
  it.each([
    [
      "a bare 503 with no envelope",
      () => new HttpResponse("", { status: 503 }),
    ],
    [
      "a 503 that is not the door",
      () => refuse(503, "service_unavailable", "Try again soon."),
    ],
    ["a 500", () => refuse(500, "internal_error", "Something broke.")],
    ["a 502", () => new HttpResponse("Bad gateway", { status: 502 })],
  ])(
    "%s: says so, keeps the section, and leaves the door open",
    async (_, reply) => {
      const api = numberOnly();
      const reads = { before: 0 };
      const { user, region } = await addEmail(() => {
        reads.before = api.configReads;
        return reply();
      });

      const alert = await within(region).findByRole("alert");
      expect(alert).toHaveTextContent("We could not connect");
      expect(alert).not.toHaveTextContent("closed");
      expect(api.configReads).toBe(reads.before);

      await user.click(within(region).getByRole("button", { name: A.cancel }));
      expect(
        await within(region).findByRole("button", { name: W.addEmail }),
      ).toBeInTheDocument();
    },
  );
});

describe("the API's door-closed answer", () => {
  it("on a number-only account: the section and its alert stay until Close", async () => {
    const api = numberOnly();
    const reads = { before: 0 };
    const { user, region, client } = await addEmail(() => {
      reads.before = api.configReads;
      api.door = false;
      return refuse(503, "sign_in_unavailable", SHUT_SENTENCE);
    });

    const alert = await within(region).findByRole("alert");
    expect(alert).toHaveTextContent("Adding a way in is closed right now");
    await waitFor(() => expect(api.configReads).toBeGreaterThan(reads.before));
    // The config now says shut; the section and the alert are still there.
    await waitFor(() =>
      expect(
        client.getQueryData<{ features: { signIn: { email: boolean } } }>(
          qk.appConfig(),
        )?.features.signIn.email,
      ).toBe(false),
    );
    expect(screen.getByRole("region", { name: W.title })).toBe(region);
    expect(within(region).getByRole("alert")).toBe(alert);

    await user.click(within(alert).getByRole("button", { name: "Close" }));
    await waitFor(() =>
      expect(screen.queryByRole("region", { name: W.title })).toBeNull(),
    );
  });
});
