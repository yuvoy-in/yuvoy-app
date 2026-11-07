import { describe, it, expect, beforeEach } from "vitest";
import { screen } from "@testing-library/react";
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

/*
  PAYING THE OPERATOR IN CASH, continued from
  `booking-screen-cash.test.tsx`: the states a cash booking settles in.
*/
describe("finishing a booking in cash", () => {
  it("reads a cash booking as BOOKED, never as pending payment", async () => {
    /*
      `paid_pending_ops` is not in `BookingStatus.state`'s enum — the contract
      declares it only on `CashBooking` — and the API used to return it here.
      The screen dereferenced its state map unguarded, so this state took the
      whole page to the error boundary for somebody who had just committed
      money.

      Kept as a REGRESSION test even though D-034 stopped this endpoint sending
      it. The projection can move again, `/me/bookings` still carries the raw
      value, and the guard being exercised is "an undeclared state does not
      crash the page", which is true of every state and not only this one.

      "Both should read as booked to the traveller — the difference is our
      bookkeeping, not their standing."
    */
    server.use(
      http.get(`${BASE}/bookings/status`, () =>
        HttpResponse.json(
          statusBody({ state: "paid_pending_ops", final: false }),
        ),
      ),
    );

    renderWithQuery(<BookingScreen />);

    expect(await screen.findByText(/You.{1,3}re booked/)).toBeInTheDocument();
    expect(screen.getByText("YV-4K2M9P7Q")).toBeInTheDocument();
    expect(
      screen.queryByText(/unpaid|pending payment/i),
    ).not.toBeInTheDocument();
  });

  /**
   * What a cash booking still owes, after D-034 — yuvoy-app#29.
   *
   * `GET /bookings/status` now answers `confirmed` for a cash booking from the
   * moment it is made, and puts what is owed in `payment`. The app keyed on
   * `state === "paid_pending_ops"`, which is not in the enum and simply
   * stopped matching — so the screen said **"Paid ₹9,000"** to somebody who
   * had not handed over a rupee, and dropped the standing "Bring ₹9,000 in
   * cash" line that exists for the traveller reloading on the morning of the
   * trip.
   *
   * Nothing failed to compile and no test failed. These four are the ones that
   * would have.
   */
  describe("a cash booking that is confirmed but not collected", () => {
    const cashStatus = (collected: boolean) =>
      statusBody({
        state: "confirmed",
        final: true,
        payment: { method: "cash", collected, amountPaise: 900000 },
      });

    it("says what to bring, and does not call it paid", async () => {
      server.use(
        http.get(`${BASE}/bookings/status`, () =>
          HttpResponse.json(cashStatus(false)),
        ),
      );
      renderWithQuery(<BookingScreen />);

      expect(
        await screen.findByText(/Bring ₹9,000 in cash/),
      ).toBeInTheDocument();
      expect(screen.getByText("To pay on the day")).toBeInTheDocument();
      expect(screen.queryByText("Paid")).not.toBeInTheDocument();
    });

    it("keeps the wording the issue rules out", async () => {
      // Never "pay Yuvoy", never "amount due", never "unpaid" or "pending
      // payment": the money never reaches us and the seat is confirmed.
      server.use(
        http.get(`${BASE}/bookings/status`, () =>
          HttpResponse.json(cashStatus(false)),
        ),
      );
      renderWithQuery(<BookingScreen />);
      await screen.findByText(/Bring ₹9,000 in cash/);

      expect(
        screen.queryByText(/pay Yuvoy|amount due|unpaid|pending payment/i),
      ).not.toBeInTheDocument();
      expect(screen.getByText(/Pay the operator/i)).toBeInTheDocument();
    });

    it("stops saying it once the operator records taking the cash", async () => {
      /*
        The half that keying on the object's mere presence would get wrong,
        pointing the other way: "Bring ₹9,000 in cash" left on the screen of
        somebody who has already paid is the same class of untruth.
      */
      server.use(
        http.get(`${BASE}/bookings/status`, () =>
          HttpResponse.json(cashStatus(true)),
        ),
      );
      renderWithQuery(<BookingScreen />);

      expect(await screen.findByText("Paid in cash")).toBeInTheDocument();
      expect(screen.queryByText(/Bring ₹/)).not.toBeInTheDocument();
      expect(screen.queryByText("To pay on the day")).not.toBeInTheDocument();
    });

    /*
      A called-off trip the traveller paid for in cash (cross-product check,
      4 Oct 2026). The operator is told to hand it back; this says the same
      thing, and only when the money really changed hands.
    */
    it("tells a traveller whose cash trip was called off where the money is", async () => {
      server.use(
        http.get(`${BASE}/bookings/status`, () =>
          HttpResponse.json(
            statusBody({
              state: "cancelled",
              final: true,
              cancellation: { reasonCode: "OPERATOR_CANCELLED" },
              payment: { method: "cash", collected: true, amountPaise: 900000 },
            }),
          ),
        ),
      );
      renderWithQuery(<BookingScreen />);

      expect(
        await screen.findByText("You get your ₹9,000 back from the operator"),
      ).toBeInTheDocument();
      expect(
        screen.getByText(/nothing is refunded online/),
      ).toBeInTheDocument();
      expect(document.body.textContent).not.toMatch(
        /refund has already started/i,
      );
    });

    it("says nothing about cash that was never handed over", async () => {
      server.use(
        http.get(`${BASE}/bookings/status`, () =>
          HttpResponse.json(
            statusBody({
              state: "cancelled",
              final: true,
              payment: {
                method: "cash",
                collected: false,
                amountPaise: 900000,
              },
            }),
          ),
        ),
      );
      renderWithQuery(<BookingScreen />);

      await screen.findByText("This trip was called off");
      expect(
        screen.queryByText(/back from the operator/),
      ).not.toBeInTheDocument();
      expect(screen.queryByText(/Bring ₹/)).not.toBeInTheDocument();
    });

    it("leaves a CARD booking alone, which carries no payment at all", async () => {
      // The distinction the screen now reads. A card booking is `confirmed`
      // too, and has genuinely been paid.
      server.use(
        http.get(`${BASE}/bookings/status`, () =>
          HttpResponse.json(statusBody({ state: "confirmed", final: true })),
        ),
      );
      renderWithQuery(<BookingScreen />);

      expect(await screen.findByText("Paid")).toBeInTheDocument();
      expect(screen.queryByText(/Bring ₹/)).not.toBeInTheDocument();
    });
  });

  it("does not crash on a state this build has never heard of", async () => {
    // The general form of the bug above. A booking screen that throws is the
    // worst outcome in the product: the person may have just handed over money.
    server.use(
      http.get(`${BASE}/bookings/status`, () =>
        HttpResponse.json(statusBody({ state: "some_new_state_from_2027" })),
      ),
    );

    renderWithQuery(<BookingScreen />);
    expect(await screen.findByText("YV-4K2M9P7Q")).toBeInTheDocument();
  });
});
