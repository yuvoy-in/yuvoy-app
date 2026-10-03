import { describe, it, expect, afterEach } from "vitest";
import { cleanup, render, screen } from "@testing-library/react";
import { ChipButton } from "./chip";

afterEach(cleanup);

describe("ChipButton", () => {
  it("says it is pressed, as a toggle", () => {
    render(<ChipButton pressed>Diving</ChipButton>);
    expect(screen.getByRole("button", { name: "Diving" })).toHaveAttribute(
      "aria-pressed",
      "true",
    );
  });

  it("leaves aria-pressed off a tab, which says it is chosen another way", () => {
    // `aria-pressed` is not allowed on `role="tab"`; Trips' tabs carried both
    // (cited in the redesign's before page, 3 Oct 2026).
    render(
      <ChipButton role="tab" aria-selected pressed>
        Upcoming
      </ChipButton>,
    );
    const tab = screen.getByRole("tab", { name: "Upcoming" });
    expect(tab).toHaveAttribute("aria-selected", "true");
    expect(tab).not.toHaveAttribute("aria-pressed");
  });
});
