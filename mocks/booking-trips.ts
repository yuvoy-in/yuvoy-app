import { mockNow } from "./fixtures";
import { byToken, reservations } from "./booking-support";

/*
  The trips the booking mocks list without this device having made them,
  moved word for word from booking-handlers.ts (yuvoy-app#243), with the
  decline sentences and the seeding that makes each listed trip openable.
*/
/**
 * A day that has not happened yet, under either clock.
 *
 * The mock's own clock starts at `FIXTURE_NOW` and the device's is whatever
 * the machine says, so a fixture date is only reliably in the future when it
 * is ahead of BOTH. A literal is ahead of neither for long: this trip was
 * written as `2026-09-22` and quietly moved itself into the Past tab on
 * 23 September, failing two tests that had nothing to do with whatever
 * anybody was changing that day.
 */
function daysAhead(days: number): string {
  const now = Math.max(Date.now(), mockNow());
  return new Date(now + days * 86_400_000).toISOString().slice(0, 10);
}

export const INVITED_TRIP = {
  id: "inv_joined",
  role: "guest" as const,
  guestState: "invited" as const,
  experience: "Try-dive at Nemo Reef",
  experienceSlug: "try-dive-nemo-reef",
  operator: "Sample Dive Operator",
  // Upcoming, and it stays upcoming. See `daysAhead`.
  localDate: daysAhead(3),
  localTime: "07:00",
  meetingPoint: "Jetty 2, Havelock",
  landmark: "Beside the blue ticket hut",
  durationMinutes: 120,
  partySize: 3,
  status: "confirmed" as const,
  going: [{ name: "Asha Menon" }, { name: "Guest", you: true }],
};

/** The same, called off, so the Cancelled tab has something in it. */
export const INVITED_CANCELLED = {
  ...INVITED_TRIP,
  id: "inv_called_off",
  guestState: "joined" as const,
  status: "called_off" as const,
  /*
    In the past, and that is the point of the pair: a called-off trip belongs
    in Cancelled whatever its date says, so this one has a date that would put
    it in Past if the status did not win.
  */
  localDate: daysAhead(-13),
};

/** A trip on this number that this device has never seen. */
const ANOTHER_PHONES_TRIP = {
  reference: "YV-OTHERPH",
  reservationId: "res_other_phone",
  experience: "Snorkel trip to Elephant Beach",
  experienceId: "exp_snorkel",
  experienceSlug: "snorkel-elephant-beach",
  operator: "Sample Boat Operator",
  localDate: "2026-08-24",
  localTime: "09:00",
  state: "confirmed",
  guests: 2,
  meetingPoint: "Jetty 2, Havelock",
  statusToken: "tok_other_phone",
  tab: "upcoming" as const,
};

/** A request the operator has not answered: no reference, only an id. */
const WAITING_REQUEST = {
  reference: "",
  reservationId: "res_waiting_request",
  experience: "Mangrove kayak at dawn",
  experienceId: "exp_kayak",
  experienceSlug: "mangrove-kayak-at-dawn",
  operator: "Sample New Operator",
  localDate: "2026-08-26",
  localTime: "06:30",
  state: "pending_request",
  guests: 1,
  meetingPoint: "Mangrove jetty",
  statusToken: "tok_waiting_request",
  tab: "upcoming" as const,
};

/**
 * A trip that HAPPENED, and one the traveller called off.
 *
 * The Past tab had no fixture at all, which is how the owner's report of
 * 19 September — tapping a past trip and being told the link was dead — was
 * structurally unreachable by the suite: there was nothing in that tab to tap.
 * `no_show` rather than `completed` on the second past row because the
 * contract files it under PAST, not cancelled, and that rule is only worth
 * anything if something exercises it.
 */
const PAST_TRIP = {
  reference: "YV-PASTONE",
  reservationId: "res_past_trip",
  experience: "Sunset cruise off Radhanagar",
  experienceId: "exp_sunset_cruise",
  experienceSlug: "sunset-cruise-off-radhanagar",
  operator: "Sample Boat Operator",
  localDate: "2026-07-02",
  localTime: "16:30",
  state: "completed",
  guests: 2,
  meetingPoint: "Jetty 1, Havelock",
  statusToken: "tok_past_trip",
  tab: "past" as const,
};

const MISSED_TRIP = {
  reference: "YV-NOSHOW1",
  reservationId: "res_no_show",
  experience: "Dawn birdwatching at Chidiya Tapu",
  experienceId: "exp_birdwatching",
  experienceSlug: "dawn-birdwatching-at-chidiya-tapu",
  operator: "Sample New Operator",
  localDate: "2026-07-11",
  localTime: "05:15",
  state: "no_show",
  guests: 1,
  meetingPoint: "Chidiya Tapu gate",
  statusToken: "tok_no_show",
  tab: "past" as const,
};

const CANCELLED_TRIP = {
  reference: "YV-CALLOFF",
  reservationId: "res_cancelled_trip",
  experience: "Try-dive at Nemo Reef",
  experienceId: "exp_try_dive",
  experienceSlug: "try-dive-nemo-reef",
  operator: "Sample Dive Operator",
  localDate: "2026-08-01",
  localTime: "07:00",
  state: "cancelled",
  guests: 3,
  meetingPoint: "Jetty 2, Havelock",
  statusToken: "tok_cancelled_trip",
  tab: "cancelled" as const,
};

/**
 * A request the operator said no to, with the reason they picked
 * (yuvoy-api#225). No reference, because no booking ever existed; no payment
 * and no refund, because no money moved.
 *
 * Filed under Cancelled, AFTER the cancelled booking, so the first card in
 * that tab is still the one the booking-link suite opens.
 */
const DECLINED_REQUEST = {
  reference: "",
  reservationId: "res_declined_request",
  experience: "Mangrove kayak at dawn",
  experienceId: "exp_kayak",
  experienceSlug: "mangrove-kayak-at-dawn",
  operator: "Sample New Operator",
  localDate: "2026-08-28",
  localTime: "06:30",
  state: "declined",
  reasonCode: "no_capacity",
  guests: 2,
  meetingPoint: "Mangrove jetty",
  statusToken: "tok_declined_request",
  tab: "cancelled" as const,
};

/**
 * The API's sentence for each decline code, word for word
 * (`internal/booking/decline.go` at yuvoy-api 2afd7b4).
 */
const DECLINE_SENTENCES: Record<string, string> = {
  no_capacity: "The operator is full on that departure. Nothing was charged.",
  weather:
    "The operator isn't running that date because of the conditions. Nothing was charged.",
  not_operating:
    "The operator isn't running that departure after all. Nothing was charged.",
  party_too_large:
    "The operator can't take a group that size on this one. Nothing was charged.",
  unsafe_for_party:
    "The operator doesn't think this trip is right for your group. Nothing was charged.",
};

export function declineSentence(code: string): string {
  return (
    DECLINE_SENTENCES[code] ??
    "The operator couldn't take this one. Nothing was charged."
  );
}

/**
 * A departure `days` market days from today in Port Blair, at `time` there,
 * as `date` (the market's day) and `startsAt` (the instant, in UTC).
 */
export function marketDayFromNow(
  days: number,
  time: string,
): { date: string; startsAt: string } {
  const IST_MS = 5.5 * 3600_000;
  const wall = new Date(Date.now() + IST_MS);
  wall.setUTCDate(wall.getUTCDate() + days);
  const date = wall.toISOString().slice(0, 10);
  const [h, m] = time.split(":").map(Number);
  const startsAt = new Date(
    Date.UTC(
      Number(date.slice(0, 4)),
      Number(date.slice(5, 7)) - 1,
      Number(date.slice(8, 10)),
      h,
      m,
    ) - IST_MS,
  ).toISOString();
  return { date, startsAt };
}

/** Every row the API lists that this device did not create. */
export const LISTED_TRIPS = [
  ANOTHER_PHONES_TRIP,
  WAITING_REQUEST,
  PAST_TRIP,
  MISSED_TRIP,
  CANCELLED_TRIP,
  DECLINED_REQUEST,
];

/**
 * Makes the listed trips OPENABLE.
 *
 * Every row of `listMyBookings` carries a `statusToken`, and the contract is
 * unambiguous that it opens that booking. The mock used to invent those
 * tokens in the list handler alone and register them nowhere, so
 * `GET /bookings/status` answered 401 for every one of them: tapping a trip
 * in Trips — the single most ordinary thing on the screen — could not be
 * tested end to end, and a client that mangled the token on the way was
 * indistinguishable from the mock's own refusal.
 *
 * That is the gap the 19 September defect hid in, so it is closed here rather
 * than worked around in a test.
 */
/** A request the operator refused: declined, and never a booking. */
function isDeclinedRequestRow(trip: { state: string; reference: string }) {
  return trip.state === "declined" && trip.reference === "";
}

export function seedListedTrips(): void {
  for (const trip of LISTED_TRIPS) {
    reservations.set(trip.reservationId, {
      reservationId: trip.reservationId,
      slotId: `slot_${trip.reservationId}`,
      guests: trip.guests,
      contactName: "Sample Traveller",
      state: trip.state === "pending_request" ? "pending_request" : "active",
      holdExpiresAt: null,
      requestExpiresAt: null,
      token: trip.statusToken,
      reference: trip.reference || trip.reservationId,
      polls: 0,
      /*
        A declined REQUEST never took money, and its conversation is the empty
        one a link with no booking behind it answers.
      */
      paid:
        !isDeclinedRequestRow(trip) &&
        (trip.state === "confirmed" || trip.tab !== "upcoming"),
      /*
        And its booking link reads `released`, not `declined`: that is how the
        API projects an operator-declined request on `GET /bookings/status`,
        where `declined` means money was taken (yuvoy-api#225).
      */
      listedState: isDeclinedRequestRow(trip) ? "released" : trip.state,
      ...(isDeclinedRequestRow(trip) &&
      "reasonCode" in trip &&
      typeof trip.reasonCode === "string"
        ? { declineReasonCode: trip.reasonCode }
        : {}),
    });
    byToken.set(trip.statusToken, trip.reservationId);
  }
}

seedListedTrips();
