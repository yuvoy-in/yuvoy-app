import {
  describe,
  it,
  expect,
  vi,
  beforeAll,
  beforeEach,
  afterEach,
} from "vitest";
import { screen, cleanup, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { delay, http, HttpResponse } from "msw";
import { renderWithQuery } from "@/test/render";
import { TripsScreen } from "./trips-screen";
import { server } from "../../../mocks/server";
import { __signInAppRouteMock } from "../../../mocks/app-route-handlers";
import { marketDaysFrom, marketToday } from "@/lib/booking/availability-window";

const BASE = process.env.NEXT_PUBLIC_API_URL ?? "http://localhost:8099/v1";

/*
  An in-memory IndexedDB, because jsdom has none and this screen is built on
  one: the device's trips and the session both live in `idb-keyval`, and
  without a stand-in every store read answers empty and every test here passes
  against a screen with nothing on it. Same stub `token-store.idb.test.ts`
  uses.
*/
const idb = vi.hoisted(() => ({
  store: new Map<string, unknown>(),
  /** Every key read, in order. */
  reads: [] as string[],
  /** Keys whose read never answers, for a test of the wait itself. */
  hang: new Set<string>(),
}));
vi.mock("idb-keyval", () => ({
  get: async (k: string) => {
    idb.reads.push(k);
    if (idb.hang.has(k)) return new Promise(() => {});
    return idb.store.get(k);
  },
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
  idb.reads.length = 0;
  idb.hang.clear();
  sent.length = 0;
});
afterEach(cleanup);

/*
  Signed in means "the cookie is set", and the cookie is server-side now
  (yuvoy-app#57). Nothing in the browser holds a token, so a test cannot put
  one in storage to sign in; it flips the flag the app-route mock keeps where
  the real route keeps a cookie. See mocks/app-route-handlers.ts.
*/
const signIn = () => __signInAppRouteMock("sess_test");

/** Every query the screen has sent to `/me/bookings`, for the tab assertions. */
const sent: URLSearchParams[] = [];

/**
 * The server's answer, with only what a test cares about spelled out.
 *
 * `nextCursor` defaults to null, so nothing pages unless a test asks. Every
 * request's query is recorded: the tab and the date range travel as parameters
 * and a cursor from a different query is refused with `invalid_input`, so
 * "which query was actually sent" is the thing worth asserting.
 */
function serverBookings(
  rows:
    | Partial<Record<string, unknown>>[]
    | ((read: number) => Partial<Record<string, unknown>>[]),
  answer: { nextCursor?: string | null } = {},
): ReturnType<typeof http.get> {
  let reads = 0;
  return http.get(`${BASE}/me/bookings`, ({ request }) => {
    sent.push(new URL(request.url).searchParams);
    reads += 1;
    return HttpResponse.json({
      nextCursor: answer.nextCursor ?? null,
      bookings: (typeof rows === "function" ? rows(reads) : rows).map((r) => ({
        reference: "YV-SERVER11",
        reservationId: "res_server",
        experience: "Snorkel trip to Elephant Beach",
        operator: "Sample Boat Operator",
        localDate: "2026-12-24",
        localTime: "09:00",
        state: "confirmed",
        guests: 2,
        statusToken: "tok_server",
        experienceSlug: "snorkel-elephant-beach",
        operatorSlug: "sample-boat-operator",
        heroImageUrl: null,
        destination: "Havelock",
        startsAt: "2026-12-24T03:30:00Z",
        timezone: "Asia/Kolkata",
        createdAt: "2026-09-14T06:00:00Z",
        price: { totalPaise: 900000, currency: "INR" },
        reviewed: false,
        canReview: false,
        ...r,
      })),
    });
  });
}

/** No invited trips, for a test that wants only the booked ones. */
const noInvites = () =>
  server.use(
    http.get(`${BASE}/me/invited-trips`, () =>
      HttpResponse.json({ trips: [] }),
    ),
  );

/**
 * Your island days (the approved redesign: traveller A with C's day plan in
 * Trips, 3 Oct 2026). The plan's rules are `lib/trips/stay.test.ts`; these
 * pin the screen: setting the days, what a day says, and what it never claims.
 *
 * The days live on the account since yuvoy-api#257, so a test keeps them
 * there through the mock API, as another phone would, and reads them back
 * the same way: the screen is right only if the API has what it shows.
 */
describe("your island days", () => {
  const STAY_KEY = "yuvoy:stay:v1";
  const SESSION = "Bearer sess_test";
  const days = (n: number) => marketDaysFrom(marketToday(), n);

  /** Days kept on the account before the screen opens, as another phone would. */
  const keepOnAccount = async (from: string, to: string) => {
    const kept = await fetch(`${BASE}/me/stay`, {
      method: "PUT",
      headers: { Authorization: SESSION, "Content-Type": "application/json" },
      body: JSON.stringify({ from, to }),
    });
    expect(kept.status).toBe(200);
  };

  /** What the account holds now, read straight from the API. */
  const accountStay = async () => {
    const me = await fetch(`${BASE}/me`, {
      headers: { Authorization: SESSION },
    });
    return ((await me.json()) as { stay: unknown }).stay;
  };

  it("puts each trip on its day, and offers what runs on a free one", async () => {
    const [today, tomorrow] = days(2);
    signIn();
    await keepOnAccount(today, tomorrow);
    noInvites();
    server.use(
      serverBookings([
        {
          reference: "YV-DAYPLAN1",
          reservationId: "res_day",
          experience: "Try-dive at Nemo Reef",
          statusToken: "tok_day",
          localDate: tomorrow,
          localTime: "07:00",
          startsAt: new Date(Date.now() + 30 * 3_600_000).toISOString(),
        },
      ]),
    );
    renderWithQuery(<TripsScreen />);

    const plan = await screen.findByRole("region", {
      name: "Your island days",
    });
    const free = await within(plan).findByRole("link", {
      name: "See what runs",
    });
    expect(free).toHaveAttribute("href", `/search?on=${today}`);
    expect(
      within(plan).getByRole("link", { name: "07:00 Try-dive at Nemo Reef" }),
    ).toHaveAttribute("href", "/booking#t=tok_day");
  });

  it("never calls a day free that it has not read", async () => {
    // More than a page of trips in the stay: days past the last row read say
    // so, rather than "Nothing booked".
    const [today, , third] = days(3);
    signIn();
    await keepOnAccount(today, third);
    noInvites();
    server.use(
      serverBookings([{ localDate: today, localTime: "07:00" }], {
        nextCursor: "c2",
      }),
    );
    renderWithQuery(<TripsScreen />);
    expect(
      (
        await screen.findAllByText(
          "More trips than shown here: see your trips below.",
        )
      ).length,
    ).toBe(2);
  });

  it("lays out the stay's own days while the bookings on them are read", async () => {
    /*
      The days are the stay's, known before any booking is. Two fixed bars
      stood in for all of them, and a week's stay grew by five rows when the
      bookings landed (stability audit, 6 Oct 2026).
    */
    const [today, , third] = days(3);
    signIn();
    await keepOnAccount(today, third);
    noInvites();
    server.use(
      http.get(`${BASE}/me/bookings`, async () => {
        await delay("infinite");
        return HttpResponse.json({});
      }),
    );
    renderWithQuery(<TripsScreen />);

    const plan = await screen.findByRole("region", {
      name: "Your island days",
    });
    const rows = await within(plan).findAllByRole("listitem");
    expect(rows).toHaveLength(3);
    expect(within(rows[0]).getByText("Today")).toBeInTheDocument();
    expect(within(rows[1]).getByText("Tomorrow")).toBeInTheDocument();
    rows.forEach((row) =>
      expect(row.querySelector(".skeleton")).not.toBeNull(),
    );
    expect(within(plan).queryByText(/Nothing booked/)).toBeNull();
  });

  it("is a panel from the first frame while the account is read", async () => {
    // It drew nothing, then arrived above the list and pushed it down.
    signIn();
    noInvites();
    server.use(
      serverBookings([]),
      // The proxied read only: the session's own check of the cookie answers.
      http.get("*/api/v1/me", async () => {
        await delay("infinite");
        return HttpResponse.json({});
      }),
    );
    renderWithQuery(<TripsScreen />);
    const plan = await screen.findByRole("region", {
      name: "Your island days",
    });
    expect(
      within(plan).getByRole("status", { name: "Reading your days" }),
    ).toBeInTheDocument();
    expect(
      within(plan).queryByRole("button", { name: "Set your days" }),
    ).toBeNull();
  });

  it("does not wait on a phone store that never answers", async () => {
    // The account has spoken; a hung store only holds days still to move.
    idb.hang.add(STAY_KEY);
    signIn();
    noInvites();
    server.use(serverBookings([]));
    renderWithQuery(<TripsScreen />);
    expect(
      await screen.findByRole("button", { name: "Set your days" }),
    ).toBeInTheDocument();
  });

  it("says when the account did not load, and asks again", async () => {
    signIn();
    noInvites();
    /*
      Down until the tap, not for one read: every reader of the account that
      mounts after a failure asks again on its own.
    */
    let down = true;
    server.use(
      serverBookings([]),
      http.get("*/api/v1/me", () => {
        if (down) {
          return HttpResponse.json(
            { error: { code: "service_unavailable", message: "Not now." } },
            { status: 503 },
          );
        }
        // Answering nothing hands the read on to the app's own route.
        return undefined;
      }),
    );
    const user = userEvent.setup();
    renderWithQuery(<TripsScreen />);
    const plan = await screen.findByRole("region", {
      name: "Your island days",
    });
    expect(
      await within(plan).findByText("Your days did not load."),
    ).toBeInTheDocument();
    down = false;
    await user.click(within(plan).getByRole("button", { name: "Try again" }));
    expect(
      await within(plan).findByRole("button", { name: "Set your days" }),
    ).toBeInTheDocument();
  });

  it("says when the days are over, and lets them go", async () => {
    signIn();
    await keepOnAccount("2026-01-01", "2026-01-03");
    noInvites();
    server.use(serverBookings([]));
    const user = userEvent.setup();
    renderWithQuery(<TripsScreen />);
    expect(await screen.findByText(/They ended on/)).toBeInTheDocument();
    await user.click(screen.getByRole("button", { name: "Clear them" }));
    expect(
      await screen.findByRole("button", { name: "Set your days" }),
    ).toBeInTheDocument();
    expect(await accountStay()).toBeNull();
  });
});
