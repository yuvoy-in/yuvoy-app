import {
  describe,
  it,
  expect,
  vi,
  beforeAll,
  beforeEach,
  afterEach,
} from "vitest";
import { screen, cleanup, waitFor } from "@testing-library/react";
import { http, HttpResponse } from "msw";
import { renderWithQuery } from "@/test/render";
import { TripsScreen } from "./trips-screen";
import { server } from "../../../mocks/server";
import { __signInAppRouteMock } from "../../../mocks/app-route-handlers";
import { rememberBooking } from "@/lib/booking/token-store";

const BASE = process.env.NEXT_PUBLIC_API_URL ?? "http://localhost:8099/v1";

/*
  An in-memory IndexedDB, because jsdom has none and this screen is built on
  one: the device's trips and the session both live in `idb-keyval`, and
  without a stand-in every store read answers empty and every test here passes
  against a screen with nothing on it. Same stub `token-store.idb.test.ts`
  uses.
*/
const idb = vi.hoisted(() => ({ store: new Map<string, unknown>() }));
vi.mock("idb-keyval", () => ({
  get: async (k: string) => idb.store.get(k),
  set: async (k: string, v: unknown) => void idb.store.set(k, v),
  del: async (k: string) => void idb.store.delete(k),
  keys: async () => [...idb.store.keys()],
}));

vi.mock("next/navigation", () => ({
  useRouter: () => ({ push: vi.fn(), replace: vi.fn() }),
  usePathname: () => "/trips",
  useSearchParams: () => new URLSearchParams(),
}));

beforeAll(() => vi.stubGlobal("indexedDB", {}));
beforeEach(() => {
  idb.store.clear();
});
afterEach(cleanup);

/*
  Signed in means "the cookie is set", and the cookie is server-side now
  (yuvoy-app#57). Nothing in the browser holds a token, so a test cannot put
  one in storage to sign in; it flips the flag the app-route mock keeps where
  the real route keeps a cookie. See mocks/app-route-handlers.ts.
*/
const signIn = () => __signInAppRouteMock("sess_test");

/** The server's answer, with only what a test cares about spelled out. */
function serverBookings(
  rows: Partial<Record<string, unknown>>[],
): ReturnType<typeof http.get> {
  return http.get(`${BASE}/me/bookings`, () =>
    HttpResponse.json({
      bookings: rows.map((r) => ({
        reference: "YV-SERVER11",
        reservationId: "res_server",
        experience: "Snorkel trip to Elephant Beach",
        operator: "Sample Boat Operator",
        localDate: "2026-12-24",
        localTime: "09:00",
        state: "confirmed",
        guests: 2,
        statusToken: "tok_server",
        ...r,
      })),
    }),
  );
}

/**
 * The Trips tab — yuvoy-app#34.
 *
 * This file's own comment promised the merge and never did it: T11 shipped on
 * the Account tab instead, so a signed-in traveller had two lists of
 * overlapping bookings, in two places, with different cards.
 */
describe("signed out", () => {
  it("still works on the device alone, and asks for nothing", async () => {
    /*
      Checkout is unauthenticated: the status token is the access and the
      device store is the only copy a guest has. That is what makes this screen
      work with no account and no signal, and it does not change.
    */
    let called = false;
    server.use(
      http.get(`${BASE}/me/bookings`, () => {
        called = true;
        return HttpResponse.json({ bookings: [] });
      }),
    );
    await rememberBooking({ reference: "YV-ONDEVICE", token: "tok_device" });

    renderWithQuery(<TripsScreen />);
    expect(await screen.findByText("YV-ONDEVICE")).toBeInTheDocument();
    await new Promise((r) => setTimeout(r, 50));
    expect(called).toBe(false);
  });

  it("offers signing in as the way to the rest, not only recovery", async () => {
    /*
      It used to say "Booked on another phone? Get your link back", pointing at
      recovery — the only route there was. Signing in works for a number that
      has never booked and revokes nothing, where recovery rotates the links
      already on this phone.
    */
    renderWithQuery(<TripsScreen />);
    expect(
      await screen.findByRole("link", { name: /Sign in with my number/ }),
    ).toHaveAttribute("href", "/account");
    expect(
      screen.getByRole("link", { name: /Get a new one sent/ }),
    ).toHaveAttribute("href", "/trips/recover");
  });
});

describe("signed in", () => {
  it("shows a trip booked on another phone beside the device's own", async () => {
    await signIn();
    await rememberBooking({ reference: "YV-ONDEVICE", token: "tok_device" });
    server.use(serverBookings([{}]));

    renderWithQuery(<TripsScreen />);
    expect(await screen.findByText("YV-ONDEVICE")).toBeInTheDocument();
    expect(await screen.findByText("YV-SERVER11")).toBeInTheDocument();
  });

  it("shows a booking on both sources ONCE", async () => {
    await signIn();
    await rememberBooking({ reference: "YV-SERVER11", token: "tok_device" });
    server.use(serverBookings([{}]));

    renderWithQuery(<TripsScreen />);
    await screen.findByText("YV-SERVER11");
    await waitFor(() =>
      expect(screen.getAllByText("YV-SERVER11")).toHaveLength(1),
    );
  });

  it("shows a request still waiting, and says so instead of a reference", async () => {
    /*
      `GET /me/bookings` lists it with `state: pending_request` and an EMPTY
      reference. An internal id styled as a reference is a number somebody will
      read out at a jetty to no effect.
    */
    await signIn();
    server.use(
      serverBookings([
        {
          reference: "",
          reservationId: "res_waiting",
          state: "pending_request",
          experience: "Mangrove kayak at dawn",
        },
      ]),
    );

    renderWithQuery(<TripsScreen />);
    expect(
      await screen.findByText("Mangrove kayak at dawn"),
    ).toBeInTheDocument();
    expect(screen.getByText("Waiting for the operator")).toBeInTheDocument();
    expect(screen.queryByText("res_waiting")).toBeNull();
  });

  it("does not list a waiting request twice when the device knows it too", async () => {
    // The case the reference-only match breaks: two cards, two tokens, one of
    // which may be dead.
    await signIn();
    await rememberBooking({
      reservationId: "res_waiting",
      token: "tok_device",
    });
    server.use(
      serverBookings([
        {
          reference: "",
          reservationId: "res_waiting",
          state: "pending_request",
          experience: "Mangrove kayak at dawn",
        },
      ]),
    );

    renderWithQuery(<TripsScreen />);
    await screen.findByText("Mangrove kayak at dawn");
    await waitFor(() =>
      expect(screen.getAllByRole("listitem")).toHaveLength(1),
    );
  });

  it("opens a trip on the server's own token", async () => {
    // "A booking link for this trip, minted for this response, so a trip booked
    // on another phone opens here."
    await signIn();
    server.use(serverBookings([{}]));

    renderWithQuery(<TripsScreen />);
    const row = (await screen.findByText("YV-SERVER11")).closest("a")!;
    expect(row.getAttribute("href")).toContain("tok_server");
  });

  it("says a dead session has expired, and keeps the device's trips", async () => {
    /*
      `retry: false` means this will not resolve itself, so a Trips tab quietly
      missing half of somebody's bookings would stay that way.
    */
    await signIn();
    await rememberBooking({ reference: "YV-ONDEVICE", token: "tok_device" });
    server.use(
      http.get(`${BASE}/me/bookings`, () =>
        HttpResponse.json(
          { error: { code: "token_expired", message: "gone" } },
          { status: 401 },
        ),
      ),
    );

    renderWithQuery(<TripsScreen />);
    expect(
      await screen.findByText("Your sign-in has expired"),
    ).toBeInTheDocument();
    // The device's own trips are unaffected and still listed.
    expect(screen.getByText("YV-ONDEVICE")).toBeInTheDocument();
  });
});
