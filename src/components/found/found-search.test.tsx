import { describe, it, expect, vi } from "vitest";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import type { FoundSearch } from "@/lib/found/found-filters";
import { FoundSearchBox } from "./found-search";

/**
 * Search inside a place (yuvoy-app#180): a field named by the place, sent on
 * submit, Clear search, and a real form for a search sent before the page
 * hydrated.
 */

function renderBox(search: FoundSearch | null = null) {
  const onSearch = vi.fn();
  const onClear = vi.fn();
  const view = render(
    <FoundSearchBox
      placeName="Bengaluru"
      search={search}
      keep={[
        ["place", "karnataka/bengaluru"],
        ["when", "weekend"],
      ]}
      onSearch={onSearch}
      onClear={onClear}
    />,
  );
  return { onSearch, onClear, ...view };
}

const field = () => screen.getByRole("searchbox", { name: "Search Bengaluru" });

describe("FoundSearchBox", () => {
  it("is a field named for the place, and asks nothing until it is sent", async () => {
    const { onSearch } = renderBox();
    await userEvent.type(field(), "comedy saturday");
    expect(onSearch).not.toHaveBeenCalled();
    await userEvent.keyboard("{Enter}");
    expect(onSearch).toHaveBeenCalledWith("comedy saturday");

    await userEvent.click(screen.getByRole("button", { name: "Search" }));
    expect(onSearch).toHaveBeenCalledTimes(2);
  });

  it("shows the applied search, and Clear search empties it and keeps the focus in the field", async () => {
    const { onClear } = renderBox({ q: "dive", asText: [] });
    expect(field()).toHaveValue("dive");
    await userEvent.click(screen.getByRole("button", { name: "Clear search" }));
    expect(onClear).toHaveBeenCalledTimes(1);
    expect(field()).toHaveValue("");
    expect(field()).toHaveFocus();
    expect(screen.queryByRole("button", { name: "Clear search" })).toBeNull();
  });

  it("takes the applied search again when it changes elsewhere", () => {
    const { rerender } = renderBox({ q: "dive", asText: [] });
    const props = {
      placeName: "Bengaluru",
      keep: [] as const,
      onSearch: vi.fn(),
      onClear: vi.fn(),
    };
    rerender(<FoundSearchBox {...props} search={null} />);
    expect(field()).toHaveValue("");
  });

  it("is a real GET form on / carrying what else is chosen", () => {
    renderBox();
    const form = screen.getByRole("search");
    expect(form).toHaveAttribute("action", "/");
    expect(form).toHaveAttribute("method", "get");
    expect(field()).toHaveAttribute("name", "q");
    const hidden = [
      ...form.querySelectorAll<HTMLInputElement>("input[type=hidden]"),
    ];
    expect(hidden.map((input) => [input.name, input.value])).toEqual([
      ["place", "karnataka/bengaluru"],
      ["when", "weekend"],
    ]);
  });
});
