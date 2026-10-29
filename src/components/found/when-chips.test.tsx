import { describe, it, expect, vi } from "vitest";
import { render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { NO_FOUND_FILTERS, type FoundFilters } from "@/lib/found/found-filters";
import { WhenChips } from "./when-chips";

/**
 * The day chips and Free (yuvoy-app#180): one day at a time, Free beside it,
 * every chip a filter with `aria-pressed`, in a group a screen reader names.
 */

const f = (over: Partial<FoundFilters> = {}): FoundFilters => ({
  ...NO_FOUND_FILTERS,
  ...over,
});

const group = () =>
  screen.getByRole("group", { name: "Filter by day and price" });

describe("WhenChips", () => {
  it("shows Today, Tomorrow, This weekend and Free, in that order, nothing pressed", () => {
    render(<WhenChips filters={f()} onChange={vi.fn()} />);
    const chips = within(group()).getAllByRole("button");
    expect(chips.map((chip) => chip.textContent)).toEqual([
      "Today",
      "Tomorrow",
      "This weekend",
      "Free",
    ]);
    for (const chip of chips) {
      expect(chip).toHaveAttribute("aria-pressed", "false");
    }
  });

  it("presses the chosen day and Free together", () => {
    render(
      <WhenChips
        filters={f({ when: "weekend", budget: "free" })}
        onChange={vi.fn()}
      />,
    );
    expect(
      screen.getByRole("button", { name: "This weekend" }),
    ).toHaveAttribute("aria-pressed", "true");
    expect(screen.getByRole("button", { name: "Free" })).toHaveAttribute(
      "aria-pressed",
      "true",
    );
    expect(screen.getByRole("button", { name: "Today" })).toHaveAttribute(
      "aria-pressed",
      "false",
    );
  });

  it("is one day at a time, a second tap clears it, and Free keeps the day", async () => {
    const onChange = vi.fn();
    const { rerender } = render(
      <WhenChips filters={f({ when: "today" })} onChange={onChange} />,
    );
    await userEvent.click(screen.getByRole("button", { name: "Tomorrow" }));
    await userEvent.click(screen.getByRole("button", { name: "Today" }));
    await userEvent.click(screen.getByRole("button", { name: "Free" }));
    expect(onChange.mock.calls).toEqual([
      [f({ when: "tomorrow" })],
      [f()],
      [f({ when: "today", budget: "free" })],
    ]);

    // Free replaces an under-price budget, so the two are never sent together.
    onChange.mockClear();
    rerender(
      <WhenChips filters={f({ budget: "under_500" })} onChange={onChange} />,
    );
    await userEvent.click(screen.getByRole("button", { name: "Free" }));
    expect(onChange).toHaveBeenCalledWith(f({ budget: "free" }));
  });

  it("works from the keyboard", async () => {
    const onChange = vi.fn();
    render(<WhenChips filters={f()} onChange={onChange} />);
    await userEvent.tab();
    expect(screen.getByRole("button", { name: "Today" })).toHaveFocus();
    await userEvent.keyboard("{Enter}");
    await userEvent.tab();
    await userEvent.keyboard(" ");
    expect(onChange.mock.calls).toEqual([
      [f({ when: "today" })],
      [f({ when: "tomorrow" })],
    ]);
  });

  it("draws what it is given beside the group, outside it", () => {
    render(
      <WhenChips
        filters={f()}
        onChange={vi.fn()}
        after={<button type="button">Filters</button>}
      />,
    );
    expect(screen.getByRole("button", { name: "Filters" })).toBeInTheDocument();
    expect(
      within(group()).queryByRole("button", { name: "Filters" }),
    ).toBeNull();
  });
});
