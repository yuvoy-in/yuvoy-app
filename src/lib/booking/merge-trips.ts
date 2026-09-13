import type { components, operations } from "@/lib/api/schema.gen";

type BookingStatus = components["schemas"]["BookingStatus"];

/**
 * One row of `GET /me/bookings`.
 *
 * DERIVED from the generated operation rather than retyped. The response is
 * inline in the contract with no named schema, and a hand-written copy of an
 * inline shape is exactly what `contracts/PINNED` exists to prevent: it would
 * still compile the day the server adds `reasonCode` or drops `meetingPoint`,
 * and the disagreement would surface at runtime, in a list of somebody's
 * bookings.
 */
export type ServerTrip =
  operations["listMyBookings"]["responses"][200]["content"]["application/json"]["bookings"][number];

/** One booking this device remembers, with whatever we last saw of it. */
export interface DeviceTrip {
  key: string;
  reference: string | null;
  reservationId?: string | null;
  token: string;
  savedAt: string;
  dead: boolean;
  status: BookingStatus | null;
  fetchedAt: string | null;
}

/** What the Trips screen renders, from either source or both. */
export interface Trip {
  /** Stable across a merge, so React does not remount a card on a refetch. */
  key: string;
  reference: string | null;
  /** Null only for a device record we have never opened. */
  reservationId: string | null;
  title: string;
  /** ISO instant, for ordering. Null when neither source knows one. */
  startsAt: string | null;
  timezone: string | null;
  state: string | null;
  guests: number | null;
  /** Present on a declined request (api#175). */
  reasonCode?: string;
  /** Where the card goes. Always the freshest token we hold. */
  token: string;
  /** The device's link is finished with; the server may still have one. */
  dead: boolean;
  /** When this device last saw the booking itself, for "last checked". */
  fetchedAt: string | null;
  /** True when the server listed it, so it is not device-only. */
  onServer: boolean;
}

/**
 * The device's trips and the number's trips, as one list — yuvoy-app#34.
 *
 * ## Why matching is two-keyed, and why that is not belt and braces
 *
 * A booking has a reference. A REQUEST does not, until the operator accepts:
 * `GET /me/bookings` lists it with `state: pending_request` and an **empty**
 * reference. The issue is explicit — "match against trips saved on the phone
 * by `reference`, or by the new `reservationId` when there is no reference" —
 * and getting it wrong is not cosmetic: every waiting request on the phone
 * would appear twice, once from each source, with two different tokens.
 *
 * Empty string is the absent case, not `undefined`. The contract says
 * `reference` is required and "empty for a request the operator has not
 * answered yet", so a naive `if (row.reference)` is right and
 * `Object.hasOwn` is not. Both are guarded here rather than at the call site.
 *
 * ## The server's token wins
 *
 * Each row's `statusToken` is minted for that response and "issuing it revokes
 * nothing", so it is always at least as good as the device's copy — and it is
 * strictly better when the device's has died, which is exactly the case a
 * traveller signs in to fix. A device record marked dead therefore stops being
 * dead the moment the server lists the same trip.
 *
 * ## The device's snapshot survives
 *
 * The server row has no meeting point detail, no hero and no `startsAt` — only
 * a local date and time. The device's snapshot is a whole `BookingStatus`. So
 * the merge takes identity and access from the server and detail from the
 * device, rather than choosing one row wholesale.
 */
export function mergeTrips(
  device: readonly DeviceTrip[],
  server: readonly ServerTrip[] | null,
): Trip[] {
  const out: Trip[] = [];
  const byReference = new Map<string, Trip>();
  const byReservation = new Map<string, Trip>();

  for (const d of device) {
    const reservationId = d.reservationId ?? d.status?.reservationId ?? null;
    const trip: Trip = {
      key: d.key,
      reference: d.reference,
      reservationId,
      title: d.status?.experience.title ?? "Your booking",
      startsAt: d.status?.slot.startsAt ?? null,
      timezone: d.status?.slot.timezone ?? null,
      state: d.status?.state ?? null,
      guests: d.status?.guests ?? null,
      token: d.token,
      dead: d.dead,
      fetchedAt: d.fetchedAt,
      onServer: false,
    };
    out.push(trip);
    if (d.reference) byReference.set(d.reference, trip);
    if (reservationId) byReservation.set(reservationId, trip);
  }

  for (const row of server ?? []) {
    const reference = row.reference?.trim() || null;
    const existing =
      (reference ? byReference.get(reference) : undefined) ??
      byReservation.get(row.reservationId);

    if (existing) {
      /*
        Same trip, two sources. Identity and access from the server, detail
        from the device — and the reference in particular, because a request
        the device saw before it was accepted has none while the server's row
        now might.
      */
      existing.onServer = true;
      existing.reference = reference ?? existing.reference;
      existing.reservationId = row.reservationId;
      existing.state = row.state;
      existing.guests = row.guests;
      existing.reasonCode = row.reasonCode;
      existing.token = row.statusToken || existing.token;
      // A fresh token from the server is exactly what un-kills a dead link.
      if (row.statusToken) existing.dead = false;
      if (!existing.title || existing.title === "Your booking") {
        existing.title = row.experience;
      }
      continue;
    }

    out.push({
      // Prefixed, so a server row can never collide with a device key.
      key: `srv:${row.reservationId}`,
      reference,
      reservationId: row.reservationId,
      title: row.experience,
      /*
        No instant on this row, only the market's local date and time. Joined
        as a naive local string rather than assumed to be UTC: reading
        "06:30 on the 14th" as an instant would move a dawn dive to the
        previous afternoon for anybody east of Greenwich, which is everybody
        here. Ordering below treats a naive string as naive.
      */
      startsAt: `${row.localDate}T${row.localTime}`,
      timezone: null,
      state: row.state,
      guests: row.guests,
      reasonCode: row.reasonCode,
      token: row.statusToken,
      dead: false,
      fetchedAt: null,
      onServer: true,
    });
  }

  return sortTrips(out);
}

/**
 * Upcoming first, soonest first; then everything past, most recent first.
 *
 * Somebody opening this on the morning of a dive wants the dive, not the thing
 * they did in March.
 *
 * ## Comparing two shapes of time
 *
 * A device trip carries a real instant; a server row carries the market's
 * local date and time with no zone. They are compared as strings after both
 * are reduced to `YYYY-MM-DDTHH:MM`, which sorts correctly for both because
 * ISO-8601 is lexicographically ordered — and because every departure in this
 * product is in one market. The alternative, parsing the naive string as UTC,
 * moves a 06:30 dive to the previous afternoon.
 */
function sortTrips(trips: Trip[]): Trip[] {
  const now = new Date().toISOString().slice(0, 16);
  const at = (t: Trip) => (t.startsAt ?? "").slice(0, 16);

  return [...trips].sort((a, b) => {
    const aAt = at(a);
    const bAt = at(b);
    // A trip with no date at all is a hold we have never opened. It goes last
    // rather than first: it is the least likely thing anybody came here for.
    if (!aAt || !bAt) return aAt ? -1 : bAt ? 1 : 0;

    const aUp = aAt >= now;
    const bUp = bAt >= now;
    if (aUp !== bUp) return aUp ? -1 : 1;
    return aUp ? aAt.localeCompare(bAt) : bAt.localeCompare(aAt);
  });
}
