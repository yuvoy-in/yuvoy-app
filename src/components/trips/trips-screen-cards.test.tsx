import {
  describe,
  it,
  expect,
  vi,
  beforeAll,
  beforeEach,
  afterEach,
} from "vitest";
import { act, screen, cleanup, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { delay, http, HttpResponse } from "msw";
import { renderWithQuery } from "@/test/render";
import { TripsScreen } from "./trips-screen";
import { server } from "../../../mocks/server";
import { __signInAppRouteMock } from "../../../mocks/app-route-handlers";

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
 * Waiting for a tab: the motion system §8 (approved 4 Oct 2026). Nothing for
 * 300ms, then the skeleton, which once shown stays 300ms.
 *
 * Every tab used to draw its skeleton the moment it was first opened, so an
 * answer inside 300ms flashed it on and straight off. jsdom draws nothing,
 * so "drawn" here is the skeleton's blocks without `invisible`: the class is
 * the whole difference between a wait that is held back and one that shows.
 */
describe("waiting for a tab", () => {
  /** Each tab's own trip, answered after that tab's wait. */
  const byTab = (wait: Partial<Record<string, number>>) =>
    server.use(
      http.get(`${BASE}/me/bookings`, async ({ request }) => {
        const tab = new URL(request.url).searchParams.get("tab") ?? "";
        sent.push(new URL(request.url).searchParams);
        const ms = wait[tab];
        if (ms) await delay(ms);
        return HttpResponse.json({
          nextCursor: null,
          bookings: [
            {
              reference: `YV-${tab.toUpperCase()}`,
              reservationId: `res_${tab}`,
              experience: `The ${tab} trip`,
              localDate: "2026-12-24",
              localTime: "09:00",
              state: "confirmed",
              guests: 2,
              statusToken: `tok_${tab}`,
              price: { totalPaise: 900000, currency: "INR" },
            },
          ],
        });
      }),
    );

  const skeletonDrawn = () =>
    Array.from(document.querySelectorAll(".skeleton")).some(
      (s) =>
        s.closest('[data-motion-key="loading"], [data-motion-key="waiting"]') &&
        !s.closest(".invisible"),
    );

  /** Whether the skeleton was drawn at any moment from now on. */
  function watchSkeleton() {
    let drawn = skeletonDrawn();
    const watcher = new MutationObserver(() => {
      if (skeletonDrawn()) drawn = true;
    });
    watcher.observe(document.body, {
      subtree: true,
      childList: true,
      attributes: true,
      attributeFilter: ["class"],
    });
    return () => {
      watcher.disconnect();
      return drawn;
    };
  }

  const pause = (ms: number) =>
    act(() => new Promise<void>((resolve) => setTimeout(resolve, ms)));

  it("draws no skeleton for a tab that answers inside 300ms", async () => {
    const user = userEvent.setup();
    await signIn();
    noInvites();
    byTab({ past: 150 });
    renderWithQuery(<TripsScreen />);
    await screen.findByText("The upcoming trip");

    const drawn = watchSkeleton();
    await user.click(screen.getByRole("tab", { name: "Past" }));
    // Waiting is still said, to a screen reader; it is only not drawn.
    expect(
      screen.getByRole("status", { name: "Loading your trips" }),
    ).toBeInTheDocument();
    expect(await screen.findByText("The past trip")).toBeInTheDocument();
    expect(drawn(), "the skeleton flashed for a quick answer").toBe(false);
  });

  it("draws it once the wait has lasted 300ms, and keeps it 300ms", async () => {
    const user = userEvent.setup();
    await signIn();
    noInvites();
    byTab({ past: 500 });
    renderWithQuery(<TripsScreen />);
    await screen.findByText("The upcoming trip");

    await user.click(screen.getByRole("tab", { name: "Past" }));
    await pause(200);
    expect(skeletonDrawn()).toBe(false);

    await waitFor(() => expect(skeletonDrawn()).toBe(true), { timeout: 1000 });
    const shownAt = performance.now();
    await screen.findByText("The past trip", {}, { timeout: 2000 });
    // The answer came at 500ms; the skeleton, up since 300ms, held to 600ms.
    expect(performance.now() - shownAt).toBeGreaterThanOrEqual(240);
    expect(skeletonDrawn()).toBe(false);
  });

  it("starts every tab's wait afresh", async () => {
    // A skeleton just drawn on one tab is not held over the next one's trips.
    const user = userEvent.setup();
    await signIn();
    noInvites();
    byTab({ past: 2000 });
    renderWithQuery(<TripsScreen />);
    await screen.findByText("The upcoming trip");

    await user.click(screen.getByRole("tab", { name: "Past" }));
    await waitFor(() => expect(skeletonDrawn()).toBe(true), { timeout: 1000 });
    await user.click(screen.getByRole("tab", { name: "Upcoming" }));
    expect(screen.getByText("The upcoming trip")).toBeInTheDocument();
    expect(skeletonDrawn()).toBe(false);
  });

  it("keeps the skeleton Trips opened with, rather than blanking it", async () => {
    // The screen drew it while the session was read: it must not go for
    // 300ms and come back when the first tab's list mounts.
    await signIn();
    noInvites();
    byTab({ upcoming: 800 });
    renderWithQuery(<TripsScreen />);
    await screen.findByRole("tablist", { name: "Which trips" });
    expect(skeletonDrawn()).toBe(true);
    expect(await screen.findByText("The upcoming trip")).toBeInTheDocument();
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

  it("asks for payment by the hold's deadline on an accepted request, and never says paid", async () => {
    /*
      yuvoy-app#156. The operator said yes and the seats are held until it is
      paid for: no reference and no payment, and falling through to the last
      rule read "Paid ₹9,000" on seats nobody had paid for. The deadline is
      in the market's own day, 12:00Z being 17:30 in the Andamans.
    */
    await card({
      state: "holding",
      reference: "",
      holdExpiresAt: "2099-12-24T12:00:00Z",
    });
    expect(
      await screen.findByText("Seats held. Pay ₹9,000 by 17:30 on Thu 24 Dec"),
    ).toBeInTheDocument();
    expect(screen.getByText("Holding")).toBeInTheDocument();
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
