import { describe, it, expect, vi, beforeEach } from "vitest";
import { screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { http, HttpResponse } from "msw";
import { server } from "../../../mocks/server";
import { mockHeaders, mockNow } from "../../../mocks/fixtures";
import { renderWithQuery } from "@/test/render";
import { marketDaysFrom } from "@/lib/booking/availability-window";
import { NO_FOUND_FILTERS, foundToday } from "@/lib/found/found-filters";
import type {
  ExplorePlace,
  FoundItem,
  FoundItemList,
} from "@/lib/found/found-words";
import { FoundFeed } from "./found-feed";

const BASE = process.env.NEXT_PUBLIC_API_URL ?? "http://localhost:8099/v1";

vi.mock("next/navigation", () => ({
  usePathname: () => "/",
  useSearchParams: () => new URLSearchParams(),
  useRouter: () => ({ push: vi.fn(), replace: vi.fn() }),
}));
vi.mock("./see-details", () => ({ SeeDetails: () => null }));
vi.mock("./report-sheet", () => ({ ReportSheet: () => null }));

/** jsdom has no IndexedDB: the hidden list is this Map. */
const idb = vi.hoisted(() => ({ store: new Map<string, unknown>() }));
vi.mock("idb-keyval", () => ({
  get: async (k: string) => idb.store.get(k),
  set: async (k: string, v: unknown) => {
    idb.store.set(k, v);
  },
}));

/**
 * An observer that reports the feed's foot on screen the moment it is
 * watched, when a test says so, and nothing else: the cards' `shown` observer
 * stays quiet. jsdom has no layout, so the scroll is driven rather than
 * simulated.
 */
const io = vi.hoisted(() => ({ fire: false }));
class FootObserver {
  constructor(private cb: IntersectionObserverCallback) {}
  observe(target: Element) {
    if (!io.fire || !target.hasAttribute("data-tail")) return;
    queueMicrotask(() =>
      this.cb(
        [{ isIntersecting: true, target } as IntersectionObserverEntry],
        this as unknown as IntersectionObserver,
      ),
    );
  }
  unobserve() {}
  disconnect() {}
  takeRecords() {
    return [];
  }
}

const PLACE: ExplorePlace = {
  key: "karnataka/bengaluru",
  name: "Bengaluru",
  regionName: "Karnataka",
  kind: "local",
  timezone: "Asia/Kolkata",
};

const card = (n: number, over: Partial<FoundItem> = {}): FoundItem => ({
  id: `00000000-0000-4000-8000-00000000000${n}`,
  kind: "event",
  department: "food_drink",
  title: `Card ${n}`,
  when: {
    startsOn: "2026-11-22",
    startTime: null,
    endsOn: null,
    repeats: null,
  },
  where: { placeText: "Cubbon Park", town: "Bengaluru" },
  price: { kind: "free", from: null, text: "Free" },
  status: "scheduled",
  check: {
    tier: "staff_checked",
    label: "Checked by Yuvoy · 16 Oct",
    checkedAt: "2026-10-16T09:00:00Z",
    lapsed: false,
    sourceName: null,
    sourceUrl: null,
  },
  ...over,
});

const page = (
  items: FoundItem[],
  over: Partial<FoundItemList> = {},
): FoundItemList => ({
  place: PLACE,
  items,
  complete: true,
  understood: [],
  ...over,
});

function renderFeed(
  props: Partial<Parameters<typeof FoundFeed>[0]> = {},
  trigger = <button type="button">Bengaluru</button>,
) {
  return renderWithQuery(
    <FoundFeed
      place={PLACE}
      placeName="Bengaluru"
      firstPage={page([card(1), card(2)])}
      category={null}
      signedIn={false}
      trigger={trigger}
      {...props}
    />,
  );
}

const titles = () =>
  within(screen.getAllByRole("feed")[0])
    .getAllByRole("article")
    .map((article) => within(article).getByRole("heading").textContent);

beforeEach(() => {
  idb.store.clear();
  io.fire = false;
  vi.stubGlobal("indexedDB", {});
  vi.stubGlobal("IntersectionObserver", FootObserver);
  window.history.replaceState(null, "", "/");
});

/* ------------------------------------------------- R3 (yuvoy-app#180) -- */

/**
 * Every `GET /events` this test made, as its query, answered by `answer`.
 * Each answer carries the mock's clock in its `Date` header, as every other
 * mocked route does, so the feed's clock offset reads one clock whichever
 * response lands last.
 */
function answerEvents(answer: (query: URLSearchParams) => FoundItemList) {
  const asked: URLSearchParams[] = [];
  server.use(
    http.get(`${BASE}/events`, ({ request }) => {
      const query = new URL(request.url).searchParams;
      asked.push(query);
      return HttpResponse.json(answer(query), {
        headers: mockHeaders("found-feed-r3"),
      });
    }),
  );
  return asked;
}

/** The R3 parameters of a request, in a fixed order, to compare. */
const narrowing = (query: URLSearchParams) =>
  [
    "when",
    "free",
    "budget",
    "timeOfDay",
    "duration",
    "setting",
    "suits",
    "difficulty",
    "q",
    "asText",
    "cursor",
  ]
    .flatMap((key) => query.getAll(key).map((value) => `${key}=${value}`))
    .join("&");

/** The page's heading, where focus goes when the control pressed goes. */
const pageHeading = () =>
  screen.getByRole("heading", { level: 1, name: "Things to do in Bengaluru" });
/** The polite line that says a narrowed list has landed. */
const announced = () => screen.getByTestId("found-announce");

/** Each R3 case starts on a bare `/`, as the address it writes is checked. */
function atHome() {
  window.history.replaceState(null, "", "/");
}

describe("R3 search", () => {
  beforeEach(atHome);

  const DIVE_SATURDAY: FoundItemList["understood"] = [
    {
      kind: "department",
      value: "adventure",
      label: "Adventure",
      from: "dive",
    },
    { kind: "when", value: "saturday", label: "Saturday", from: "saturday" },
  ];

  it("searches on submit, shows what the words were taken to mean, and a removed chip is searched as text", async () => {
    const asked = answerEvents((query) =>
      page([card(8)], {
        understood: query.getAll("asText").includes("saturday")
          ? DIVE_SATURDAY.slice(0, 1)
          : DIVE_SATURDAY,
      }),
    );
    renderFeed({ checkedCities: true });
    await userEvent.type(
      screen.getByRole("searchbox", { name: "Search Bengaluru" }),
      "dive saturday{Enter}",
    );
    const row = await screen.findByRole("group", { name: "Showing" });
    expect(narrowing(asked.at(-1)!)).toBe("q=dive saturday");
    expect(
      within(row)
        .getAllByRole("button")
        .map((chip) => chip.textContent),
    ).toEqual(["Adventure", "Saturday"]);

    await userEvent.click(
      within(row).getByRole("button", { name: "Remove Saturday" }),
    );
    await waitFor(() =>
      expect(narrowing(asked.at(-1)!)).toBe("q=dive saturday&asText=saturday"),
    );
    expect(window.location.search).toBe("?q=dive+saturday&asText=saturday");
    // The row goes while the list is read again: focus waits on the heading.
    expect(pageHeading()).toHaveFocus();
    await waitFor(() =>
      expect(
        screen.queryByRole("button", { name: "Remove Saturday" }),
      ).toBeNull(),
    );
    expect(pageHeading()).toHaveFocus();
    expect(announced()).toHaveTextContent("1 thing to do.");
  });

  it("offers another place the words named as a link, and never narrows by it", () => {
    renderFeed({
      checkedCities: true,
      search: { q: "coffee coorg", asText: [] },
      searchPlaces: ["karnataka/bengaluru", "karnataka/coorg"],
      firstPage: page([card(9)], {
        understood: [
          {
            kind: "place",
            value: "karnataka/coorg",
            label: "Coorg",
            from: "coorg",
          },
        ],
      }),
    });
    const link = screen.getByRole("link", { name: "Search in Coorg" });
    expect(link.getAttribute("href")).toContain("place=karnataka%2Fcoorg");
    expect(link.getAttribute("href")).toContain("q=coffee+coorg");
    expect(screen.queryByRole("button", { name: /^Remove/ })).toBeNull();
  });

  it("leaves the applied search and the field alone when the words are too short", async () => {
    const asked = answerEvents(() => page([card(2)]));
    renderFeed({
      checkedCities: true,
      search: { q: "dive", asText: [] },
      firstPage: page([card(1)]),
    });
    window.history.replaceState(null, "", "/?q=dive");
    const box = screen.getByRole("searchbox", { name: "Search Bengaluru" });
    await userEvent.clear(box);
    await userEvent.type(box, "d{Enter}");
    expect(box).toHaveValue("d");
    expect(titles()).toEqual(["Card 1"]);
    expect(asked).toEqual([]);
    expect(window.location.search).toBe("?q=dive");
    expect(announced()).toBeEmptyDOMElement();
  });

  it("says nothing matches, and Clear search shows the place again", async () => {
    const asked = answerEvents((query) =>
      query.get("q") ? page([]) : page([card(10)]),
    );
    renderFeed({
      checkedCities: true,
      search: { q: "zzz", asText: [] },
      firstPage: page([]),
    });
    expect(
      screen.getByText("Nothing in Bengaluru matches “zzz”."),
    ).toBeInTheDocument();
    const clears = screen.getAllByRole("button", { name: "Clear search" });
    await userEvent.click(clears.at(-1)!);
    await waitFor(() => expect(titles()).toEqual(["Card 10"]));
    expect(narrowing(asked.at(-1)!)).toBe("");
    expect(
      screen.getByRole("searchbox", { name: "Search Bengaluru" }),
    ).toHaveValue("");
  });
});

describe("R3 thin weekend", () => {
  beforeEach(atHome);

  it("also reads the plain list, shows what is coming up in two weeks, and the ask line", async () => {
    // The feed counts from the server's clock (the Date header), which in
    // the mocks is the fixture morning, not this machine's day.
    const days = marketDaysFrom(foundToday(mockNow(), "Asia/Kolkata"), 20);
    const on = (n: number, day: string) =>
      card(n, {
        when: { startsOn: day, startTime: null, endsOn: null, repeats: null },
      });
    const weekend = page([on(1, days[1])], {
      window: { from: days[1], to: days[3] },
    });
    const asked = answerEvents((query) =>
      query.get("when")
        ? weekend
        : // The plain list: one already shown, one in two weeks, one past them.
          page([on(1, days[1]), on(11, days[3]), on(12, days[19])]),
    );
    renderFeed({
      checkedCities: true,
      filters: { ...NO_FOUND_FILTERS, when: "weekend" },
      firstPage: weekend,
    });
    const coming = await screen.findByRole("feed", { name: "Coming up" });
    expect(asked.map(narrowing)).toContain("");
    expect(
      within(coming)
        .getAllByRole("article")
        .map((article) => within(article).getByRole("heading").textContent),
    ).toEqual(["Card 11"]);
    // Its own feed counts from 1; the list above is not in it.
    const [first] = within(coming).getAllByRole("article");
    expect(first).toHaveAttribute("aria-posinset", "1");
    expect(first).toHaveAttribute("aria-setsize", "1");
    // Where it sits on the page, for what is recorded, still runs on.
    expect(first).toHaveAttribute("data-found-position", "1");
    expect(
      screen.getByText(
        "Not much this weekend yet. Here's what's coming up in the next two weeks.",
      ),
    ).toBeInTheDocument();
    expect(
      screen.getByRole("link", { name: "Ask the Yuvoy team." }),
    ).toHaveAttribute("href", "/help");
  });
});
