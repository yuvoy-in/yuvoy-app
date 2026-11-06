import { describe, it, expect } from "vitest";
import { fireEvent, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { renderWithQuery } from "@/test/render";
import { MessageThread } from "./message-thread";
import { server } from "../../../mocks/server";
import { delay, http, HttpResponse } from "msw";
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
});
