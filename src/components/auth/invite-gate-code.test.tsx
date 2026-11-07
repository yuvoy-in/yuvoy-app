import { describe, it, expect, vi, beforeEach } from "vitest";
import { screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { http, HttpResponse, delay } from "msw";
import { renderWithQuery } from "@/test/render";
import { qk } from "@/lib/query/policy";
import { useStanding } from "@/lib/auth/use-access";
import { InviteGate, type GateView } from "./invite-gate";
import { server } from "../../../mocks/server";
import { __signInAppRouteMock } from "../../../mocks/app-route-handlers";

/**
 * The invite gate's code screen (yuvoy-api#195): every answer it can get.
 * Moved out of `invite-gate.test.tsx` (yuvoy-app#243) with the setup it uses.
 *
 * Refusals are answered as values by MSW, the way the API sends them, so each
 * one reaches the screen as the typed `YuvoyError` the client builds.
 */

const BASE = process.env.NEXT_PUBLIC_API_URL ?? "http://localhost:8099/v1";
const REDEEM = `${BASE}/me/invite-codes/redeem`;

vi.mock("next/navigation", () => ({
  useRouter: () => ({ refresh: vi.fn(), replace: vi.fn(), push: vi.fn() }),
  usePathname: () => "/",
  useSearchParams: () => new URLSearchParams(),
}));

/** `GET /me` for a signed-in number, admitted or not. */
function me(admitted: boolean | undefined, phone = "+919000003210") {
  server.use(
    http.get(`${BASE}/me`, () =>
      HttpResponse.json({
        phone,
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

/** What the redeem endpoint answers, and what it was sent. */
function redeemAnswers(
  status: number,
  body: unknown,
  seen: { codes: string[] } = { codes: [] },
) {
  server.use(
    http.post(REDEEM, async ({ request }) => {
      seen.codes.push(((await request.json()) as { code: string }).code);
      return HttpResponse.json(body as object, { status });
    }),
  );
  return seen;
}

const refusal = (code: string, message = "No.") => ({
  error: { code, message, requestId: "01JTESTREQUEST" },
});

/**
 * The gate the way its containers drive it: the view follows where this
 * device stands, as a sheet's container derives it.
 */
function Live({ onAdmitted }: { onAdmitted?: () => void }) {
  const standing = useStanding(true);
  const view: GateView =
    standing === undefined
      ? "checking"
      : standing === "signed-out"
        ? "signed-out"
        : standing === "admitted"
          ? "in"
          : "code";
  return (
    <InviteGate
      view={view}
      variant="sheet"
      purpose="save"
      onAdmitted={onAdmitted}
    />
  );
}

async function typeCode(value: string) {
  const user = userEvent.setup();
  const field = await screen.findByLabelText("Invite code");
  await user.clear(field);
  await user.type(field, value);
  await user.click(screen.getByRole("button", { name: "Use this code" }));
  return { user, field };
}

beforeEach(() => {
  __signInAppRouteMock("sess_919000003210");
  me(false);
});

describe("the code screen", () => {
  it("is one labelled field, built for a code rather than a word", () => {
    renderWithQuery(
      <InviteGate
        view="code"
        variant="page"
        purpose="browse"
        phone="+919000003210"
      />,
    );
    expect(
      screen.getByRole("heading", { level: 1, name: "Enter your invite code" }),
    ).toBeInTheDocument();

    const field = screen.getByLabelText("Invite code");
    expect(field).toHaveAttribute("autocomplete", "off");
    expect(field).toHaveAttribute("autocapitalize", "characters");
    expect(field).toHaveAttribute("spellcheck", "false");
    expect(field).toHaveAccessibleDescription(
      /8 letters and numbers, like K7QM-4XRD/,
    );
    // Admission belongs to the account, so the number is named.
    expect(screen.getByText("+91 ••••••3210")).toBeInTheDocument();
  });

  it("names the proven email of an account with no number", async () => {
    const { client } = renderWithQuery(
      <InviteGate view="code" variant="page" purpose="browse" />,
    );
    client.setQueryData(qk.myAccount(), {
      phone: null,
      provenEmail: "asha@example.com",
      admitted: false,
    });
    expect(await screen.findByText("asha@example.com")).toBeInTheDocument();
    expect(screen.getByText(/^Signed in as/)).toHaveTextContent(
      "Signed in as asha@example.com. Not you?",
    );
    expect(screen.getByText(/you are in on any phone/)).toBeInTheDocument();
  });

  it("says in words why a typo cannot be a code, and sends nothing", async () => {
    const seen = redeemAnswers(200, { admitted: true });
    renderWithQuery(<InviteGate view="code" variant="sheet" purpose="save" />);

    const { field } = await typeCode("K7QM-4XR");
    expect(field).toHaveAccessibleDescription(
      expect.stringContaining(
        "That cannot be a code. A code is 8 letters and numbers, like K7QM-4XRD, and that has 7.",
      ),
    );
    expect(field).toHaveAttribute("aria-invalid", "true");

    await typeCode("K7QM-4XR0");
    expect(
      screen.getByText(
        /never use the letters O, I or L, or the numbers 0 or 1/,
      ),
    ).toBeInTheDocument();

    // Neither spent one of the ten attempts an hour.
    expect(seen.codes).toEqual([]);
  });

  it("takes lowercase and spaces, and sends the code the way it is shown", async () => {
    const seen = redeemAnswers(200, { admitted: true });
    // What the API says once a code has been accepted.
    me(true);
    const onAdmitted = vi.fn();
    const { client } = renderWithQuery(
      <InviteGate
        view="code"
        variant="sheet"
        purpose="save"
        onAdmitted={onAdmitted}
      />,
    );
    client.setQueryData(qk.myAccount(), {
      phone: "+919000003210",
      admitted: false,
    });

    const { field } = await typeCode("k7qm 4xrd");
    await waitFor(() => expect(onAdmitted).toHaveBeenCalledTimes(1));
    expect(onAdmitted).toHaveBeenCalledWith({ admitted: true });
    expect(seen.codes).toEqual(["K7QM-4XRD"]);
    expect(field).not.toBeInTheDocument();
    expect(screen.getByRole("status")).toHaveTextContent(
      "Code accepted. You are in.",
    );
    // Written straight into the account, so every screen moves on at once.
    expect(
      (client.getQueryData(qk.myAccount()) as { admitted: boolean }).admitted,
    ).toBe(true);
  });

  it("says a code was not used up when the number was already in", async () => {
    redeemAnswers(200, { admitted: true, alreadyAdmitted: true });
    const onAdmitted = vi.fn();
    renderWithQuery(
      <InviteGate
        view="code"
        variant="sheet"
        purpose="save"
        onAdmitted={onAdmitted}
      />,
    );

    await typeCode("K7QM-4XRD");
    await waitFor(() =>
      expect(onAdmitted).toHaveBeenCalledWith({
        admitted: true,
        alreadyAdmitted: true,
      }),
    );
    expect(screen.getByRole("status")).toHaveTextContent(
      "You were already in, so your code was not used.",
    );
  });

  it.each([
    [
      404,
      "invite_code_unknown",
      // A code given for one number is unknown to every other (yuvoy-api#195).
      "We do not recognise that code. Check it against the one you were given. If it was given for a phone number, sign in with that number: it works for no other.",
    ],
    [409, "invite_code_used", "That code has already been used."],
    [410, "invite_code_expired", "That code has expired."],
  ])(
    "puts a %s %s on the field in its own words, and keeps the code",
    async (status, code, sentence) => {
      redeemAnswers(status, refusal(code));
      renderWithQuery(
        <InviteGate view="code" variant="sheet" purpose="save" />,
      );

      const { field } = await typeCode("K7QM-4XRD");
      await waitFor(() =>
        expect(field).toHaveAttribute("aria-invalid", "true"),
      );
      expect(field).toHaveAccessibleDescription(
        expect.stringContaining(sentence),
      );
      expect(field).toHaveValue("K7QM-4XRD");
    },
  );

  it("treats too many tries as a designed state, not an error", async () => {
    redeemAnswers(429, refusal("rate_limited", "Too many requests."));
    renderWithQuery(<InviteGate view="code" variant="sheet" purpose="save" />);

    const { field } = await typeCode("K7QM-4XRD");
    const alert = await screen.findByRole("alert");
    expect(alert).toHaveTextContent("Too many tries for now");
    expect(alert).toHaveTextContent(/each account can try only a few an hour/);
    expect(alert).toHaveTextContent(/Wait a while, up to an hour/);
    expect(field).toHaveValue("K7QM-4XRD");
    // No "Try again" button over a throttle: waiting is the only fix.
    expect(screen.queryByRole("button", { name: /try again/i })).toBeNull();
  });

  it("says when the signal is the problem, and keeps what was typed", async () => {
    /*
      Offline, the browser's own request to this app's proxy is what fails:
      the call never reaches a server to be answered.
    */
    server.use(
      http.post("*/api/v1/me/invite-codes/redeem", () => HttpResponse.error()),
    );
    renderWithQuery(<InviteGate view="code" variant="sheet" purpose="save" />);

    const { field } = await typeCode("k7qm4xrd");
    const alert = await screen.findByRole("alert");
    expect(alert).toHaveTextContent("No connection");
    expect(alert).toHaveTextContent(/Your code is still here/);
    expect(field).toHaveValue("K7QM-4XRD");
  });

  it("owns a server failure as ours", async () => {
    redeemAnswers(500, refusal("internal_error", "Boom."));
    renderWithQuery(<InviteGate view="code" variant="sheet" purpose="save" />);

    await typeCode("K7QM-4XRD");
    const alert = await screen.findByRole("alert");
    expect(alert).toHaveTextContent("Something went wrong");
    expect(alert).toHaveTextContent("01JTESTREQUEST");
  });

  it("clears a refusal as soon as the code is edited", async () => {
    redeemAnswers(404, refusal("invite_code_unknown"));
    renderWithQuery(<InviteGate view="code" variant="sheet" purpose="save" />);

    const { user, field } = await typeCode("K7QM-4XRD");
    await waitFor(() => expect(field).toHaveAttribute("aria-invalid", "true"));
    await user.type(field, "{backspace}");
    expect(field).not.toHaveAttribute("aria-invalid");
  });

  it("sends one attempt for a double tap", async () => {
    const seen = { codes: [] as string[] };
    server.use(
      http.post(REDEEM, async ({ request }) => {
        seen.codes.push(((await request.json()) as { code: string }).code);
        await delay(50);
        return HttpResponse.json({ admitted: true });
      }),
    );
    const user = userEvent.setup();
    renderWithQuery(<InviteGate view="code" variant="sheet" purpose="save" />);
    await user.type(await screen.findByLabelText("Invite code"), "K7QM4XRD");
    const submit = screen.getByRole("button", { name: "Use this code" });
    await user.dblClick(submit);

    await screen.findByRole("status");
    expect(seen.codes).toHaveLength(1);
  });

  it("asks somebody whose session ended to sign in again, and says so", async () => {
    // The proxy answers 401 and drops the cookie, as the real route does.
    redeemAnswers(401, refusal("unauthorized", "Sign in first."));
    renderWithQuery(<Live />);

    await typeCode("K7QM-4XRD");
    expect(
      await screen.findByText(
        "Your sign-in has ended. Sign in again, then enter your code.",
      ),
    ).toBeInTheDocument();
    expect(screen.getByLabelText("Your WhatsApp number")).toBeInTheDocument();
  });

  it("lets somebody on the wrong number sign out from the code screen", async () => {
    const user = userEvent.setup();
    renderWithQuery(<Live />);

    await screen.findByLabelText("Invite code");
    await user.click(await screen.findByRole("button", { name: "Not you?" }));
    expect(
      await screen.findByLabelText("Your WhatsApp number"),
    ).toBeInTheDocument();
  });
});
