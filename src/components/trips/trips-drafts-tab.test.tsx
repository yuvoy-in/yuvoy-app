import {
  describe,
  it,
  expect,
  vi,
  beforeAll,
  beforeEach,
  afterEach,
} from "vitest";
import { cleanup, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { http, HttpResponse } from "msw";
import { renderWithQuery } from "@/test/render";
import { useRelease } from "@/lib/site/use-release";
import { TRIGO_LISTS_WORDS as W } from "@/lib/trigo/lists-words";
import { TripsScreen } from "./trips-screen";
import { server } from "../../../mocks/server";
import { BASE, serveDrafts, signedIn } from "@/components/trigo/lists-test-kit";
import { defaultDrafts } from "../../../mocks/trigo-list-fixtures";

/* The same in-memory IndexedDB `trips-screen.test.tsx` uses: jsdom has none. */
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
beforeEach(() => idb.store.clear());
afterEach(cleanup);

/** One upcoming booking, and how often the bookings were asked for. */
function oneBooking() {
  const asked = { count: 0 };
  server.use(
    http.get(`${BASE}/me/invited-trips`, () =>
      HttpResponse.json({ trips: [] }),
    ),
    http.get(`${BASE}/me/bookings`, () => {
      asked.count += 1;
      return HttpResponse.json({
        nextCursor: null,
        bookings: [
          {
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
          },
        ],
      });
    }),
  );
  return asked;
}

/** Says when the release has answered, so an absence is the screen's choice. */
function ReleaseProbe() {
  const release = useRelease("trigo");
  return (
    <p data-testid="release">
      {release.stage} {release.pending ? "pending" : "known"}
    </p>
  );
}

/** The Drafts tab on Trips (yuvoy-app#220), behind the `trigo` release. */
describe("Trips: the Drafts tab", () => {
  it("comes fourth, after Cancelled, while the release is open", async () => {
    signedIn("all");
    oneBooking();
    serveDrafts([]);
    renderWithQuery(<TripsScreen />);

    await screen.findByRole("tab", { name: W.draftsTab });
    expect(screen.getAllByRole("tab").map((t) => t.textContent)).toEqual([
      "Upcoming",
      "Past",
      "Cancelled",
      W.draftsTab,
    ]);
  });

  it("shows the drafts with no date filter, and no bookings under them", async () => {
    const user = userEvent.setup();
    signedIn("all");
    const bookings = oneBooking();
    serveDrafts(defaultDrafts());
    renderWithQuery(<TripsScreen />);
    await screen.findByText("Snorkel trip to Elephant Beach");
    expect(screen.getByRole("button", { name: "Dates" })).toBeInTheDocument();
    const before = bookings.count;

    await user.click(await screen.findByRole("tab", { name: W.draftsTab }));
    expect(
      await screen.findByRole("heading", { name: "Havelock long weekend" }),
    ).toBeInTheDocument();
    expect(screen.getByRole("tab", { name: W.draftsTab })).toHaveAttribute(
      "aria-selected",
      "true",
    );
    expect(screen.queryByRole("button", { name: "Dates" })).toBeNull();
    expect(screen.queryByText("Snorkel trip to Elephant Beach")).toBeNull();
    expect(bookings.count).toBe(before);

    // Back on Upcoming, the bookings and the filter return.
    await user.click(screen.getByRole("tab", { name: "Upcoming" }));
    expect(
      await screen.findByText("Snorkel trip to Elephant Beach"),
    ).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Dates" })).toBeInTheDocument();
  });

  it("is not there while the release is closed, and the drafts are not read", async () => {
    signedIn("off");
    oneBooking();
    const drafts = serveDrafts([]);
    renderWithQuery(
      <>
        <ReleaseProbe />
        <TripsScreen />
      </>,
    );
    await screen.findByText("Snorkel trip to Elephant Beach");
    await waitFor(() =>
      expect(screen.getByTestId("release")).toHaveTextContent("off known"),
    );
    expect(screen.queryByRole("tab", { name: W.draftsTab })).toBeNull();
    expect(screen.getAllByRole("tab")).toHaveLength(3);
    expect(drafts.count).toBe(0);
  });
});
