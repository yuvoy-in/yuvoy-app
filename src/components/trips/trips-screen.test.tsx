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
  rows: Partial<Record<string, unknown>>[],
  answer: { nextCursor?: string | null } = {},
): ReturnType<typeof http.get> {
  return http.get(`${BASE}/me/bookings`, ({ request }) => {
    sent.push(new URL(request.url).searchParams);
    return HttpResponse.json({
      nextCursor: answer.nextCursor ?? null,
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
    /*
      Counted by TITLE, not by list item. The Upcoming tab also carries trips
      this number was INVITED to (yuvoy-app#38), which are separate cards and
      belong there: an all-items count used to mean "one card" and now means
      "one card plus however many invitations the fixture has".
    */
    await waitFor(() =>
      expect(screen.getAllByText("Mangrove kayak at dawn")).toHaveLength(1),
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

/**
 * Tabs, paging, the card and the date filter (yuvoy-app#38 items 1 and 2).
 *
 * The API decides the tab for a trip the traveller BOOKED and guarantees the
 * three never overlap, so what is asserted here is that the screen ASKS for the
 * right one. An invited trip carries no tab and the client places it; that
 * logic is unit-tested in `lib/trips/tabs.test.ts` and joined up here.
 */
describe("the three tabs", () => {
  it("opens on Upcoming and asks the API for it", async () => {
    await signIn();
    noInvites();
    server.use(serverBookings([{}]));

    renderWithQuery(<TripsScreen />);
    await screen.findByText("Snorkel trip to Elephant Beach");

    expect(screen.getByRole("tab", { name: "Upcoming" })).toHaveAttribute(
      "aria-selected",
      "true",
    );
    expect(sent.at(0)?.get("tab")).toBe("upcoming");
  });

  it("asks the API again with the tab a traveller taps", async () => {
    /*
      The tab is the API's parameter, not a client-side filter. Filtering a
      fetched page here would show "Past" over whatever the upcoming page
      happened to contain, and would never reach a trip from last year.
    */
    const user = userEvent.setup();
    await signIn();
    noInvites();
    server.use(serverBookings([{}]));

    renderWithQuery(<TripsScreen />);
    await screen.findByText("Snorkel trip to Elephant Beach");

    await user.click(screen.getByRole("tab", { name: "Cancelled" }));
    await waitFor(() => expect(sent.at(-1)?.get("tab")).toBe("cancelled"));
  });

  it("says what is empty, per tab, and offers a way out", async () => {
    const user = userEvent.setup();
    await signIn();
    noInvites();
    server.use(serverBookings([]));

    renderWithQuery(<TripsScreen />);
    expect(await screen.findByText("No upcoming trips")).toBeInTheDocument();
    expect(
      screen.getByRole("link", { name: "Find something" }),
    ).toHaveAttribute("href", "/");

    await user.click(screen.getByRole("tab", { name: "Past" }));
    expect(await screen.findByText("No past trips yet")).toBeInTheDocument();

    await user.click(screen.getByRole("tab", { name: "Cancelled" }));
    expect(await screen.findByText("Nothing cancelled")).toBeInTheDocument();
  });

  it("shows no tabs at all when signed out", async () => {
    // Nothing to divide: three tabs over one phone's bookings is two empty ones.
    renderWithQuery(<TripsScreen />);
    await screen.findByText(/Kept on this device/);
    expect(screen.queryByRole("tab", { name: "Upcoming" })).toBeNull();
    expect(
      screen.getByRole("link", { name: /Sign in with my number/ }),
    ).toBeInTheDocument();
  });
});

describe("paging", () => {
  it("offers Show more only while there is another page", async () => {
    await signIn();
    noInvites();
    server.use(serverBookings([{}], { nextCursor: null }));

    renderWithQuery(<TripsScreen />);
    await screen.findByText("Snorkel trip to Elephant Beach");
    expect(screen.queryByRole("button", { name: "Show more" })).toBeNull();
  });

  it("sends the cursor back WITH the same tab", async () => {
    /*
      The contract: "Pass `nextCursor` back as `cursor` with the same `tab`,
      `from` and `to`; a cursor from a different query is refused with
      `invalid_input`." A button that sent the cursor alone would 400 on the
      second page only, which is the kind of bug nobody scrolls far enough to
      find in review.
    */
    const user = userEvent.setup();
    await signIn();
    noInvites();
    server.use(serverBookings([{}], { nextCursor: "cur_2" }));

    renderWithQuery(<TripsScreen />);
    await screen.findByText("Snorkel trip to Elephant Beach");
    await user.click(screen.getByRole("button", { name: "Show more" }));

    await waitFor(() => expect(sent.at(-1)?.get("cursor")).toBe("cur_2"));
    expect(sent.at(-1)?.get("tab")).toBe("upcoming");
    expect(sent.at(-1)?.get("limit")).toBe("20");
  });

  it("does not send a cursor at all on the first page", async () => {
    // `cursor=` empty is a different request from sending none.
    await signIn();
    noInvites();
    server.use(serverBookings([{}]));

    renderWithQuery(<TripsScreen />);
    await screen.findByText("Snorkel trip to Elephant Beach");
    expect(sent.at(0)?.has("cursor")).toBe(false);
  });
});

describe("the card", () => {
  const card = async (row: Partial<Record<string, unknown>>) => {
    await signIn();
    noInvites();
    server.use(serverBookings([row]));
    renderWithQuery(<TripsScreen />);
    return screen.findByText("Snorkel trip to Elephant Beach");
  };

  it("asks for the cash rather than claiming it is paid", async () => {
    /*
      The live defect this card was the second surface for. The API reports a
      cash booking as `confirmed`, so reading the state alone showed
      "Paid ₹9,000" to travellers who had handed over nothing (#29, D-034).
    */
    await card({
      state: "confirmed",
      payment: { method: "cash", collected: false, amountPaise: 900000 },
    });
    expect(
      await screen.findByText("Pay ₹9,000 cash on the day"),
    ).toBeInTheDocument();
    expect(screen.queryByText("Paid ₹9,000")).toBeNull();
  });

  it("says what was paid on an ordinary booking", async () => {
    await card({
      state: "confirmed",
      payment: { method: "online", collected: true, amountPaise: 900000 },
    });
    expect(await screen.findByText("Paid ₹9,000")).toBeInTheDocument();
  });

  it("says nothing about money on a request nobody has answered", async () => {
    await card({ state: "pending_request", reference: "" });
    expect(
      await screen.findByText("Waiting for the operator"),
    ).toBeInTheDocument();
    expect(screen.queryByText(/Paid /)).toBeNull();
  });

  it("counts the party, with the singular for one", async () => {
    await card({ guests: 1 });
    expect(await screen.findByText("1 person")).toBeInTheDocument();
  });

  it("names the day in the market's own words", async () => {
    await card({ localDate: "2026-12-24", localTime: "09:00" });
    expect(await screen.findByText(/Thu 24 Dec · 09:00/)).toBeInTheDocument();
  });
});

describe("an invited trip", () => {
  it("shows as a Guest card with no price", async () => {
    /*
      The API sends no price, no payment and nothing about the booker, and the
      issue forbids inventing any of it. A guest reading a price would be
      reading somebody else's money.
    */
    await signIn();
    renderWithQuery(<TripsScreen />);

    const title = await screen.findByText("Try-dive at Nemo Reef");
    const card = title.closest("a")!;
    expect(card.getAttribute("href")).toBe("/trips/invited/inv_joined");
    expect(within(card).getByText("Guest")).toBeInTheDocument();
    expect(within(card).queryByText(/Paid |Pay /)).toBeNull();
  });

  it("lands in the tab its status says, not always Upcoming", async () => {
    const user = userEvent.setup();
    await signIn();
    server.use(serverBookings([]));

    renderWithQuery(<TripsScreen />);
    // Confirmed and in the future: Upcoming.
    await screen.findByText("Try-dive at Nemo Reef");

    await user.click(screen.getByRole("tab", { name: "Cancelled" }));
    // The called-off one, and only it.
    await waitFor(() =>
      expect(screen.getAllByText("Try-dive at Nemo Reef")).toHaveLength(1),
    );
    expect(
      await screen.findByText("Called off by the operator"),
    ).toBeInTheDocument();
  });
});

describe("the date filter", () => {
  it("sends from and to with the tab, and reads back on the button", async () => {
    const user = userEvent.setup();
    await signIn();
    noInvites();
    server.use(serverBookings([{}]));

    renderWithQuery(<TripsScreen />);
    await screen.findByText("Snorkel trip to Elephant Beach");

    await user.click(screen.getByRole("button", { name: "Dates" }));
    const sheet = await screen.findByRole("dialog", {
      name: "Filter by date",
    });
    await user.type(within(sheet).getByLabelText("From"), "2026-12-01");
    await user.type(within(sheet).getByLabelText("To"), "2026-12-31");
    await user.click(within(sheet).getByRole("button", { name: "Apply" }));

    await waitFor(() => expect(sent.at(-1)?.get("from")).toBe("2026-12-01"));
    expect(sent.at(-1)?.get("to")).toBe("2026-12-31");
    expect(sent.at(-1)?.get("tab")).toBe("upcoming");

    /*
      And the button says so, with its own way off. Matched EXACTLY: a loose
      regex also matches "Remove 1 Dec to 31 Dec", which is the x beside it, and
      the pair is deliberate. Two controls, one to change the range and one to
      clear it, the same shape the search pills use.
    */
    expect(
      await screen.findByRole("button", { name: "1 Dec to 31 Dec" }),
    ).toBeInTheDocument();
    expect(
      screen.getByRole("button", { name: "Remove 1 Dec to 31 Dec" }),
    ).toBeInTheDocument();
  });

  it("refuses a To before the From", async () => {
    const user = userEvent.setup();
    await signIn();
    noInvites();
    server.use(serverBookings([{}]));

    renderWithQuery(<TripsScreen />);
    await screen.findByText("Snorkel trip to Elephant Beach");
    await user.click(screen.getByRole("button", { name: "Dates" }));
    const sheet = await screen.findByRole("dialog", {
      name: "Filter by date",
    });

    await user.type(within(sheet).getByLabelText("From"), "2026-12-31");
    await user.type(within(sheet).getByLabelText("To"), "2026-12-01");

    expect(
      within(sheet).getByText("That is before the From date."),
    ).toBeInTheDocument();
    expect(within(sheet).getByRole("button", { name: "Apply" })).toBeDisabled();
  });

  it("clears back to every date", async () => {
    const user = userEvent.setup();
    await signIn();
    noInvites();
    server.use(serverBookings([{}]));

    renderWithQuery(<TripsScreen />);
    await screen.findByText("Snorkel trip to Elephant Beach");
    await user.click(screen.getByRole("button", { name: "Dates" }));
    const sheet = await screen.findByRole("dialog", {
      name: "Filter by date",
    });
    await user.type(within(sheet).getByLabelText("From"), "2026-12-01");
    await user.click(within(sheet).getByRole("button", { name: "Apply" }));
    await screen.findByRole("button", { name: "From 1 Dec" });

    await user.click(screen.getByRole("button", { name: "Remove From 1 Dec" }));
    await waitFor(() => expect(sent.at(-1)?.has("from")).toBe(false));
    expect(
      await screen.findByRole("button", { name: "Dates" }),
    ).toBeInTheDocument();
  });
});
