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
import { focusManager, onlineManager } from "@tanstack/react-query";
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

/**
 * The grid is one VISIT of a shuffled order (yuvoy-app#96).
 *
 * "Back returns to the same grid" is this screen's promise, and a first page
 * asked for again is a new order. So the grid is never refetched behind the
 * traveller, and a refused cursor starts one new visit of the SAME filters.
 */
describe("the grid as one visit", () => {
  afterEach(() => {
    vi.useRealTimers();
    act(() => {
      onlineManager.setOnline(true);
      focusManager.setFocused(undefined);
    });
  });

  const tile = (id: string, title: string) => ({
    media: {
      id,
      kind: "video",
      posterUrl: "data:image/svg+xml;utf8,%3Csvg%2F%3E",
      aspectRatio: "9:16",
    },
    experience: {
      id: `exp_${id}`,
      slug: `slug-${id}`,
      title,
      marketKey: "andaman",
      destinationKey: "andaman/havelock",
      category: "adventure",
      bookingMode: "allotment",
      durationMinutes: 120,
      operator: { id: "o1", slug: "o1", name: "Operator", verified: true },
    },
  });

  it("is not refetched, and so not reshuffled, when focus or signal returns", async () => {
    vi.useFakeTimers({ toFake: ["Date"] });
    vi.setSystemTime(new Date("2026-09-21T08:30:00Z"));
    let calls = 0;
    server.use(
      http.get(`${BASE}/reels`, () => {
        calls += 1;
        return HttpResponse.json({
          items: [tile("m1", "One")],
          complete: true,
        });
      }),
    );

    renderWithQuery(<SearchScreen />);
    await screen.findByRole("link", { name: /One/ });
    expect(calls).toBe(1);

    vi.setSystemTime(new Date("2026-09-21T09:30:00Z"));
    act(() => {
      focusManager.setFocused(false);
      focusManager.setFocused(true);
      onlineManager.setOnline(false);
      onlineManager.setOnline(true);
    });
    await new Promise((r) => setTimeout(r, 60));
    expect(calls).toBe(1);
  });

  it("restarts a refused cursor with the same filters, and repeats no tile", async () => {
    const user = userEvent.setup();
    navigateTo("/search?kind=adventure");
    const asked: URLSearchParams[] = [];
    server.use(
      http.get(`${BASE}/reels`, ({ request }) => {
        const query = new URL(request.url).searchParams;
        asked.push(query);
        const cursor = query.get("cursor");
        if (cursor === "pre-shuffle") {
          return HttpResponse.json(
            { error: { code: "invalid_input", message: "start again" } },
            { status: 400 },
          );
        }
        const first = asked.filter((q) => !q.get("cursor")).length === 1;
        return HttpResponse.json(
          first
            ? {
                items: [tile("m1", "Seen one")],
                complete: false,
                nextCursor: "pre-shuffle",
              }
            : {
                items: [tile("m1", "Seen one"), tile("m2", "New two")],
                complete: true,
              },
        );
      }),
    );

    renderWithQuery(<SearchScreen />);
    await screen.findByRole("link", { name: /Seen one/ });
    await user.click(screen.getByRole("button", { name: "Show more" }));

    expect(
      await screen.findByRole("link", { name: /New two/ }),
    ).toBeInTheDocument();
    expect(screen.getAllByRole("link", { name: /Seen one/ })).toHaveLength(1);
    // The restart's own first page carries the filters: a cursor belongs to
    // the filter set it was minted under, and so does a new visit.
    const restart = asked.at(-1)!;
    expect(restart.get("cursor")).toBeNull();
    expect(restart.get("category")).toBe("adventure");
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
    navigateTo("/search?price=high");
    renderWithQuery(<SearchScreen />);
    const row = await screen.findByRole("group", { name: "Filters applied" });
    expect(within(row).getByText("₹4,000 and up")).toBeInTheDocument();
    expect(screen.getByText(/priced for a whole group/)).toBeInTheDocument();

    cleanup();
    navigateTo("/search?length=short");
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
    navigateTo("/search?price=high");
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
    navigateTo("/search?length=short&kind=adventure");
    renderWithQuery(<SearchScreen />);

    const row = await screen.findByRole("group", { name: "Filters applied" });
    await user.click(
      within(row).getByRole("button", { name: "Remove Up to 2 hours" }),
    );
    await waitFor(() => expect(params().get("length")).toBeNull());
    expect(params().get("kind")).toBe("adventure");
  });

  it("counts a band on the Filters button", async () => {
    navigateTo("/search?length=long&price=low");
    renderWithQuery(<SearchScreen />);
    expect(
      screen.getByRole("button", { name: "Filters, 2 on" }),
    ).toBeInTheDocument();
  });
});
