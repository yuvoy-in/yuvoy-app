import {
  describe,
  it,
  expect,
  vi,
  beforeAll,
  beforeEach,
  afterAll,
  afterEach,
  onTestFinished,
} from "vitest";
import { screen, waitFor, cleanup, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { renderWithQuery } from "@/test/render";
import { addressBar, followHistory, navigateTo } from "@/test/address";
import { SearchScreen } from "./search-screen";
import { server } from "../../../mocks/server";
import { http, HttpResponse } from "msw";
import { marketToday, marketDaysFrom } from "@/lib/booking/availability-window";
import { dateLabel } from "@/lib/search/labels";

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

/** Opens the sheet and hands back its dialog. */
async function openFilters(user: ReturnType<typeof userEvent.setup>) {
  await user.click(screen.getByRole("button", { name: /^Filters/ }));
  return screen.getByRole("dialog", { name: "Filters" });
}

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
    // Mid-month: on a month's last day tomorrow is not in the month it opens on.
    vi.useFakeTimers({ toFake: ["Date"] });
    vi.setSystemTime(new Date("2026-09-15T08:30:00Z"));
    onTestFinished(() => {
      vi.useRealTimers();
    });
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
    navigateTo("/search?kind=not_a_category");
    renderWithQuery(<SearchScreen />);
    expect(await screen.findByRole("alert")).toBeInTheDocument();
  });

  it("treats an unknown activity type as an empty page, not an error", async () => {
    navigateTo("/search?doing=not_a_thing_yet");
    renderWithQuery(<SearchScreen />);
    expect(await screen.findByText("No matches")).toBeInTheDocument();
    expect(screen.queryByRole("alert")).toBeNull();
  });
});
