import {
  describe,
  it,
  expect,
  vi,
  beforeAll,
  beforeEach,
  afterAll,
  afterEach,
} from "vitest";
import { act, screen, waitFor, cleanup, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { renderWithQuery } from "@/test/render";
import { addressBar, followHistory, navigateTo } from "@/test/address";
import { SearchScreen } from "./search-screen";
import { server } from "../../../mocks/server";
import { delay, http, HttpResponse } from "msw";
import { REELS } from "../../../mocks/fixtures";
import { reelFilterKey } from "@/lib/search/filters";
import type { ReelsPage } from "@/lib/feed/reels";
import { marketToday } from "@/lib/booking/availability-window";

const BASE = process.env.NEXT_PUBLIC_API_URL ?? "http://localhost:8099/v1";

/**
 * Search: a bar, one Filters button, and results as reels (yuvoy-app#37).
 *
 * ## The address is real enough to hold a search
 *
 * The filters live in the address, and that is the mechanism rather than a
 * detail: it is what lets a reel opened from the grid page the same filtered
 * order, and what makes back return to the same grid. The screen writes it in
 * place with `history.replaceState`, which Next folds into `useSearchParams`;
 * `followHistory` does the same here, so a screen that stopped writing it, or
 * went back to the router to write it, fails rather than passes.
 */
const router = vi.hoisted(() => ({ replace: vi.fn(), push: vi.fn() }));
vi.mock("next/navigation", async () => {
  const { useShownAddress } = await import("@/test/address");
  return {
    /*
      `LoginButton` sits in every logo header and in the feed masthead
      (yuvoy-app#56), and it reads both of these. A mock missing either
      fails the whole file with "No export is defined", which reads as a
      broken screen rather than an incomplete mock.
    */
    usePathname: () => "/search",
    useRouter: () => router,
    useSearchParams: () =>
      new URLSearchParams(useShownAddress().split("?")[1] ?? ""),
  };
});

const params = addressBar;

let unfollow = () => {};
beforeAll(() => {
  unfollow = followHistory();
});
afterAll(() => unfollow());
beforeEach(() => {
  navigateTo("/search");
  router.replace.mockClear();
  router.push.mockClear();
});
afterEach(cleanup);

/**
 * The pills under the search bar (yuvoy-app#37 item 1).
 *
 * The sharpest half of the owner's "very bad filters" verdict was not the wall
 * of chips inside the sheet: it was that NOTHING ON THE SCREEN showed what was
 * applied. A traveller could open a filtered URL, see an empty grid, and have
 * no way to know why except opening the sheet and reading sixty-one chips for
 * a highlight.
 */
describe("what is applied, on the screen", () => {
  it("shows nothing at all when nothing is applied", async () => {
    renderWithQuery(<SearchScreen />);
    await screen.findByRole("list", { name: "Search results" });
    // An empty row would be permanent furniture above every result.
    expect(screen.queryByRole("group", { name: "Filters applied" })).toBeNull();
  });

  it("names each applied filter in the server's own words", async () => {
    navigateTo("/search?place=andaman%2Fhavelock&kind=adventure");
    renderWithQuery(<SearchScreen />);

    const row = await screen.findByRole("group", { name: "Filters applied" });
    // "Havelock (Swaraj Dweep)" is the label verbatim. No title-casing of
    // `andaman/havelock` produces it.
    expect(
      await within(row).findByText("Havelock (Swaraj Dweep)"),
    ).toBeInTheDocument();
    expect(within(row).getByText("Adventure")).toBeInTheDocument();
  });

  it("does not make a pill out of the typed word", async () => {
    // The search box is already on screen and already holds it.
    navigateTo("/search?q=diving");
    renderWithQuery(<SearchScreen />);
    await screen.findByRole("list", { name: "Search results" });
    expect(screen.queryByRole("group", { name: "Filters applied" })).toBeNull();
  });

  it("takes one filter off with its own x, with no sheet and no Apply", async () => {
    /*
      The whole point. A removal writes the URL directly, so the grid reloads
      from page one with no cursor: `GET /reels` answers 400 to a cursor
      replayed under different filters.
    */
    const user = userEvent.setup();
    navigateTo("/search?place=andaman%2Fhavelock&kind=adventure");
    renderWithQuery(<SearchScreen />);

    const row = await screen.findByRole("group", { name: "Filters applied" });
    await within(row).findByText("Adventure");
    await user.click(
      within(row).getByRole("button", { name: "Remove Adventure" }),
    );

    await waitFor(() => expect(params().get("kind")).toBeNull());
    // And only that one.
    expect(params().get("place")).toBe("andaman/havelock");
  });

  it("takes the activity off with the category that framed it", async () => {
    const user = userEvent.setup();
    navigateTo("/search?kind=adventure&doing=scuba-diving");
    renderWithQuery(<SearchScreen />);

    const row = await screen.findByRole("group", { name: "Filters applied" });
    await within(row).findByText("Adventure");
    await user.click(
      within(row).getByRole("button", { name: "Remove Adventure" }),
    );

    await waitFor(() => expect(params().get("kind")).toBeNull());
    /*
      A type left behind would be a filter with no chip to un-tap: the activity
      chips only exist under a chosen category.
    */
    expect(params().get("doing")).toBeNull();
  });

  it("offers Clear all from two filters, and not from one", async () => {
    /*
      With one pill applied, its own x already clears everything, and a second
      control beside it that does the same thing is a choice a traveller has to
      read before discovering it was not one.
    */
    const { unmount } = renderWithQuery(<SearchScreen />);
    navigateTo("/search?kind=adventure");
    unmount();

    renderWithQuery(<SearchScreen />);
    const one = await screen.findByRole("group", { name: "Filters applied" });
    expect(within(one).queryByRole("button", { name: "Clear all" })).toBeNull();

    cleanup();
    navigateTo("/search?kind=adventure&place=andaman%2Fhavelock");
    renderWithQuery(<SearchScreen />);
    const two = await screen.findByRole("group", { name: "Filters applied" });
    expect(within(two).getByRole("button", { name: "Clear all" })).toBeTruthy();
  });

  it("Clear all keeps the typed word", async () => {
    /*
      Guaranteed TWICE, deliberately: `withoutFilters` returns `{ q }`, and
      `apply` re-adds the word from the search box's own state. So breaking
      either one alone leaves this green, which was checked rather than assumed:
      it goes red only with both broken.

      Worth writing down so a later reader does not take a single-path change
      passing here as proof the assertion is vacuous. The one-way version lives
      in `lib/search/labels.test.ts`, where it fails on its own.
    */
    const user = userEvent.setup();
    navigateTo("/search?q=diving&kind=adventure&place=andaman%2Fhavelock");
    renderWithQuery(<SearchScreen />);

    const row = await screen.findByRole("group", { name: "Filters applied" });
    await user.click(within(row).getByRole("button", { name: "Clear all" }));

    await waitFor(() => expect(params().get("kind")).toBeNull());
    expect(params().get("place")).toBeNull();
    // Somebody who narrowed "diving" to nothing did not ask to lose the word.
    expect(params().get("q")).toBe("diving");
  });

  it("shows a skeleton rather than a raw key while the vocabulary loads", async () => {
    /*
      `andaman/havelock` on screen is worse than a placeholder, and dropping
      the pill entirely would leave a filter applied with nothing to remove it.
      The x still works meanwhile: the filter IS applied.
    */
    server.use(
      http.get(`${BASE}/catalog/vocabulary`, async () => {
        await new Promise((r) => setTimeout(r, 300));
        return HttpResponse.json({
          destinations: [],
          categories: [],
          activityTypes: [],
        });
      }),
    );

    navigateTo("/search?place=andaman%2Fhavelock");
    renderWithQuery(<SearchScreen />);

    const row = await screen.findByRole("group", { name: "Filters applied" });
    expect(within(row).queryByText(/andaman/)).toBeNull();
    expect(
      within(row).getByRole("button", { name: "Remove this filter" }),
    ).toBeTruthy();
  });

  it("names a day as a word rather than a date where it can", async () => {
    navigateTo(`/search?on=${marketToday()}`);
    renderWithQuery(<SearchScreen />);
    const row = await screen.findByRole("group", { name: "Filters applied" });
    expect(within(row).getByText("Today")).toBeInTheDocument();
    expect(
      within(row).getByRole("button", { name: "Remove Today" }),
    ).toBeTruthy();
  });
});

/*
  T11 A (approved 4 Oct 2026): a wait is shown only once it has lasted 300ms,
  the last answer stays on screen until then, and once the skeleton is up it
  stays 300ms. Real timers: MSW's own delay is the wait.
*/
describe("waiting for an answer (T11 A)", () => {
  /** The full grid first, then every later read answered after `ms`. */
  function serveThenWait(ms: number) {
    let calls = 0;
    server.use(
      http.get(`${BASE}/reels`, async () => {
        calls += 1;
        if (calls > 1) await delay(ms);
        return HttpResponse.json({
          items: calls > 1 ? REELS.slice(0, 2) : REELS,
          complete: true,
        });
      }),
    );
  }

  const searching = () => screen.queryByRole("status", { name: "Searching" });
  const tiles = () =>
    within(screen.getByRole("list", { name: "Search results" })).getAllByRole(
      "listitem",
    );

  it("keeps the last answer on screen, marked busy, while the next one loads", async () => {
    serveThenWait(250);
    renderWithQuery(<SearchScreen />);
    await screen.findByRole("list", { name: "Search results" });
    const before = tiles().length;
    expect(before).toBeGreaterThan(2);

    // A filter, not the word: the search box owns the word.
    act(() => navigateTo("/search?kind=adventure"));

    // The old grid, still there, said to be out of date; no skeleton yet.
    expect(tiles()).toHaveLength(before);
    expect(
      screen
        .getByRole("list", { name: "Search results" })
        .closest("[aria-busy]"),
    ).toHaveAttribute("aria-busy", "true");
    expect(searching()).toBeNull();

    // A quick answer replaces it in place, with no skeleton between.
    await waitFor(() => expect(tiles()).toHaveLength(2));
    expect(searching()).toBeNull();
  });

  it("shows the skeleton only once a wait has lasted 300ms, then keeps it 300ms", async () => {
    serveThenWait(700);
    renderWithQuery(<SearchScreen />);
    await screen.findByRole("list", { name: "Search results" });

    const changed = performance.now();
    // A filter, not the word: the search box owns the word.
    act(() => navigateTo("/search?kind=adventure"));

    await new Promise((r) => setTimeout(r, 150));
    expect(searching(), "a skeleton for a wait of 150ms").toBeNull();

    const status = await screen.findByRole(
      "status",
      { name: "Searching" },
      { timeout: 2000 },
    );
    const shown = performance.now();
    expect(shown - changed).toBeGreaterThanOrEqual(290);
    // The true shape: two lines of words under every picture.
    expect(status.querySelectorAll(".rounded-tile")).toHaveLength(6);

    await waitFor(() => expect(searching()).toBeNull(), { timeout: 3000 });
    expect(performance.now() - shown).toBeGreaterThanOrEqual(290);
    expect(tiles()).toHaveLength(2);
  });
});

/**
 * The first page the server sent with the HTML (production readiness,
 * 6 Oct 2026). The grid used to be fetched only once the page had hydrated,
 * which made its first tile the slowest first paint in the app.
 */
describe("the first page the server sent", () => {
  const served = (title: string): ReelsPage =>
    ({
      items: [
        {
          media: {
            id: `m_${title}`,
            kind: "video",
            posterUrl: "data:image/svg+xml;utf8,%3Csvg%2F%3E",
            aspectRatio: "9:16",
          },
          experience: {
            id: `exp_${title}`,
            slug: `slug-${title}`,
            title,
            marketKey: "andaman",
            destinationKey: "andaman/havelock",
            category: "adventure",
            bookingMode: "allotment",
            durationMinutes: 120,
            operator: {
              id: "o1",
              slug: "o1",
              name: "Operator",
              verified: true,
            },
          },
        },
      ],
      complete: true,
    }) as ReelsPage;

  function countReads() {
    const seen = { calls: 0 };
    server.use(
      http.get(`${BASE}/reels`, () => {
        seen.calls += 1;
        return HttpResponse.json({ items: [], complete: true });
      }),
    );
    return seen;
  }

  it("is on screen at once, and not asked for again", async () => {
    navigateTo("/search?q=dive");
    const reads = countReads();

    renderWithQuery(
      <SearchScreen
        initial={{
          page: served("Served"),
          fetchedAt: Date.now(),
          key: reelFilterKey({ q: "dive" }),
        }}
      />,
    );

    expect(screen.getByRole("link", { name: /Served/ })).toBeInTheDocument();
    await new Promise((r) => setTimeout(r, 60));
    expect(reads.calls).toBe(0);
  });

  it("is never shown for a search it was not fetched for", async () => {
    navigateTo("/search?q=kayak");
    const reads = countReads();

    renderWithQuery(
      <SearchScreen
        initial={{
          page: served("Served"),
          fetchedAt: Date.now(),
          key: reelFilterKey({ q: "dive" }),
        }}
      />,
    );

    await waitFor(() => expect(reads.calls).toBe(1));
    expect(screen.queryByRole("link", { name: /Served/ })).toBeNull();
  });

  it("is let go once the search changes, so it cannot come back later", async () => {
    navigateTo("/search?q=dive");
    const reads = countReads();
    const user = userEvent.setup();
    const initial = {
      page: served("Served"),
      fetchedAt: Date.now(),
      key: reelFilterKey({ q: "dive" }),
    };

    const { client } = renderWithQuery(<SearchScreen initial={initial} />);
    const box = screen.getByRole("searchbox", { name: "Search experiences" });
    await user.type(box, "s");
    await waitFor(() => expect(params().get("q")).toBe("dives"));
    await waitFor(() => expect(reads.calls).toBeGreaterThan(0));

    // Back to the word it was fetched for, after its cache entry has gone.
    client.removeQueries();
    await user.type(box, "{Backspace}");
    await waitFor(() => expect(params().get("q")).toBe("dive"));
    await waitFor(() => expect(reads.calls).toBeGreaterThan(1));
    expect(screen.queryByRole("link", { name: /Served/ })).toBeNull();
  });
});
