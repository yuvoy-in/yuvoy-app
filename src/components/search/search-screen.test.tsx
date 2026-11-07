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
import { http, HttpResponse } from "msw";

const BASE = process.env.NEXT_PUBLIC_API_URL ?? "http://localhost:8099/v1";

/**
 * Search — a bar, one Filters button, and results as reels (yuvoy-app#37).
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
    renderWithQuery(<SearchScreen />);

    const box = screen.getByRole("searchbox", { name: "Search experiences" });
    await user.type(box, "kayak");
    await waitFor(() => expect(params().get("q")).toBe("kayak"));

    await user.clear(box);
    await waitFor(() => expect(params().get("q")).toBeNull());
    // A grid, not a prompt.
    expect(
      await screen.findByRole("list", { name: "Search results" }),
    ).toBeInTheDocument();
  });
});

/*
  The Search tab on this screen, or Back from one search to another, changes
  the address while the screen stays mounted. The box used to keep its own
  word and write it straight back over the new address: the tab cleared the
  filters and not the word, neither a reset nor a no-op.
*/
describe("an address that changes from outside", () => {
  it("takes the word out of the box when the Search tab clears it", async () => {
    navigateTo("/search?q=dive&place=andaman%2Fhavelock");
    renderWithQuery(<SearchScreen />);
    const box = screen.getByRole("searchbox", { name: "Search experiences" });
    expect(box).toHaveValue("dive");

    act(() => navigateTo("/search"));

    expect(box).toHaveValue("");
    // And nothing wrote it back once the grid had answered.
    expect(
      await screen.findByRole("list", { name: "Search results" }),
    ).toBeInTheDocument();
    expect(params().get("q")).toBeNull();
    expect(params().get("place")).toBeNull();
  });

  it("puts an earlier word back in the box when Back returns to it", async () => {
    const user = userEvent.setup();
    renderWithQuery(<SearchScreen />);
    const box = screen.getByRole("searchbox", { name: "Search experiences" });
    await user.type(box, "dive");
    await waitFor(() => expect(params().get("q")).toBe("dive"));

    act(() => navigateTo("/search"));
    expect(box).toHaveValue("");

    act(() => navigateTo("/search?q=dive"));
    expect(box).toHaveValue("dive");
  });

  it("leaves the typed word alone when only a filter changes", async () => {
    const user = userEvent.setup();
    renderWithQuery(<SearchScreen />);
    const box = screen.getByRole("searchbox", { name: "Search experiences" });
    await user.type(box, "kayak ");
    await waitFor(() => expect(params().get("q")).toBe("kayak"));

    act(() => navigateTo("/search?q=kayak&kind=adventure"));

    // The trailing space is the traveller's, mid-word, and stays theirs.
    expect(box).toHaveValue("kayak ");
  });
});

/*
  yuvoy-app#116 item 3. Guides were in the desktop rail only, so a phone had
  no way in. The door is here for somebody who opened Search without a plan,
  and gone the moment they are searching.
*/
describe("the way to the guides", () => {
  it("is offered while nothing is typed or applied, and only then", async () => {
    const user = userEvent.setup();
    renderWithQuery(<SearchScreen />);

    expect(screen.getByRole("link", { name: "Read a guide" })).toHaveAttribute(
      "href",
      "/guides",
    );

    await user.type(
      screen.getByRole("searchbox", { name: "Search experiences" }),
      "kayak",
    );
    expect(screen.queryByRole("link", { name: "Read a guide" })).toBeNull();
  });

  it("is not offered while a filter is applied", () => {
    navigateTo("/search?kind=adventure");
    renderWithQuery(<SearchScreen />);
    expect(screen.queryByRole("link", { name: "Read a guide" })).toBeNull();
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

  it("writes it in place: no router, and no history entry", async () => {
    /*
      `router.replace` was the old way, and on this dynamic route it is a
      request for the whole page per keystroke and per filter
      (`e2e/address.spec.ts` counts them). In place, and replaced: one search
      being refined is one entry in the history, not one per letter.
    */
    navigateTo("/search?kind=adventure");
    const entries = window.history.length;
    const user = userEvent.setup();
    renderWithQuery(<SearchScreen />);

    await user.type(
      screen.getByRole("searchbox", { name: "Search experiences" }),
      "kayak",
    );
    await user.click(
      await screen.findByRole("button", { name: "Remove Adventure" }),
    );

    await waitFor(() => expect(params().get("kind")).toBeNull());
    expect(params().get("q")).toBe("kayak");
    expect(router.replace).not.toHaveBeenCalled();
    expect(router.push).not.toHaveBeenCalled();
    expect(window.history.length).toBe(entries);
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
