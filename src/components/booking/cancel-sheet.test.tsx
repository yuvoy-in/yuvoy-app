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
