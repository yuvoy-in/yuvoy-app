import { describe, it, expect } from "vitest";
import { screen } from "@testing-library/react";
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

describe("MessageThread", () => {
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
});
