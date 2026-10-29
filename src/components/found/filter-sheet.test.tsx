import { describe, it, expect, vi } from "vitest";
import { render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { NO_FOUND_FILTERS, type FoundFilters } from "@/lib/found/found-filters";
import { FiltersButton, FoundFilterSheet } from "./filter-sheet";

/**
 * Filters over the found feed (yuvoy-app#180): Budget and Time of day, one
 * choice each, nothing chosen by default, drafted and then applied, and a
 * button that says how many of its rows narrow. R3-T6's four rows after them
 * (yuvoy-app#195), How hard in a local place only.
 *
 * Whether the sheet can be opened at all is the feed's: its Filters button
 * is drawn only while `checkedCities` is open, which the server decides
 * before the page renders, so there is no pending state to hide it in
 * (found-feed.test.tsx, "R3 closed").
 */

const f = (over: Partial<FoundFilters> = {}): FoundFilters => ({
  ...NO_FOUND_FILTERS,
  ...over,
});

function open(filters = f(), local = true) {
  const onApply = vi.fn();
  const onClose = vi.fn();
  render(
    <FoundFilterSheet
      open
      filters={filters}
      local={local}
      onApply={onApply}
      onClose={onClose}
    />,
  );
  return { onApply, onClose };
}

const row = (name: string) => screen.getByRole("group", { name });
const options = (name: string) =>
  within(row(name))
    .getAllByRole("radio")
    .map((chip) => chip.textContent);
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

  it("offers How long, Indoors or out, Who it suits and How hard after them in a local place", () => {
    open();
    // In the order they show, each named by its title.
    expect(
      screen
        .getAllByRole("group")
        .map((group) => group.getAttribute("aria-labelledby"))
        .map((id) => document.getElementById(id!)?.textContent),
    ).toEqual([
      "Budget",
      "Time of day",
      "How long",
      "Indoors or out",
      "Who it suits",
      "How hard",
    ]);
    expect(options("How long")).toEqual([
      "Under 2 hours",
      "Half a day",
      "Longer",
    ]);
    // No "both": an item stated as both matches either.
    expect(options("Indoors or out")).toEqual(["Indoors", "Outdoors"]);
    expect(options("Who it suits")).toEqual([
      "Solo",
      "Couples",
      "Friends",
      "Families",
      "Kids",
    ]);
    expect(options("How hard")).toEqual(["Easy", "Moderate", "Hard"]);
    for (const name of [
      "How long",
      "Indoors or out",
      "Who it suits",
      "How hard",
    ])
      expect(checked(name)).toEqual([]);
  });

  it("How hard is absent in a travel place", () => {
    open(f(), false);
    expect(screen.queryByRole("group", { name: "How hard" })).toBeNull();
    expect(screen.queryByRole("radio", { name: "Moderate" })).toBeNull();
    expect(row("Who it suits")).toBeInTheDocument();
  });

  it("takes one choice a row in the four, and a second tap clears it", async () => {
    const { onApply } = open();
    await userEvent.click(screen.getByRole("radio", { name: "Families" }));
    await userEvent.click(screen.getByRole("radio", { name: "Kids" }));
    await userEvent.click(screen.getByRole("radio", { name: "Under 2 hours" }));
    await userEvent.click(screen.getByRole("radio", { name: "Longer" }));
    await userEvent.click(screen.getByRole("radio", { name: "Indoors" }));
    await userEvent.click(screen.getByRole("radio", { name: "Easy" }));
    await userEvent.click(screen.getByRole("radio", { name: "Easy" }));
    expect(checked("Who it suits")).toEqual(["Kids"]);
    expect(checked("How long")).toEqual(["Longer"]);
    expect(checked("Indoors or out")).toEqual(["Indoors"]);
    expect(checked("How hard")).toEqual([]);
    await userEvent.click(screen.getByRole("button", { name: "Show results" }));
    expect(onApply).toHaveBeenCalledWith(
      f({ duration: "longer", setting: "indoor", suits: "kids" }),
    );
  });

  it("clears the four with Budget and Time of day", async () => {
    const { onApply } = open(
      f({
        when: "today",
        budget: "under_1500",
        timeOfDay: "evening",
        duration: "half_day",
        setting: "outdoor",
        suits: "couples",
        difficulty: "moderate",
      }),
    );
    expect(checked("How hard")).toEqual(["Moderate"]);
    await userEvent.click(
      screen.getByRole("button", { name: "Clear filters" }),
    );
    for (const name of [
      "Budget",
      "Time of day",
      "How long",
      "Indoors or out",
      "Who it suits",
      "How hard",
    ])
      expect(checked(name)).toEqual([]);
    await userEvent.click(screen.getByRole("button", { name: "Show results" }));
    expect(onApply).toHaveBeenCalledWith(f({ when: "today" }));
  });
});

describe("FiltersButton", () => {
  it("is named Filters, and says how many rows narrow, Free and Any not among them", async () => {
    const onOpen = vi.fn();
    const { rerender } = render(
      <FiltersButton filters={f({ budget: "free" })} local onOpen={onOpen} />,
    );
    expect(screen.getByRole("button", { name: "Filters" })).toBeInTheDocument();
    rerender(
      <FiltersButton
        filters={f({ budget: "under_1500", timeOfDay: "evening" })}
        local
        onOpen={onOpen}
      />,
    );
    const button = screen.getByRole("button", { name: "Filters, 2 on" });
    expect(button).toHaveAttribute("aria-haspopup", "dialog");
    expect(button).not.toHaveAttribute("aria-pressed");
    await userEvent.click(button);
    expect(onOpen).toHaveBeenCalledTimes(1);
  });

  it("counts the four, How hard only in a local place", () => {
    const four = f({
      duration: "under_2h",
      setting: "indoor",
      suits: "solo",
      difficulty: "easy",
    });
    const { rerender } = render(
      <FiltersButton filters={four} local onOpen={() => {}} />,
    );
    expect(
      screen.getByRole("button", { name: "Filters, 4 on" }),
    ).toBeInTheDocument();
    rerender(<FiltersButton filters={four} local={false} onOpen={() => {}} />);
    expect(
      screen.getByRole("button", { name: "Filters, 3 on" }),
    ).toBeInTheDocument();
  });
});
