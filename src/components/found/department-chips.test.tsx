import { describe, it, expect, vi } from "vitest";
import { render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { DepartmentChips } from "./department-chips";

/**
 * The chips are exactly the vocabulary's answer, in its order, after "All";
 * with no answer they are "All" alone (yuvoy-app#179, decision 9).
 */

const TERMS = [
  { key: "food_drink", label: "Food and drink" },
  { key: "adventure", label: "Adventure" },
  { key: "learning", label: "Learning" },
];

const chipNames = () =>
  within(screen.getByRole("group", { name: "Kinds of things to do" }))
    .getAllByRole("button")
    .map((chip) => chip.textContent);

describe("DepartmentChips", () => {
  it("shows All, then the vocabulary's departments in the order it sent", () => {
    render(
      <DepartmentChips terms={TERMS} selected={null} onSelect={vi.fn()} />,
    );
    expect(chipNames()).toEqual([
      "All",
      "Food and drink",
      "Adventure",
      "Learning",
    ]);
  });

  it("shows All alone when the vocabulary has not answered", () => {
    const { rerender } = render(
      <DepartmentChips terms={null} selected={null} onSelect={vi.fn()} />,
    );
    expect(chipNames()).toEqual(["All"]);
    rerender(<DepartmentChips terms={[]} selected={null} onSelect={vi.fn()} />);
    expect(chipNames()).toEqual(["All"]);
  });

  it("presses the chosen chip and no other", () => {
    render(
      <DepartmentChips terms={TERMS} selected="adventure" onSelect={vi.fn()} />,
    );
    expect(screen.getByRole("button", { name: "Adventure" })).toHaveAttribute(
      "aria-pressed",
      "true",
    );
    expect(screen.getByRole("button", { name: "All" })).toHaveAttribute(
      "aria-pressed",
      "false",
    );
  });

  it("says which was chosen, and All as none", async () => {
    const onSelect = vi.fn();
    render(
      <DepartmentChips
        terms={TERMS}
        selected="adventure"
        onSelect={onSelect}
      />,
    );
    await userEvent.click(screen.getByRole("button", { name: "Learning" }));
    await userEvent.click(screen.getByRole("button", { name: "All" }));
    expect(onSelect.mock.calls).toEqual([["learning"], [null]]);
  });
});
