import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { http, HttpResponse } from "msw";
import { renderWithQuery } from "@/test/render";
import { EXPERIENCE_DETAIL, availabilityFor } from "../../../mocks/fixtures";
import { server } from "../../../mocks/server";
import {
  __resetAppRouteMocks,
  __signInAppRouteMock,
} from "../../../mocks/app-route-handlers";
import { MOCK_INVITE_CODES } from "../../../mocks/booking-handlers";

/**
 * Checkout, refused with `403 invite_required` (yuvoy-api#195).
 *
 * This is the one piece of the invite gate that ships whatever this app's own
 * switch says, and that is the whole reason it is tested both ways: the API's
 * gate and this app's are two switches, and Hima turns the API's on the day
 * the code screen is live. A build with `NEXT_PUBLIC_INVITE_ONLY` off can meet
 * this refusal in production, and without the panel the traveller would get a
 * generic failure over a form they had just filled in.
 */

const BASE = process.env.NEXT_PUBLIC_API_URL ?? "http://localhost:8099/v1";
const kayak = EXPERIENCE_DETAIL["mangrove-kayak-at-dawn"];
const kayakSlot = availabilityFor("mangrove-kayak-at-dawn")[0];

const replace = vi.fn();
vi.mock("next/navigation", () => ({
  usePathname: () => "/e/mangrove-kayak-at-dawn/book",
  useRouter: () => ({ replace, push: vi.fn(), refresh: vi.fn() }),
  useSearchParams: () => new URLSearchParams(),
}));

/**
 * Every reservation that reached the API.
 *
 * Counted at the API's own origin, not at `/api/v1/`: a signed-in checkout
 * goes through this app's proxy, so one booking is two requests with
 * `/reservations` in the URL, and counting both makes every number here
 * double for a signed-in traveller and not for a guest.
 */
let posted = 0;
function count({ request }: { request: Request }) {
  if (
    request.method === "POST" &&
    request.url.startsWith(BASE) &&
    new URL(request.url).pathname.endsWith("/reservations")
  ) {
    posted += 1;
  }
}

/** The API's gate, on: a number that is not in is refused before anything. */
function serverGateOn(admitted: { yes: boolean }) {
  server.use(
    http.post(`${BASE}/reservations`, () =>
      admitted.yes
        ? HttpResponse.json(
            {
              reservationId: "res_1",
              state: "active",
              guests: 1,
              holdExpiresAt: new Date(Date.now() + 600_000).toISOString(),
              requestExpiresAt: null,
              statusToken: "tok_abc",
            },
            { status: 201 },
          )
        : HttpResponse.json(
            {
              error: {
                code: "invite_required",
                message:
                  "Booking is by invitation. Sign in with your number, then enter your invite code.",
                requestId: "01JTESTREQUEST",
              },
            },
            { status: 403 },
          ),
    ),
  );
}

/** `GET /me` for a signed-in number, saying whether it is in. */
function meSays(admitted: boolean) {
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
        admitted,
      }),
    ),
  );
}

/** The form, built with the switch in the state this case needs. */
async function checkout(inviteOnly: string) {
  vi.resetModules();
  vi.stubEnv("NEXT_PUBLIC_INVITE_ONLY", inviteOnly);
  const { CheckoutForm } = await import("./checkout-form");
  renderWithQuery(<CheckoutForm experience={kayak} slot={kayakSlot} />);
  return userEvent.setup();
}

/** Name, number and the policy: everything the button waits for. */
async function fillIn(user: ReturnType<typeof userEvent.setup>) {
  await user.type(await screen.findByLabelText("Your name"), "Asha Menon");
  await user.type(screen.getByLabelText("WhatsApp number"), "+919000000000");
  await user.click(screen.getByRole("checkbox", { name: /called off/i }));
}

const hold = () => screen.getByRole("button", { name: /hold these seats/i });

/** Waits for a signed-in form to settle: the fields collapse into a line. */
async function signedInFormReady() {
  await screen.findByText(/^Booking as/);
  await waitFor(() => expect(hold()).toBeDisabled());
  await userEvent
    .setup()
    .click(screen.getByRole("checkbox", { name: /called off/i }));
  await waitFor(() => expect(hold()).toBeEnabled());
}

beforeEach(() => {
  replace.mockClear();
  posted = 0;
  server.events.on("request:start", count);
});

afterEach(() => {
  server.events.removeListener("request:start", count);
  __resetAppRouteMocks();
  vi.unstubAllEnvs();
  vi.resetModules();
});

describe("the API refuses with 403 invite_required", () => {
  it("asks for the invitation, with the switch OFF, and keeps the whole form", async () => {
    serverGateOn({ yes: false });
    const user = await checkout("false");

    // A party of three, and a name, both of which must survive the refusal.
    await user.click(screen.getByRole("button", { name: "One more guest" }));
    await user.click(screen.getByRole("button", { name: "One more guest" }));
    await fillIn(user);
    const typedPhone = (
      screen.getByLabelText("WhatsApp number") as HTMLInputElement
    ).value;
    await user.click(hold());

    expect(
      await screen.findByText("Booking is by invitation for now"),
    ).toBeInTheDocument();
    // Said in the panel, because it is the question a traveller has here.
    expect(
      screen.getByText(/Nothing was held and nothing was charged/),
    ).toBeInTheDocument();

    // Everything they filled in is exactly where they left it.
    expect(screen.getByLabelText("Your name")).toHaveValue("Asha Menon");
    expect(screen.getByLabelText("WhatsApp number")).toHaveValue(typedPhone);
    expect(screen.getByRole("checkbox", { name: /called off/i })).toBeChecked();
    expect(screen.getByText(/3 people/)).toBeInTheDocument();
    // And the button is still live, for the tap that follows the code.
    expect(hold()).toBeEnabled();
  });

  it("does not fall back to the generic failure panel", async () => {
    /*
      `invite_required` is a step to take, not a failure to report, so it must
      REPLACE the panel rather than appear beside it. Two panels saying
      different things about one refusal is worse than either alone.
    */
    serverGateOn({ yes: false });
    const user = await checkout("false");
    await fillIn(user);
    await user.click(hold());

    await screen.findByText("Booking is by invitation for now");
    expect(screen.queryByText("Something went wrong")).toBeNull();
    expect(screen.queryByRole("link", { name: "Get a new link" })).toBeNull();
  });

  it("leaves every other refusal to the failure panel it always had", async () => {
    // The negative half: nothing about the gate touches the rest of checkout.
    server.use(
      http.post(`${BASE}/reservations`, () =>
        HttpResponse.json(
          {
            error: {
              code: "capacity_unavailable",
              message: "Those seats have gone.",
              details: { remaining: 2 },
            },
          },
          { status: 409 },
        ),
      ),
    );
    const user = await checkout("false");
    await fillIn(user);
    await user.click(hold());

    expect(
      await screen.findByText("Not enough room for that party"),
    ).toBeInTheDocument();
    expect(screen.queryByText("Booking is by invitation for now")).toBeNull();
  });

  it("names the number that is signed in, and asks it for a code", async () => {
    __signInAppRouteMock("sess_919000003210");
    meSays(false);
    serverGateOn({ yes: false });
    const user = await checkout("false");

    await signedInFormReady();
    await user.click(hold());

    // Signed in and not admitted: a code is the thing that is missing.
    expect(
      await screen.findByText("Enter your invite code to book"),
    ).toBeInTheDocument();
    expect(await screen.findByLabelText("Invite code")).toBeInTheDocument();
  });

  it("turns into the way back to the button once a code is accepted", async () => {
    __signInAppRouteMock("sess_919000003210");
    meSays(false);
    const admitted = { yes: false };
    serverGateOn(admitted);
    const user = await checkout("false");

    await signedInFormReady();
    await user.click(hold());

    const field = await screen.findByLabelText("Invite code");
    meSays(true);
    admitted.yes = true;
    expect(posted).toBe(1);
    await user.type(field, MOCK_INVITE_CODES.valid);
    await user.click(screen.getByRole("button", { name: "Use this code" }));

    /*
      AND IT DID NOT ALSO TRY TO BOOK.

      The gate's code form is a `<form>` drawn inside checkout's own form, and
      React dispatches `submit` up its tree: without the two guards ("Use this
      code" stopping the event, and checkout ignoring a submit that is not its
      own) this tap would run the Hold these seats handler as well and send a
      reservation the traveller never asked for.
    */
    expect(posted).toBe(1);

    // It names the control rather than describing one.
    expect(
      await screen.findByText(/Tap Hold these seats.*again to book/),
    ).toBeInTheDocument();

    // And the same button, tapped again, books.
    await user.click(hold());
    await waitFor(() => expect(replace).toHaveBeenCalled());
    expect(screen.queryByText(/Tap Hold these seats/)).toBeNull();
  });
});

/*
  NO FORM INSIDE A FORM (yuvoy-api#195).

  The gate is drawn inside checkout's own form. A browser stops a nested form's
  `submit` at the outer form element, so React (listening at the document)
  never runs the gate's handler and the browser submits natively: "Send me a
  code" reloaded checkout onto its first step and dropped the booking form.
  jsdom does not model that rule, so these assert the structure that avoids it:
  no `form` element inside another, and the gate's controls owned by their own
  form rather than checkout's. The browser half is e2e/invite-gate.spec.ts.
*/
describe("the gate inside checkout's form", () => {
  function checkoutForm(): HTMLFormElement {
    const form = hold().closest("form");
    expect(form).not.toBeNull();
    return form!;
  }

  it("nests no form in it, and the sign-in steps submit their own", async () => {
    serverGateOn({ yes: false });
    const user = await checkout("false");
    await fillIn(user);
    await user.click(hold());
    await screen.findByText("Booking is by invitation for now");

    expect(document.querySelector("form form")).toBeNull();
    const send = await screen.findByRole("button", { name: "Send me a code" });
    const own = (send as HTMLButtonElement).form;
    expect(own).not.toBeNull();
    expect(own).not.toBe(checkoutForm());
    // The number field belongs to the same form, so Enter in it submits it.
    const number = screen.getByLabelText("Your WhatsApp number");
    expect((number as HTMLInputElement).form).toBe(own);
  });

  it("nests no form for the invite code either", async () => {
    __signInAppRouteMock("sess_919000003210");
    meSays(false);
    serverGateOn({ yes: false });
    const user = await checkout("false");
    await signedInFormReady();
    await user.click(hold());
    const code = await screen.findByLabelText("Invite code");

    expect(document.querySelector("form form")).toBeNull();
    const use = screen.getByRole("button", { name: "Use this code" });
    const own = (use as HTMLButtonElement).form;
    expect(own).not.toBeNull();
    expect(own).not.toBe(checkoutForm());
    expect((code as HTMLInputElement).form).toBe(own);
  });
});

describe("with the switch on, a device that signed out mid-form", () => {
  it("is refused here rather than sent as a guest booking", async () => {
    /*
      The one state the server's decision cannot survive. With the gate on,
      this form is only rendered for a number the server let through, and the
      device can sign out from under that (Account in another tab, "Not you?"
      on a gate). The page asks the server again when it notices, but a submit
      in that window would be exactly the guest booking the gate exists to
      refuse, so it never leaves the browser.
    */
    const user = await checkout("true");
    await fillIn(user);
    await user.click(hold());

    expect(
      await screen.findByText("Booking is by invitation for now"),
    ).toBeInTheDocument();
    expect(posted).toBe(0);
    expect(replace).not.toHaveBeenCalled();
    // Nothing was lost by being refused.
    expect(screen.getByLabelText("Your name")).toHaveValue("Asha Menon");
  });

  it("changes nothing about a guest checkout with the switch off", async () => {
    // The same tap, the same form, the switch off: it books, as it always has.
    const user = await checkout("false");
    await fillIn(user);
    await user.click(hold());

    await waitFor(() => expect(replace).toHaveBeenCalled());
    expect(posted).toBe(1);
    expect(screen.queryByText("Booking is by invitation for now")).toBeNull();
  });
});
