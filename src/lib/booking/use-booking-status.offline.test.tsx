import {
  describe,
  it,
  expect,
  vi,
  beforeAll,
  beforeEach,
  afterEach,
} from "vitest";
import { waitFor } from "@testing-library/react";
import { onlineManager } from "@tanstack/react-query";
import { http, HttpResponse } from "msw";
import { renderWithQuery } from "@/test/render";
import { server } from "../../../mocks/server";
import { useBookingStatus } from "./use-booking-status";
import { rememberBooking, saveSnapshot } from "./token-store";
import type { components } from "@/lib/api/schema.gen";

type BookingStatus = components["schemas"]["BookingStatus"];

/**
 * The booking saved on the device, once the phone has gone offline
 * (production readiness, 6 Oct 2026).
 *
 * T9's promise is that this screen works "even if WhatsApp, email and signal
 * all fail". The saved copy is shown when a read fails, and a read started
 * after the browser said it was offline did not fail: it waited for the
 * signal, so the screen was a spinner with the booking already on the phone.
 */

const BASE = process.env.NEXT_PUBLIC_API_URL ?? "http://localhost:8099/v1";

const idb = vi.hoisted(() => ({ store: new Map<string, unknown>() }));
vi.mock("idb-keyval", () => ({
  get: async (k: string) => idb.store.get(k),
  set: async (k: string, v: unknown) => void idb.store.set(k, v),
  del: async (k: string) => void idb.store.delete(k),
  keys: async () => [...idb.store.keys()],
}));

beforeAll(() => vi.stubGlobal("indexedDB", {}));
beforeEach(() => idb.store.clear());
afterEach(() => onlineManager.setOnline(true));

const status = {
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
} as BookingStatus;

function Harness({
  token,
  onState,
}: {
  token: string;
  onState: (state: ReturnType<typeof useBookingStatus>) => void;
}) {
  onState(useBookingStatus(token));
  return null;
}

describe("a booking opened after the phone went offline", () => {
  it("shows what was saved on the device, rather than waiting for a signal", async () => {
    await rememberBooking({ reference: "YV-ONDEVICE", token: "tok_device" });
    await saveSnapshot("YV-ONDEVICE", status);
    server.use(http.get(`${BASE}/bookings/status`, () => HttpResponse.error()));
    onlineManager.setOnline(false);

    let latest: ReturnType<typeof useBookingStatus> | undefined;
    renderWithQuery(
      <Harness token="tok_device" onState={(state) => (latest = state)} />,
    );

    await waitFor(
      () =>
        expect(latest?.snapshot?.status.bookingReference).toBe("YV-ONDEVICE"),
      { timeout: 3_000 },
    );
    expect(latest?.isLoadingError).toBe(true);
  });
});
