import { describe, it, expect, vi, beforeEach } from "vitest";
import { screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { http, HttpResponse } from "msw";
import { renderWithQuery } from "@/test/render";
import { InviteGate, WAITLIST_URL } from "./invite-gate";
import { server } from "../../../mocks/server";
import {
  __resetAppRouteMocks,
  __signInAppRouteMock,
} from "../../../mocks/app-route-handlers";

/**
 * The invite gate itself (yuvoy-api#195): the landing for somebody signed out,
 * and the in-between states. The code screen and every answer it can get are
 * in `invite-gate-code.test.tsx` (yuvoy-app#243).
 */

const BASE = process.env.NEXT_PUBLIC_API_URL ?? "http://localhost:8099/v1";

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

beforeEach(() => {
  __signInAppRouteMock("sess_919000003210");
  me(false);
});

describe("the landing, for somebody signed out", () => {
  it("says what Yuvoy is and how to get in, before it asks for anything", () => {
    renderWithQuery(
      <InviteGate view="signed-out" variant="page" purpose="browse" />,
    );

    expect(
      screen.getByRole("heading", {
        level: 1,
        name: "Yuvoy is by invitation for now",
      }),
    ).toBeInTheDocument();
    expect(
      // Words that name no place (yuvoy-app#181).
      screen.getByText(/^Find something worth doing, and book a seat on it\./),
    ).toBeInTheDocument();
    expect(
      screen.getByText("Have a code? Sign in, then enter it."),
    ).toBeInTheDocument();
    // Not a bare form: the number is asked for only once somebody asks to.
    expect(screen.queryByLabelText("Your WhatsApp number")).toBeNull();
    expect(screen.getByRole("button", { name: "Sign in" })).toBeInTheDocument();
  });

  it("offers the waitlist to somebody with no code, and the guides meanwhile", () => {
    renderWithQuery(
      <InviteGate view="signed-out" variant="page" purpose="browse" />,
    );
    const waitlist = screen.getByRole("link", { name: "Join the waitlist" });
    expect(waitlist).toHaveAttribute("href", WAITLIST_URL);
    expect(WAITLIST_URL).toBe("https://yuvoy.in/waitlist");
    expect(screen.getByText(/No code yet\?/)).toBeInTheDocument();
    expect(
      screen.getByRole("link", { name: "Read the guides" }),
    ).toHaveAttribute("href", "/guides");
  });

  it("says why, on the route that sent somebody here", () => {
    renderWithQuery(
      <InviteGate view="signed-out" variant="page" purpose="book" />,
    );
    expect(
      screen.getByText("Booking opens once you are in."),
    ).toBeInTheDocument();
  });

  it("signs in with the Account screen's own steps, in place", async () => {
    __resetAppRouteMocks();
    const onSignedIn = vi.fn();
    const user = userEvent.setup();
    renderWithQuery(
      <InviteGate
        view="signed-out"
        variant="page"
        purpose="browse"
        onSignedIn={onSignedIn}
      />,
    );

    await user.click(screen.getByRole("button", { name: "Sign in" }));
    const number = screen.getByLabelText("Your WhatsApp number");
    expect(number).toHaveFocus();
    await user.type(number, "9000003210");
    await user.click(screen.getByRole("button", { name: "Send me a code" }));
    await user.type(await screen.findByLabelText("Sign-in code"), "123456");
    await user.click(screen.getByRole("button", { name: "Sign in" }));

    await waitFor(() => expect(onSignedIn).toHaveBeenCalledTimes(1));
    // Signed in, and the answer to "is this traveller in" is on its way.
    expect(
      screen.getByRole("status", { name: "Checking your invitation" }),
    ).toBeInTheDocument();
  });

  it("says what the API says once a code is asked for (yuvoy-api#254)", async () => {
    /*
      The code goes by email to an address given while signed in or with an
      invitation (yuvoy-api#303), or nowhere, so the gate prints the API's
      sentence rather than promising a WhatsApp message.
    */
    __resetAppRouteMocks();
    const user = userEvent.setup();
    renderWithQuery(
      <InviteGate view="signed-out" variant="page" purpose="browse" />,
    );

    await user.click(screen.getByRole("button", { name: "Sign in" }));
    await user.type(
      screen.getByLabelText("Your WhatsApp number"),
      "9000003210",
    );
    await user.click(screen.getByRole("button", { name: "Send me a code" }));
    await screen.findByLabelText("Sign-in code");

    expect(
      screen.getByText(
        "If you gave us an email for this number while signed in, or with your invitation, a code is on its way to that email. It is good for a few minutes and works once.",
      ),
    ).toBeInTheDocument();
    expect(document.body).not.toHaveTextContent(/on whatsapp/i);
    // The same way out as Account, because it is the same steps.
    expect(screen.getByLabelText("Sign-in code")).toHaveAccessibleDescription(
      /No email\? Use the number you booked with or were invited on, or call us on \+91 81216 57657\.$/,
    );
  });

  it("opens the steps at once in a sheet, where somebody has just tried to act", () => {
    __resetAppRouteMocks();
    renderWithQuery(
      <InviteGate view="signed-out" variant="sheet" purpose="save" />,
    );
    expect(screen.getByLabelText("Your WhatsApp number")).toBeInTheDocument();
    expect(
      screen.getByText("Saving opens once you are in."),
    ).toBeInTheDocument();
    // A sheet carries its heading in its own title bar.
    expect(screen.queryByRole("heading")).toBeNull();
  });
});

describe("the in-between states", () => {
  it("is a loading state while it is not known, never a refusal", () => {
    renderWithQuery(
      <InviteGate view="checking" variant="sheet" purpose="save" />,
    );
    expect(
      screen.getByRole("status", { name: "Checking your invitation" }),
    ).toBeInTheDocument();
    expect(screen.queryByLabelText("Invite code")).toBeNull();
    expect(screen.queryByLabelText("Your WhatsApp number")).toBeNull();
  });

  it("opens the page while it is asked for, and offers to ask again if it did not come", async () => {
    const onContinue = vi.fn();
    const { rerender } = renderWithQuery(
      <InviteGate
        view="in"
        variant="page"
        purpose="browse"
        refreshing
        onContinue={onContinue}
      />,
    );
    expect(
      screen.getByRole("heading", { level: 1, name: "You are in" }),
    ).toBeInTheDocument();
    expect(
      screen.getByRole("status", { name: "Opening Yuvoy" }),
    ).toBeInTheDocument();

    rerender(
      <InviteGate
        view="in"
        variant="page"
        purpose="browse"
        refreshing={false}
        onContinue={onContinue}
      />,
    );
    await userEvent
      .setup()
      .click(screen.getByRole("button", { name: "Continue" }));
    expect(onContinue).toHaveBeenCalledTimes(1);
  });

  it("tells a traveller at checkout which button to tap again", () => {
    renderWithQuery(
      <InviteGate
        view="in"
        variant="panel"
        purpose="book"
        retryLabel="Hold these seats"
      />,
    );
    const status = screen.getByRole("status");
    expect(
      within(status).getByText("Tap Hold these seats again to book."),
    ).toBeInTheDocument();
  });
});
