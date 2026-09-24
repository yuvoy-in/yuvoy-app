import { describe, expect, it } from "vitest";
import { declineView } from "./trip-copy";
import type { components } from "@/lib/api/schema.gen";

type BookingStatus = components["schemas"]["BookingStatus"];

/*
  `declineView`: a request the operator turned down, as the page says it
  (yuvoy-api#225). The screen tests cover the render; these cover the edges.
*/

function status(over: Partial<BookingStatus>): BookingStatus {
  return {
    reservationId: "res_1",
    state: "released",
    final: true,
    guests: 3,
    experience: { slug: "reef dive", title: "Reef dive" },
    slot: { startsAt: "2026-09-20T03:30:00Z", timezone: "Asia/Kolkata" },
    ...over,
  } as BookingStatus;
}

const NEXT = {
  date: "2026-09-24",
  startsAt: "2026-09-24T03:30:00Z",
  timezone: "Asia/Kolkata",
  bookUrl: "https://yuvoy.in/e/reef-dive",
};

describe("declineView", () => {
  it("is null without the API's sentence, whatever the code says", () => {
    expect(declineView(status({}))).toBeNull();
    expect(
      declineView(status({ cancellation: { reasonCode: "no_capacity" } })),
    ).toBeNull();
    expect(
      declineView(
        status({ cancellation: { reasonCode: "no_capacity", message: "  " } }),
      ),
    ).toBeNull();
  });

  it("encodes the slug and carries the party size", () => {
    const view = declineView(
      status({
        cancellation: {
          reasonCode: "no_capacity",
          message:
            "The operator is full on that departure. Nothing was charged.",
          nextDeparture: NEXT,
        },
      }),
    );
    expect(view?.next?.href).toBe(
      "/e/reef%20dive/book?date=2026-09-24&guests=3",
    );
    expect(view?.otherDates).toBe("/e/reef%20dive/book");
  });

  it("offers no date without a listing to book it on", () => {
    const view = declineView(
      status({
        experience: { title: "Reef dive" } as BookingStatus["experience"],
        cancellation: {
          reasonCode: "weather",
          message: "x.",
          nextDeparture: NEXT,
        },
      }),
    );
    expect(view?.next).toBeNull();
    expect(view?.otherDates).toBeNull();
  });

  it("says the market day without a time when the zone cannot be read", () => {
    const view = declineView(
      status({
        cancellation: {
          reasonCode: "weather",
          message: "x.",
          nextDeparture: { ...NEXT, timezone: "Not/AZone" },
        },
      }),
    );
    expect(view?.next?.when).toBe("Thu, 24 Sep");
  });

  it("offers nothing for a date that is not a date", () => {
    const view = declineView(
      status({
        cancellation: {
          reasonCode: "weather",
          message: "x.",
          nextDeparture: { ...NEXT, date: "next week" },
        },
      }),
    );
    expect(view?.next).toBeNull();
  });
});
