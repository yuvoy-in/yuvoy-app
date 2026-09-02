import { describe, it, expect } from "vitest";
import { screen, waitFor } from "@testing-library/react";
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
      screen.getByText("Pick a day, or type a place or an activity"),
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
      await screen.findByText("Pick a day, or type a place or an activity"),
    ).toBeInTheDocument();
    expect(screen.queryByText("Mangrove kayak at dawn")).toBeNull();
  });
});
