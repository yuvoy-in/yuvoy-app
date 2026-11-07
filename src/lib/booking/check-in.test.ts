import { describe, it, expect } from "vitest";
import type { components } from "@/lib/api/schema.gen";
import { checkInUsedLine, checkInView, spokenCode } from "./check-in";

type BookingStatus = components["schemas"]["BookingStatus"];

/**
 * The check-in code's words and when it shows (yuvoy-app#218). The trip is
 * 07:00 IST on Saturday 22 August, so its day ends at 18:30Z that evening.
 */

const LINK = "https://operators.yuvoy.in/check-in#YV-4K2M9P7Q.K7QM2XPA";

const status = (checkIn?: Partial<NonNullable<BookingStatus["checkIn"]>>) =>
  ({
    reservationId: "res_1",
    state: "confirmed",
    final: true,
    guests: 2,
    bookingReference: "YV-4K2M9P7Q",
    experience: {
      slug: "try-dive-nemo-reef",
      title: "Try-dive at Nemo Reef",
      operator: "Sample Dive Operator",
    },
    slot: { startsAt: "2026-08-22T01:30:00Z", timezone: "Asia/Kolkata" },
    price: { totalPaise: 900000, currency: "INR" },
    ...(checkIn
      ? {
          checkIn: {
            code: "K7QM-2XPA",
            link: LINK,
            validOn: "2026-08-22",
            ...checkIn,
          },
        }
      : {}),
  }) as BookingStatus;

const at = (iso: string) => Date.parse(iso);
const BEFORE = at("2026-08-19T02:00:00Z");

describe("checkInView", () => {
  it("gives the code and link as sent, and the day it is for", () => {
    expect(checkInView(status({}), BEFORE)).toEqual({
      code: "K7QM-2XPA",
      link: LINK,
      day: "For Saturday, 22 August",
      checkedIn: null,
    });
  });

  it("is nothing when the API sends no checkIn", () => {
    expect(checkInView(status(), BEFORE)).toBeNull();
  });

  it("is nothing for an empty code or link", () => {
    expect(checkInView(status({ code: "  " }), BEFORE)).toBeNull();
    expect(checkInView(status({ link: "" }), BEFORE)).toBeNull();
  });

  it("shows to the last minute of the trip's day in its market, and not after", () => {
    expect(checkInView(status({}), at("2026-08-22T18:29:00Z"))).not.toBeNull();
    expect(checkInView(status({}), at("2026-08-22T18:31:00Z"))).toBeNull();
  });

  it("falls back to the departure's day for a validOn it cannot read, with no day line", () => {
    const view = checkInView(status({ validOn: "soon" }), BEFORE);
    expect(view).toMatchObject({ code: "K7QM-2XPA", day: null });
    expect(
      checkInView(status({ validOn: "soon" }), at("2026-08-22T18:31:00Z")),
    ).toBeNull();
  });

  it("says when the code was used, in the trip's own zone", () => {
    expect(
      checkInView(status({ checkedInAt: "2026-08-22T02:12:00Z" }), BEFORE)
        ?.checkedIn,
    ).toBe("Checked in at 07:42");
  });
});

describe("checkInUsedLine", () => {
  it("adds the day when the code was used the day before", () => {
    expect(
      checkInUsedLine("2026-08-21T12:30:00Z", "Asia/Kolkata", "2026-08-22"),
    ).toBe("Checked in at 18:00 on Friday, 21 August");
  });

  it("says only Checked in for a time or a zone it cannot read", () => {
    expect(checkInUsedLine("later", "Asia/Kolkata", "2026-08-22")).toBe(
      "Checked in",
    );
    expect(
      checkInUsedLine("2026-08-22T02:12:00Z", "Not/AZone", "2026-08-22"),
    ).toBe("Checked in");
  });
});

describe("spokenCode", () => {
  it("reads each character, with a pause for the hyphen", () => {
    expect(spokenCode("K7QM-2XPA")).toBe("K 7 Q M, 2 X P A");
  });
});
