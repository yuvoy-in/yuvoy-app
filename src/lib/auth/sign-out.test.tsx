import { describe, it, expect, vi, beforeAll, beforeEach } from "vitest";
import { act } from "@testing-library/react";
import { renderWithQuery } from "@/test/render";
import { useTravellerSession } from "./use-traveller";
import {
  rememberBooking,
  listBookings,
  saveSnapshot,
} from "@/lib/booking/token-store";
import type { components } from "@/lib/api/schema.gen";

type BookingStatus = components["schemas"]["BookingStatus"];

/**
 * Signing out forgets this phone's bookings (yuvoy-app#60 item 3).
 *
 * `token-store.idb.test.ts` proves `forgetAllBookings` clears the store. This
 * proves the thing that actually matters, that SIGN OUT calls it: the owner's
 * report was about a screen, and a correct helper nobody reached would have
 * left the report true.
 *
 * Deliberately not asserted through the Account screen. What is being pinned
 * is a side effect of `signOut`, and routing it through a button, a session
 * cookie mock and two rerenders would put four other things between the defect
 * and the assertion.
 */

const idb = vi.hoisted(() => ({ store: new Map<string, unknown>() }));
vi.mock("idb-keyval", () => ({
  get: async (k: string) => idb.store.get(k),
  set: async (k: string, v: unknown) => void idb.store.set(k, v),
  del: async (k: string) => void idb.store.delete(k),
  keys: async () => [...idb.store.keys()],
}));

beforeAll(() => vi.stubGlobal("indexedDB", {}));
beforeEach(() => idb.store.clear());

const status = () =>
  ({
    reservationId: "res_1",
    state: "confirmed",
    final: true,
    guests: 2,
    bookingReference: "YV-ONDEVICE",
    experience: {
      slug: "try-dive-nemo-reef",
      title: "Try-dive at Nemo Reef",
      operator: "Sample Dive Operator",
    },
    slot: { startsAt: "2026-08-22T01:30:00Z", timezone: "Asia/Kolkata" },
    price: { totalPaise: 900000, currency: "INR" },
  }) as BookingStatus;

/** Hands the hook's `signOut` out so a test can call it directly. */
function Harness({ onReady }: { onReady: (fn: () => Promise<void>) => void }) {
  const { signOut } = useTravellerSession();
  onReady(signOut);
  return null;
}

describe("signing out", () => {
  it("clears every booking saved on this device", async () => {
    await rememberBooking({ reference: "YV-ONDEVICE", token: "tok_device" });
    await saveSnapshot("YV-ONDEVICE", status());
    expect(await listBookings()).toHaveLength(1);

    let signOut!: () => Promise<void>;
    renderWithQuery(<Harness onReady={(fn) => (signOut = fn)} />);

    await act(async () => {
      await signOut();
    });

    expect(await listBookings()).toEqual([]);
    /*
      The snapshot too, not only the token. It is a whole `BookingStatus`: the
      experience, the party, the meeting point and what was paid.
    */
    expect([...idb.store.keys()]).toEqual([]);
  });

  it("clears the device even when the sign-out request fails", async () => {
    /*
      The route is told first and its answer is deliberately ignored, because a
      traveller who taps sign out on a jetty with no signal must still be
      signed out on the phone in front of them. The device half has to hold
      under exactly that condition, or sign out becomes something that only
      works online.
    */
    vi.stubGlobal(
      "fetch",
      vi.fn(async () => {
        throw new Error("offline");
      }),
    );
    await rememberBooking({ reference: "YV-ONDEVICE", token: "tok_device" });

    let signOut!: () => Promise<void>;
    renderWithQuery(<Harness onReady={(fn) => (signOut = fn)} />);

    await act(async () => {
      await signOut();
    });

    expect(await listBookings()).toEqual([]);
    vi.unstubAllGlobals();
    vi.stubGlobal("indexedDB", {});
  });
});
