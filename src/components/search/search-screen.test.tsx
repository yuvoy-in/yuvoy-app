import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { screen, waitFor, cleanup, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { renderWithQuery } from "@/test/render";
import { SearchScreen } from "./search-screen";
import { server } from "../../../mocks/server";
import { http, HttpResponse } from "msw";

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

describe("nothing is asked until something is asked for", () => {
  it("renders a prompt by default and sends no request", async () => {
    /*
      The contract: "An empty `q` returns nothing, not everything — 'everything'
      is what the feed is for." The screen used to fetch on mount with nothing
      typed and render whatever the mock's kinder answer was.
    */
    let calls = 0;
    server.use(
      http.get(`${BASE}/reels`, () => {
        calls += 1;
        return HttpResponse.json({ items: [], complete: true });
      }),
    );

    renderWithQuery(<SearchScreen />);
    expect(
      screen.getByText("Pick a day or a place, or type what you want to do"),
    ).toBeInTheDocument();

    await new Promise((r) => setTimeout(r, 50));
    expect(calls).toBe(0);
  });

  it("returns to the prompt when the words are cleared, never to everything", async () => {
    const user = userEvent.setup();
    const { rerender } = renderWithQuery(<SearchScreen />);

    const box = screen.getByRole("searchbox", { name: "Search experiences" });
    await user.type(box, "kayak");
    await waitFor(() => expect(params().get("q")).toBe("kayak"));

    await user.clear(box);
    await waitFor(() => expect(params().get("q")).toBeNull());
    rerender(<SearchScreen />);
    expect(
      await screen.findByText(
        "Pick a day or a place, or type what you want to do",
      ),
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
    await user.click(within(sheet).getByRole("button", { name: "Apply" }));

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
    expect(screen.queryByRole("group", { name: "Which day" })).toBeNull();
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

  it("narrows the activity chips to the chosen category", async () => {
    // The vocabulary carries the category on each type, so the grouping is the
    // server's rather than a second copy of the taxonomy in this client.
    const user = userEvent.setup();
    renderWithQuery(<SearchScreen />);
    const sheet = await openFilters(user);

    await within(sheet).findByRole("button", { name: "Scuba diving" });
    expect(within(sheet).getByRole("button", { name: "Tasting" })).toBeTruthy();

    await user.click(
      within(sheet).getByRole("button", { name: "Nature and wildlife" }),
    );
    expect(
      within(sheet).getByRole("button", { name: "Birdwatching" }),
    ).toBeTruthy();
    expect(
      within(sheet).queryByRole("button", { name: "Scuba diving" }),
    ).toBeNull();
    expect(within(sheet).queryByRole("button", { name: "Tasting" })).toBeNull();
  });

  it("changes nothing until Apply", async () => {
    /*
      A sheet that filtered live would refetch on every tap and leave the grid
      reflowing under a panel nobody can see past. It also makes Clear
      meaningful.
    */
    const user = userEvent.setup();
    renderWithQuery(<SearchScreen />);
    const sheet = await openFilters(user);

    await user.click(within(sheet).getByRole("button", { name: "Today" }));
    expect(params().get("on")).toBeNull();

    await user.click(within(sheet).getByRole("button", { name: "Apply" }));
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
    await user.click(within(sheet).getByRole("button", { name: "Anything" }));
    await user.click(within(sheet).getByRole("button", { name: "Apply" }));

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
    expect(await within(sheet).findByText(/did not load/)).toBeInTheDocument();
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
    await user.click(within(sheet).getByRole("button", { name: "Apply" }));

    expect(
      await screen.findByText("Nothing matches that yet"),
    ).toBeInTheDocument();
    expect(
      screen.getByRole("button", { name: "Clear filters" }),
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
    expect(
      await screen.findByText("Nothing matches that yet"),
    ).toBeInTheDocument();
    expect(screen.queryByRole("alert")).toBeNull();
  });
});
