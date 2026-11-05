import {
  describe,
  it,
  expect,
  vi,
  beforeAll,
  beforeEach,
  afterEach,
} from "vitest";
import { screen, cleanup, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { http, HttpResponse } from "msw";
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

  it("asks for the days, keeps them on the account, and lays them out", async () => {
    signIn();
    noInvites();
    server.use(serverBookings([]));
    const user = userEvent.setup();
    renderWithQuery(<TripsScreen />);

    await user.click(
      await screen.findByRole("button", { name: "Set your days" }),
    );
    expect(
      screen.getByText(
        "Kept with your account. Nothing is booked by setting them.",
      ),
    ).toBeInTheDocument();
    const [first, , last] = days(3);
    await user.type(screen.getByLabelText("Arriving"), first);
    await user.type(screen.getByLabelText("Leaving"), last);
    await user.click(screen.getByRole("button", { name: "Save" }));

    expect(await screen.findByText("Today")).toBeInTheDocument();
    expect(screen.getByText("Tomorrow")).toBeInTheDocument();
    expect(await accountStay()).toEqual({ from: first, to: last });
    // On the account, and not on the phone as well.
    expect(idb.store.has(STAY_KEY)).toBe(false);
    expect(
      screen.getAllByText("Your dates are kept with your account."),
    ).toHaveLength(1);
  });

  it("shows the days the account keeps, set on another phone", async () => {
    const [today, tomorrow] = days(2);
    signIn();
    await keepOnAccount(today, tomorrow);
    noInvites();
    server.use(serverBookings([]));
    renderWithQuery(<TripsScreen />);

    const plan = await screen.findByRole("region", {
      name: "Your island days",
    });
    /*
      Once the bookings are in: the rows drawn while they load are a tree of
      their own, so a row found then is gone a moment later.
    */
    await waitFor(() => {
      expect(
        within(plan).queryByRole("status", { name: "Laying out your days" }),
      ).toBeNull();
      expect(within(plan).getByText("Today")).toBeInTheDocument();
    });
    expect(within(plan).getByText("Tomorrow")).toBeInTheDocument();
  });

  it("moves days set on this phone to the account, once, and forgets them here", async () => {
    // Set before the account could keep them: they must not be lost, nor kept twice.
    const [today, tomorrow] = days(2);
    idb.store.set(STAY_KEY, { from: today, to: tomorrow });
    signIn();
    noInvites();
    server.use(serverBookings([]));
    renderWithQuery(<TripsScreen />);

    const plan = await screen.findByRole("region", {
      name: "Your island days",
    });
    expect(await within(plan).findByText("Tomorrow")).toBeInTheDocument();
    await waitFor(() => expect(idb.store.has(STAY_KEY)).toBe(false));
    expect(await accountStay()).toEqual({ from: today, to: tomorrow });
    expect(
      within(plan).getByText("Your dates are kept with your account."),
    ).toBeInTheDocument();
  });

  it("lets the account's days win over a phone's older copy", async () => {
    const [today, tomorrow, third] = days(3);
    signIn();
    await keepOnAccount(tomorrow, third);
    idb.store.set(STAY_KEY, { from: today, to: today });
    noInvites();
    server.use(serverBookings([]));
    renderWithQuery(<TripsScreen />);

    await waitFor(() => expect(idb.store.has(STAY_KEY)).toBe(false));
    expect(await accountStay()).toEqual({ from: tomorrow, to: third });
    const plan = screen.getByRole("region", { name: "Your island days" });
    expect(within(plan).queryByText("Today")).toBeNull();
    expect(within(plan).getByText("Tomorrow")).toBeInTheDocument();
  });

  it("keeps the phone's copy when the move fails, to try again", async () => {
    const [today, tomorrow] = days(2);
    idb.store.set(STAY_KEY, { from: today, to: tomorrow });
    signIn();
    noInvites();
    let tried = 0;
    server.use(
      serverBookings([]),
      http.put(`${BASE}/me/stay`, () => {
        tried += 1;
        return HttpResponse.json(
          { error: { code: "service_unavailable", message: "Try again." } },
          { status: 503 },
        );
      }),
    );
    renderWithQuery(<TripsScreen />);

    const plan = await screen.findByRole("region", {
      name: "Your island days",
    });
    // Still shown, from the phone, rather than lost to a failed request.
    expect(await within(plan).findByText("Tomorrow")).toBeInTheDocument();
    await waitFor(() => expect(tried).toBe(1));
    expect(idb.store.get(STAY_KEY)).toEqual({ from: today, to: tomorrow });
  });

  it("keeps the days on the phone against an API that cannot keep them", async () => {
    // `stay` absent from `GET /me` is an API from before yuvoy-api#257.
    server.use(
      http.get(`${BASE}/me`, () =>
        HttpResponse.json({
          phone: "+919000000000",
          name: "Asha Menon",
          email: null,
          interests: [],
          onboardingRequired: false,
          memberSince: null,
          trips: { total: 0, upcoming: 0, completed: 0 },
          reviews: { count: 0 },
          support: { whatsappE164: null, hours: "9am to 7pm" },
          admitted: true,
        }),
      ),
    );
    signIn();
    noInvites();
    server.use(serverBookings([]));
    const user = userEvent.setup();
    renderWithQuery(<TripsScreen />);

    await user.click(
      await screen.findByRole("button", { name: "Set your days" }),
    );
    const [first, , last] = days(3);
    await user.type(screen.getByLabelText("Arriving"), first);
    await user.type(screen.getByLabelText("Leaving"), last);
    await user.click(screen.getByRole("button", { name: "Save" }));

    expect(await screen.findByText("Today")).toBeInTheDocument();
    expect(idb.store.get(STAY_KEY)).toEqual({ from: first, to: last });
    expect(
      screen.getByText("Your dates are kept on this phone."),
    ).toBeInTheDocument();
  });

  it("stays open and says so when the days do not save", async () => {
    signIn();
    noInvites();
    server.use(
      serverBookings([]),
      http.put(`${BASE}/me/stay`, () =>
        HttpResponse.json(
          {
            error: {
              code: "invalid_input",
              message: "Those days could not be kept.",
              details: { to: "A stay is at most 60 days \u2014 pick fewer." },
            },
          },
          { status: 400 },
        ),
      ),
    );
    const user = userEvent.setup();
    renderWithQuery(<TripsScreen />);

    await user.click(
      await screen.findByRole("button", { name: "Set your days" }),
    );
    const [first, , last] = days(3);
    await user.type(screen.getByLabelText("Arriving"), first);
    await user.type(screen.getByLabelText("Leaving"), last);
    await user.click(screen.getByRole("button", { name: "Save" }));

    // The API's own sentence, beside the field it names, with no long dash.
    expect(
      await screen.findByText("A stay is at most 60 days. Pick fewer."),
    ).toBeInTheDocument();
    expect(screen.getByRole("dialog")).toBeInTheDocument();
    expect(await accountStay()).toBeNull();
  });
});
