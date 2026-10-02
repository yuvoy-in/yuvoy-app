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
  it("shows the sign-in prompt and no booking at all", async () => {
    /*
      THE OWNER'S SECOND REPORT, AS AN ASSERTION (yuvoy-app#60 item 2).

      Trips used to read a list out of this device's IndexedDB, which knows
      nothing about sessions, so signing out left every booking on screen. The
      store is deliberately PRIMED here with a booking: the test is worthless
      against an empty store, because then any screen passes it.

      The API is asserted never called too. There is no session, so asking
      would be a guaranteed 401, and a screen that asks anyway flashes an error
      panel at somebody who is simply signed out.
    */
    let called = false;
    server.use(
      http.get(`${BASE}/me/bookings`, () => {
        called = true;
        return HttpResponse.json({ bookings: [], nextCursor: null });
      }),
    );
    await rememberBooking({ reference: "YV-ONDEVICE", token: "tok_device" });

    renderWithQuery(<TripsScreen />);
    expect(
      await screen.findByText("Sign in to see your trips"),
    ).toBeInTheDocument();

    await new Promise((r) => setTimeout(r, 50));
    expect(screen.queryByText("YV-ONDEVICE")).toBeNull();
    expect(called).toBe(false);
  });

  it("leads with finding a booking, and keeps signing in second", async () => {
    /*
      yuvoy-app#113. Checkout needs no account, so most people here signed out
      booked as guests, and the way to their booking used to be a small link
      under a sign-in wall. Now it leads, and it goes to recovery, which needs
      no account at all.

      Both routes stay, because they are genuinely different: signing in works
      for a number that has never booked and revokes nothing; recovery mints
      one booking's link and rotates the old one. `next=/trips` is asserted
      because without it signing in lands on Account and the traveller has to
      find their own way back.
    */
    renderWithQuery(<TripsScreen />);
    const find = await screen.findByRole("link", { name: "Find my booking" });
    const signIn = screen.getByRole("link", { name: /^Sign in$/ });

    expect(find).toHaveAttribute("href", "/trips/recover");
    expect(signIn).toHaveAttribute("href", "/account?next=/trips");
    // First in reading order, which is what "leads" means to a screen reader
    // as much as to the eye.
    expect(
      find.compareDocumentPosition(signIn) & Node.DOCUMENT_POSITION_FOLLOWING,
    ).toBeTruthy();
  });

  it("keeps the owner's sign-in words, verbatim", async () => {
    renderWithQuery(<TripsScreen />);
    expect(
      await screen.findByText("Sign in to see your trips"),
    ).toBeInTheDocument();
    expect(
      screen.getByText(
        "Your bookings are kept in your account. Sign in with the WhatsApp number you booked with.",
      ),
    ).toBeInTheDocument();
  });

  it("promises nothing about signal or this device", async () => {
    /*
      Item 5. The screen used to say "Kept on this device. No account, and they
      work without signal", which stopped being true the moment the device read
      went. The promise the product cannot keep is the defect, not the wording.
    */
    renderWithQuery(<TripsScreen />);
    await screen.findByText("Sign in to see your trips");
    expect(document.body.textContent).not.toMatch(/without signal/i);
    expect(document.body.textContent).not.toMatch(/on this device/i);
  });
});

describe("signed in", () => {
  it("shows the account's trips, and ONLY those", async () => {
    /*
      The store is primed with a booking the API does not list. It must not
      appear: Trips is the account's list now, and a device record has no tab,
      no date and no state to be placed by.
    */
    await signIn();
    await rememberBooking({ reference: "YV-ONDEVICE", token: "tok_device" });
    server.use(serverBookings([{}]));

    renderWithQuery(<TripsScreen />);
    expect(await screen.findByText("YV-SERVER11")).toBeInTheDocument();
    await new Promise((r) => setTimeout(r, 50));
    expect(screen.queryByText("YV-ONDEVICE")).toBeNull();
  });

  it("never draws a cancelled booking under Upcoming", async () => {
    /*
      THE OWNER'S FIRST REPORT, AS AN ASSERTION (yuvoy-app#60 item 1).

      The API is right and excludes cancelled trips from the `upcoming` page.
      The old merge added them back, and did so precisely BECAUSE the API had
      filed them correctly: a device record the server had not listed on this
      page counted as "not listed at all" and was drawn under Upcoming.

      So the store is primed with the cancelled booking AND the API answers an
      empty Upcoming page. That is the exact pair that produced the defect.
    */
    await signIn();
    await rememberBooking({ reference: "YV-CANCELLED", token: "tok_device" });
    server.use(serverBookings([]));
    noInvites();

    renderWithQuery(<TripsScreen />);
    expect(await screen.findByText("No upcoming trips")).toBeInTheDocument();
    expect(screen.queryByText("YV-CANCELLED")).toBeNull();
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

  it("opens a trip on the server's own token", async () => {
    // "A booking link for this trip, minted for this response, so a trip booked
    // on another phone opens here."
    await signIn();
    server.use(serverBookings([{}]));

    renderWithQuery(<TripsScreen />);
    const row = (await screen.findByText("YV-SERVER11")).closest("a")!;
    expect(row.getAttribute("href")).toContain("tok_server");
  });

  it("says a dead session has expired, and promises nothing else", async () => {
    /*
      `retry: false` means this will not resolve itself, so it has to be said
      plainly rather than left as a spinner.

      It used to add "Anything saved on this phone is unaffected", above the
      device's trips which were still listed. There is nothing left to be
      unaffected, so the sentence went with the list: a failed read is the whole
      screen's failure now, and the copy must not imply otherwise.
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
    expect(screen.queryByText("YV-ONDEVICE")).toBeNull();
    expect(document.body.textContent).not.toMatch(/saved on this phone/i);
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
    // Nothing to divide: three tabs over no trips would be three empty ones
    // above a sign-in prompt.
    renderWithQuery(<TripsScreen />);
    await screen.findByText("Sign in to see your trips");
    expect(screen.queryByRole("tab", { name: "Upcoming" })).toBeNull();
    expect(screen.queryByRole("tablist")).toBeNull();
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

  /*
    A REPLY HAS ARRIVED (yuvoy-api#207).

    Before `unreadCount` the only way to learn the business had written was to
    open that exact trip and scroll to the conversation. The line is inside
    the card's link, so it is part of the name a screen reader hears for the
    trip it belongs to.
  */
  it("says a reply has arrived, in words, inside the trip's own link", async () => {
    await card({ unreadCount: 1 });
    const line = await screen.findByText("1 new message");
    expect(line.closest("a")?.getAttribute("href")).toContain("tok_server");
  });

  it("counts more than one", async () => {
    await card({ unreadCount: 3 });
    expect(await screen.findByText("3 new messages")).toBeInTheDocument();
  });

  it("says why the operator declined a request, and does not call it refunded", async () => {
    /*
      yuvoy-api#225. A declined REQUEST took no money, so the booking page's
      "Refunded" for `declined` is false here, beside a sentence that says the
      operator could not take it.
    */
    await card({
      state: "declined",
      reasonCode: "no_capacity",
      reference: "",
      price: { totalPaise: 900000, currency: "INR" },
    });
    expect(
      await screen.findByText(
        "The operator could not take this one: no seats left.",
      ),
    ).toBeInTheDocument();
    expect(screen.getByText("Not accepted")).toBeInTheDocument();
    expect(screen.queryByText("Refunded")).toBeNull();
    expect(screen.queryByText(/no_capacity/)).toBeNull();
  });

  it("keeps Refunded, and invents no reason, for a declined booking that was paid", async () => {
    await card({
      state: "declined",
      payment: { method: "online", collected: true, amountPaise: 900000 },
      refund: { amountPaise: 900000, state: "pending" },
    });
    expect(await screen.findByText("Refunded")).toBeInTheDocument();
    expect(screen.getByText("Refund of ₹9,000 on its way")).toBeInTheDocument();
    expect(screen.queryByText(/could not take this one/)).toBeNull();
  });

  it("says nothing when nothing is new, or when the API sends no count", async () => {
    /*
      Zero is the ordinary case and must draw nothing. ABSENT is the case an
      API a deploy behind the contract produces, and it must look exactly like
      the card before the field existed rather than like a broken one.
    */
    await card({ unreadCount: 0 });
    await screen.findByText("Paid ₹9,000");
    expect(screen.queryByText(/new message/)).toBeNull();
    cleanup();

    await card({});
    await screen.findByText("Paid ₹9,000");
    expect(screen.queryByText(/new message/)).toBeNull();
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
