import { describe, it, expect, vi, beforeEach } from "vitest";
import { screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { http, HttpResponse } from "msw";
import { server } from "../../../mocks/server";
import { mockHeaders } from "../../../mocks/fixtures";
import { renderWithQuery } from "@/test/render";
import { NO_FOUND_FILTERS } from "@/lib/found/found-filters";
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

describe("R3 closed: checkedCities is not open to this caller", () => {
  beforeEach(atHome);

  it("draws no chips, no search and no Filters, and the address narrows nothing", () => {
    renderFeed({
      checkedCities: false,
      filters: {
        ...NO_FOUND_FILTERS,
        when: "weekend",
        budget: "free",
        suits: "kids",
        difficulty: "hard",
      },
      search: { q: "dive", asText: [] },
    });
    expect(
      screen.queryByRole("group", { name: "Filter by day and price" }),
    ).toBeNull();
    expect(screen.queryByRole("search")).toBeNull();
    expect(screen.queryByRole("button", { name: /^Filters/ })).toBeNull();
    expect(titles()).toEqual(["Card 1", "Card 2"]);
  });
});

describe("R3 open", () => {
  beforeEach(atHome);

  it("narrows by a day, writes the address, and pages with the same filters", async () => {
    const asked = answerEvents((query) =>
      query.get("cursor")
        ? page([card(4)])
        : page([card(3)], {
            complete: false,
            nextCursor: "c2",
            window: { from: "2026-11-20", to: "2026-11-22" },
          }),
    );
    window.history.replaceState(null, "", "/?place=karnataka/bengaluru");
    renderFeed({ checkedCities: true });

    await userEvent.click(screen.getByRole("button", { name: "This weekend" }));
    await waitFor(() => expect(titles()).toEqual(["Card 3"]));
    expect(narrowing(asked[0])).toBe("when=weekend");
    expect(window.location.search).toBe(
      "?place=karnataka%2Fbengaluru&when=weekend",
    );
    expect(screen.getByTestId("found-window")).toHaveTextContent(
      "This weekend · Fri, 20 Nov to Sun, 22 Nov",
    );
  });

  it("passes the cursor back with the same filters, q and asText", async () => {
    const asked = answerEvents(() => page([card(4)]));
    io.fire = true;
    renderFeed({
      checkedCities: true,
      filters: { ...NO_FOUND_FILTERS, when: "today", budget: "free" },
      search: { q: "dive saturday", asText: ["saturday"] },
      firstPage: page([card(3)], { complete: false, nextCursor: "c2" }),
    });
    await waitFor(() => expect(titles()).toEqual(["Card 3", "Card 4"]));
    expect(narrowing(asked[0])).toBe(
      "when=today&free=true&q=dive saturday&asText=saturday&cursor=c2",
    );
  });

  it("combines Free with a day, and says so in the address", async () => {
    const asked = answerEvents(() => page([card(5)]));
    renderFeed({ checkedCities: true });
    await userEvent.click(screen.getByRole("button", { name: "Today" }));
    await userEvent.click(screen.getByRole("button", { name: "Free" }));
    await waitFor(() => expect(titles()).toEqual(["Card 5"]));
    expect(narrowing(asked.at(-1)!)).toBe("when=today&free=true");
    expect(window.location.search).toBe("?when=today&free=1");
  });

  it("says a day with nothing checked, and shows everything again", async () => {
    const asked = answerEvents((query) =>
      query.get("when") ? page([]) : page([card(6)]),
    );
    renderFeed({
      checkedCities: true,
      filters: { ...NO_FOUND_FILTERS, when: "tomorrow" },
      firstPage: page([]),
    });
    expect(
      screen.getByText("Nothing checked for tomorrow in Bengaluru yet."),
    ).toBeInTheDocument();
    expect(announced()).toBeEmptyDOMElement();
    await userEvent.click(
      screen.getByRole("button", { name: "Show everything" }),
    );
    // The button goes with the empty state: focus waits on the heading.
    expect(pageHeading()).toHaveFocus();
    await waitFor(() => expect(titles()).toEqual(["Card 6"]));
    expect(narrowing(asked.at(-1)!)).toBe("");
    expect(pageHeading()).toHaveFocus();
    expect(announced()).toHaveTextContent("1 thing to do.");
  });

  it("says nothing is free", () => {
    renderFeed({
      checkedCities: true,
      filters: { ...NO_FOUND_FILTERS, budget: "free" },
      firstPage: page([]),
    });
    expect(
      screen.getByText("Nothing free in Bengaluru right now."),
    ).toBeInTheDocument();
    expect(
      screen.getByRole("button", { name: "Show everything" }),
    ).toBeInTheDocument();
  });

  it("narrows by the Filters sheet's Budget and Time of day", async () => {
    const asked = answerEvents(() => page([card(7)]));
    renderFeed({ checkedCities: true });
    await userEvent.click(screen.getByRole("button", { name: "Filters" }));
    await userEvent.click(screen.getByRole("radio", { name: "Under ₹500" }));
    await userEvent.click(screen.getByRole("radio", { name: "Evening" }));
    await userEvent.click(screen.getByRole("button", { name: "Show results" }));
    await waitFor(() => expect(titles()).toEqual(["Card 7"]));
    expect(narrowing(asked.at(-1)!)).toBe("budget=under_500&timeOfDay=evening");
    expect(
      screen.getByRole("button", { name: "Filters, 2 on" }),
    ).toBeInTheDocument();
  });

  it("narrows by How long, Indoors or out, Who it suits and How hard in a local place, from page one", async () => {
    const asked = answerEvents(() => page([card(8)]));
    window.history.replaceState(null, "", "/?place=karnataka/bengaluru");
    renderFeed({
      checkedCities: true,
      firstPage: page([card(3)], { complete: false, nextCursor: "c2" }),
    });
    await userEvent.click(screen.getByRole("button", { name: "Filters" }));
    await userEvent.click(screen.getByRole("radio", { name: "Half a day" }));
    await userEvent.click(screen.getByRole("radio", { name: "Indoors" }));
    await userEvent.click(screen.getByRole("radio", { name: "Kids" }));
    await userEvent.click(screen.getByRole("radio", { name: "Hard" }));
    await userEvent.click(screen.getByRole("button", { name: "Show results" }));
    await waitFor(() => expect(titles()).toEqual(["Card 8"]));
    // Page one of a new list: the old cursor never goes with new filters.
    expect(narrowing(asked.at(-1)!)).toBe(
      "duration=half_day&setting=indoor&suits=kids&difficulty=hard",
    );
    expect(window.location.search).toBe(
      "?place=karnataka%2Fbengaluru&duration=half_day&setting=indoor&suits=kids&difficulty=hard",
    );
    expect(
      screen.getByRole("button", { name: "Filters, 4 on" }),
    ).toBeInTheDocument();
  });

  it("has no How hard in a travel place, and never sends difficulty there", async () => {
    const goa: ExplorePlace = {
      key: "goa/panaji",
      name: "Panaji",
      regionName: "Goa",
      kind: "travel",
      timezone: "Asia/Kolkata",
    };
    const asked = answerEvents(() => page([card(9)], { place: goa }));
    renderFeed({
      place: goa,
      placeName: "Panaji",
      checkedCities: true,
      // Handed in all the same, as a hand-edited address might.
      filters: { ...NO_FOUND_FILTERS, difficulty: "hard" },
      firstPage: page([card(1)], { place: goa }),
    });
    expect(screen.getByRole("button", { name: "Filters" })).toBeInTheDocument();
    await userEvent.click(screen.getByRole("button", { name: "Filters" }));
    expect(screen.queryByRole("group", { name: "How hard" })).toBeNull();
    expect(
      screen.getByRole("group", { name: "Who it suits" }),
    ).toBeInTheDocument();
    await userEvent.click(screen.getByRole("radio", { name: "Outdoors" }));
    await userEvent.click(screen.getByRole("button", { name: "Show results" }));
    await waitFor(() => expect(titles()).toEqual(["Card 9"]));
    expect(narrowing(asked.at(-1)!)).toBe("setting=outdoor");
    expect(window.location.search).toBe("?setting=outdoor");
  });
});
