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

describe("BookingScreen — the day's facts", () => {
  it("says where to meet", async () => {
    server.use(
      http.get(`${BASE}/bookings/status`, () =>
        HttpResponse.json(
          statusBody({
            meetingPoint: {
              text: "Jetty 2, Havelock",
              landmark: "Beside the dive shop",
            },
          }),
        ),
      ),
    );

    renderWithQuery(<BookingScreen />);

    expect(await screen.findByText("Jetty 2, Havelock")).toBeInTheDocument();
    expect(screen.getByText("Beside the dive shop")).toBeInTheDocument();
  });

  it("renders no row at all when the meeting point is empty", async () => {
    // The read path coerces a NULL column to "", so the key is present and
    // useless — the one shape optional chaining does not catch (yuvoy-app#25).
    server.use(
      http.get(`${BASE}/bookings/status`, () =>
        HttpResponse.json(statusBody({ meetingPoint: { text: "  " } })),
      ),
    );

    renderWithQuery(<BookingScreen />);

    expect(await screen.findByText("You are going")).toBeInTheDocument();
    expect(screen.queryByText("Where you meet")).toBeNull();
  });

  describe("a cancelled trip says why", () => {
    function cancelled(reasonCode?: string) {
      return statusBody({
        state: "cancelled",
        final: true,
        cancellation: reasonCode ? { reasonCode } : undefined,
      });
    }

    it("names the actual reason instead of guessing at the weather", async () => {
      server.use(
        http.get(`${BASE}/bookings/status`, () =>
          HttpResponse.json(cancelled("CREDENTIAL_LAPSE")),
        ),
      );

      renderWithQuery(<BookingScreen />);

      expect(
        await screen.findByText("The operator's paperwork was not current."),
      ).toBeInTheDocument();
    });

    it("never prints the raw code at a traveller", async () => {
      server.use(
        http.get(`${BASE}/bookings/status`, () =>
          HttpResponse.json(cancelled("CREDENTIAL_LAPSE")),
        ),
      );

      renderWithQuery(<BookingScreen />);
      await screen.findByText("This trip was called off");
      expect(document.body.textContent).not.toMatch(/CREDENTIAL_LAPSE/);
    });

    it("drops the 'if the sea called it off' hedge", async () => {
      server.use(
        http.get(`${BASE}/bookings/status`, () =>
          HttpResponse.json(cancelled("OPERATOR_CANCELLED")),
        ),
      );

      renderWithQuery(<BookingScreen />);
      await screen.findByText("This trip was called off");
      expect(document.body.textContent).not.toMatch(
        /if the sea called it off/i,
      );
      // The rebooking rule is true whatever the reason was, and stays.
      expect(
        screen.getByText(/Rebooking is a fresh booking/i),
      ).toBeInTheDocument();
    });

    /*
      yuvoy-app#48 §2. D28 made a booking paid in cash cancellable from the
      sheet with `refundPaise` 0, and `STATE_COPY.cancelled` opened "Your
      refund has already started." — a promise of money to somebody from whom
      none was ever taken. This test used to assert that sentence was present
      on a body carrying no `refund` at all, which is how it survived.
    */
    it("promises no refund on a cancelled booking that has none", async () => {
      server.use(
        http.get(`${BASE}/bookings/status`, () =>
          HttpResponse.json(cancelled("TRAVELLER_REQUEST")),
        ),
      );

      renderWithQuery(<BookingScreen />);
      await screen.findByText("This trip was called off");
      expect(document.body.textContent).not.toMatch(
        /refund has already started/i,
      );
    });

    /*
      The other direction, and the reason the sentence is dropped rather than
      inverted: when a refund DOES exist the traveller must still be told. It
      comes from the server's own refund state now, not from static copy that
      cannot know.
    */
    it("still shows the refund when there is one", async () => {
      server.use(
        http.get(`${BASE}/bookings/status`, () =>
          HttpResponse.json({
            ...cancelled("OPERATOR_CANCELLED"),
            refund: { state: "pending", amountPaise: 900000 },
          }),
        ),
      );

      renderWithQuery(<BookingScreen />);
      expect(await screen.findByText("Your refund")).toBeInTheDocument();
      expect(screen.getByText("Refund started")).toBeInTheDocument();
    });

    /*
      yuvoy-app#48 §1. `OPERATOR_MOVED_IT` is what the server records when a
      full refund was granted because the departure moved. Unmapped, it fell
      to "The operator or we called it off." — which names the wrong actor for
      a cancellation the traveller pressed, and hides the fact that explains
      the money.
    */
    it("names a moved departure rather than blaming the traveller's own tap", async () => {
      server.use(
        http.get(`${BASE}/bookings/status`, () =>
          HttpResponse.json(cancelled("OPERATOR_MOVED_IT")),
        ),
      );

      renderWithQuery(<BookingScreen />);
      expect(
        await screen.findByText(
          "The operator moved this departure after you booked.",
        ),
      ).toBeInTheDocument();
      expect(document.body.textContent).not.toMatch(
        /The operator or we called it off/i,
      );
    });

    it("treats the two names for a traveller cancellation as one event", async () => {
      // `TRAVELLER_REQUEST` and `CUSTOMER_REQUEST` are the same thing under
      // two names in the backend's own table. Neither may fall through.
      for (const code of ["TRAVELLER_REQUEST", "CUSTOMER_REQUEST"]) {
        server.use(
          http.get(`${BASE}/bookings/status`, () =>
            HttpResponse.json(cancelled(code)),
          ),
        );
        const { unmount } = renderWithQuery(<BookingScreen />);
        expect(
          await screen.findByText("You asked us to cancel."),
        ).toBeInTheDocument();
        unmount();
      }
    });

    it("has a sentence for a code it has never seen", async () => {
      // The set grows by INSERT on the server with no deploy here, so an
      // unmapped code is the expected steady state after any addition — not
      // an edge case. It must not render blank and must not render the token.
      server.use(
        http.get(`${BASE}/bookings/status`, () =>
          HttpResponse.json(cancelled("VOLCANO")),
        ),
      );

      renderWithQuery(<BookingScreen />);

      expect(
        await screen.findByText("The operator or we called it off."),
      ).toBeInTheDocument();
      expect(document.body.textContent).not.toMatch(/VOLCANO/);
    });

    it("says nothing at all when no reason came back", async () => {
      server.use(
        http.get(`${BASE}/bookings/status`, () =>
          HttpResponse.json(cancelled()),
        ),
      );

      renderWithQuery(<BookingScreen />);
      await screen.findByText("This trip was called off");
      expect(screen.queryByText(/called it off\./)).toBeNull();
    });
  });

  it("tells a waiting traveller how long the operator has", async () => {
    server.use(
      http.get(`${BASE}/bookings/status`, () =>
        HttpResponse.json(
          statusBody({
            state: "awaiting_operator",
            final: false,
            bookingReference: undefined,
            // 04:30Z is 10:00 IST — stated in the market's zone, like every
            // other time on this screen.
            requestExpiresAt: "2026-08-21T04:30:00Z",
          }),
        ),
      ),
    );

    renderWithQuery(<BookingScreen />);

    expect(
      await screen.findByText("The operator has until"),
    ).toBeInTheDocument();
    expect(screen.getByText(/10:00/)).toBeInTheDocument();
  });

  it("shows no deadline on a booking nobody is waiting on", async () => {
    // The API drops `requestExpiresAt` once the booking is final, so the key
    // being absent is already the answer — no state check needed here.
    server.use(
      http.get(`${BASE}/bookings/status`, () =>
        HttpResponse.json(statusBody()),
      ),
    );

    renderWithQuery(<BookingScreen />);

    expect(await screen.findByText("You are going")).toBeInTheDocument();
    expect(screen.queryByText("The operator has until")).toBeNull();
  });
});
