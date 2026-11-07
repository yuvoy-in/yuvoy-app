import { describe, it, expect, afterEach } from "vitest";
import { screen, cleanup, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { http, HttpResponse } from "msw";
import { renderWithQuery } from "@/test/render";
import { HelpSection } from "./help-section";
import { server } from "../../../mocks/server";
import {
  __signInAppRouteMock,
  __resetAppRouteMocks,
} from "../../../mocks/app-route-handlers";

const BASE = process.env.NEXT_PUBLIC_API_URL ?? "http://localhost:8099/v1";

const support = {
  whatsappE164: "+919000000001",
  hours: "9am to 7pm, every day",
};

afterEach(() => {
  cleanup();
  __resetAppRouteMocks();
});

/*
  A test with no status token goes through this app's own `/api/v1` route,
  which refuses without a session before it forwards anything. That is the real
  behaviour rather than a mock quirk: Account reaches this form with a session
  and no booking reference, and the booking page reaches it with a token and no
  session. A test of the sessioned path has to be signed in.
*/

/**
 * Where a sent request is now (yuvoy-api#196).
 *
 * The receipt used to end "There is nothing to check back on here", because
 * there was not. There is now, and it is asked with the credential that sent
 * it: the booking's own status token on a booking page, the session anywhere
 * else. The reply itself still comes on WhatsApp, and nothing here may say
 * otherwise.
 */
describe("checking a request after it is sent", () => {
  /** Sends one message through the row's sheet and waits for the receipt. */
  const sendOne = async (user: ReturnType<typeof userEvent.setup>) => {
    await user.click(screen.getByRole("button", { name: /^Message us/ }));
    await user.type(
      screen.getByLabelText("Your message"),
      "Something long enough to pass.",
    );
    await user.click(screen.getByRole("button", { name: "Send" }));
    await screen.findByText(/Reference SR-/);
  };

  const sent = () =>
    server.use(
      http.post(`${BASE}/support/requests`, () =>
        HttpResponse.json(
          { reference: "SR-1", message: "Thanks, we have it." },
          { status: 201 },
        ),
      ),
    );

  it("asks with the booking's own token on a booking page, and says where it is", async () => {
    sent();
    let auth: string | null = null;
    let asked = 0;
    server.use(
      http.get(`${BASE}/support/requests/:reference`, ({ request, params }) => {
        asked += 1;
        auth = request.headers.get("authorization");
        return HttpResponse.json({
          reference: String(params.reference),
          status: "in_progress",
          topic: "other",
          createdAt: "2026-09-21T04:00:00Z",
          updatedAt: "2026-09-22T06:00:00Z",
          message: "Something long enough to pass.",
        });
      }),
    );

    const user = userEvent.setup();
    renderWithQuery(
      <HelpSection support={support} whatsappMessage="Hi" token="tok_abc" />,
    );
    await sendOne(user);

    // Nothing is asked until the traveller asks: the answer would be
    // "received", which the send already said.
    expect(asked).toBe(0);
    await user.click(screen.getByRole("button", { name: "Check its status" }));

    expect(await screen.findByText("Someone is on it")).toBeInTheDocument();
    expect(screen.getByText("Last change 22 Sep")).toBeInTheDocument();
    expect(auth).toBe("Bearer tok_abc");
    // And the reply still comes where it always did.
    expect(
      screen.getByText("A person replies on WhatsApp, to the number you used."),
    ).toBeInTheDocument();
  });

  it("asks through this app's own server on the session when there is no token", async () => {
    let auth: string | null = null;
    server.use(
      http.get(`${BASE}/support/requests/:reference`, ({ request, params }) => {
        auth = request.headers.get("authorization");
        return HttpResponse.json({
          reference: String(params.reference),
          status: "resolved",
          topic: "other",
          createdAt: "2026-09-21T04:00:00Z",
          updatedAt: "2026-09-21T09:00:00Z",
          message: "Something long enough to pass.",
        });
      }),
    );

    __signInAppRouteMock("sess_test");
    const user = userEvent.setup();
    renderWithQuery(<HelpSection support={support} whatsappMessage="Hi" />);
    await sendOne(user);
    await user.click(screen.getByRole("button", { name: "Check its status" }));

    expect(await screen.findByText("Resolved")).toBeInTheDocument();
    // The proxy attached the session; no browser code ever held it.
    expect(auth).toBe("Bearer sess_test");
  });

  it("keeps the reference and the WhatsApp line when this API cannot look it up", async () => {
    /*
      An API that predates the read answers 404 or 405. What the traveller had
      before the read existed is what they keep: the reference, and where the
      reply comes from. No retry, because the same question gets the same
      answer.
    */
    sent();
    server.use(
      http.get(`${BASE}/support/requests/:reference`, () =>
        HttpResponse.json(
          { error: { code: "method_not_allowed", message: "raw" } },
          { status: 405 },
        ),
      ),
    );

    const user = userEvent.setup();
    renderWithQuery(
      <HelpSection support={support} whatsappMessage="Hi" token="tok_abc" />,
    );
    await sendOne(user);
    await user.click(screen.getByRole("button", { name: "Check its status" }));

    expect(
      await screen.findByText(
        "We cannot look this one up here. Keep the reference: the reply comes on WhatsApp.",
      ),
    ).toBeInTheDocument();
    expect(screen.getByText("Reference SR-1")).toBeInTheDocument();
    expect(
      screen.queryByRole("button", { name: /Check/ }),
    ).not.toBeInTheDocument();
  });

  it("says a dead booking link cannot open it, and offers no sign-in it cannot use", async () => {
    sent();
    server.use(
      http.get(`${BASE}/support/requests/:reference`, () =>
        HttpResponse.json(
          { error: { code: "unauthorized", message: "raw" } },
          { status: 401 },
        ),
      ),
    );

    const user = userEvent.setup();
    renderWithQuery(
      <HelpSection support={support} whatsappMessage="Hi" token="tok_abc" />,
    );
    await sendOne(user);
    await user.click(screen.getByRole("button", { name: "Check its status" }));

    expect(
      await screen.findByText("This booking link cannot open it any more."),
    ).toBeInTheDocument();
    expect(screen.queryByRole("link", { name: "Sign in" })).toBeNull();
  });

  it("offers another go after too many checks", async () => {
    sent();
    server.use(
      http.get(`${BASE}/support/requests/:reference`, () =>
        HttpResponse.json(
          { error: { code: "rate_limited", message: "raw" } },
          { status: 429 },
        ),
      ),
    );

    const user = userEvent.setup();
    renderWithQuery(
      <HelpSection support={support} whatsappMessage="Hi" token="tok_abc" />,
    );
    await sendOne(user);
    await user.click(screen.getByRole("button", { name: "Check its status" }));

    expect(
      await screen.findByText(/a lot of checks in a short time/),
    ).toBeInTheDocument();
    expect(
      screen.getByRole("button", { name: "Check its status" }),
    ).toBeInTheDocument();
  });

  it("keeps the reference on the page after the sheet is closed", async () => {
    // The receipt closes with the sheet. A traveller who closed it too quickly
    // still has the reference, and a way to check it, on the row.
    sent();
    const user = userEvent.setup();
    renderWithQuery(
      <HelpSection support={support} whatsappMessage="Hi" token="tok_abc" />,
    );
    await sendOne(user);
    await user.click(screen.getByRole("button", { name: "Close" }));

    await waitFor(() =>
      expect(screen.queryByRole("dialog")).not.toBeInTheDocument(),
    );
    expect(screen.getByText("Reference SR-1")).toBeInTheDocument();
    expect(
      screen.getByRole("button", { name: "Check its status" }),
    ).toBeInTheDocument();
    expect(
      screen.getByText(
        "Your message is with us. A person replies on WhatsApp.",
      ),
    ).toBeInTheDocument();
  });
});
