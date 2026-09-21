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
