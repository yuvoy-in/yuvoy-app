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

/**
 * "Need help?" (yuvoy-app#38 items 4 and 9).
 *
 * The WhatsApp half is a URL and nothing else, so it is asserted as a URL: it
 * is built from a number that arrives from the API, and the two ways to get it
 * wrong are silent. A number with a `+` still in it opens WhatsApp on an empty
 * search, and an unencoded message truncates at the first `&`.
 */

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

describe("chat with us", () => {
  it("opens a thread with the message already written", async () => {
    renderWithQuery(
      <HelpSection
        support={support}
        whatsappMessage="Hi, I need help with booking YV-4K2M9P7Q."
      />,
    );

    const link = screen.getByRole("link", { name: "Chat on WhatsApp" });
    expect(link).toHaveAttribute(
      "href",
      "https://wa.me/919000000001?text=Hi%2C%20I%20need%20help%20with%20booking%20YV-4K2M9P7Q.",
    );
  });

  it("strips everything that is not a digit from the number", () => {
    /*
      `wa.me` wants bare digits. A `+`, a space or a dash left in produces a
      URL that opens WhatsApp on an empty search rather than on our thread, and
      nothing about that looks broken until somebody tries it.
    */
    renderWithQuery(
      <HelpSection
        support={{ whatsappE164: " +91 90000-00001 " }}
        whatsappMessage="Hi"
      />,
    );
    expect(
      screen.getByRole("link", { name: "Chat on WhatsApp" }),
    ).toHaveAttribute("href", "https://wa.me/919000000001?text=Hi");
  });

  it("shows the hours under it, when there are any", () => {
    renderWithQuery(<HelpSection support={support} whatsappMessage="Hi" />);
    expect(screen.getByText("9am to 7pm, every day")).toBeInTheDocument();
  });

  it("hides the button when there is no number", () => {
    /*
      The contract's own sentence: null "while there is no support number, and
      the button is hidden then". A Chat with us that opens nothing is worse
      than no chat at all, and this product has shipped an unconfigured number
      before.
    */
    for (const value of [null, undefined, "   "]) {
      cleanup();
      renderWithQuery(
        <HelpSection support={{ whatsappE164: value }} whatsappMessage="Hi" />,
      );
      expect(
        screen.queryByRole("link", { name: "Chat on WhatsApp" }),
        String(value),
      ).toBeNull();
      // The form is still there: there is always a way to reach somebody.
      expect(
        screen.getByRole("button", { name: "Message us" }),
      ).toBeInTheDocument();
    }
  });

  it("offers the form even with no support object at all", () => {
    renderWithQuery(<HelpSection support={undefined} whatsappMessage="Hi" />);
    expect(
      screen.getByRole("button", { name: "Message us" }),
    ).toBeInTheDocument();
  });
});

describe("send us a message", () => {
  const openSheet = async () => {
    const user = userEvent.setup();
    /* "Message us" on Account, "Message us about this trip" on a booking: the
       row names the context it is in. Matched either way so this helper does
       not have to know which case the caller set up. */
    await user.click(screen.getByRole("button", { name: /^Message us/ }));
    return user;
  };

  it("sends the message, the topic and the reference, and shows the receipt", async () => {
    let body: Record<string, unknown> = {};
    server.use(
      http.post(`${BASE}/support/requests`, async ({ request }) => {
        body = (await request.json()) as Record<string, unknown>;
        return HttpResponse.json(
          { reference: "SR-3F9A12C0", message: "Thanks, we have it." },
          { status: 201 },
        );
      }),
    );

    renderWithQuery(
      <HelpSection
        support={support}
        whatsappMessage="Hi"
        bookingReference="YV-4K2M9P7Q"
        token="tok_test"
      />,
    );
    const user = await openSheet();

    await user.click(screen.getByRole("button", { name: "Payment" }));
    await user.type(
      screen.getByLabelText("Your message"),
      "The operator has not confirmed my dive yet.",
    );
    await user.click(screen.getByRole("button", { name: "Send" }));

    expect(
      await screen.findByText(/Reference SR-3F9A12C0/),
    ).toBeInTheDocument();
    expect(body).toEqual({
      message: "The operator has not confirmed my dive yet.",
      topic: "payment",
      bookingReference: "YV-4K2M9P7Q",
    });
  });

  it("defaults the topic to other, and sends no reference when there is none", async () => {
    let body: Record<string, unknown> = {};
    server.use(
      http.post(`${BASE}/support/requests`, async ({ request }) => {
        body = (await request.json()) as Record<string, unknown>;
        return HttpResponse.json(
          { reference: "SR-1", message: "Thanks." },
          { status: 201 },
        );
      }),
    );

    __signInAppRouteMock();
    renderWithQuery(<HelpSection support={support} whatsappMessage="Hi" />);
    const user = await openSheet();
    await user.type(
      screen.getByLabelText("Your message"),
      "I cannot sign in with my number.",
    );
    await user.click(screen.getByRole("button", { name: "Send" }));

    await screen.findByText(/Reference SR-1/);
    expect(body).toEqual({
      message: "I cannot sign in with my number.",
      topic: "other",
    });
    expect(body).not.toHaveProperty("bookingReference");
  });

  it("refuses to send a message under ten characters, without asking the API", async () => {
    /*
      The contract's `minLength`. A form that accepts "help" and then has the
      server refuse it has spent a round trip on island signal to say something
      it already knew.
    */
    let posted = false;
    server.use(
      http.post(`${BASE}/support/requests`, () => {
        posted = true;
        return HttpResponse.json(
          { reference: "SR-1", message: "" },
          { status: 201 },
        );
      }),
    );

    renderWithQuery(<HelpSection support={support} whatsappMessage="Hi" />);
    const user = await openSheet();
    await user.type(screen.getByLabelText("Your message"), "help");
    await user.click(screen.getByRole("button", { name: "Send" }));

    expect(
      await screen.findByText(/at least 10 characters/),
    ).toBeInTheDocument();
    expect(posted).toBe(false);
  });

  it("says nothing about length until a send is attempted", async () => {
    // A field that scolds while it is being typed into is scolding somebody
    // who is halfway through a sentence.
    renderWithQuery(<HelpSection support={support} whatsappMessage="Hi" />);
    const user = await openSheet();
    await user.type(screen.getByLabelText("Your message"), "help");
    expect(screen.queryByRole("alert")).toBeNull();
  });

  it("puts a field complaint under its field", async () => {
    server.use(
      http.post(`${BASE}/support/requests`, () =>
        HttpResponse.json(
          {
            error: {
              code: "invalid_input",
              message: "That did not work.",
              details: { message: "That message is too short." },
            },
          },
          { status: 400 },
        ),
      ),
    );

    __signInAppRouteMock();
    renderWithQuery(<HelpSection support={support} whatsappMessage="Hi" />);
    const user = await openSheet();
    await user.type(
      screen.getByLabelText("Your message"),
      "Something long enough to pass the client check.",
    );
    await user.click(screen.getByRole("button", { name: "Send" }));

    expect(
      await screen.findByText("That message is too short."),
    ).toBeInTheDocument();
  });

  it("says how many are left after five in an hour", async () => {
    server.use(
      http.post(`${BASE}/support/requests`, () =>
        HttpResponse.json(
          { error: { code: "rate_limited", message: "raw" } },
          { status: 429 },
        ),
      ),
    );

    __signInAppRouteMock();
    renderWithQuery(<HelpSection support={support} whatsappMessage="Hi" />);
    const user = await openSheet();
    await user.type(
      screen.getByLabelText("Your message"),
      "Something long enough to pass the client check.",
    );
    await user.click(screen.getByRole("button", { name: "Send" }));

    expect(
      await screen.findByText("That is 5 messages this hour. Try again later."),
    ).toBeInTheDocument();
  });

  it("bears the status token when it has one", async () => {
    /*
      What lets somebody who booked without signing in ask for help at all.
      Asserted on the header, because the alternative path goes through this
      app's own server and would answer 401 in a test with no cookie.
    */
    let auth: string | null = null;
    server.use(
      http.post(`${BASE}/support/requests`, ({ request }) => {
        auth = request.headers.get("authorization");
        return HttpResponse.json(
          { reference: "SR-1", message: "Thanks." },
          { status: 201 },
        );
      }),
    );

    renderWithQuery(
      <HelpSection support={support} whatsappMessage="Hi" token="tok_abc" />,
    );
    const user = await openSheet();
    await user.type(
      screen.getByLabelText("Your message"),
      "Something long enough to pass.",
    );
    await user.click(screen.getByRole("button", { name: "Send" }));

    await waitFor(() => expect(auth).toBe("Bearer tok_abc"));
  });
});

describe("the row's touch targets", () => {
  it("gives every control the repo's minimum tap height", () => {
    /*
      THE DEFECT THIS PINS. The help row was cut to one line of inline text and
      its three controls shipped as bare text, about 20px tall on a phone and
      a dot apart. `tap-target` is the repo's own floor for inline controls
      (28px), so a thumb has something to land on and a neighbour to miss.
    */
    renderWithQuery(
      <HelpSection
        support={{ whatsappE164: "+919000000001" }}
        whatsappMessage="Hi"
        token="tok_1"
      />,
    );

    const controls = [
      screen.getByRole("link", { name: "Help centre" }),
      screen.getByRole("link", { name: "Chat on WhatsApp" }),
      screen.getByRole("button", { name: /^Message us/ }),
    ];
    for (const control of controls) {
      expect(control, control.textContent ?? "").toHaveClass("tap-target");
    }
  });
});

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
