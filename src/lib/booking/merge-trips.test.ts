import { describe, it, expect } from "vitest";
import { mergeTrips, type DeviceTrip, type ServerTrip } from "./merge-trips";

/**
 * The device's trips and the number's trips, as one list — yuvoy-app#34.
 *
 * The interesting cases are all about IDENTITY. Get matching wrong and a
 * traveller sees the same booking twice, with two different tokens, one of
 * which may be dead — which is worse than either list alone.
 */

const device = (over: Partial<DeviceTrip> = {}): DeviceTrip => ({
  key: "YV-AAAA1111",
  reference: "YV-AAAA1111",
  reservationId: "res_1",
  token: "tok_device",
  savedAt: "2026-08-20T00:00:00Z",
  dead: false,
  status: null,
  fetchedAt: "2026-08-20T00:00:00Z",
  ...over,
});

const server = (over: Partial<ServerTrip> = {}): ServerTrip =>
  ({
    reference: "YV-AAAA1111",
    reservationId: "res_1",
    experience: "Try-dive at Nemo Reef",
    operator: "Sample Dive Operator",
    localDate: "2026-08-22",
    localTime: "07:00",
    state: "confirmed",
    guests: 2,
    statusToken: "tok_server",
    ...over,
  }) as ServerTrip;

describe("matching", () => {
  it("shows one card when both sources have the same booking", () => {
    const trips = mergeTrips([device()], [server()]);
    expect(trips).toHaveLength(1);
    expect(trips[0].onServer).toBe(true);
  });

  it("matches a WAITING REQUEST by reservationId, because it has no reference", () => {
    /*
      The case the issue names and the one that breaks silently. A request the
      operator has not answered is listed with `state: pending_request` and an
      EMPTY reference — not a missing key, an empty string. A merge that only
      matched on reference would list every waiting request twice, once from
      each source, with two different tokens.
    */
    const trips = mergeTrips(
      [device({ key: "res_9", reference: null, reservationId: "res_9" })],
      [
        server({
          reference: "",
          reservationId: "res_9",
          state: "pending_request",
        }),
      ],
    );
    expect(trips).toHaveLength(1);
    expect(trips[0].state).toBe("pending_request");
    expect(trips[0].reference).toBeNull();
  });

  it("keeps a trip only one source knows about", () => {
    const trips = mergeTrips(
      [
        device({
          key: "YV-ONLYDEV",
          reference: "YV-ONLYDEV",
          reservationId: "res_dev",
        }),
      ],
      [server({ reference: "YV-ONLYSRV", reservationId: "res_srv" })],
    );
    expect(trips).toHaveLength(2);
    expect(trips.filter((t) => t.onServer)).toHaveLength(1);
  });

  it("cannot collide a server key with a device key", () => {
    // A device record is keyed by its reference or reservation id, and so is a
    // server row. Prefixing keeps React from remounting the wrong card.
    const trips = mergeTrips([], [server({ reservationId: "YV-AAAA1111" })]);
    expect(trips[0].key).toBe("srv:YV-AAAA1111");
  });
});

describe("what each source contributes", () => {
  it("takes the fresher token from the server", () => {
    /*
      Each row's `statusToken` is minted for that response and revokes nothing,
      so it is at least as good as the device's copy.
    */
    const trips = mergeTrips([device({ token: "tok_old" })], [server()]);
    expect(trips[0].token).toBe("tok_server");
  });

  it("brings a dead link back to life", () => {
    /*
      The case a traveller signs in to fix. The device's link has been rotated
      away by a recovery; the server hands out a fresh one for the same trip,
      so the card stops being a dead end.
    */
    const trips = mergeTrips([device({ dead: true })], [server()]);
    expect(trips[0].dead).toBe(false);
    expect(trips[0].token).toBe("tok_server");
  });

  it("keeps the device's detail, which the server row does not carry", () => {
    // The server row has a local date and time and no instant, no zone and no
    // snapshot. Choosing one row wholesale would throw that away.
    const trips = mergeTrips(
      [
        device({
          fetchedAt: "2026-08-21T00:00:00Z",
          status: {
            reservationId: "res_1",
            state: "confirmed",
            final: true,
            guests: 2,
            bookingReference: "YV-AAAA1111",
            experience: {
              slug: "s",
              title: "The device's title",
              operator: "o",
            },
            slot: {
              startsAt: "2026-08-22T01:30:00Z",
              timezone: "Asia/Kolkata",
            },
            price: { totalPaise: 1, currency: "INR" },
          } as DeviceTrip["status"],
        }),
      ],
      [server()],
    );
    expect(trips[0].startsAt).toBe("2026-08-22T01:30:00Z");
    expect(trips[0].timezone).toBe("Asia/Kolkata");
    expect(trips[0].fetchedAt).toBe("2026-08-21T00:00:00Z");
  });

  it("takes a reference the device did not have yet", () => {
    // A request the device saw before it was accepted has none; the server's
    // row now might.
    const trips = mergeTrips(
      [device({ key: "res_1", reference: null })],
      [server({ reference: "YV-NEWREF" })],
    );
    expect(trips[0].reference).toBe("YV-NEWREF");
  });

  it("carries the reason a request was declined", () => {
    // api#175. A declined request stays in the list and says why.
    const trips = mergeTrips(
      [],
      [server({ state: "declined", reasonCode: "weather" })],
    );
    expect(trips[0].reasonCode).toBe("weather");
  });
});

describe("ordering", () => {
  it("puts upcoming first, soonest first", () => {
    const soon = new Date(Date.now() + 86_400_000).toISOString();
    const later = new Date(Date.now() + 3 * 86_400_000).toISOString();
    const past = new Date(Date.now() - 86_400_000).toISOString();

    const trips = mergeTrips(
      [
        device({
          key: "a",
          reference: "a",
          reservationId: "ra",
          status: at(past),
        }),
        device({
          key: "b",
          reference: "b",
          reservationId: "rb",
          status: at(later),
        }),
        device({
          key: "c",
          reference: "c",
          reservationId: "rc",
          status: at(soon),
        }),
      ],
      null,
    );
    expect(trips.map((t) => t.key)).toEqual(["c", "b", "a"]);
  });

  it("does not read a server row's naive time as UTC", () => {
    /*
      A server row carries the market's local date and time with no zone.
      Parsing "2026-08-22T06:30" as an instant moves a dawn dive to the
      previous afternoon for anybody east of Greenwich, which is everybody
      here — and reorders the list with it. It is compared as a string.
    */
    // A day well ahead, so both rows are upcoming and the earlier one leads.
    // A fixed past date would sort descending and pass for the wrong reason.
    const day = new Date(Date.now() + 30 * 86_400_000)
      .toISOString()
      .slice(0, 10);
    const trips = mergeTrips(
      [],
      [
        server({ reservationId: "r1", localDate: day, localTime: "06:30" }),
        server({ reservationId: "r2", localDate: day, localTime: "05:00" }),
      ],
    );
    expect(trips[0].startsAt).toBe(`${day}T05:00`);

    /*
      And the naive string is kept naive. Read as UTC, `T05:00` is 10:30 IST
      and `T06:30` is noon — the pair would still sort this way, which is why
      the assertion above is not enough on its own. What must not happen is the
      value being converted at all.
    */
    expect(trips[0].timezone).toBeNull();
  });

  it("puts a trip with no date at all last", () => {
    // A hold this device has never opened. It is the least likely thing
    // anybody came here for.
    const soon = new Date(Date.now() + 86_400_000).toISOString();
    const trips = mergeTrips(
      [
        device({ key: "unknown", reference: null, reservationId: "r0" }),
        device({
          key: "known",
          reference: "k",
          reservationId: "r1",
          status: at(soon),
        }),
      ],
      null,
    );
    expect(trips.map((t) => t.key)).toEqual(["known", "unknown"]);
  });
});

function at(startsAt: string): DeviceTrip["status"] {
  return {
    reservationId: "res_x",
    state: "confirmed",
    final: true,
    guests: 1,
    experience: { slug: "s", title: "T", operator: "o" },
    slot: { startsAt, timezone: "Asia/Kolkata" },
    price: { totalPaise: 1, currency: "INR" },
  } as DeviceTrip["status"];
}
