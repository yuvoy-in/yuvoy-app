import { describe, it, expect, vi, beforeAll, beforeEach } from "vitest";
import {
  findByToken,
  forgetAllBookings,
  getSnapshot,
  listBookings,
  markTokenDead,
  rememberBooking,
  saveSnapshot,
} from "./token-store";
import type { components } from "@/lib/api/schema.gen";

type BookingStatus = components["schemas"]["BookingStatus"];

/**
 * The store's one-key rule, against an in-memory IndexedDB stand-in.
 *
 * jsdom has none, so `indexedDB` is stubbed present and `idb-keyval` is the
 * Map below. The fragment half of this module is covered in
 * `token-store.test.ts`; this file is the half that used to key tokens and
 * snapshots two different ways.
 */
const idb = vi.hoisted(() => ({
  mode: "ok" as "ok" | "reject",
  store: new Map<string, unknown>(),
}));
vi.mock("idb-keyval", () => ({
  get: async (k: string) => {
    if (idb.mode === "reject") throw new Error("InvalidStateError");
    return idb.store.get(k);
  },
  set: async (k: string, v: unknown) => {
    if (idb.mode === "reject") throw new Error("QuotaExceededError");
    idb.store.set(k, v);
  },
  del: async (k: string) => {
    idb.store.delete(k);
  },
  keys: async () => {
    if (idb.mode === "reject") throw new Error("InvalidStateError");
    return [...idb.store.keys()];
  },
}));

const status = (over: Partial<BookingStatus> = {}): BookingStatus =>
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
    ...over,
  }) as BookingStatus;

beforeAll(() => vi.stubGlobal("indexedDB", {}));
beforeEach(() => {
  idb.mode = "ok";
  idb.store.clear();
});

describe("one key per booking", () => {
  it("re-keys a checkout-time record the moment the reference is known", async () => {
    // Checkout knows only the reservation id.
    await rememberBooking({ reservationId: "res_1", token: "tok_a" });
    expect((await listBookings()).map((b) => b.key)).toEqual(["res_1"]);

    // The first status fetch knows both.
    await rememberBooking({
      reservationId: "res_1",
      reference: "YV-4K2M9P7Q",
      token: "tok_a",
    });
    const all = await listBookings();
    expect(all).toHaveLength(1);
    expect(all[0]).toMatchObject({
      key: "YV-4K2M9P7Q",
      reservationId: "res_1",
      reference: "YV-4K2M9P7Q",
      token: "tok_a",
    });
  });

  it("joins the snapshot on the same key, so the offline page finds it", async () => {
    await rememberBooking({ reservationId: "res_1", token: "tok_a" });
    await rememberBooking({
      reservationId: "res_1",
      reference: "YV-4K2M9P7Q",
      token: "tok_a",
    });
    await saveSnapshot("YV-4K2M9P7Q", status());

    const record = await findByToken("tok_a");
    expect(record?.key).toBe("YV-4K2M9P7Q");
    const snap = await getSnapshot(record!.key);
    expect(snap?.status.bookingReference).toBe("YV-4K2M9P7Q");
  });

  it("does not list a trip twice when the account list claims it too", async () => {
    await rememberBooking({ reservationId: "res_1", token: "tok_a" });
    await rememberBooking({
      reservationId: "res_1",
      reference: "YV-4K2M9P7Q",
      token: "tok_a",
    });
    // `/me/bookings` knows the reference and the token, never the reservation id.
    await rememberBooking({ reference: "YV-4K2M9P7Q", token: "tok_a" });

    const all = await listBookings();
    expect(all).toHaveLength(1);
    expect(all[0].reservationId).toBe("res_1");
  });

  it("overwrites a revoked token with the fresh one recovery minted", async () => {
    await rememberBooking({ reference: "YV-4K2M9P7Q", token: "tok_old" });
    await rememberBooking({
      reservationId: "res_1",
      reference: "YV-4K2M9P7Q",
      token: "tok_new",
    });

    const all = await listBookings();
    expect(all).toHaveLength(1);
    expect(all[0].token).toBe("tok_new");
    expect(await findByToken("tok_old")).toBeNull();
  });

  it("flags a dead link rather than deleting the trip", async () => {
    await rememberBooking({ reference: "YV-4K2M9P7Q", token: "tok_a" });
    await markTokenDead("tok_a");
    const [record] = await listBookings();
    expect(record.dead).toBe(true);
    expect(record.reference).toBe("YV-4K2M9P7Q");
  });

  it("still reads records written before `key` existed", async () => {
    idb.store.set("yuvoy.token.YV-OLD", {
      reference: "YV-OLD",
      token: "tok_legacy",
      savedAt: "2026-08-01T00:00:00Z",
    });
    const all = await listBookings();
    expect(all).toHaveLength(1);
    expect(all[0]).toMatchObject({ key: "YV-OLD", reference: "YV-OLD" });
  });
});

describe("nothing here may throw", () => {
  it("resolves false when the device refuses the write", async () => {
    idb.mode = "reject";
    await expect(
      rememberBooking({ reservationId: "res_1", token: "tok_a" }),
    ).resolves.toBe(false);
    await expect(saveSnapshot("YV-1", status())).resolves.toBe(false);
  });

  it("reads as empty when the device refuses to open", async () => {
    idb.mode = "reject";
    await expect(listBookings()).resolves.toEqual([]);
    await expect(getSnapshot("YV-1")).resolves.toBeNull();
    await expect(findByToken("tok_a")).resolves.toBeNull();
    await expect(markTokenDead("tok_a")).resolves.toBeUndefined();
  });
});

/**
 * Sign out forgets this phone's bookings (yuvoy-app#60 item 3).
 *
 * The owner's report was "after signing out, bookings still show in Trips",
 * and that is the visible half. The other half is that a status token is a
 * bearer credential which both opens a booking and can cancel it, so leaving
 * one behind is the same shape as leaving a session cookie behind.
 */
describe("forgetting everything", () => {
  it("clears every token and every snapshot", async () => {
    await rememberBooking({ reference: "YV-ONE", token: "tok_1" });
    await rememberBooking({ reference: "YV-TWO", token: "tok_2" });
    await saveSnapshot("YV-ONE", status());
    expect(await listBookings()).toHaveLength(2);

    await forgetAllBookings();

    expect(await listBookings()).toEqual([]);
    expect(await getSnapshot("YV-ONE")).toBeNull();
    expect(await findByToken("tok_1")).toBeNull();
  });

  it("reaches records that listing cannot", async () => {
    /*
      The reason this sweeps the keyspace rather than iterating `listBookings`.
      A record `normalise` cannot read is dropped from the listing, so an
      iterating version would leave it on the phone forever, with nothing able
      to see it. A record written by an older version of this app is exactly
      that shape.

      The orphan snapshot is the same argument pointed the other way: its token
      record is gone, so nothing lists it, and it is still a copy of somebody's
      booking, meeting point and party included.
    */
    idb.store.set("yuvoy.token.YV-BROKEN", { nonsense: true });
    idb.store.set("yuvoy.booking.YV-ORPHAN", { also: "nonsense" });
    expect(await listBookings()).toEqual([]);

    await forgetAllBookings();

    expect([...idb.store.keys()]).toEqual([]);
  });

  it("leaves keys that are not ours alone", async () => {
    // The store is shared with whatever else the app keeps in IndexedDB.
    // Signing out of Yuvoy is not a reason to clear somebody else's data.
    idb.store.set("yuvoy.saved.v1", ["exp_1"]);
    idb.store.set("something.else", 1);
    await rememberBooking({ reference: "YV-ONE", token: "tok_1" });

    await forgetAllBookings();

    expect([...idb.store.keys()].sort()).toEqual([
      "something.else",
      "yuvoy.saved.v1",
    ]);
  });

  it("resolves even when the device refuses to open", async () => {
    // Sign out must complete on a phone with no usable IndexedDB as surely as
    // on one with it, or a refusal would leave somebody signed in.
    idb.mode = "reject";
    await expect(forgetAllBookings()).resolves.toBeUndefined();
  });
});
