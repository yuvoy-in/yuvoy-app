import type { components } from "../src/lib/api/schema.gen";

type CheckIn = NonNullable<components["schemas"]["BookingStatus"]["checkIn"]>;

/** The seeded code, formatted the way the API sends it. */
export const MOCK_CHECK_IN_CODE = "K7QM-2XPA";

/**
 * `checkIn` on `GET /bookings/status` (yuvoy-app#218), the same scenarios as
 * the app's mocks: `check-in` sends a code not yet used, `checked-in` one used
 * at 07:42 on the trip's day. Absent otherwise, which is what a business with
 * check-in by code off answers, so every other test sees no block. Sent only
 * while confirmed or still settling, as the server does.
 *
 * `validOn` is the seeded departure's day (22 Aug 2026, 07:00 IST), and the
 * link is the operator site's, built from the reference and the code with no
 * hyphen, the shape the scanner reads.
 */
export function mockCheckIn(
  scenario: string | null,
  state: string,
  reference: string,
): { checkIn: CheckIn } | Record<string, never> {
  if (scenario !== "check-in" && scenario !== "checked-in") return {};
  if (state !== "confirmed" && state !== "verifying") return {};
  return {
    checkIn: {
      code: MOCK_CHECK_IN_CODE,
      link: `https://operators.yuvoy.in/check-in#${reference}.${MOCK_CHECK_IN_CODE.replace("-", "")}`,
      validOn: "2026-08-22",
      ...(scenario === "checked-in"
        ? { checkedInAt: "2026-08-22T07:42:00+05:30" }
        : {}),
    },
  };
}
