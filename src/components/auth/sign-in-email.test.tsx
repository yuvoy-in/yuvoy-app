import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { screen, cleanup, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { http, HttpResponse } from "msw";
import { renderWithQuery } from "@/test/render";
import { AccountScreen } from "@/components/account/account-screen";
import { InviteGate } from "./invite-gate";
import { EMAIL_SIGN_IN } from "./use-sign-in-flow";
import { server } from "../../../mocks/server";
import { __resetAppRouteMocks } from "../../../mocks/app-route-handlers";

/**
 * The email door and the year step (yuvoy-app#229, web half of
 * yuvoy-mobile#340), on Account where the steps are drawn in full.
 */

const BASE = process.env.NEXT_PUBLIC_API_URL ?? "http://localhost:8099/v1";

vi.mock("next/navigation", () => ({
  useRouter: () => ({ push: vi.fn(), replace: vi.fn(), refresh: vi.fn() }),
  usePathname: () => "/account",
  useSearchParams: () => new URLSearchParams(),
}));

/** `GET /app-config` with the email door's switch set. */
function emailSwitch(on: boolean) {
  server.use(
    http.get(`${BASE}/app-config`, () =>
      HttpResponse.json({
        minimumVersion: { ios: "0.0.0", android: "0.0.0" },
        features: {
          payments: "coming_soon",
          inviteOnly: false,
          signIn: { email: on, google: false, apple: false },
        },
      }),
    ),
  );
}

const refusal = (
  status: number,
  code: string,
  message: string,
  details?: Record<string, unknown>,
) =>
  HttpResponse.json(
    { error: { code, message, details, requestId: "01JTESTREQUEST" } },
    { status },
  );

type Sent = Record<string, unknown>;

/** What the request and verify endpoints were sent, with verify's answers in turn. */
function signInAnswers(verify: Array<(body: Sent) => Response>) {
  const seen = { requests: [] as Sent[], verifies: [] as Sent[] };
  server.use(
    http.post(`${BASE}/me/sign-in/request`, async ({ request }) => {
      seen.requests.push((await request.json()) as Sent);
      return HttpResponse.json(
        { sent: true, message: "A code is on its way to that address." },
        { status: 202 },
      );
    }),
    http.post(`${BASE}/me/sign-in/verify`, async ({ request }) => {
      const body = (await request.json()) as Sent;
      seen.verifies.push(body);
      const next = verify[Math.min(seen.verifies.length, verify.length) - 1];
      return next(body);
    }),
  );
  return seen;
}

const signedIn = () =>
  HttpResponse.json({
    sessionToken: "sess_new",
    expiresAt: "2026-12-01T00:00:00Z",
  });
const askYear = () =>
  refusal(400, "invalid_input", "Tell us the year you were born.", {
    birthYear: "Tell us the year you were born.",
  });

async function toCodeStep(address = "asha@example.com") {
  const user = userEvent.setup();
  renderWithQuery(<AccountScreen />);
  await user.click(
    await screen.findByRole("button", { name: EMAIL_SIGN_IN.door }),
  );
  await user.type(screen.getByLabelText(EMAIL_SIGN_IN.label), address);
  await user.click(screen.getByRole("button", { name: "Send me a code" }));
  await screen.findByRole("heading", { name: "Check your email" });
  return user;
}

beforeEach(() => {
  __resetAppRouteMocks();
  window.history.replaceState({}, "", "/account");
});
afterEach(cleanup);

describe("the doors", () => {
  it("shows only the number while the switch is off", async () => {
    emailSwitch(false);
    renderWithQuery(<AccountScreen />);
    expect(
      await screen.findByLabelText("Your WhatsApp number"),
    ).toBeInTheDocument();
    expect(
      screen.queryByRole("button", { name: EMAIL_SIGN_IN.door }),
    ).toBeNull();
  });

  it("offers email first, then the number, while it is on", async () => {
    emailSwitch(true);
    renderWithQuery(<AccountScreen />);
    const door = await screen.findByRole("button", {
      name: EMAIL_SIGN_IN.door,
    });
    const number = screen.getByRole("button", {
      name: EMAIL_SIGN_IN.phoneDoor,
    });
    expect(
      door.compareDocumentPosition(number) & Node.DOCUMENT_POSITION_FOLLOWING,
    ).toBeTruthy();
    expect(screen.queryByLabelText("Your WhatsApp number")).toBeNull();
  });

  it("never offers email at the invite gate: an invitation admits a number", async () => {
    emailSwitch(true);
    const user = userEvent.setup();
    renderWithQuery(
      <InviteGate view="signed-out" variant="page" purpose="browse" />,
    );
    await user.click(screen.getByRole("button", { name: "Sign in" }));
    expect(
      await screen.findByLabelText("Your WhatsApp number"),
    ).toBeInTheDocument();
    expect(
      screen.queryByRole("button", { name: EMAIL_SIGN_IN.door }),
    ).toBeNull();
  });
});

describe("the email step", () => {
  beforeEach(() => emailSwitch(true));

  it("checks the address on its field before sending anything", async () => {
    const seen = signInAnswers([signedIn]);
    const user = userEvent.setup();
    renderWithQuery(<AccountScreen />);
    await user.click(
      await screen.findByRole("button", { name: EMAIL_SIGN_IN.door }),
    );
    await user.type(screen.getByLabelText(EMAIL_SIGN_IN.label), "asha@");
    await user.click(screen.getByRole("button", { name: "Send me a code" }));

    expect(
      await screen.findByText(EMAIL_SIGN_IN.incomplete),
    ).toBeInTheDocument();
    expect(seen.requests).toEqual([]);
  });

  it("sends the address, then names it on the code step", async () => {
    const seen = signInAnswers([signedIn]);
    await toCodeStep(" asha@example.com ");

    expect(seen.requests).toEqual([{ email: "asha@example.com" }]);
    expect(screen.getByText("asha@example.com").tagName).toBe("STRONG");
    expect(screen.getByText(EMAIL_SIGN_IN.codeHint)).toBeInTheDocument();
    expect(
      screen.getByRole("button", { name: EMAIL_SIGN_IN.useAnother }),
    ).toBeInTheDocument();
  });

  it("signs a returning person in without asking the year", async () => {
    const seen = signInAnswers([signedIn]);
    const user = await toCodeStep();
    await user.type(screen.getByLabelText("Sign-in code"), "123456");
    await user.click(screen.getByRole("button", { name: "Show me my trips" }));

    expect(
      await screen.findByRole("button", { name: "Sign out on this device" }),
    ).toBeInTheDocument();
    expect(seen.verifies).toEqual([
      { email: "asha@example.com", code: "123456" },
    ]);
  });

  it("offers the number when the door has shut since it was drawn", async () => {
    server.use(
      http.post(`${BASE}/me/sign-in/request`, () =>
        refusal(
          503,
          "sign_in_unavailable",
          "Signing in this way is not open yet. Sign in with your WhatsApp number.",
        ),
      ),
    );
    const user = userEvent.setup();
    renderWithQuery(<AccountScreen />);
    await user.click(
      await screen.findByRole("button", { name: EMAIL_SIGN_IN.door }),
    );
    await user.type(
      screen.getByLabelText(EMAIL_SIGN_IN.label),
      "asha@example.com",
    );
    await user.click(screen.getByRole("button", { name: "Send me a code" }));

    expect(
      await screen.findByText("Signing in with email is closed right now"),
    ).toBeInTheDocument();
    await user.click(
      screen.getAllByRole("button", { name: EMAIL_SIGN_IN.useNumber })[0],
    );
    expect(
      await screen.findByLabelText("Your WhatsApp number"),
    ).toBeInTheDocument();
  });
});

describe("the year step, for a person no account holds yet", () => {
  beforeEach(() => emailSwitch(true));

  it("asks the year, then sends the same code with it", async () => {
    const seen = signInAnswers([askYear, signedIn]);
    const user = await toCodeStep();
    await user.type(screen.getByLabelText("Sign-in code"), "123456");
    await user.click(screen.getByRole("button", { name: "Show me my trips" }));

    expect(
      await screen.findByRole("heading", { name: "One more thing" }),
    ).toBeInTheDocument();
    // A step, not a failure.
    expect(screen.queryByRole("alert")).toBeNull();

    await user.type(screen.getByLabelText("What year were you born?"), "1995");
    await user.click(screen.getByRole("button", { name: "Continue" }));

    expect(
      await screen.findByRole("button", { name: "Sign out on this device" }),
    ).toBeInTheDocument();
    expect(seen.verifies[1]).toEqual({
      email: "asha@example.com",
      code: "123456",
      birthYear: 1995,
    });
  });

  it("will not send without a year", async () => {
    const seen = signInAnswers([askYear, signedIn]);
    const user = await toCodeStep();
    await user.type(screen.getByLabelText("Sign-in code"), "123456");
    await user.click(screen.getByRole("button", { name: "Show me my trips" }));
    await screen.findByRole("heading", { name: "One more thing" });
    await user.click(screen.getByRole("button", { name: "Continue" }));

    expect(
      await screen.findByText("Tell us the year you were born."),
    ).toBeInTheDocument();
    expect(seen.verifies).toHaveLength(1);
  });

  it("asks the birthday for the year that straddles 18, and sends it", async () => {
    const seen = signInAnswers([askYear, signedIn]);
    const edge = String(
      Number(
        new Intl.DateTimeFormat("en-IN", {
          timeZone: "Asia/Kolkata",
          year: "numeric",
        }).format(new Date()),
      ) - 18,
    );
    const user = await toCodeStep();
    await user.type(screen.getByLabelText("Sign-in code"), "123456");
    await user.click(screen.getByRole("button", { name: "Show me my trips" }));
    await user.type(
      await screen.findByLabelText("What year were you born?"),
      edge,
    );
    await user.click(screen.getByRole("button", { name: "Continue" }));
    expect(
      await screen.findByText(
        "Tell us whether you have had your birthday this year.",
      ),
    ).toBeInTheDocument();

    await user.click(screen.getByRole("radio", { name: "Yes" }));
    await user.click(screen.getByRole("button", { name: "Continue" }));

    await waitFor(() => expect(seen.verifies).toHaveLength(2));
    expect(seen.verifies[1]).toMatchObject({
      birthYear: Number(edge),
      birthdayPassed: true,
    });
  });

  it("ends on the under step with the API's sentence, and a way to look around", async () => {
    signInAnswers([
      askYear,
      () =>
        refusal(
          403,
          "under_age_sign_up",
          "Yuvoy accounts are for people 18 and over. You can still look around without an account.",
        ),
    ]);
    const user = await toCodeStep();
    await user.type(screen.getByLabelText("Sign-in code"), "123456");
    await user.click(screen.getByRole("button", { name: "Show me my trips" }));
    await user.type(
      await screen.findByLabelText("What year were you born?"),
      "2015",
    );
    await user.click(screen.getByRole("button", { name: "Continue" }));

    const said = await screen.findByRole("alert");
    expect(said).toHaveTextContent(
      "Yuvoy accounts are for people 18 and over. You can still look around without an account.",
    );
    await waitFor(() => expect(said).toHaveFocus());
    expect(screen.getByRole("link", { name: "Look around" })).toHaveAttribute(
      "href",
      "/",
    );
    expect(screen.queryByLabelText("Sign-in code")).toBeNull();
    expect(screen.queryByRole("heading", { level: 1 })).toBeNull();
  });

  it("goes back to the code, year kept, when the code fails with the year", async () => {
    signInAnswers([
      askYear,
      () => refusal(401, "unauthorized", "That code did not work."),
    ]);
    const user = await toCodeStep();
    await user.type(screen.getByLabelText("Sign-in code"), "123456");
    await user.click(screen.getByRole("button", { name: "Show me my trips" }));
    await user.type(
      await screen.findByLabelText("What year were you born?"),
      "1995",
    );
    await user.click(screen.getByRole("button", { name: "Continue" }));

    expect(await screen.findByLabelText("Sign-in code")).toHaveValue("");
    expect(
      screen.getByRole("heading", { name: "Check your email" }),
    ).toBeInTheDocument();
  });
});
