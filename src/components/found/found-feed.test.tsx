import { describe, it, expect, vi, beforeEach } from "vitest";
import { act, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { http, HttpResponse, delay } from "msw";
import { server } from "../../../mocks/server";
import { renderWithQuery } from "@/test/render";
import { HIDDEN_CARDS_CHANGED } from "@/lib/found/device-store";
import { marketDaysFrom } from "@/lib/booking/availability-window";
import { foundToday } from "@/lib/found/found-filters";
import type {
  ExplorePlace,
  FoundItem,
  FoundItemList,
} from "@/lib/found/found-words";
import { FoundFeed } from "./found-feed";

/**
 * The found feed (yuvoy-app#179): the four feet (more, failed, stopped, end),
 * both empty states, the first page's failure with its retry, the chips from
 * the vocabulary, and the cards this browser hides left out.
 *
 * See details and Report a problem are other parts' components, stood in for
 * here. The API is MSW, on the plain client: every case is signed out.
 */

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

describe("the found feed", () => {
  it("shows the heading, the place line, the place button and the server's cards", () => {
    renderFeed();
    expect(
      screen.getByRole("heading", {
        level: 1,
        name: "Things to do in Bengaluru",
      }),
    ).toBeInTheDocument();
    expect(
      screen.getByText("Every card here was checked by a person at Yuvoy."),
    ).toBeInTheDocument();
    expect(
      screen.getByRole("button", { name: "Bengaluru" }),
    ).toBeInTheDocument();
    expect(screen.getByRole("feed")).toHaveAccessibleName(
      "Things to do in Bengaluru",
    );
    expect(titles()).toEqual(["Card 1", "Card 2"]);
  });

  it("says a travel place's cards are found by Trigo", () => {
    renderFeed({ place: { ...PLACE, kind: "travel" } });
    expect(
      screen.getByText(
        "Found by Trigo on organisers' and venues' own pages. Each card says whether a person has checked it.",
      ),
    ).toBeInTheDocument();
  });
});

describe("the foot", () => {
  it("says more is loading while there is a cursor", () => {
    renderFeed({
      firstPage: page([card(1)], { complete: false, nextCursor: "c2" }),
    });
    expect(screen.getByText("Loading more…")).toBeInTheDocument();
  });

  it("keeps the list and says so when a later page fails", async () => {
    server.use(
      http.get(`${BASE}/events`, () =>
        HttpResponse.json(
          { error: { code: "not_found", message: "Not found." } },
          { status: 404 },
        ),
      ),
    );
    io.fire = true;
    renderFeed({
      firstPage: page([card(1)], { complete: false, nextCursor: "c2" }),
    });
    expect(
      await screen.findByText(
        "More cards did not load. Scroll up and back down to try again.",
      ),
    ).toBeInTheDocument();
    expect(titles()).toEqual(["Card 1"]);
  });

  it("pages on with the server's own cursor", async () => {
    let asked: string | null = null;
    server.use(
      http.get(`${BASE}/events`, ({ request }) => {
        const url = new URL(request.url);
        asked = url.searchParams.get("cursor");
        return HttpResponse.json(page([card(2)]));
      }),
    );
    io.fire = true;
    renderFeed({
      firstPage: page([card(1)], { complete: false, nextCursor: "c2" }),
    });
    await waitFor(() => expect(titles()).toEqual(["Card 1", "Card 2"]));
    expect(asked).toBe("c2");
    expect(
      await screen.findByText("That's what we know about Bengaluru so far."),
    ).toBeInTheDocument();
  });

  it("never calls a stop without a cursor the end", () => {
    renderFeed({ firstPage: page([card(1)], { complete: false }) });
    expect(
      screen.getByText(
        "That's as far as we can load right now, not the end of the list. Reload to try again.",
      ),
    ).toBeInTheDocument();
    expect(
      screen.queryByText("That's what we know about Bengaluru so far."),
    ).toBeNull();
  });

  it("ends where the server says, with a way to another place", async () => {
    const picked = vi.fn();
    renderFeed(
      {},
      <button type="button" onClick={picked}>
        Bengaluru
      </button>,
    );
    expect(
      screen.getByText("That's what we know about Bengaluru so far."),
    ).toBeInTheDocument();
    await userEvent.click(
      screen.getByRole("button", { name: "Pick another place" }),
    );
    expect(picked).toHaveBeenCalledTimes(1);
  });
});

describe("empty", () => {
  it("says a place with nothing in it has nothing, and offers another place", () => {
    renderFeed({ firstPage: page([]) });
    expect(
      screen.getByText("Nothing to show in Bengaluru right now"),
    ).toBeInTheDocument();
    expect(
      screen.getByText(
        "Everything we had has ended or is being checked. Try another place, or come back soon.",
      ),
    ).toBeInTheDocument();
    expect(
      screen.getByRole("button", { name: "Pick another place" }),
    ).toBeInTheDocument();
    expect(screen.queryByRole("feed")).toBeNull();
  });

  it("says a department with nothing in it by the vocabulary's name, and shows everything again", async () => {
    let category: string | null = "unasked";
    server.use(
      http.get(`${BASE}/events`, ({ request }) => {
        category = new URL(request.url).searchParams.get("category");
        return HttpResponse.json(page([card(3)]));
      }),
    );
    window.history.replaceState(
      null,
      "",
      "/?place=karnataka/bengaluru&category=food_drink",
    );
    renderFeed({ firstPage: page([]), category: "food_drink" });
    expect(
      await screen.findByText("No food and drink in Bengaluru right now"),
    ).toBeInTheDocument();
    expect(screen.getByText("Try another kind of thing.")).toBeInTheDocument();

    await userEvent.click(
      screen.getByRole("button", { name: "Show everything" }),
    );
    await waitFor(() => expect(titles()).toEqual(["Card 3"]));
    expect(category).toBeNull();
    expect(window.location.search).toBe("?place=karnataka%2Fbengaluru");
  });
});

describe("the first page", () => {
  it("shows the error with a retry when the server could not read it, and asks nothing until then", async () => {
    let calls = 0;
    server.use(
      http.get(`${BASE}/events`, async () => {
        calls += 1;
        await delay(50);
        return HttpResponse.json(page([card(5)]));
      }),
    );
    renderFeed({ firstPage: null });
    expect(screen.getByRole("alert")).toHaveTextContent("Something went wrong");
    expect(calls).toBe(0);

    await userEvent.click(screen.getByRole("button", { name: "Try again" }));
    expect(
      await screen.findByRole("status", {
        name: "Loading things to do in Bengaluru",
      }),
    ).toBeInTheDocument();
    await waitFor(() => expect(titles()).toEqual(["Card 5"]));
    expect(calls).toBe(1);
  });
});

describe("the chips", () => {
  it("are All and the vocabulary's departments, and a chip reads its own list", async () => {
    let category: string | null = null;
    server.use(
      http.get(`${BASE}/events`, ({ request }) => {
        category = new URL(request.url).searchParams.get("category");
        return HttpResponse.json(page([card(7, { department: "adventure" })]));
      }),
    );
    renderFeed();
    const group = await screen.findByRole("group", {
      name: "Kinds of things to do",
    });
    await waitFor(() =>
      expect(
        within(group)
          .getAllByRole("button")
          .map((chip) => chip.textContent),
      ).toEqual([
        "All",
        "Adventure",
        "Nature and wildlife",
        "Food and drink",
        "Wellness",
      ]),
    );

    await userEvent.click(
      within(group).getByRole("button", { name: "Adventure" }),
    );
    await waitFor(() => expect(titles()).toEqual(["Card 7"]));
    expect(category).toBe("adventure");
    expect(window.location.search).toBe("?category=adventure");
  });
});

describe("hidden cards", () => {
  it("leaves out the cards this browser hides", async () => {
    idb.store.set("yv.hiddenCards", [{ id: card(1).id, at: Date.now() }]);
    renderFeed();
    await waitFor(() => expect(titles()).toEqual(["Card 2"]));
  });

  it("drops a card the moment it is hidden", async () => {
    renderFeed();
    expect(titles()).toEqual(["Card 1", "Card 2"]);
    act(() => {
      window.dispatchEvent(
        new CustomEvent(HIDDEN_CARDS_CHANGED, { detail: { id: card(2).id } }),
      );
    });
    await waitFor(() => expect(titles()).toEqual(["Card 1"]));
  });
});

/* ------------------------------------------------- R3 (yuvoy-app#180) -- */

/** Every `GET /events` this test made, as its query, answered by `answer`. */
function answerEvents(answer: (query: URLSearchParams) => FoundItemList) {
  const asked: URLSearchParams[] = [];
  server.use(
    http.get(`${BASE}/events`, ({ request }) => {
      const query = new URL(request.url).searchParams;
      asked.push(query);
      return HttpResponse.json(answer(query));
    }),
  );
  return asked;
}

/** The R3 parameters of a request, in a fixed order, to compare. */
const narrowing = (query: URLSearchParams) =>
  ["when", "free", "budget", "timeOfDay", "q", "asText", "cursor"]
    .flatMap((key) => query.getAll(key).map((value) => `${key}=${value}`))
    .join("&");

/** Each R3 case starts on a bare `/`, as the address it writes is checked. */
function atHome() {
  window.history.replaceState(null, "", "/");
}

describe("R3 closed: checkedCities is not open to this caller", () => {
  beforeEach(atHome);

  it("draws no chips, no search and no Filters, and the address narrows nothing", () => {
    renderFeed({
      checkedCities: false,
      filters: { when: "weekend", budget: "free", timeOfDay: null },
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
      filters: { when: "today", budget: "free", timeOfDay: null },
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
      filters: { when: "tomorrow", budget: null, timeOfDay: null },
      firstPage: page([]),
    });
    expect(
      screen.getByText("Nothing checked for tomorrow in Bengaluru yet."),
    ).toBeInTheDocument();
    await userEvent.click(
      screen.getByRole("button", { name: "Show everything" }),
    );
    await waitFor(() => expect(titles()).toEqual(["Card 6"]));
    expect(narrowing(asked.at(-1)!)).toBe("");
  });

  it("says nothing is free", () => {
    renderFeed({
      checkedCities: true,
      filters: { when: null, budget: "free", timeOfDay: null },
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
    await userEvent.click(screen.getByRole("button", { name: "Under ₹500" }));
    await userEvent.click(screen.getByRole("button", { name: "Evening" }));
    await userEvent.click(screen.getByRole("button", { name: "Show results" }));
    await waitFor(() => expect(titles()).toEqual(["Card 7"]));
    expect(narrowing(asked.at(-1)!)).toBe("budget=under_500&timeOfDay=evening");
    expect(
      screen.getByRole("button", { name: "Filters, 2 on" }),
    ).toBeInTheDocument();
  });
});

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
    await waitFor(() =>
      expect(
        screen.queryByRole("button", { name: "Remove Saturday" }),
      ).toBeNull(),
    );
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
    const days = marketDaysFrom(foundToday(Date.now(), "Asia/Kolkata"), 20);
    const on = (n: number, day: string) =>
      card(n, {
        when: { startsOn: day, startTime: null, endsOn: null, repeats: null },
      });
    const asked = answerEvents(() =>
      // The plain list: one already shown, one in two weeks, one past them.
      page([on(1, days[1]), on(11, days[3]), on(12, days[19])]),
    );
    renderFeed({
      checkedCities: true,
      filters: { when: "weekend", budget: null, timeOfDay: null },
      firstPage: page([on(1, days[1])], {
        window: { from: "2026-11-20", to: "2026-11-22" },
      }),
    });
    const coming = await screen.findByRole("feed", { name: "Coming up" });
    expect(narrowing(asked[0])).toBe("");
    expect(
      within(coming)
        .getAllByRole("article")
        .map((article) => within(article).getByRole("heading").textContent),
    ).toEqual(["Card 11"]);
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
