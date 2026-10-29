import { describe, it, expect, vi } from "vitest";
import { render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { NO_FOUND_FILTERS, type FoundFilters } from "@/lib/found/found-filters";
import { FiltersButton, FoundFilterSheet } from "./filter-sheet";

/**
 * Filters over the found feed (yuvoy-app#180): Budget and Time of day, one
 * choice each, nothing chosen by default, drafted and then applied, and a
 * button that says how many of its rows narrow.
 */

const f = (over: Partial<FoundFilters> = {}): FoundFilters => ({
  ...NO_FOUND_FILTERS,
  ...over,
});

function open(filters = f()) {
  const onApply = vi.fn();
  const onClose = vi.fn();
  render(
    <FoundFilterSheet
      open
      filters={filters}
      onApply={onApply}
      onClose={onClose}
    />,
  );
  return { onApply, onClose };
}

const row = (name: string) => screen.getByRole("group", { name });
const checked = (name: string) =>
  within(row(name))
    .getAllByRole("radio")
    .filter((chip) => chip.getAttribute("aria-checked") === "true")
    .map((chip) => chip.textContent);

describe("FoundFilterSheet", () => {
  it("offers Budget and Time of day, with nothing chosen by default", () => {
    open();
    expect(screen.getByRole("dialog", { name: "Filters" })).toBeInTheDocument();
    expect(
      within(row("Budget"))
        .getAllByRole("radio")
        .map((chip) => chip.textContent),
    ).toEqual(["Free", "Under ₹500", "Under ₹1,500", "Any"]);
    expect(
      within(row("Time of day"))
        .getAllByRole("radio")
        .map((chip) => chip.textContent),
    ).toEqual(["Morning", "Afternoon", "Evening"]);
    expect(checked("Budget")).toEqual([]);
    expect(checked("Time of day")).toEqual([]);
    // Radios say they are chosen with aria-checked, never aria-pressed.
    for (const radio of screen.getAllByRole("radio"))
      expect(radio).not.toHaveAttribute("aria-pressed");
  });

  it("opens on what is applied, one choice a row, and applies only on Show results", async () => {
    const { onApply, onClose } = open(f({ when: "today", budget: "free" }));
    expect(checked("Budget")).toEqual(["Free"]);

    await userEvent.click(screen.getByRole("radio", { name: "Under ₹500" }));
    await userEvent.click(screen.getByRole("radio", { name: "Evening" }));
    await userEvent.click(screen.getByRole("radio", { name: "Morning" }));
    expect(checked("Budget")).toEqual(["Under ₹500"]);
    expect(checked("Time of day")).toEqual(["Morning"]);
    expect(onApply).not.toHaveBeenCalled();

    await userEvent.click(screen.getByRole("button", { name: "Show results" }));
    expect(onApply).toHaveBeenCalledWith(
      f({ when: "today", budget: "under_500", timeOfDay: "morning" }),
    );
    expect(onClose).toHaveBeenCalled();
  });

  it("takes a choice off with a second tap", async () => {
    open(f({ timeOfDay: "evening" }));
    await userEvent.click(screen.getByRole("radio", { name: "Evening" }));
    expect(checked("Time of day")).toEqual([]);
  });

  it("clears every row with Clear filters, Free too, and keeps the day", async () => {
    const { onApply } = open(
      f({ when: "weekend", budget: "free", timeOfDay: "afternoon" }),
    );
    await userEvent.click(
      screen.getByRole("button", { name: "Clear filters" }),
    );
    expect(checked("Budget")).toEqual([]);
    expect(checked("Time of day")).toEqual([]);
    await userEvent.click(screen.getByRole("button", { name: "Show results" }));
    expect(onApply).toHaveBeenCalledWith(f({ when: "weekend" }));
  });
});

describe("FiltersButton", () => {
  it("is named Filters, and says how many rows narrow, Free and Any not among them", async () => {
    const onOpen = vi.fn();
    const { rerender } = render(
      <FiltersButton filters={f({ budget: "free" })} onOpen={onOpen} />,
    );
    expect(screen.getByRole("button", { name: "Filters" })).toBeInTheDocument();
    rerender(
      <FiltersButton
        filters={f({ budget: "under_1500", timeOfDay: "evening" })}
        onOpen={onOpen}
      />,
    );
    const button = screen.getByRole("button", { name: "Filters, 2 on" });
    expect(button).toHaveAttribute("aria-haspopup", "dialog");
    expect(button).not.toHaveAttribute("aria-pressed");
    await userEvent.click(button);
    expect(onOpen).toHaveBeenCalledTimes(1);
  });
});
