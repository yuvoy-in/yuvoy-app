import { describe, it, expect, vi } from "vitest";
import { fireEvent, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { renderWithQuery } from "@/test/render";
import { MessageThread } from "./message-thread";
import { server } from "../../../mocks/server";
import { delay, http, HttpResponse } from "msw";
import type { components } from "@/lib/api/schema.gen";
import { qk } from "@/lib/query/policy";

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

  it("announces arrivals in a log that holds a real list", async () => {
    /*
      `role="log"` sat on the `ol` and replaced its list role, so its items
      were listitems with no list (cited 3 Oct 2026). The log is a wrapper now.
    */
    serveThread();
    renderWithQuery(
      <MessageThread
        token="t"
        operatorName="Sample Dive Operator"
        bookingState="confirmed"
      />,
    );
    await screen.findByText("Bring a towel, the wind is up.");
    const log = screen.getByRole("log", { name: "Messages" });
    const list = within(log).getByRole("list");
    expect(within(list).getAllByRole("listitem")).toHaveLength(2);
  });

  it("keeps the conversation and the draft while a new booking state is read", async () => {
    /*
      The booking's state is part of the key, so a booking confirmed under
      somebody's thumb was a new, empty query: the thread and the composer
      became a skeleton for a round trip, and the keyboard went with them
      (6 Oct 2026).
    */
    let reads = 0;
    server.use(
      http.get(`${BASE}/bookings/messages`, async () => {
        reads += 1;
        if (reads > 1) await delay(300);
        return HttpResponse.json(thread());
      }),
    );
    const user = userEvent.setup();
    const { rerender } = renderWithQuery(
      <MessageThread token="t" bookingState="held" />,
    );
    const box = await screen.findByLabelText("Write to the operator");
    await user.type(box, "On my way");

    rerender(<MessageThread token="t" bookingState="confirmed" />);

    await waitFor(() => expect(reads).toBe(2));
    expect(screen.getByLabelText("Write to the operator")).toHaveValue(
      "On my way",
    );
    expect(
      screen.getByText("Bring a towel, the wind is up."),
    ).toBeInTheDocument();
  });

  it("draws the operator's side on paper, apart from the panel it sits in", async () => {
    serveThread();
    renderWithQuery(
      <MessageThread
        token="t"
        operatorName="Sample Dive Operator"
        bookingState="confirmed"
      />,
    );
    const theirs = (
      await screen.findByText("Bring a towel, the wind is up.")
    ).closest("li")!.firstElementChild!;
    expect(theirs.className).toMatch(/\bbg-paper\b/);
    expect(theirs.className).not.toMatch(/\bbg-paper-deep\b/);
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

  it("sends once, however quickly the form is sent twice", async () => {
    let posts = 0;
    serveThread();
    server.use(
      http.post(`${BASE}/bookings/messages`, async () => {
        posts += 1;
        await delay(50);
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
      "See you at the jetty",
    );

    // Two Enters, or a tap and an Enter, before the form has drawn "Sending".
    const form = screen.getByRole("button", { name: "Send" }).closest("form")!;
    fireEvent.submit(form);
    fireEvent.submit(form);

    await waitFor(() =>
      expect(screen.getByLabelText("Write to the operator")).toHaveValue(""),
    );
    expect(posts).toBe(1);
  });

  /*
    A send whose answer was lost may have landed (yuvoy-api#282 item 4). The
    same key on the resend is what lets the API answer with the message it
    already wrote instead of posting it twice.
  */
  it("resends a message whose answer was lost under the same key, and the next message under a new one", async () => {
    const keys: (string | null)[] = [];
    serveThread();
    server.use(
      http.post(`${BASE}/bookings/messages`, ({ request }) => {
        keys.push(request.headers.get("idempotency-key"));
        // The first answer never arrives; every later one does.
        if (keys.length === 1) return HttpResponse.error();
        return HttpResponse.json(
          { ...fromMe, id: `msg_000${keys.length + 2}` },
          { status: 201 },
        );
      }),
    );

    const user = userEvent.setup();
    renderWithQuery(<MessageThread token="t" bookingState="confirmed" />);
    await screen.findByText("Bring a towel, the wind is up.");
    const box = screen.getByLabelText("Write to the operator");

    await user.type(box, "See you at the jetty");
    await user.click(screen.getByRole("button", { name: "Send" }));
    await waitFor(() => expect(keys).toHaveLength(1));
    // Not sent, as far as the screen knows: the words stay to send again.
    await waitFor(() =>
      expect(screen.getByRole("button", { name: "Send" })).toBeEnabled(),
    );
    expect(box).toHaveValue("See you at the jetty");

    await user.click(screen.getByRole("button", { name: "Send" }));
    await waitFor(() => expect(box).toHaveValue(""));

    await user.type(box, "One more thing");
    await user.click(screen.getByRole("button", { name: "Send" }));
    await waitFor(() => expect(keys).toHaveLength(3));

    expect(keys[0]).toMatch(/^msg_[A-Za-z0-9_.:-]{12,124}$/);
    expect(keys[1]).toBe(keys[0]);
    expect(keys[2]).toMatch(/^msg_[A-Za-z0-9_.:-]{12,124}$/);
    expect(keys[2]).not.toBe(keys[0]);
  });

  it("sends changed words under a new key, even after a lost answer", async () => {
    const keys: (string | null)[] = [];
    serveThread();
    server.use(
      http.post(`${BASE}/bookings/messages`, ({ request }) => {
        keys.push(request.headers.get("idempotency-key"));
        return HttpResponse.error();
      }),
    );

    const user = userEvent.setup();
    renderWithQuery(<MessageThread token="t" bookingState="confirmed" />);
    await screen.findByText("Bring a towel, the wind is up.");
    const box = screen.getByLabelText("Write to the operator");

    await user.type(box, "See you at the jetty");
    await user.click(screen.getByRole("button", { name: "Send" }));
    await waitFor(() => expect(keys).toHaveLength(1));
    await waitFor(() =>
      expect(screen.getByRole("button", { name: "Send" })).toBeEnabled(),
    );

    // The same key with other words is refused, so other words get a new one.
    await user.type(box, " at seven");
    await user.click(screen.getByRole("button", { name: "Send" }));
    await waitFor(() => expect(keys).toHaveLength(2));
    expect(keys[1]).not.toBe(keys[0]);
  });

  it("says a message still on its way is on its way, and the next tap sends it once", async () => {
    const keys: (string | null)[] = [];
    serveThread();
    server.use(
      http.post(`${BASE}/bookings/messages`, ({ request }) => {
        keys.push(request.headers.get("idempotency-key"));
        if (keys.length === 1) {
          return HttpResponse.json(
            {
              error: {
                code: "idempotency_in_progress",
                message: "an identical request is still being processed",
              },
            },
            { status: 409, headers: { "Retry-After": "2" } },
          );
        }
        return HttpResponse.json(
          { ...fromMe, id: "msg_0003" },
          { status: 201, headers: { "Idempotent-Replay": "true" } },
        );
      }),
    );

    const user = userEvent.setup();
    renderWithQuery(<MessageThread token="t" bookingState="confirmed" />);
    await screen.findByText("Bring a towel, the wind is up.");
    const box = screen.getByLabelText("Write to the operator");

    await user.type(box, "See you at the jetty");
    await user.click(screen.getByRole("button", { name: "Send" }));

    expect(
      await screen.findByText(
        "This message is still on its way. Give it a moment, then tap Send again. It will only arrive once.",
      ),
    ).toBeInTheDocument();
    // Checkout's reading of the code is about a booking, not a message.
    expect(document.body.textContent).not.toMatch(/same booking/);
    expect(document.body.textContent).not.toMatch(/Something went wrong/);

    await user.click(screen.getByRole("button", { name: "Send" }));
    await waitFor(() => expect(box).toHaveValue(""));
    expect(keys[1]).toBe(keys[0]);
  });

  /*
    The mock answers as the API does, or a screen goes green against rules
    the API does not keep.
  */
  it("keeps the API's key rules in the mock: replayed, refused for other words, refused malformed", async () => {
    const send = (text: string, key?: string) =>
      fetch(`${BASE}/bookings/messages`, {
        method: "POST",
        headers: {
          Authorization: "Bearer tok_other_phone",
          "Content-Type": "application/json",
          ...(key ? { "Idempotency-Key": key } : {}),
        },
        body: JSON.stringify({ text }),
      });
    const key = "msg_0123456789abcdef";

    const first = await send("See you at the jetty", key);
    expect(first.status).toBe(201);
    const written = (await first.json()) as BookingMessage;

    const again = await send("See you at the jetty", key);
    expect(again.status).toBe(201);
    expect(again.headers.get("Idempotent-Replay")).toBe("true");
    expect(await again.json()).toEqual(written);

    const other = await send("See you at seven", key);
    expect(other.status).toBe(409);
    expect(
      ((await other.json()) as { error: { code: string } }).error.code,
    ).toBe("idempotency_key_reuse");

    const short = await send("See you at the jetty", "msg_short");
    expect(short.status).toBe(400);
    expect(
      ((await short.json()) as { error: { code: string } }).error.code,
    ).toBe("idempotency_key_malformed");

    // A refused send keeps nothing, so its key still writes the message.
    const refusedKey = "msg_fedcba9876543210";
    const refused = await send("call me on 98765 43210", refusedKey);
    expect(refused.status).toBe(400);
    expect((await send("See you there", refusedKey)).status).toBe(201);
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

  it("offers nothing more once the start of the conversation is drawn", async () => {
    /*
      The last page answers `complete` with no cursor, and that used to fall
      back to the first page's cursor: the button came back and asked for the
      page already on screen (production readiness, 6 Oct 2026).
    */
    server.use(
      http.get(`${BASE}/bookings/messages`, ({ request }) =>
        new URL(request.url).searchParams.get("cursor") === "cur_1"
          ? HttpResponse.json(
              thread({
                messages: [{ ...fromThem, id: "msg_0000", text: "Hello." }],
                complete: true,
                nextCursor: undefined,
              }),
            )
          : HttpResponse.json(thread({ complete: false, nextCursor: "cur_1" })),
      ),
    );

    const user = userEvent.setup();
    renderWithQuery(<MessageThread token="t" bookingState="confirmed" />);
    await screen.findByText("Bring a towel, the wind is up.");
    await user.click(
      screen.getByRole("button", { name: /see earlier messages/i }),
    );

    expect(await screen.findByText("Hello.")).toBeInTheDocument();
    expect(
      screen.queryByRole("button", { name: /see earlier messages/i }),
    ).not.toBeInTheDocument();
  });

  it("keeps every message drawn when a new one moves the first page on", async () => {
    /*
      The first page is the newest few, so a new message moves it on by one
      and the one it lets go of is in no earlier page. With earlier pages
      loaded, every new message took one older one off the screen
      (production readiness, 6 Oct 2026).
    */
    const start: BookingMessage = {
      ...fromThem,
      id: "msg_0000",
      text: "The first thing we ever said.",
      sentAt: "2026-08-20T09:00:00Z",
    };
    const reply: BookingMessage = {
      ...fromThem,
      id: "msg_0003",
      text: "Great, see you there.",
      sentAt: "2026-08-21T10:25:00Z",
    };
    let moved = false;
    server.use(
      http.get(`${BASE}/bookings/messages`, ({ request }) => {
        if (new URL(request.url).searchParams.get("cursor") === "cur_1") {
          return HttpResponse.json(
            thread({
              messages: [start],
              complete: true,
              nextCursor: undefined,
            }),
          );
        }
        return HttpResponse.json(
          thread({
            messages: moved ? [fromMe, reply] : [fromThem, fromMe],
            complete: false,
            nextCursor: moved ? "cur_2" : "cur_1",
          }),
        );
      }),
    );

    const user = userEvent.setup();
    const { client } = renderWithQuery(
      <MessageThread token="t" bookingState="confirmed" />,
    );
    await screen.findByText("Bring a towel, the wind is up.");
    await user.click(
      screen.getByRole("button", { name: /see earlier messages/i }),
    );
    await screen.findByText("The first thing we ever said.");

    // The business writes, and the next poll's first page has moved on.
    moved = true;
    await client.refetchQueries({ queryKey: ["getBookingMessages", "t"] });

    expect(
      await screen.findByText("Great, see you there."),
    ).toBeInTheDocument();
    expect(
      screen.getAllByRole("listitem").map((item) => item.textContent),
    ).toEqual([
      expect.stringContaining("The first thing we ever said."),
      expect.stringContaining("Bring a towel, the wind is up."),
      expect.stringContaining("Will do, see you at seven."),
      expect.stringContaining("Great, see you there."),
    ]);
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
    THE TRIPS LIST COUNTS FROM THE SAME MARKER (yuvoy-api#207).

    Each `/me/bookings` row carries `unreadCount`, and so does the dot on the
    Trips destination. A mark that left the cached list alone would send the
    traveller back to Trips to read "1 new message" about the reply they had
    just read.
  */
  it("tells the trips list to re-read once the marker has moved", async () => {
    serveThread({ unreadCount: 2 });
    server.use(
      http.post(`${BASE}/bookings/messages/read`, () =>
        HttpResponse.json({ unreadCount: 0 }),
      ),
    );

    const stop = observeAsOnScreen();
    try {
      const { client } = renderWithQuery(
        <MessageThread token="t" bookingState="confirmed" />,
      );
      // What Trips opened on, and a second tab, both cached from earlier.
      // Kept, because nothing observes them here and the test client
      // collects an unobserved entry at once.
      client.setQueryDefaults(["listMyBookings"], { gcTime: Infinity });
      const upcoming = qk.myBookings("upcoming");
      const past = qk.myBookings("past");
      for (const key of [upcoming, past]) {
        client.setQueryData(key, {
          pages: [{ bookings: [], nextCursor: null }],
          pageParams: [undefined],
        });
      }
      expect(client.getQueryState(upcoming)?.isInvalidated).toBe(false);

      await screen.findByText("Bring a towel, the wind is up.");
      await waitFor(() =>
        expect(client.getQueryState(upcoming)?.isInvalidated).toBe(true),
      );
      expect(client.getQueryState(past)?.isInvalidated).toBe(true);
    } finally {
      stop();
    }
  });

  it("leaves the trips list alone when the mark did not land", async () => {
    // Nothing moved on the server, so nothing the list says has changed.
    let marks = 0;
    serveThread({ unreadCount: 2 });
    server.use(
      http.post(`${BASE}/bookings/messages/read`, () => {
        marks += 1;
        return HttpResponse.json(
          { error: { code: "not_found", message: "No such message." } },
          { status: 404 },
        );
      }),
    );

    const stop = observeAsOnScreen();
    try {
      const { client } = renderWithQuery(
        <MessageThread token="t" bookingState="confirmed" />,
      );
      client.setQueryDefaults(["listMyBookings"], { gcTime: Infinity });
      const upcoming = qk.myBookings("upcoming");
      client.setQueryData(upcoming, {
        pages: [{ bookings: [], nextCursor: null }],
        pageParams: [undefined],
      });

      await screen.findByText("Bring a towel, the wind is up.");
      await waitFor(() => expect(marks).toBe(1));
      await new Promise((r) => setTimeout(r, 60));
      expect(client.getQueryState(upcoming)?.isInvalidated).toBe(false);
    } finally {
      stop();
    }
  });

  it("asks again on the next poll when a mark did not land", async () => {
    /*
      A failed mark counted as done, so "2 new" stayed over messages the
      traveller had read until somebody wrote again (stability audit,
      6 Oct 2026). Not at once, which on a dead link is a request per render:
      on the next poll.
    */
    let marks = 0;
    serveThread({ unreadCount: 2 });
    server.use(
      http.post(`${BASE}/bookings/messages/read`, () => {
        marks += 1;
        if (marks === 1) {
          return HttpResponse.json(
            { error: { code: "service_unavailable", message: "Later." } },
            { status: 503 },
          );
        }
        return HttpResponse.json({ unreadCount: 0 });
      }),
    );

    const stop = observeAsOnScreen();
    try {
      const { client } = renderWithQuery(
        <MessageThread token="t" bookingState="confirmed" />,
      );
      await screen.findByText("Bring a towel, the wind is up.");
      await waitFor(() => expect(marks).toBe(1));
      await new Promise((r) => setTimeout(r, 60));
      expect(marks).toBe(1);
      expect(screen.getByText("2 new")).toBeInTheDocument();

      // The next poll.
      await client.refetchQueries({ queryKey: ["getBookingMessages", "t"] });
      await waitFor(() => expect(marks).toBe(2));
      await waitFor(() =>
        expect(screen.queryByText("2 new")).not.toBeInTheDocument(),
      );
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
