import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { screen, cleanup, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { http, HttpResponse } from "msw";
import { renderWithQuery } from "@/test/render";
import { ContactFields, maskPhone } from "./contact-fields";
import { server } from "../../../mocks/server";
import {
  __resetAppRouteMocks,
  __signInAppRouteMock,
} from "../../../mocks/app-route-handlers";

const BASE = process.env.NEXT_PUBLIC_API_URL ?? "http://localhost:8099/v1";

vi.mock("next/navigation", () => ({
  useRouter: () => ({ push: vi.fn(), replace: vi.fn() }),
  usePathname: () => "/e/try-dive-nemo-reef",
  useSearchParams: () => new URLSearchParams(),
}));

beforeEach(() => __resetAppRouteMocks());
afterEach(cleanup);

/** `GET /me`, with only the fields this block reads spelled out. */
function profile(over: Record<string, unknown> = {}) {
  server.use(
    http.get(`${BASE}/me`, () =>
      HttpResponse.json({
        phone: "+919000003210",
        name: "Asha Menon",
        email: "asha@example.com",
        interests: [],
        onboardingRequired: false,
        memberSince: "2026-07-02T04:30:00Z",
        trips: { total: 1, upcoming: 1, completed: 0 },
        reviews: { count: 0 },
        support: { whatsappE164: null, hours: "9am to 7pm" },
        ...over,
      }),
    ),
  );
}

const noop = () => {};
const draw = (over: Partial<Record<string, unknown>> = {}) =>
  renderWithQuery(
    <ContactFields
      name=""
      onNameChange={noop}
      phone="+91"
      onPhoneChange={noop}
      email=""
      onEmailChange={noop}
      {...over}
    />,
  );

/**
 * Who is booking, asked once or not at all — yuvoy-app#32.
 *
 * The owner raised it on 13 September: a signed-in traveller was still being
 * asked for their name and number, on a phone whose number we had already
 * proved by sending it a code. One block, used by the Ask pop-up and by
 * checkout, so the fix cannot land on one and drift on the other.
 */
describe("a traveller who is not signed in", () => {
  it("is asked for a name and a number, as before", async () => {
    expect(await screen.findByLabelText("Your name")).toBeInTheDocument();
    expect(screen.getByLabelText("WhatsApp number")).toBeInTheDocument();
    expect(screen.getByLabelText("Email (optional)")).toBeInTheDocument();
  });

  beforeEach(() => draw());
});

describe("a traveller who is signed in, with a name on record", () => {
  beforeEach(() => {
    __signInAppRouteMock();
    profile();
    draw();
  });

  it("is not asked for a name or a number", async () => {
    expect(await screen.findByText(/Booking as/)).toBeInTheDocument();
    expect(screen.queryByLabelText("Your name")).toBeNull();
    expect(screen.queryByLabelText("WhatsApp number")).toBeNull();
  });

  it("is shown who they are, with the number masked", async () => {
    const line = await screen.findByText(/Booking as/);
    expect(line).toHaveTextContent("Asha Menon");
    /*
      Enough to recognise, not enough to read out. The last four are the part
      that tells somebody with two numbers which one they signed in with.
    */
    expect(line).toHaveTextContent("3210");
    expect(line).not.toHaveTextContent("9000003210");
  });

  it("offers a way to say it is not them", async () => {
    expect(
      await screen.findByRole("button", { name: "Not you?" }),
    ).toBeInTheDocument();
  });

  it("brings both fields back when they say it is not them", async () => {
    const user = userEvent.setup();
    await user.click(await screen.findByRole("button", { name: "Not you?" }));

    await waitFor(() =>
      expect(screen.getByLabelText("Your name")).toBeInTheDocument(),
    );
    expect(screen.getByLabelText("WhatsApp number")).toBeInTheDocument();
    expect(screen.queryByText(/Booking as/)).toBeNull();
  });

  it("still asks for an email, and never hides it", async () => {
    // Optional, and the profile's is prefilled by the parent, not hidden.
    expect(
      await screen.findByLabelText("Email (optional)"),
    ).toBeInTheDocument();
  });
});

describe("a traveller who is signed in with NO name on record", () => {
  /*
    A number that signed in to look at their trips and skipped the
    first-sign-in screen. Common, not an edge: `onboardingRequired` is true and
    `name` is null. Asking for a number we already have would still be wrong,
    and putting somebody on a boat with no name to call out is worse.
  */
  beforeEach(() => {
    __signInAppRouteMock();
    profile({ name: null, onboardingRequired: true, email: null });
    draw();
  });

  it("is asked for a name and NOT for a number", async () => {
    expect(await screen.findByLabelText("Your name")).toBeInTheDocument();
    expect(screen.queryByLabelText("WhatsApp number")).toBeNull();
    expect(screen.queryByText(/Booking as/)).toBeNull();
  });

  it("shows a refusal about the name on the field it concerns", async () => {
    cleanup();
    __signInAppRouteMock();
    profile({ name: null });
    draw({ nameError: "We do not have a name for this number yet." });

    expect(
      await screen.findByText("We do not have a name for this number yet."),
    ).toBeInTheDocument();
  });
});

describe("a profile read that fails", () => {
  it("falls back to the guest fields rather than blocking the booking", async () => {
    /*
      Not an error state. The traveller came here to book, the guest path works
      perfectly, and turning a convenience into an outage over a profile lookup
      would cost a booking to save a form field.
    */
    __signInAppRouteMock();
    server.use(
      http.get(`${BASE}/me`, () =>
        HttpResponse.json(
          { error: { code: "unavailable", message: "not wired" } },
          { status: 503 },
        ),
      ),
    );
    draw();

    expect(await screen.findByLabelText("Your name")).toBeInTheDocument();
    expect(screen.getByLabelText("WhatsApp number")).toBeInTheDocument();
  });
});

describe("masking a number", () => {
  it("keeps the dial code and the last four", () => {
    expect(maskPhone("+919000003210")).toBe("+91 ••••••3210");
  });

  it("does not over-hide a short number", () => {
    expect(maskPhone("+911234")).toBe("+91 1234");
  });

  it("reads +91 before +1, so an Indian number is not read as American", () => {
    // `+1` is a prefix of `+91`. Shortest-match-first is a wrong country.
    expect(maskPhone("+919000003210")).toContain("+91 ");
    expect(maskPhone("+12025550147")).toBe("+1 ••••••0147");
  });
});
