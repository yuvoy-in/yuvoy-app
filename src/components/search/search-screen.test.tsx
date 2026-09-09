import { describe, it, expect } from "vitest";
import { screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { renderWithQuery } from "@/test/render";
import { SearchScreen } from "./search-screen";
import { server } from "../../../mocks/server";
import { http, HttpResponse } from "msw";

const BASE = process.env.NEXT_PUBLIC_API_URL ?? "http://localhost:8099/v1";

/**
 * Search asks only when there is something to ask for.
 *
 * The contract: "An empty `q` returns nothing, not everything — 'everything'
 * is what the feed is for." The screen used to fetch on mount with nothing
 * typed, and rendered whatever the mock's kinder answer was.
 */
describe("SearchScreen", () => {
  it("renders a prompt by default and sends no request", async () => {
    let calls = 0;
    server.use(
      http.get(`${BASE}/search`, () => {
        calls += 1;
        return HttpResponse.json({
          items: [],
          nextCursor: null,
          complete: true,
        });
      }),
    );

    renderWithQuery(<SearchScreen />);

    expect(
      screen.getByText("Pick a day or a place, or type what you want to do"),
    ).toBeInTheDocument();
    expect(screen.queryByRole("status", { name: "Searching" })).toBeNull();
    // Give any stray effect a tick to fire. It must not.
    await new Promise((r) => setTimeout(r, 50));
    expect(calls).toBe(0);
  });

  it("searches by the words typed", async () => {
    const user = userEvent.setup();
    renderWithQuery(<SearchScreen />);

    await user.type(
      screen.getByRole("searchbox", { name: "Search experiences" }),
      "kayak",
    );

    expect(
      await screen.findByText("Mangrove kayak at dawn"),
    ).toBeInTheDocument();
    expect(screen.queryByText("Try-dive at Nemo Reef")).toBeNull();
  });

  it("treats a day alone as a real question, sent without q", async () => {
    const seen: string[] = [];
    server.use(
      http.get(`${BASE}/search`, ({ request }) => {
        seen.push(new URL(request.url).search);
        return HttpResponse.json({
          items: [],
          nextCursor: null,
          complete: true,
        });
      }),
    );

    const user = userEvent.setup();
    renderWithQuery(<SearchScreen />);
    await user.click(screen.getByRole("button", { name: "Today" }));

    await waitFor(() => expect(seen).toHaveLength(1));
    expect(seen[0]).toMatch(/bookableOn=\d{4}-\d{2}-\d{2}/);
    expect(seen[0]).not.toMatch(/[?&]q=/);
    expect(await screen.findByText("Nothing on that day")).toBeInTheDocument();
  });

  it("returns to the prompt when the words are cleared, never to everything", async () => {
    const user = userEvent.setup();
    renderWithQuery(<SearchScreen />);
    const box = screen.getByRole("searchbox", { name: "Search experiences" });

    await user.type(box, "kayak");
    expect(
      await screen.findByText("Mangrove kayak at dawn"),
    ).toBeInTheDocument();

    await user.clear(box);
    expect(
      await screen.findByText(
        "Pick a day or a place, or type what you want to do",
      ),
    ).toBeInTheDocument();
    expect(screen.queryByText("Mangrove kayak at dawn")).toBeNull();
  });
});

/**
 * The two chip groups — yuvoy-app#24.
 *
 * They exist because `/search` started answering a filter with no text
 * (yuvoy-api#133). Before that fix the API returned before reading
 * `destinationKey` or `bookableOn`, so every chip tapped without typing
 * answered an empty page over real departures.
 */
describe("SearchScreen — where and what", () => {
  it("offers a chip per place in the catalogue, labelled by the server", async () => {
    renderWithQuery(<SearchScreen />);

    /*
      The label is `location` off the summary, never a title-cased slug.
      Production returns "Havelock (Swaraj Dweep)" for `andaman/havelock`,
      which is the case that proves deriving a name from the key is wrong.
    */
    const places = await screen.findByRole("group", {
      name: "Filter by place",
    });
    expect(
      within(places).getByRole("button", { name: "Havelock" }),
    ).toBeInTheDocument();
    expect(
      within(places).getByRole("button", { name: "Anywhere" }),
    ).toBeInTheDocument();
    // The key is never shown.
    expect(screen.queryByText(/andaman\//)).toBeNull();
  });

  it("sends destinationKey, and does not need a word typed", async () => {
    const seen: URL[] = [];
    server.use(
      http.get(`${BASE}/search`, ({ request }) => {
        seen.push(new URL(request.url));
        return HttpResponse.json({
          items: [],
          nextCursor: null,
          complete: true,
        });
      }),
    );
    const user = userEvent.setup();
    renderWithQuery(<SearchScreen />);

    const places = await screen.findByRole("group", {
      name: "Filter by place",
    });
    await user.click(within(places).getByRole("button", { name: "Havelock" }));

    await waitFor(() => expect(seen.length).toBeGreaterThan(0));
    const last = seen[seen.length - 1];
    expect(last.searchParams.get("destinationKey")).toBe("andaman/havelock");
    // A place alone is a real question. Nothing typed, and no `q` sent.
    expect(last.searchParams.get("q")).toBeNull();
  });

  it("sends category, and intersects it with a place", async () => {
    const seen: URL[] = [];
    server.use(
      http.get(`${BASE}/search`, ({ request }) => {
        seen.push(new URL(request.url));
        return HttpResponse.json({
          items: [],
          nextCursor: null,
          complete: true,
        });
      }),
    );
    const user = userEvent.setup();
    renderWithQuery(<SearchScreen />);

    const kinds = await screen.findByRole("group", { name: "Filter by kind" });
    await user.click(
      within(kinds).getByRole("button", { name: "Nature & wildlife" }),
    );
    const places = await screen.findByRole("group", {
      name: "Filter by place",
    });
    await user.click(within(places).getByRole("button", { name: "Havelock" }));

    await waitFor(() => {
      const last = seen[seen.length - 1];
      expect(last?.searchParams.get("category")).toBe("nature_wildlife");
      expect(last?.searchParams.get("destinationKey")).toBe("andaman/havelock");
    });
  });

  it("never shows a chip that would return nothing", async () => {
    /*
      Facets are derived from published listings, so a chip exists only if
      something is behind it. `Category` is a closed enum of twelve and the
      fixtures use two of them — the other ten must not appear, or the screen
      offers ten controls that answer "Nothing matches".
    */
    renderWithQuery(<SearchScreen />);
    const kinds = await screen.findByRole("group", { name: "Filter by kind" });
    expect(
      within(kinds).queryByRole("button", { name: "Food & drink" }),
    ).toBeNull();
    expect(
      within(kinds).queryByRole("button", { name: "Wellness" }),
    ).toBeNull();
  });

  it("tapping a chosen chip again clears it", async () => {
    const user = userEvent.setup();
    renderWithQuery(<SearchScreen />);

    const places = await screen.findByRole("group", {
      name: "Filter by place",
    });
    const havelock = within(places).getByRole("button", { name: "Havelock" });
    await user.click(havelock);
    expect(havelock).toHaveAttribute("aria-pressed", "true");
    await user.click(havelock);
    expect(havelock).toHaveAttribute("aria-pressed", "false");
    // And the screen goes back to the prompt rather than to everything.
    expect(
      screen.getByText("Pick a day or a place, or type what you want to do"),
    ).toBeInTheDocument();
  });

  it("keeps the chips when the facet read fails, and still searches", async () => {
    // The chips are a rail, not the subject. Losing them must not cost the
    // text box, and must not take the screen to an error boundary.
    server.use(
      http.get(`${BASE}/experiences`, () =>
        HttpResponse.json({ error: { code: "internal" } }, { status: 500 }),
      ),
    );
    const user = userEvent.setup();
    renderWithQuery(<SearchScreen />);

    await user.type(
      screen.getByRole("searchbox", { name: "Search experiences" }),
      "kayak",
    );
    expect(
      await screen.findByText("Mangrove kayak at dawn"),
    ).toBeInTheDocument();
    expect(screen.queryByRole("group", { name: "Filter by place" })).toBeNull();
  });
});
