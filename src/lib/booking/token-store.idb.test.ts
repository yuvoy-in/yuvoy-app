import { describe, it, expect, vi, beforeAll, beforeEach } from "vitest";
import {
  findByToken,
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
