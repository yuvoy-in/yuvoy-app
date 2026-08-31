import { describe, it, expect, beforeEach } from "vitest";
import { screen, waitFor } from "@testing-library/react";
import { renderWithQuery } from "@/test/render";
import { BookingScreen } from "./booking-screen";
import { server } from "../../../mocks/server";
import { http, HttpResponse } from "msw";

const BASE = process.env.NEXT_PUBLIC_API_URL ?? "http://localhost:8099/v1";

function setHash(hash: string) {
  window.location.hash = hash;
}

function statusBody(over: Record<string, unknown> = {}) {
  return {
    reservationId: "res_1",
    state: "confirmed",
    final: true,
    guests: 2,
    contactName: "Asha Menon",
    bookingReference: "YV-4K2M9P7Q",
    experience: {
      slug: "try-dive-nemo-reef",
      title: "Try-dive at Nemo Reef",
      operator: "Sample Dive Operator",
    },
    slot: { startsAt: "2026-08-22T01:30:00Z", timezone: "Asia/Kolkata" },
    price: { totalPaise: 900000, currency: "INR" },
    ...over,
  };
}

beforeEach(() => setHash("#t=tok_test"));

describe("BookingScreen", () => {
  it("renders a confirmed booking with everything needed for the day", async () => {
    server.use(
      http.get(`${BASE}/bookings/status`, () =>
        HttpResponse.json(statusBody()),
      ),
    );

    renderWithQuery(<BookingScreen />);

    expect(await screen.findByText("You are going")).toBeInTheDocument();
    // The reference is what gets read aloud on a jetty.
    expect(screen.getByText("YV-4K2M9P7Q")).toBeInTheDocument();
    // Rendered in the MARKET's zone: 01:30Z is 07:00 IST.
    expect(
      screen.getByText(/07:00 on Saturday, 22 August/),
    ).toBeInTheDocument();
    expect(screen.getByText("₹9,000")).toBeInTheDocument();
  });

  it("NEVER renders verifying as a failure", async () => {
    server.use(
      http.get(`${BASE}/bookings/status`, () =>
        HttpResponse.json(
          statusBody({
            state: "verifying",
            final: false,
            bookingReference: undefined,
          }),
        ),
      ),
    );

    renderWithQuery(<BookingScreen />);

    // "If money left your account it is safe" is the only honest copy here.
    expect(
      await screen.findByText("Confirming your payment"),
    ).toBeInTheDocument();
    expect(screen.getByText(/it is safe/i)).toBeInTheDocument();
    /*
      No number and no countdown. yuvoy-api#53 confirmed `verifying` is a race
      window of milliseconds to seconds, not a waiting room — nothing in the
      system bounds it, so publishing a figure would publish a promise nothing
      keeps.
    */
    expect(screen.queryByRole("timer")).not.toBeInTheDocument();
    // Nothing that reads as an error.
    expect(screen.queryByRole("alert")).not.toBeInTheDocument();
    expect(screen.queryByText(/failed|error|wrong/i)).not.toBeInTheDocument();
  });

  it("shows a countdown ONLY while holding", async () => {
    server.use(
      http.get(`${BASE}/bookings/status`, () =>
        HttpResponse.json(
          statusBody({
            state: "holding",
            final: false,
            bookingReference: undefined,
            holdExpiresAt: new Date(Date.now() + 300_000).toISOString(),
          }),
        ),
      ),
    );

    renderWithQuery(<BookingScreen />);
    expect(await screen.findByRole("timer")).toBeInTheDocument();
  });

  it("shows no countdown beside a dead booking", async () => {
    // holdExpiresAt is absent in every state but `holding`, precisely so a
    // clock is never rendered next to an expired one.
    server.use(
      http.get(`${BASE}/bookings/status`, () =>
        HttpResponse.json(
          statusBody({ state: "expired", final: true, holdExpiresAt: null }),
        ),
      ),
    );

    renderWithQuery(<BookingScreen />);
    expect(await screen.findByText("The hold ran out")).toBeInTheDocument();
    expect(screen.queryByRole("timer")).not.toBeInTheDocument();
  });

  it("treats payments_unavailable as calm and truthful, not a crash", async () => {
    server.use(
      http.get(`${BASE}/bookings/status`, () =>
        HttpResponse.json(
          statusBody({
            state: "holding",
            final: false,
            bookingReference: undefined,
            holdExpiresAt: new Date(Date.now() + 300_000).toISOString(),
          }),
        ),
      ),
      http.post(`${BASE}/reservations/:id/payment-order`, () =>
        HttpResponse.json(
          {
            error: {
              code: "payments_unavailable",
              message: "raw",
              requestId: "01JPAY",
            },
          },
          { status: 503 },
        ),
      ),
    );

    renderWithQuery(<BookingScreen />);
    (await screen.findByRole("button", { name: /^Pay/ })).click();

    await waitFor(() =>
      expect(
        screen.getByText("Payment is not available yet"),
      ).toBeInTheDocument(),
    );
    // Says explicitly that nothing was charged — the traveller's real question.
    expect(screen.getByText(/Nothing has been charged/i)).toBeInTheDocument();
    expect(screen.getByText("01JPAY")).toBeInTheDocument();
    expect(screen.queryByText("raw")).not.toBeInTheDocument();
  });

  it("shows refund progress on a declined booking without being asked", async () => {
    server.use(
      http.get(`${BASE}/bookings/status`, () =>
        HttpResponse.json(
          statusBody({
            state: "declined",
            final: true,
            refund: {
              state: "pending",
              amountPaise: 900000,
              message: "Your refund is with your bank.",
            },
          }),
        ),
      ),
    );

    renderWithQuery(<BookingScreen />);

    expect(
      await screen.findByText("We could not get you the seat"),
    ).toBeInTheDocument();
    expect(screen.getByText("Your refund")).toBeInTheDocument();
    // Prefer the server's ready-to-render copy over ours.
    expect(
      screen.getByText("Your refund is with your bank."),
    ).toBeInTheDocument();
    expect(
      screen.getByText(/You do not need to ask for it/i),
    ).toBeInTheDocument();
  });

  it("tells the truth when a refund has failed, and promises a human", async () => {
    server.use(
      http.get(`${BASE}/bookings/status`, () =>
        HttpResponse.json(
          statusBody({
            state: "cancelled",
            final: true,
            refund: { state: "failed", amountPaise: 900000 },
          }),
        ),
      ),
    );

    renderWithQuery(<BookingScreen />);
    expect(
      await screen.findByText(/someone is on it and will message you/i),
    ).toBeInTheDocument();
  });

  it("explains itself when there is no token in the link", async () => {
    setHash("");
    renderWithQuery(<BookingScreen />);
    expect(
      await screen.findByText("We need your booking link"),
    ).toBeInTheDocument();
  });
});
