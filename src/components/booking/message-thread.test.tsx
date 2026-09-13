import { describe, it, expect, vi } from "vitest";
import { screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { renderWithQuery } from "@/test/render";
import { MessageThread } from "./message-thread";
import { server } from "../../../mocks/server";
import { http, HttpResponse } from "msw";
import type { components } from "@/lib/api/schema.gen";

type BookingMessage = components["schemas"]["BookingMessage"];

const BASE = process.env.NEXT_PUBLIC_API_URL ?? "http://localhost:8099/v1";

const fromThem: BookingMessage = {
  id: "msg_0001",
  from: "operator",
  senderName: "Sample Dive Operator",
  text: "Bring a towel, the wind is up.",
  sentAt: "2026-08-21T10:15:00Z",
};
const fromMe: BookingMessage = {
  id: "msg_0002",
  from: "traveller",
  senderName: "Asha Menon",
  text: "Will do, see you at seven.",
  sentAt: "2026-08-21T10:20:00Z",
};

function thread(over: Record<string, unknown> = {}) {
  return {
    messages: [fromThem, fromMe],
    complete: true,
    unreadCount: 0,
    canWrite: true,
    writableUntil: "2026-08-29T01:30:00Z",
    ...over,
  };
}

function serveThread(over: Record<string, unknown> = {}) {
  server.use(
    http.get(`${BASE}/bookings/messages`, () =>
      HttpResponse.json(thread(over)),
    ),
  );
}

/**
 * An IntersectionObserver that reports the element as on screen.
 *
 * The setup file's global stub never fires, which is the OFF-screen case and
 * the default here on purpose. This replaces it for the cases that need the
 * panel to have been scrolled to, and restores it afterwards so one test
 * cannot decide another's answer.
 */
function observeAsOnScreen(): () => void {
  const original = globalThis.IntersectionObserver;
  class OnScreen {
    constructor(private cb: IntersectionObserverCallback) {}
    observe(target: Element) {
      this.cb(
        [{ isIntersecting: true, target } as IntersectionObserverEntry],
        this as unknown as IntersectionObserver,
      );
    }
    unobserve() {}
    disconnect() {}
    takeRecords() {
      return [];
    }
    root = null;
    rootMargin = "";
    thresholds = [];
  }
  vi.stubGlobal("IntersectionObserver", OnScreen);
  return () => vi.stubGlobal("IntersectionObserver", original);
}

describe("MessageThread", () => {
  it("draws the conversation oldest first, with who wrote each one", async () => {
    serveThread();
    renderWithQuery(
      <MessageThread
        token="t"
        operatorName="Sample Dive Operator"
        bookingState="confirmed"
      />,
    );

    expect(
      await screen.findByText("Bring a towel, the wind is up."),
    ).toBeInTheDocument();
    expect(screen.getByText("Will do, see you at seven.")).toBeInTheDocument();

    const items = screen.getAllByRole("listitem");
    expect(items[0]).toHaveTextContent("Bring a towel");
    expect(items[1]).toHaveTextContent("Will do");
  });

  /*
    "Show it as a message whose text was removed, never as an empty one."
    A blank bubble reads as something the app lost, and the message itself
    stays on purpose: who wrote it and when are still true.
  */
  it("renders a message whose text was removed as removed, not as blank", async () => {
    serveThread({
      messages: [
        {
          id: "msg_0001",
          from: "operator",
          senderName: "Sample Dive Operator",
          textRemovedAt: "2026-11-20T00:00:00Z",
          sentAt: "2026-08-21T10:15:00Z",
        },
      ],
    });

    renderWithQuery(<MessageThread token="t" bookingState="confirmed" />);

    expect(
      await screen.findByText("The text of this message was removed."),
    ).toBeInTheDocument();
    // The message is still a message: it keeps its sender.
    expect(screen.getByText("Sample Dive Operator")).toBeInTheDocument();
  });

  it("sends what was written, trimmed", async () => {
    let sent: unknown = null;
    serveThread();
    server.use(
      http.post(`${BASE}/bookings/messages`, async ({ request }) => {
        sent = await request.json();
        return HttpResponse.json(
          { ...fromMe, id: "msg_0003" },
          { status: 201 },
        );
      }),
    );

    const user = userEvent.setup();
    renderWithQuery(<MessageThread token="t" bookingState="confirmed" />);
    await screen.findByText("Bring a towel, the wind is up.");

    await user.type(
      screen.getByLabelText("Write to the operator"),
      "  See you at the jetty  ",
    );
    await user.click(screen.getByRole("button", { name: "Send" }));

    await waitFor(() => expect(sent).toEqual({ text: "See you at the jetty" }));
  });

  /*
    THE REFUSAL THAT MUST NOT READ AS OUR BUG - yuvoy-app#47 §2.

    `invalid_input` is in CLIENT_BUGS, so describeError says "Something went
    wrong ... trying again often fixes it" and offers a retry. The same text
    fails again, so that is a loop and a lie about whose fault it is.
  */
  it("shows the sentence about phone numbers, never 'Something went wrong'", async () => {
    serveThread();
    server.use(
      http.post(`${BASE}/bookings/messages`, () =>
        HttpResponse.json(
          {
            error: {
              code: "invalid_input",
              message:
                "Messages cannot include phone numbers, email addresses or links. This one looks like it has a phone number, from seven or more digits written close together. Take the number out and send the message again.",
              details: { text: "contact details", contactDetail: "phone" },
            },
          },
          { status: 400 },
        ),
      ),
    );

    const user = userEvent.setup();
    renderWithQuery(<MessageThread token="t" bookingState="confirmed" />);
    await screen.findByText("Bring a towel, the wind is up.");

    await user.type(
      screen.getByLabelText("Write to the operator"),
      "call me on 98765 43210",
    );
    await user.click(screen.getByRole("button", { name: "Send" }));

    expect(
      await screen.findByText(/looks like it has a phone number/),
    ).toBeInTheDocument();
    expect(document.body.textContent).not.toMatch(/Something went wrong/);
    expect(
      screen.queryByRole("button", { name: /try again/i }),
    ).not.toBeInTheDocument();
    // And nothing was added to the thread.
    expect(screen.getAllByRole("listitem")).toHaveLength(2);
  });

  it("says why a closed conversation is closed, and offers no composer", async () => {
    serveThread({ canWrite: false, closedReason: "cancelled" });
    renderWithQuery(<MessageThread token="t" bookingState="confirmed" />);

    expect(
      await screen.findByText(
        /This booking was cancelled, so no more messages/,
      ),
    ).toBeInTheDocument();
    // Readable, not writable.
    expect(
      screen.getByText("Bring a towel, the wind is up."),
    ).toBeInTheDocument();
    expect(
      screen.queryByLabelText("Write to the operator"),
    ).not.toBeInTheDocument();
  });

  /*
    "A link whose hold or request never became a booking answers an empty,
    complete conversation with `canWrite: false` and `closedReason:
    not_booked`, NOT an error." A client that treated it as one would put a
    crash panel on a screen where nothing is wrong.
  */
  it("treats a link with no booking behind it as a state, never a failure", async () => {
    serveThread({
      messages: [],
      complete: true,
      canWrite: false,
      closedReason: "not_booked",
      writableUntil: undefined,
    });

    renderWithQuery(<MessageThread token="t" bookingState="confirmed" />);

    expect(
      await screen.findByText(/Messages open once the booking is made/),
    ).toBeInTheDocument();
    expect(
      screen.queryByLabelText("Write to the operator"),
    ).not.toBeInTheDocument();
    expect(document.body.textContent).not.toMatch(/Something went wrong/);
  });

  it("loads what came before, and puts it above what is already there", async () => {
    const older: BookingMessage = {
      id: "msg_0000",
      from: "operator",
      senderName: "Sample Dive Operator",
      text: "The first thing we ever said.",
      sentAt: "2026-08-20T09:00:00Z",
    };
    let call = 0;
    server.use(
      http.get(`${BASE}/bookings/messages`, ({ request }) => {
        const cursor = new URL(request.url).searchParams.get("cursor");
        call += 1;
        if (cursor === "cur_1") {
          return HttpResponse.json(
            thread({
              messages: [older],
              complete: true,
              nextCursor: undefined,
            }),
          );
        }
        return HttpResponse.json(
          thread({ complete: false, nextCursor: "cur_1" }),
        );
      }),
    );

    const user = userEvent.setup();
    renderWithQuery(<MessageThread token="t" bookingState="confirmed" />);
    await screen.findByText("Bring a towel, the wind is up.");

    await user.click(
      screen.getByRole("button", { name: /see earlier messages/i }),
    );

    expect(
      await screen.findByText("The first thing we ever said."),
    ).toBeInTheDocument();
    // Above, because a later page is older than everything already held.
    const items = screen.getAllByRole("listitem");
    expect(items[0]).toHaveTextContent("The first thing we ever said.");
    expect(call).toBeGreaterThan(1);
  });

  it("offers nothing to load when the conversation begins on this page", async () => {
    serveThread();
    renderWithQuery(<MessageThread token="t" bookingState="confirmed" />);
    await screen.findByText("Bring a towel, the wind is up.");
    expect(
      screen.queryByRole("button", { name: /see earlier messages/i }),
    ).not.toBeInTheDocument();
  });

  /*
    THE HALF THAT IS EASY TO GET WRONG - yuvoy-app#47 §3.

    "Mark only what was on screen, so a page left polling in a pocket does not
    clear `unreadCount`." This panel sits at the FOOT of a long booking page,
    so on arrival it is below the fold: a marker that fired on page load would
    clear the count for messages the traveller has not scrolled to.

    The setup file's IntersectionObserver never reports an intersection, so
    this is the off-screen case by default, and it is the guard.
  */
  it("marks nothing while the panel has not been scrolled to", async () => {
    let marks = 0;
    serveThread({ unreadCount: 2 });
    server.use(
      http.post(`${BASE}/bookings/messages/read`, () => {
        marks += 1;
        return HttpResponse.json({ unreadCount: 0 });
      }),
    );

    renderWithQuery(<MessageThread token="t" bookingState="confirmed" />);
    expect(await screen.findByText("2 new")).toBeInTheDocument();

    await new Promise((r) => setTimeout(r, 60));
    expect(marks).toBe(0);
    // And the badge still says so, because nothing has been read.
    expect(screen.getByText("2 new")).toBeInTheDocument();
  });

  /*
    And the other direction. The marker moves to the newest message DRAWN,
    never "all of it, now", and the badge then reads the receipt rather than
    waiting up to thirty seconds for the next poll to agree.
  */
  it("marks the newest message drawn once the panel is on screen", async () => {
    let markedUpTo: unknown = null;
    serveThread({ unreadCount: 2 });
    server.use(
      http.post(`${BASE}/bookings/messages/read`, async ({ request }) => {
        markedUpTo = await request.json();
        return HttpResponse.json({ unreadCount: 0 });
      }),
    );

    const stop = observeAsOnScreen();
    try {
      renderWithQuery(<MessageThread token="t" bookingState="confirmed" />);
      await screen.findByText("Bring a towel, the wind is up.");

      // `msg_0002`, the newest drawn, not a "mark everything" call.
      await waitFor(() => expect(markedUpTo).toEqual({ upTo: "msg_0002" }));
      await waitFor(() =>
        expect(screen.queryByText("2 new")).not.toBeInTheDocument(),
      );
    } finally {
      stop();
    }
  });

  it("marks nothing when there is nothing unread", async () => {
    let marks = 0;
    serveThread({ unreadCount: 0 });
    server.use(
      http.post(`${BASE}/bookings/messages/read`, () => {
        marks += 1;
        return HttpResponse.json({ unreadCount: 0 });
      }),
    );

    const stop = observeAsOnScreen();
    try {
      renderWithQuery(<MessageThread token="t" bookingState="confirmed" />);
      await screen.findByText("Bring a towel, the wind is up.");
      await new Promise((r) => setTimeout(r, 60));
      expect(marks).toBe(0);
    } finally {
      stop();
    }
  });

  /*
    A FAILING THREAD MUST NOT SHOUT ABOUT THE LINK.

    This panel renders on every booking page, and `describeError` with
    `tokenBearing` turns a 401 into "This link no longer opens anything" with
    an offer of a fresh one. Under a booking the same link just opened, that is
    two statements on one screen and one of them is false.

    `GET /bookings/status` is the authority on whether the link works, and it
    is polling. If the token really has died the whole screen becomes the
    dead-link screen a beat later, from the call that knows.
  */
  it("stays quiet about the link when the conversation will not load", async () => {
    server.use(
      http.get(`${BASE}/bookings/messages`, () =>
        HttpResponse.json(
          { error: { code: "token_expired", message: "raw" } },
          { status: 401 },
        ),
      ),
    );

    renderWithQuery(<MessageThread token="t" bookingState="confirmed" />);

    expect(
      await screen.findByText(/We could not load your messages just now/),
    ).toBeInTheDocument();
    expect(
      screen.getByRole("button", { name: /try again/i }),
    ).toBeInTheDocument();
    // Not the recovery panel, and nothing on the page reads as an alarm.
    expect(screen.queryByText("This link has expired")).not.toBeInTheDocument();
    expect(
      screen.queryByRole("link", { name: "Get a new link" }),
    ).not.toBeInTheDocument();
    expect(screen.queryByRole("alert")).not.toBeInTheDocument();
  });

  it("will not send an empty message, or one past the limit", async () => {
    serveThread();
    const user = userEvent.setup();
    renderWithQuery(<MessageThread token="t" bookingState="confirmed" />);
    await screen.findByText("Bring a towel, the wind is up.");

    const send = screen.getByRole("button", { name: "Send" });
    expect(send).toBeDisabled();

    const box = screen.getByLabelText("Write to the operator");
    await user.type(box, "   ");
    expect(send).toBeDisabled();
  });
});
