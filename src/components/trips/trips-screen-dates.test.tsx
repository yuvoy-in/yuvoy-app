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
import { useRelease } from "@/lib/site/use-release";
import { server } from "../../../mocks/server";
import { __signInAppRouteMock } from "../../../mocks/app-route-handlers";
import { appConfig } from "@/components/trigo/lists-test-kit";

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
  /*
    Trips reads the config for its Drafts tab (yuvoy-app#220), and the shared
    mock's answer is dated by the fixture's clock, which would put the
    server's today in August. These lay out days and passes by this device's
    today, so the config answers undated, as a server on the same clock would.
  */
  appConfig("off");
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

/**
 * The Next up pass (the approved redesign: traveller A with C's pass,
 * 3 Oct 2026). `nextUpTrip`'s rules are in `lib/trips/next-up.test.ts`; these
 * pin what the screen draws from them.
 */
describe("the next up pass", () => {
  const inHours = (h: number) =>
    new Date(Date.now() + h * 3_600_000).toISOString();

  /** The next-up trip's own status: the landmark and the operator's note. */
  const passStatus = () => ({
    reservationId: "res_next",
    state: "confirmed",
    final: false,
    guests: 2,
    experience: {
      slug: "try-dive-nemo-reef",
      title: "Try-dive at Nemo Reef",
      operator: "Sample Dive Operator",
      operatorSlug: "sample-dive-operator",
      heroImageUrl: null,
    },
    slot: { startsAt: inHours(3), timezone: "Asia/Kolkata" },
    price: { totalPaise: 900000, currency: "INR" },
    review: { reviewed: false, canReview: false },
    meetingPoint: {
      text: "Jetty 2, Havelock",
      landmark: "The blue kiosk",
    },
    operatorUpdates: [
      {
        kind: "relay",
        detail: "Meet at jetty 2, not 1",
        sentAt: new Date().toISOString(),
      },
    ],
  });

  it("draws the trip leaving within the day whole, above the list, and once", async () => {
    signIn();
    noInvites();
    server.use(
      serverBookings([
        {
          reference: "YV-NEXTUP01",
          reservationId: "res_next",
          experience: "Try-dive at Nemo Reef",
          statusToken: "tok_next",
          startsAt: inHours(3),
          meetingPoint: "Jetty 2, Havelock",
          payment: { method: "cash", collected: false, amountPaise: 900000 },
          unreadCount: 2,
        },
        {
          reference: "YV-LATER001",
          reservationId: "res_later",
          experience: "Snorkel trip to Elephant Beach",
          statusToken: "tok_later",
          startsAt: inHours(72),
        },
      ]),
      // The one trip's own status, for the landmark and the operator's note.
      http.get(`${BASE}/bookings/status`, () =>
        HttpResponse.json(passStatus()),
      ),
    );
    renderWithQuery(<TripsScreen />);

    const pass = (await screen.findByText("Next up")).closest("section")!;
    expect(within(pass).getByText("in 3 h")).toBeInTheDocument();
    expect(within(pass).getByText("YV-NEXTUP01")).toBeInTheDocument();
    expect(within(pass).getByText("Jetty 2, Havelock")).toBeInTheDocument();
    expect(within(pass).getByText("₹9,000 in cash")).toBeInTheDocument();
    expect(
      within(pass).getByText("2 new from the operator"),
    ).toBeInTheDocument();
    expect(await within(pass).findByText("The blue kiosk")).toBeInTheDocument();
    expect(
      within(pass).getByText(/Meet at jetty 2, not 1/),
    ).toBeInTheDocument();
    expect(
      within(pass).getByRole("link", { name: /Everything for the morning/ }),
    ).toHaveAttribute("href", "/booking#t=tok_next");

    // Drawn once: the list below holds only the later trip.
    const items = screen.getAllByRole("listitem");
    expect(items).toHaveLength(1);
    expect(items[0]).toHaveTextContent("Snorkel trip to Elephant Beach");
  });

  it("keeps the landmark while the pass asks again under a new token", async () => {
    /*
      `/me/bookings` mints a fresh status token for every row on every read,
      and the pass asks for its trip's status by token. So each refresh of the
      list was a new, empty query here, and the landmark and the operator's
      note blinked out for a round trip (6 Oct 2026).
    */
    signIn();
    noInvites();
    let statuses = 0;
    server.use(
      serverBookings((read) => [
        {
          reference: "YV-NEXTUP01",
          reservationId: "res_next",
          experience: "Try-dive at Nemo Reef",
          statusToken: `tok_next_${read}`,
          startsAt: inHours(3),
        },
      ]),
      http.get(`${BASE}/bookings/status`, async () => {
        statuses += 1;
        if (statuses > 1) await delay(400);
        return HttpResponse.json(passStatus());
      }),
    );
    const { client } = renderWithQuery(<TripsScreen />);
    const pass = (await screen.findByText("Next up")).closest("section")!;
    expect(await within(pass).findByText("The blue kiosk")).toBeInTheDocument();

    await act(async () => {
      await client.refetchQueries({ queryKey: ["listMyBookings"] });
      await new Promise((resolve) => setTimeout(resolve, 20));
    });
    expect(statuses).toBe(2);
    // Asked again, and still drawn while the answer is on its way.
    expect(within(pass).getByText("The blue kiosk")).toBeInTheDocument();
  });

  it("draws no pass for a trip more than a day away", async () => {
    signIn();
    noInvites();
    server.use(serverBookings([{ startsAt: inHours(30) }]));
    renderWithQuery(<TripsScreen />);
    await screen.findByText("Snorkel trip to Elephant Beach");
    expect(screen.queryByText("Next up")).toBeNull();
  });
});

/**
 * Get my link on a trip that is over (yuvoy-app#207): the Past tab only, and
 * only while the `creator` release is open.
 */
describe("a share link from a past trip", () => {
  const creator = (stage: "off" | "all") =>
    server.use(
      http.get(`${BASE}/app-config`, () =>
        HttpResponse.json({
          minimumVersion: { ios: "0.0.0", android: "0.0.0" },
          features: { payments: "coming_soon", inviteOnly: false },
          support: { whatsappE164: null, hours: "" },
          deliveryHost: null,
          releases: { creator: stage },
        }),
      ),
    );

  /** The creator release as the button reads it, once it is known. */
  function ReleaseProbe() {
    const release = useRelease("creator");
    return (
      <p data-testid="release">
        {release.stage} {release.pending ? "pending" : "known"}
      </p>
    );
  }

  it("is offered on Past and not on Upcoming", async () => {
    const user = userEvent.setup();
    await signIn();
    noInvites();
    creator("all");
    server.use(serverBookings([{ state: "completed" }]));

    renderWithQuery(<TripsScreen />);
    await screen.findByText("Snorkel trip to Elephant Beach");

    /*
      Past first: its button proves the release has been read as open, so
      its absence on Upcoming afterwards is the tab's decision and not a
      read still out.
    */
    await user.click(screen.getByRole("tab", { name: "Past" }));
    const offered = await screen.findByRole("button", { name: "Get my link" });
    // Beside the card, never inside the link to the booking, and about it.
    expect(offered.closest("a")).toBeNull();
    expect(offered).toHaveAccessibleDescription(
      "Snorkel trip to Elephant Beach",
    );

    await user.click(screen.getByRole("tab", { name: "Upcoming" }));
    await waitFor(() => expect(sent.at(-1)?.get("tab")).toBe("upcoming"));
    await waitFor(() =>
      expect(screen.queryByRole("button", { name: "Get my link" })).toBeNull(),
    );
    expect(
      await screen.findByText("Snorkel trip to Elephant Beach"),
    ).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "Get my link" })).toBeNull();
  });

  it("is not offered while the release is off", async () => {
    const user = userEvent.setup();
    await signIn();
    noInvites();
    creator("off");
    server.use(serverBookings([{ state: "completed" }]));

    renderWithQuery(
      <>
        <ReleaseProbe />
        <TripsScreen />
      </>,
    );
    await user.click(await screen.findByRole("tab", { name: "Past" }));
    await waitFor(() => expect(sent.at(-1)?.get("tab")).toBe("past"));
    await screen.findByText("Snorkel trip to Elephant Beach");
    // The same read the button waits on has answered, and it says off.
    await waitFor(() =>
      expect(screen.getByTestId("release")).toHaveTextContent("off known"),
    );
    expect(screen.queryByRole("button", { name: "Get my link" })).toBeNull();
  });
});
