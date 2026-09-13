import { describe, it, expect } from "vitest";
import { screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { renderWithQuery } from "@/test/render";
import { CancelSheet } from "./cancel-sheet";
import { server } from "../../../mocks/server";
import { http, HttpResponse } from "msw";

const BASE = process.env.NEXT_PUBLIC_API_URL ?? "http://localhost:8099/v1";
const noop = () => {};

describe("CancelSheet", () => {
  it("hides the button entirely when a human has to decide", async () => {
    server.use(
      http.get(`${BASE}/bookings/cancellation-quote`, () =>
        HttpResponse.json({
          cancellable: true,
          selfService: false,
          capturedPaise: 900000,
          refundPaise: 450000,
          note: "Under 24 hours, so a person checks it.",
        }),
      ),
    );

    renderWithQuery(<CancelSheet token="t" onDone={noop} onClose={noop} />);

    // Showing a button that will be refused is worse than not showing one.
    expect(await screen.findByText(/a person checks it/i)).toBeInTheDocument();
    expect(
      screen.queryByRole("button", { name: /cancel this booking/i }),
    ).not.toBeInTheDocument();
  });

  it("echoes the quoted amount back on commit", async () => {
    let sent: unknown = null;
    server.use(
      http.post(`${BASE}/bookings/cancellation`, async ({ request }) => {
        sent = await request.json();
        return HttpResponse.json({
          bookingReference: "YV-1",
          state: "cancelled",
          refundPaise: 900000,
        });
      }),
    );

    const user = userEvent.setup();
    renderWithQuery(<CancelSheet token="t" onDone={noop} onClose={noop} />);

    await user.click(
      await screen.findByRole("button", { name: /cancel this booking/i }),
    );
    await user.click(screen.getByRole("button", { name: /yes, cancel it/i }));

    // The commit must carry the quoted figure, unchanged — that is what stops
    // a cancellation happening for an amount the traveller never saw.
    await waitFor(() => expect(sent).toEqual({ expectedRefundPaise: 900000 }));
  });

  it("re-quotes rather than cancelling when the amount moved", async () => {
    let quotes = 0;
    server.use(
      http.get(`${BASE}/bookings/cancellation-quote`, () => {
        quotes += 1;
        return HttpResponse.json({
          cancellable: true,
          selfService: true,
          capturedPaise: 900000,
          refundPaise: 900000,
        });
      }),
      http.post(`${BASE}/bookings/cancellation`, () =>
        HttpResponse.json(
          { error: { code: "refund_quote_moved", message: "moved" } },
          { status: 409 },
        ),
      ),
    );

    const user = userEvent.setup();
    renderWithQuery(<CancelSheet token="t" onDone={noop} onClose={noop} />);

    await user.click(
      await screen.findByRole("button", { name: /cancel this booking/i }),
    );
    await user.click(screen.getByRole("button", { name: /yes, cancel it/i }));

    // Back to a fresh quote, and NOT cancelled.
    await waitFor(() => expect(quotes).toBeGreaterThan(1));
    expect(
      screen.queryByRole("button", { name: /yes, cancel it/i }),
    ).not.toBeInTheDocument();
  });

  /*
    yuvoy-app#48 §1. A departure the operator moved refunds in full, which is
    self-service, and `note` is the only place the traveller learns why. The
    sheet showed `note` only in the `selfService: false` branch, so this quote
    rendered "You get everything back." and nothing else.
  */
  it("shows the note beside the figure on a self-service full refund", async () => {
    server.use(
      http.get(`${BASE}/bookings/cancellation-quote`, () =>
        HttpResponse.json({
          cancellable: true,
          selfService: true,
          capturedPaise: 900000,
          refundPaise: 900000,
          refundTier: "half",
          note: "The operator moved this departure after you booked.",
        }),
      ),
    );

    renderWithQuery(<CancelSheet token="t" onDone={noop} onClose={noop} />);

    expect(
      await screen.findByText("You get everything back."),
    ).toBeInTheDocument();
    expect(
      screen.getByText("The operator moved this departure after you booked."),
    ).toBeInTheDocument();
  });

  /*
    yuvoy-app#48 §2. A booking paid in cash has `capturedPaise` and
    `refundPaise` both 0, so the old `refundPaise === capturedPaise` test
    printed "You get everything back." above ₹0 — a promise of money that was
    never taken, to somebody who is about to hand notes to an operator.
  */
  it("does not promise everything back when nothing was paid online", async () => {
    server.use(
      http.get(`${BASE}/bookings/cancellation-quote`, () =>
        HttpResponse.json({
          cancellable: true,
          selfService: true,
          capturedPaise: 0,
          refundPaise: 0,
          refundTier: "half",
          hoursBeforeStart: 30,
        }),
      ),
    );

    renderWithQuery(<CancelSheet token="t" onDone={noop} onClose={noop} />);

    expect(
      await screen.findByText(
        "Nothing was paid online for this booking, so there is nothing to refund.",
      ),
    ).toBeInTheDocument();
    expect(
      screen.queryByText("You get everything back."),
    ).not.toBeInTheDocument();
    // And no large zero under a sentence that already answered the question.
    expect(screen.queryByText("₹0")).not.toBeInTheDocument();
    // D28: it needs nobody, so the button is there.
    expect(
      screen.getByRole("button", { name: /cancel this booking/i }),
    ).toBeInTheDocument();
  });

  /*
    The tier that still needs a person, unchanged. `selfService: false` is
    narrower than it was, not gone, and a partial refund of money that really
    did move online still routes to a human.
  */
  it("still routes a partial refund of money paid online to a person", async () => {
    server.use(
      http.get(`${BASE}/bookings/cancellation-quote`, () =>
        HttpResponse.json({
          cancellable: true,
          selfService: false,
          capturedPaise: 900000,
          refundPaise: 450000,
          refundTier: "half",
          note: "Under 24 hours, so this one is half back and a person checks it.",
        }),
      ),
    );

    renderWithQuery(<CancelSheet token="t" onDone={noop} onClose={noop} />);

    expect(
      await screen.findByText(/half back and a person checks it/i),
    ).toBeInTheDocument();
    expect(screen.getByText(/Message us on WhatsApp/i)).toBeInTheDocument();
    expect(
      screen.queryByRole("button", { name: /cancel this booking/i }),
    ).not.toBeInTheDocument();
  });

  it("says plainly when a booking cannot be cancelled at all", async () => {
    server.use(
      http.get(`${BASE}/bookings/cancellation-quote`, () =>
        HttpResponse.json({
          cancellable: false,
          selfService: false,
          reason: "This departure has already left.",
        }),
      ),
    );

    renderWithQuery(<CancelSheet token="t" onDone={noop} onClose={noop} />);
    expect(
      await screen.findByText("This departure has already left."),
    ).toBeInTheDocument();
  });
});

describe("CancelSheet — a dead link", () => {
  it("offers a new link when the token behind the commit has expired", async () => {
    server.use(
      http.post(`${BASE}/bookings/cancellation`, () =>
        HttpResponse.json(
          { error: { code: "token_expired", message: "raw" } },
          { status: 401 },
        ),
      ),
    );

    const user = userEvent.setup();
    renderWithQuery(<CancelSheet token="t" onDone={noop} onClose={noop} />);

    await user.click(
      await screen.findByRole("button", { name: /cancel this booking/i }),
    );
    await user.click(screen.getByRole("button", { name: /yes, cancel it/i }));

    expect(
      await screen.findByText("This link has expired"),
    ).toBeInTheDocument();
    expect(
      screen.getByRole("link", { name: "Get a new link" }),
    ).toHaveAttribute("href", "/trips/recover");
  });
});
