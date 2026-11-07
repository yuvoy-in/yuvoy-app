import { describe, it, expect, vi } from "vitest";
import { render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import type { ReactNode } from "react";
import type { UnderstoodChip } from "@/lib/found/found-words";
import { UnderstoodRow } from "./understood-row";

/**
 * What a search's words were taken to mean (yuvoy-app#180): the API's chips
 * with its labels, each removable, and a place as a link that never narrows.
 */

vi.mock("next/navigation", () => ({ usePathname: () => "/" }));
// Next's own link resolves the address; the stand-in keeps it as handed.
vi.mock("next/link", () => ({
  default: ({
    href,
    transitionTypes,
    children,
    ...rest
  }: {
    href: string;
    transitionTypes?: string[];
    children?: ReactNode;
  }) => (
    <a href={href} data-types={transitionTypes?.join(" ") ?? ""} {...rest}>
      {children}
    </a>
  ),
}));

const ADVENTURE: UnderstoodChip = {
  kind: "department",
  value: "adventure",
  label: "Adventure",
  from: "dive",
};
const SATURDAY: UnderstoodChip = {
  kind: "when",
  value: "saturday",
  label: "Saturday",
  from: "saturday",
};
const PANAJI: UnderstoodChip = {
  kind: "place",
  value: "goa/panaji",
  label: "Panaji",
  from: "panaji",
};

describe("UnderstoodRow", () => {
  it("says Showing, then the API's chips with its labels, in its order", () => {
    render(
      <UnderstoodRow
        chips={[ADVENTURE, SATURDAY]}
        onRemove={vi.fn()}
        placeHref={(key) => `/?place=${key}`}
      />,
    );
    const row = screen.getByRole("group", { name: "Showing" });
    expect(
      within(row)
        .getAllByRole("button")
        .map((chip) => chip.textContent),
    ).toEqual(["Adventure", "Saturday"]);
    expect(
      within(row).getByRole("button", { name: "Remove Adventure" }),
    ).not.toHaveAttribute("aria-pressed");
  });

  it("hands back the chip that was removed", async () => {
    const onRemove = vi.fn();
    render(
      <UnderstoodRow
        chips={[ADVENTURE, SATURDAY]}
        onRemove={onRemove}
        placeHref={(key) => `/?place=${key}`}
      />,
    );
    await userEvent.click(
      screen.getByRole("button", { name: "Remove Saturday" }),
    );
    expect(onRemove).toHaveBeenCalledWith(SATURDAY);
  });

  it("draws a place as a link to search there, never as a filter", () => {
    render(
      <UnderstoodRow
        chips={[ADVENTURE, PANAJI]}
        onRemove={vi.fn()}
        placeHref={(key) => `/?place=${key}&q=dive`}
      />,
    );
    expect(
      screen.getByRole("link", { name: "Search in Panaji" }),
    ).toHaveAttribute("href", "/?place=goa/panaji&q=dive");
    expect(screen.queryByRole("button", { name: "Remove Panaji" })).toBeNull();
  });

  it("draws nothing with no chips", () => {
    const { container } = render(
      <UnderstoodRow chips={[]} onRemove={vi.fn()} placeHref={() => "/"} />,
    );
    expect(container).toBeEmptyDOMElement();
  });
});
