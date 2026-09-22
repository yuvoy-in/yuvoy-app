import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { screen, waitFor, cleanup, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { renderWithQuery } from "@/test/render";
import { SearchScreen } from "./search-screen";
import { server } from "../../../mocks/server";
import { http, HttpResponse } from "msw";
import { marketToday, marketDaysFrom } from "@/lib/booking/availability-window";
import { dateLabel } from "@/lib/search/labels";

const BASE = process.env.NEXT_PUBLIC_API_URL ?? "http://localhost:8099/v1";

/**
 * Search — a bar, one Filters button, and results as reels (yuvoy-app#37).
 *
 * ## The router is real enough to hold a URL
 *
 * The filters live in the address now, and that is the mechanism rather than a
 * detail: it is what lets a reel opened from the grid page the same filtered
 * order, and what makes back return to the same grid. A router mock that threw
 * the URL away would make every test here pass against a screen that had
 * silently stopped writing it.
 */
const nav = vi.hoisted(() => ({ url: "/search" }));
vi.mock("next/navigation", () => ({
  /*
    `LoginButton` sits in every logo header and in the feed masthead
    (yuvoy-app#56), and it reads both of these. A mock missing either
    fails the whole file with "No export is defined", which reads as a
    broken screen rather than an incomplete mock.
  */
  usePathname: () => "/search",
  useRouter: () => ({
    replace: (href: string) => {
      nav.url = href;
    },
    push: (href: string) => {
      nav.url = href;
    },
  }),
  useSearchParams: () => new URLSearchParams(nav.url.split("?")[1] ?? ""),
}));

const params = () => new URLSearchParams(nav.url.split("?")[1] ?? "");

beforeEach(() => {
  nav.url = "/search";
});
afterEach(cleanup);

/** Opens the sheet and hands back its dialog. */
async function openFilters(user: ReturnType<typeof userEvent.setup>) {
  await user.click(screen.getByRole("button", { name: /^Filters/ }));
  return screen.getByRole("dialog", { name: "Filters" });
}

describe("the default state is the grid, not a prompt", () => {
  it("shows the unfiltered grid straight away", async () => {
    /*
      The owner's decision on 14 September (yuvoy-app#37 item 9). This screen
      used to refuse to ask anything until something was asked for: an empty
      query was a prompt with two links, on the reasoning that "everything" is
      what the feed is for.

      A search screen whose first state is an instruction is one that has to be
      obeyed before it does anything.
    */
    let calls = 0;
    server.use(
      http.get(`${BASE}/reels`, () => {
        calls += 1;
        return HttpResponse.json({ items: [], complete: true });
      }),
    );

    renderWithQuery(<SearchScreen />);
    await waitFor(() => expect(calls).toBeGreaterThan(0));
    // And the prompt it replaces is gone, links and all.
    expect(screen.queryByText(/Pick a day or a place/)).toBeNull();
    expect(screen.queryByRole("link", { name: "Browse the feed" })).toBeNull();
    expect(screen.queryByRole("link", { name: "Read the guides" })).toBeNull();
  });

  it("asks for nothing in particular, so the grid is the whole rotation", async () => {
    const seen: string[] = [];
    server.use(
      http.get(`${BASE}/reels`, ({ request }) => {
        seen.push(new URL(request.url).search);
        return HttpResponse.json({ items: [], complete: true });
      }),
    );

    renderWithQuery(<SearchScreen />);
    await waitFor(() => expect(seen.length).toBeGreaterThan(0));
    for (const name of ["q", "bookableOn", "destinationKey", "category"]) {
      expect(seen.at(-1), name).not.toMatch(new RegExp(`[?&]${name}=`));
    }
  });

  it("returns to the unfiltered grid when the words are cleared", async () => {
    const user = userEvent.setup();
    const { rerender } = renderWithQuery(<SearchScreen />);

    const box = screen.getByRole("searchbox", { name: "Search experiences" });
    await user.type(box, "kayak");
    await waitFor(() => expect(params().get("q")).toBe("kayak"));

    await user.clear(box);
    await waitFor(() => expect(params().get("q")).toBeNull());
    rerender(<SearchScreen />);
    // A grid, not a prompt.
    expect(
      await screen.findByRole("list", { name: "Search results" }),
    ).toBeInTheDocument();
  });
});

describe("the filter set lives in the address", () => {
  it("writes the typed words there, and searches on them", async () => {
    const user = userEvent.setup();
    renderWithQuery(<SearchScreen />);

    await user.type(
      screen.getByRole("searchbox", { name: "Search experiences" }),
      "kayak",
    );

    await waitFor(() => expect(params().get("q")).toBe("kayak"));
    expect(
      await screen.findByRole("link", { name: /Mangrove kayak at dawn/ }),
    ).toBeInTheDocument();
    expect(
      screen.queryByRole("link", { name: /Try-dive at Nemo Reef/ }),
    ).toBeNull();
  });

  it("treats a day alone as a real question, sent without q", async () => {
    /*
      "A day alone is a real question" was this screen's stated design and was
      FALSE against the live API until 9 Sep 2026 (yuvoy-api#132 → #133). Text
      and filters are independent now, and either alone is a real search.
    */
    const user = userEvent.setup();
    const seen: string[] = [];
    server.use(
      http.get(`${BASE}/reels`, ({ request }) => {
        seen.push(new URL(request.url).search);
        return HttpResponse.json({ items: [], complete: true });
      }),
    );

    renderWithQuery(<SearchScreen />);
    const sheet = await openFilters(user);
    await user.click(within(sheet).getByRole("button", { name: "Today" }));
    await user.click(
      within(sheet).getByRole("button", { name: "Show results" }),
    );

    await waitFor(() => expect(params().get("on")).toBeTruthy());
    await waitFor(() => expect(seen.length).toBeGreaterThan(0));
    expect(seen.at(-1)).toMatch(/bookableOn=/);
    expect(seen.at(-1)).not.toMatch(/[?&]q=/);
  });

  it("carries the whole filter set to the reel a tile opens", async () => {
    /*
      Without the filters the strip would fall back to the unfiltered feed and
      the second swipe would leave the search behind — which is the one thing
      "swiping goes to the next reel in the same filtered order" rules out.
    */
    const user = userEvent.setup();
    renderWithQuery(<SearchScreen />);
    await user.type(
      screen.getByRole("searchbox", { name: "Search experiences" }),
      "kayak",
    );

    const tile = await screen.findByRole("link", {
      name: /Mangrove kayak at dawn/,
    });
    const href = tile.getAttribute("href")!;
    expect(href).toMatch(/^\/search\/r\/med_kayak\?/);
    expect(new URLSearchParams(href.split("?")[1]).get("q")).toBe("kayak");
  });
});

describe("the filter sheet", () => {
  it("is one button, not three rows of chips on the screen", async () => {
    /*
      The complaint this issue is about. Nothing may render the chips outside
      the sheet: they filled the phone above the results, so a search screen
      showed no results until you scrolled past its own controls.
    */
    renderWithQuery(<SearchScreen />);
    expect(screen.getByRole("button", { name: /^Filters/ })).toBeTruthy();
    expect(screen.queryByRole("group", { name: "When" })).toBeNull();
    expect(screen.queryByRole("group", { name: "Where" })).toBeNull();
  });

  it("offers the API's own words, not a list derived from listings", async () => {
    /*
      `GET /catalog/vocabulary` (api#173) replaced chips derived from a
      fifty-item page of `/experiences`. "Havelock (Swaraj Dweep)" is the
      server's label verbatim — no title-casing of `andaman/havelock` produces
      it — and Wellness is offered with nothing behind it, which the endpoint
      documents: it publishes the ACTIVE vocabulary, not the populated one.
    */
    const user = userEvent.setup();
    renderWithQuery(<SearchScreen />);
    const sheet = await openFilters(user);

    await within(sheet).findByRole("button", {
      name: "Havelock (Swaraj Dweep)",
    });
    expect(
      within(sheet).getByRole("button", { name: "Wellness" }),
    ).toBeTruthy();
  });

  it("shows NO activity chips until a category is chosen", async () => {
    /*
      The other half of the owner's "very bad" verdict. All 35 activity types
      were on the sheet at once, next to 12 categories and 14 day chips: sixty
      one controls, harder to read than the three rows they replaced.

      Activity only exists in relation to a category, so it only appears once
      one is chosen, and then only that category's types (item 6).
    */
    const user = userEvent.setup();
    renderWithQuery(<SearchScreen />);
    const sheet = await openFilters(user);

    await within(sheet).findByRole("button", { name: "Adventure" });
    expect(within(sheet).queryByRole("group", { name: "Activity" })).toBeNull();
    expect(
      within(sheet).queryByRole("button", { name: "Scuba diving" }),
    ).toBeNull();
    expect(within(sheet).queryByRole("button", { name: "Tasting" })).toBeNull();

    await user.click(within(sheet).getByRole("button", { name: "Adventure" }));

    expect(
      within(sheet).getByRole("group", { name: "Activity" }),
    ).toBeInTheDocument();
    expect(
      within(sheet).getByRole("button", { name: "Scuba diving" }),
    ).toBeTruthy();
    // And ONLY Adventure's. Tasting belongs to another category.
    expect(within(sheet).queryByRole("button", { name: "Tasting" })).toBeNull();
  });

  it("re-narrows the activity chips when the category changes", async () => {
    const user = userEvent.setup();
    renderWithQuery(<SearchScreen />);
    const sheet = await openFilters(user);

    await within(sheet).findByRole("button", { name: "Adventure" });
    await user.click(within(sheet).getByRole("button", { name: "Adventure" }));
    await within(sheet).findByRole("button", { name: "Scuba diving" });

    await user.click(
      within(sheet).getByRole("button", { name: "Nature and wildlife" }),
    );
    expect(
      within(sheet).getByRole("button", { name: "Birdwatching" }),
    ).toBeTruthy();
    expect(
      within(sheet).queryByRole("button", { name: "Scuba diving" }),
    ).toBeNull();
  });

  it("offers four When chips, not a fortnight of them", async () => {
    /*
      Fourteen day chips could never reach past a fortnight however many were
      added, and a traveller looking for a date in November had no way to ask.
      Four chips and a calendar behind the fourth (item 4).
    */
    const user = userEvent.setup();
    renderWithQuery(<SearchScreen />);
    const sheet = await openFilters(user);

    const when = within(sheet).getByRole("group", { name: "When" });
    expect(within(when).getAllByRole("button")).toHaveLength(4);
    for (const name of ["Any day", "Today", "Tomorrow", "Pick a date"]) {
      expect(within(when).getByRole("button", { name }), name).toBeTruthy();
    }
  });

  it("opens a month calendar behind Pick a date, and the chip then reads it", async () => {
    const user = userEvent.setup();
    renderWithQuery(<SearchScreen />);
    const sheet = await openFilters(user);

    await user.click(
      within(sheet).getByRole("button", { name: "Pick a date" }),
    );

    // A real month, with the arrows to move between them.
    expect(
      within(sheet).getByRole("button", { name: "Next month" }),
    ).toBeTruthy();
    expect(
      within(sheet).getByRole("button", { name: "Previous month" }),
    ).toBeTruthy();

    /*
      Exactly ONE button named "Today": the When chip. A calendar cell is named
      by its date, never by "Today" or "Tomorrow", so the two cannot collide in
      one dialog. An earlier draft of this test expected two, which is how the
      collision was found.
    */
    expect(
      within(sheet).getAllByRole("button", { name: "Today" }),
    ).toHaveLength(1);

    /*
      A cell is reachable by its date, and the chip then READS that date, so
      the applied day is legible without re-opening the calendar. "Pick a date"
      with a date quietly selected behind it is the fault this issue is about.
    */
    const [, tomorrow] = marketDaysFrom(marketToday(), 2);
    const cell = within(sheet).getByRole("button", {
      name: dateLabel(tomorrow),
    });
    await user.click(cell);

    expect(
      within(sheet).queryByRole("button", { name: "Pick a date" }),
    ).toBeNull();
    expect(
      within(sheet).getByRole("button", { name: dateLabel(tomorrow) }),
    ).toBeTruthy();

    await user.click(
      within(sheet).getByRole("button", { name: "Show results" }),
    );
    await waitFor(() => expect(params().get("on")).toBe(tomorrow));
  });

  it("refuses a date outside the window the API will answer", async () => {
    /*
      Before today, or more than 89 days after it. A disabled cell rather than
      a styled one: the API refuses those dates, so letting one be pressed
      would spend a round trip to show an empty grid.
    */
    const user = userEvent.setup();
    renderWithQuery(<SearchScreen />);
    const sheet = await openFilters(user);
    await user.click(
      within(sheet).getByRole("button", { name: "Pick a date" }),
    );

    const today = marketToday();
    // The day before today, whichever month it falls in.
    const before = new Date(`${today}T12:00:00+05:30`);
    before.setUTCDate(before.getUTCDate() - 1);
    const priorDate = before.toISOString().slice(0, 10);

    const priorCell = within(sheet).queryByRole("button", {
      name: dateLabel(priorDate),
    });
    // Only present when yesterday falls in the month on screen.
    if (priorCell) expect(priorCell).toBeDisabled();
    expect(
      within(sheet).getByRole("button", { name: dateLabel(today) }),
    ).toBeEnabled();
  });

  it("changes nothing until Show results", async () => {
    /*
      A sheet that filtered live would refetch on every tap and leave the grid
      reflowing under a panel nobody can see past. It also makes the footer's
      "Clear all" meaningful: it empties the DRAFT, and the traveller still has
      to say so.
    */
    const user = userEvent.setup();
    renderWithQuery(<SearchScreen />);
    const sheet = await openFilters(user);

    await user.click(within(sheet).getByRole("button", { name: "Today" }));
    expect(params().get("on")).toBeNull();

    await user.click(
      within(sheet).getByRole("button", { name: "Show results" }),
    );
    await waitFor(() => expect(params().get("on")).toBeTruthy());
  });

  it("forgets edits that were abandoned rather than applied", async () => {
    const user = userEvent.setup();
    renderWithQuery(<SearchScreen />);

    let sheet = await openFilters(user);
    await user.click(within(sheet).getByRole("button", { name: "Today" }));
    await user.click(within(sheet).getByRole("button", { name: "Close" }));

    sheet = await openFilters(user);
    expect(
      within(sheet).getByRole("button", { name: "Any day" }),
    ).toHaveAttribute("aria-pressed", "true");
  });

  it("clears the activity type with the category that framed it", async () => {
    /*
      The type chips are narrowed BY the category. Leaving one selected that is
      no longer on screen is a filter a traveller cannot see and cannot remove.
    */
    const user = userEvent.setup();
    renderWithQuery(<SearchScreen />);
    const sheet = await openFilters(user);

    await within(sheet).findByRole("button", { name: "Adventure" });
    await user.click(within(sheet).getByRole("button", { name: "Adventure" }));
    await user.click(
      within(sheet).getByRole("button", { name: "Scuba diving" }),
    );
    /*
      There is no "Anything" chip any more (item 5): tapping the SELECTED chip
      unselects it, so a neutral option would be a second way to do one thing.
    */
    await user.click(within(sheet).getByRole("button", { name: "Adventure" }));
    await user.click(
      within(sheet).getByRole("button", { name: "Show results" }),
    );

    await waitFor(() => expect(params().get("kind")).toBeNull());
    expect(params().get("doing")).toBeNull();
  });

  it("keeps searching when the vocabulary read fails", async () => {
    // The text box and the day chips do not depend on it, so an error state
    // over the whole sheet would remove the parts that still work.
    const user = userEvent.setup();
    server.use(
      http.get(`${BASE}/catalog/vocabulary`, () =>
        HttpResponse.json({ error: { code: "server_error" } }, { status: 500 }),
      ),
    );

    renderWithQuery(<SearchScreen />);
    const sheet = await openFilters(user);
    expect(
      await within(sheet).findByText("Places and activities did not load."),
    ).toBeInTheDocument();
    // Offered again rather than left dead (item 7).
    expect(
      within(sheet).getByRole("button", { name: "Try again" }),
    ).toBeTruthy();
    // And When still works: these are dates, not server data.
    expect(within(sheet).getByRole("button", { name: "Today" })).toBeTruthy();
  });
});

describe("results", () => {
  it("are reels in a grid, not listing rows", async () => {
    const user = userEvent.setup();
    renderWithQuery(<SearchScreen />);
    await user.type(
      screen.getByRole("searchbox", { name: "Search experiences" }),
      "dive",
    );

    const grid = await screen.findByRole("list", { name: "Search results" });
    expect(within(grid).getAllByRole("link").length).toBeGreaterThan(0);
    // The row's furniture is gone: no price, no booking-mode line.
    expect(screen.queryByText(/Price on request/)).toBeNull();
    expect(screen.queryByText(/Instant book/)).toBeNull();
  });

  it("says nothing matched, and offers to clear the filters that caused it", async () => {
    /*
      A single chip can now legitimately find nothing — the vocabulary is the
      ACTIVE one, not the populated one — so the empty state has to be useful
      rather than assuming the word is at fault.
    */
    const user = userEvent.setup();
    renderWithQuery(<SearchScreen />);
    const sheet = await openFilters(user);
    await within(sheet).findByRole("button", { name: "Wellness" });
    await user.click(within(sheet).getByRole("button", { name: "Wellness" }));
    await user.click(
      within(sheet).getByRole("button", { name: "Show results" }),
    );

    expect(await screen.findByText("No matches")).toBeInTheDocument();
    expect(
      screen.getByRole("button", { name: "Clear all filters" }),
    ).toBeInTheDocument();
  });

  it("surfaces an unknown category as an error rather than an empty page", async () => {
    /*
      The contract's asymmetry, and it is deliberate on both sides: `category`
      is a CLOSED enum, so a 400 means this build and the server disagree about
      a fixed vocabulary — a real bug worth seeing. `activityType` grows by
      INSERT, so an unknown one is an empty page. A client that could not tell
      them apart is exactly what the contract is guarding against.
    */
    nav.url = "/search?kind=not_a_category";
    renderWithQuery(<SearchScreen />);
    expect(await screen.findByRole("alert")).toBeInTheDocument();
  });

  it("treats an unknown activity type as an empty page, not an error", async () => {
    nav.url = "/search?doing=not_a_thing_yet";
    renderWithQuery(<SearchScreen />);
    expect(await screen.findByText("No matches")).toBeInTheDocument();
    expect(screen.queryByRole("alert")).toBeNull();
  });
});

/**
 * How long and how much (yuvoy-api#197).
 *
 * `GET /reels` takes four inclusive ranges. The sheet offers them as three
 * bands each, and a price band leaves listings priced for a whole group out
 * of the results by the owner's decision, which the screen has to say.
 */
describe("length and price", () => {
  it("sends the bands chosen in the sheet, from page one, and writes them to the address", async () => {
    const user = userEvent.setup();
    const seen: URLSearchParams[] = [];
    server.use(
      http.get(`${BASE}/reels`, ({ request }) => {
        seen.push(new URL(request.url).searchParams);
        return HttpResponse.json({ items: [], complete: true });
      }),
    );

    renderWithQuery(<SearchScreen />);
    const sheet = await openFilters(user);
    await user.click(
      within(sheet).getByRole("button", { name: "2 to 4 hours" }),
    );
    await user.click(
      within(sheet).getByRole("button", { name: "₹2,000 to ₹4,000" }),
    );
    await user.click(
      within(sheet).getByRole("button", { name: "Show results" }),
    );

    await waitFor(() => expect(params().get("length")).toBe("medium"));
    expect(params().get("price")).toBe("mid");

    await waitFor(() =>
      expect(seen.at(-1)?.get("minDurationMinutes")).toBe("120"),
    );
    const last = seen.at(-1)!;
    expect(last.get("maxDurationMinutes")).toBe("240");
    expect(last.get("minPriceMinor")).toBe("200000");
    expect(last.get("maxPriceMinor")).toBe("400000");
    // A new filter set is a new first page: a cursor minted under the old one
    // would be a 400.
    expect(last.get("cursor")).toBeNull();
  });

  it("says a price band leaves group-priced trips out, the moment one is chosen", async () => {
    const user = userEvent.setup();
    renderWithQuery(<SearchScreen />);
    const sheet = await openFilters(user);
    expect(within(sheet).queryByText(/priced for a whole group/)).toBeNull();

    await user.click(
      within(sheet).getByRole("button", { name: "Up to ₹2,000" }),
    );
    expect(
      within(sheet).getByText(
        "Prices are per person, so trips priced for a whole group are not included.",
      ),
    ).toBeInTheDocument();

    // And "Any price" takes both the band and the sentence away.
    await user.click(within(sheet).getByRole("button", { name: "Any price" }));
    expect(within(sheet).queryByText(/priced for a whole group/)).toBeNull();
  });

  it("keeps saying so under the pills for as long as a price band is applied", async () => {
    nav.url = "/search?price=high";
    renderWithQuery(<SearchScreen />);
    const row = await screen.findByRole("group", { name: "Filters applied" });
    expect(within(row).getByText("₹4,000 and up")).toBeInTheDocument();
    expect(screen.getByText(/priced for a whole group/)).toBeInTheDocument();

    cleanup();
    nav.url = "/search?length=short";
    renderWithQuery(<SearchScreen />);
    await screen.findByRole("group", { name: "Filters applied" });
    // A length band says nothing about group pricing: duration is unaffected.
    expect(screen.queryByText(/priced for a whole group/)).toBeNull();
  });

  it("leaves a group-priced listing out of a price band, even a band it fits", async () => {
    /*
      Against the mock, which filters the way the API does. The private
      charter is ₹18,000 FOR THE GROUP, which "₹4,000 and up" would include
      if a price for the whole boat were compared with a price for one person.
    */
    nav.url = "/search?price=high";
    renderWithQuery(<SearchScreen />);
    // The try-dive (₹4,500 per person) has three reels, all of them in.
    expect(
      (await screen.findAllByRole("link", { name: /Try-dive at Nemo Reef/ }))
        .length,
    ).toBeGreaterThan(0);
    expect(
      screen.queryByRole("link", { name: /Private boat charter/ }),
    ).toBeNull();
  });

  it("takes a band off with its own x", async () => {
    const user = userEvent.setup();
    nav.url = "/search?length=short&kind=adventure";
    renderWithQuery(<SearchScreen />);

    const row = await screen.findByRole("group", { name: "Filters applied" });
    await user.click(
      within(row).getByRole("button", { name: "Remove Up to 2 hours" }),
    );
    await waitFor(() => expect(params().get("length")).toBeNull());
    expect(params().get("kind")).toBe("adventure");
  });

  it("counts a band on the Filters button", async () => {
    nav.url = "/search?length=long&price=low";
    renderWithQuery(<SearchScreen />);
    expect(
      screen.getByRole("button", { name: "Filters, 2 on" }),
    ).toBeInTheDocument();
  });
});

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
    nav.url = "/search?place=andaman%2Fhavelock&kind=adventure";
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
    nav.url = "/search?q=diving";
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
    nav.url = "/search?place=andaman%2Fhavelock&kind=adventure";
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
    nav.url = "/search?kind=adventure&doing=scuba-diving";
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
    nav.url = "/search?kind=adventure";
    unmount();

    renderWithQuery(<SearchScreen />);
    const one = await screen.findByRole("group", { name: "Filters applied" });
    expect(within(one).queryByRole("button", { name: "Clear all" })).toBeNull();

    cleanup();
    nav.url = "/search?kind=adventure&place=andaman%2Fhavelock";
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
    nav.url = "/search?q=diving&kind=adventure&place=andaman%2Fhavelock";
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

    nav.url = "/search?place=andaman%2Fhavelock";
    renderWithQuery(<SearchScreen />);

    const row = await screen.findByRole("group", { name: "Filters applied" });
    expect(within(row).queryByText(/andaman/)).toBeNull();
    expect(
      within(row).getByRole("button", { name: "Remove this filter" }),
    ).toBeTruthy();
  });

  it("names a day as a word rather than a date where it can", async () => {
    nav.url = `/search?on=${marketToday()}`;
    renderWithQuery(<SearchScreen />);
    const row = await screen.findByRole("group", { name: "Filters applied" });
    expect(within(row).getByText("Today")).toBeInTheDocument();
    expect(
      within(row).getByRole("button", { name: "Remove Today" }),
    ).toBeTruthy();
  });
});
