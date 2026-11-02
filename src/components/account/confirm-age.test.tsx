import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { screen, cleanup, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { renderWithQuery } from "@/test/render";
import { indiaYear } from "@/lib/auth/birth-year";
import { AccountScreen } from "./account-screen";
import { CONFIRM_AGE_WORDS as W } from "./confirm-age";
import {
  answer,
  json,
  noContent,
  refuse,
} from "@/components/people/people-test-kit";
import {
  __resetAppRouteMocks,
  __signInAppRouteMock,
} from "../../../mocks/app-route-handlers";

/**
 * Account's "Signed in as" line and Confirm your age (yuvoy-app#229, the web
 * half of yuvoy-mobile#340).
 */

vi.mock("next/navigation", () => ({
  useRouter: () => ({ push: vi.fn(), replace: vi.fn(), refresh: vi.fn() }),
  usePathname: () => "/account",
  useSearchParams: () => new URLSearchParams(),
}));

/* The API's own under-18 sentence on `PUT /me/age` (traveller_age.go). */
const UNDER_AGE =
  "Yuvoy accounts are for people 18 and over, so we have closed this one. If you think this is wrong, contact us.";

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

/** Signs in and shows Account; returns the `DELETE /me/session` calls. */
function signedIn(...answers: Array<() => Response>) {
  __signInAppRouteMock("sess_test");
  const signOut = answer("delete", "/me/session", noContent());
  answer("get", "/me", ...answers);
  renderWithQuery(<AccountScreen />);
  return signOut;
}

async function sendYear(year: number) {
  const user = userEvent.setup();
  await screen.findByRole("heading", { level: 2, name: W.title });
  await user.type(
    screen.getByLabelText("What year were you born?"),
    String(year),
  );
  await user.click(screen.getByRole("button", { name: "Continue" }));
}

beforeEach(() => __resetAppRouteMocks());
afterEach(cleanup);

describe("Signed in as", () => {
  it("names the number", async () => {
    signedIn(json(me()));
    expect(await screen.findByText(/^Signed in as/)).toHaveTextContent(
      "Signed in as +919000000000",
    );
  });

  it("names the proven email when there is no number", async () => {
    signedIn(json(me({ phone: null, provenEmail: "asha@example.com" })));
    expect(await screen.findByText(/^Signed in as/)).toHaveTextContent(
      "Signed in as asha@example.com",
    );
  });

  it("never reads a Google-only account as having no way in", async () => {
    signedIn(json(me({ phone: null, googleSignIn: true })));
    expect(
      await screen.findByText("Signed in with Google"),
    ).toBeInTheDocument();
  });
});

describe("Confirm your age", () => {
  it("is not asked once the age is confirmed", async () => {
    signedIn(json(me({ ageConfirmed: true })));
    await screen.findByText("Asha Menon");
    expect(screen.queryByRole("heading", { name: W.title })).toBeNull();
  });

  it("is not asked when /me does not say", async () => {
    signedIn(json(me({ ageConfirmed: undefined })));
    await screen.findByText("Asha Menon");
    expect(screen.queryByRole("heading", { name: W.title })).toBeNull();
  });

  it("sends the year, then goes and says so", async () => {
    signedIn(json(me({ ageConfirmed: false })), json(me()));
    const put = answer("put", "/me/age", json({ ageConfirmed: true }));
    await sendYear(1990);

    expect(await screen.findByRole("status")).toHaveTextContent(W.done);
    expect(screen.queryByRole("heading", { name: W.title })).toBeNull();
    expect(put.map((s) => s.body)).toEqual([{ birthYear: 1990 }]);
  });

  it("says age_locked in the API's words and stays", async () => {
    signedIn(json(me({ ageConfirmed: false })));
    answer("put", "/me/age", () =>
      refuse(
        409,
        "age_locked",
        "Your age can only be changed by the Yuvoy team. Write to us from Help.",
      ),
    );
    await sendYear(1990);

    expect(await screen.findByRole("alert")).toHaveTextContent(
      "Your age can only be changed by the Yuvoy team. Write to us from Help.",
    );
    expect(
      screen.getByRole("heading", { level: 2, name: W.title }),
    ).toBeInTheDocument();
  });

  it("signs out on under 18 and keeps the API's sentence", async () => {
    const signOut = signedIn(json(me({ ageConfirmed: false })));
    answer("put", "/me/age", () => refuse(403, "under_age_sign_up", UNDER_AGE));
    await sendYear(indiaYear() - 12);

    expect(
      await screen.findByRole("heading", { level: 1, name: W.closedTitle }),
    ).toBeInTheDocument();
    expect(screen.getByRole("alert")).toHaveTextContent(UNDER_AGE);
    expect(screen.getByRole("link", { name: W.help })).toHaveAttribute(
      "href",
      "/help",
    );
    // Signed out: no account below it, and no sign-in form over it.
    await waitFor(() =>
      expect(
        screen.queryByRole("button", { name: "Sign out on this device" }),
      ).toBeNull(),
    );
    expect(screen.queryByLabelText("Your WhatsApp number")).toBeNull();
    // The session is ended on the server too, not only forgotten here.
    expect(signOut.length).toBeGreaterThan(0);
  });
});
