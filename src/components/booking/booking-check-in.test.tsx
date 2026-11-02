import {
  describe,
  it,
  expect,
  vi,
  beforeAll,
  beforeEach,
  afterEach,
} from "vitest";
import { act, cleanup, screen } from "@testing-library/react";
import { onlineManager } from "@tanstack/react-query";
import { http, HttpResponse } from "msw";
import { renderWithQuery } from "@/test/render";
import { server } from "../../../mocks/server";
import { mockHeaders, mockNow } from "../../../mocks/fixtures";
import { mockCheckIn } from "../../../mocks/check-in";
import { BookingScreen } from "./booking-screen";
import { qrPath } from "@/lib/format/qr-path";
import { recordServerDate } from "@/lib/booking/clock";
import { rememberBooking, saveSnapshot } from "@/lib/booking/token-store";
import type { components } from "@/lib/api/schema.gen";

type BookingStatus = components["schemas"]["BookingStatus"];

/**
 * Show at check-in on the booking page (yuvoy-app#218): through the real
 * screen, against the status the API sends. The trip is 07:00 IST on Saturday
 * 22 August; the mock's clock is the morning of the 19th.
 */

const BASE = process.env.NEXT_PUBLIC_API_URL ?? "http://localhost:8099/v1";
const LINK = "https://operators.yuvoy.in/check-in#YV-4K2M9P7Q.K7QM2XPA";

const idb = vi.hoisted(() => ({ store: new Map<string, unknown>() }));
vi.mock("idb-keyval", () => ({
  get: async (k: string) => idb.store.get(k),
  set: async (k: string, v: unknown) => void idb.store.set(k, v),
  del: async (k: string) => void idb.store.delete(k),
  keys: async () => [...idb.store.keys()],
}));

function statusBody(over: Record<string, unknown> = {}) {
  return {
    reservationId: "res_1",
    state: "confirmed",
    final: true,
    guests: 2,
    contactName: "Asha Menon",
    bookingReference: "YV-4K2M9P7Q",
    experience: {
      slug: "try-dive-nemo-reef",
      title: "Try-dive at Nemo Reef",
      operator: "Sample Dive Operator",
    },
    slot: { startsAt: "2026-08-22T01:30:00Z", timezone: "Asia/Kolkata" },
    price: { totalPaise: 900000, currency: "INR" },
    ...over,
  };
}

const CHECK_IN = { code: "K7QM-2XPA", link: LINK, validOn: "2026-08-22" };

function answer(body: Record<string, unknown>) {
  server.use(
    http.get(`${BASE}/bookings/status`, () =>
      HttpResponse.json(body, { headers: mockHeaders("req_check_in") }),
    ),
  );
}

const block = () =>
  document.querySelector<HTMLElement>("[data-check-in]") ?? null;

beforeAll(() => vi.stubGlobal("indexedDB", {}));
beforeEach(() => {
  idb.store.clear();
  window.location.hash = "#t=tok_test";
});
afterEach(() => {
  cleanup();
  onlineManager.setOnline(true);
  vi.useRealTimers();
});

describe("show at check-in", () => {
  it("shows the QR, the code, the day and the hint, above the details", async () => {
    answer(statusBody({ checkIn: CHECK_IN }));
    renderWithQuery(<BookingScreen />);

    expect(await screen.findByText("K7QM-2XPA")).toBeVisible();
    // Read out one character at a time.
    expect(
      screen.getByText("Check-in code K 7 Q M, 2 X P A"),
    ).toBeInTheDocument();
    const panel = block()!;
    expect(panel).toHaveTextContent("Show at check-in");
    expect(panel).toHaveTextContent("For Saturday, 22 August");
    expect(panel).toHaveTextContent(/It also works the day before\.$/);
    // Before the booking's details, where the reference is.
    const reference = screen.getByText("YV-4K2M9P7Q");
    expect(
      panel.compareDocumentPosition(reference) &
        Node.DOCUMENT_POSITION_FOLLOWING,
    ).toBeTruthy();
  });

  it("draws the link's code module for module, and never the token's", async () => {
    answer(statusBody({ checkIn: CHECK_IN }));
    renderWithQuery(<BookingScreen />);

    const qr = await screen.findByRole("img", { name: "Check-in QR code" });
    const d = qr.querySelector("path")!.getAttribute("d");
    expect(d).toBe(qrPath(LINK)!.d);
    expect(d).not.toBe(qrPath("tok_test")!.d);
    expect(qr.getAttribute("width")).toBe("232");
  });

  it("draws nothing at all when the API sends no checkIn", async () => {
    answer(statusBody());
    renderWithQuery(<BookingScreen />);
    await screen.findByText("YV-4K2M9P7Q");
    expect(block()).toBeNull();
    expect(screen.queryByText("Show at check-in")).toBeNull();
  });

  it("says when it was used, in place of the day and the hint", async () => {
    answer(
      statusBody({
        checkIn: { ...CHECK_IN, checkedInAt: "2026-08-22T07:42:00+05:30" },
      }),
    );
    renderWithQuery(<BookingScreen />);

    const used = await screen.findByText("Checked in at 07:42");
    expect(used).toBeVisible();
    expect(block()).not.toHaveTextContent("For Saturday");
    expect(block()).not.toHaveTextContent("It also works the day before");
    expect(block()!.querySelector(".eyebrow-tick")).not.toBeNull();
  });

  describe("the day it works", () => {
    /*
      The server's clock as the page reads it: the mocks' `Date` header sets
      it apart from this device's, so the device is put where the server's
      clock lands on the minute wanted.
    */
    function serverAt(iso: string) {
      vi.useFakeTimers({ toFake: ["Date", "setInterval", "clearInterval"] });
      const skew = mockNow() - Date.now();
      vi.setSystemTime(Date.parse(iso) - skew);
    }

    // No lower bound, as the app: the issue only says when it goes.
    it("shows from the first read, a week before the trip's day included", async () => {
      serverAt("2026-08-15T04:30:00Z");
      answer(statusBody({ checkIn: CHECK_IN }));
      renderWithQuery(<BookingScreen />);
      expect(await screen.findByText("K7QM-2XPA")).toBeVisible();
    });

    it("goes once the trip's day is over, on a page left open", async () => {
      serverAt("2026-08-22T18:28:00Z");
      answer(statusBody({ checkIn: CHECK_IN }));
      renderWithQuery(<BookingScreen />);
      expect(await screen.findByText("K7QM-2XPA")).toBeVisible();

      act(() => vi.advanceTimersByTime(3 * 60_000));
      expect(block()).toBeNull();
      expect(screen.getByText("YV-4K2M9P7Q")).toBeVisible();
    });
  });

  it("is on the copy kept on this device, with no signal", async () => {
    await rememberBooking({ reference: "YV-4K2M9P7Q", token: "tok_test" });
    await saveSnapshot(
      "YV-4K2M9P7Q",
      statusBody({ checkIn: CHECK_IN }) as BookingStatus,
    );
    // The clock the page last read from the server: the mock's morning.
    recordServerDate(new Date(mockNow()).toUTCString());
    server.use(http.get(`${BASE}/bookings/status`, () => HttpResponse.error()));
    onlineManager.setOnline(false);

    renderWithQuery(<BookingScreen />);
    expect(await screen.findByText(/You are offline/)).toBeVisible();
    expect(screen.getByText("K7QM-2XPA")).toBeVisible();
    expect(
      screen.getByRole("img", { name: "Check-in QR code" }),
    ).toBeInTheDocument();
  });
});

describe("the mocks' check-in scenarios", () => {
  it("send a code only under check-in or checked-in, while confirmed or settling", () => {
    expect(mockCheckIn(null, "confirmed", "YV-1")).toEqual({});
    expect(mockCheckIn("check-in", "holding", "YV-1")).toEqual({});
    expect(mockCheckIn("check-in", "cancelled", "YV-1")).toEqual({});
    expect(mockCheckIn("check-in", "verifying", "YV-1")).toEqual({
      checkIn: {
        code: "K7QM-2XPA",
        link: "https://operators.yuvoy.in/check-in#YV-1.K7QM2XPA",
        validOn: "2026-08-22",
      },
    });
    expect(
      mockCheckIn("checked-in", "confirmed", "YV-1").checkIn?.checkedInAt,
    ).toBe("2026-08-22T07:42:00+05:30");
  });
});
