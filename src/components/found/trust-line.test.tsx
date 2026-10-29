import { describe, it, expect } from "vitest";
import { render, screen } from "@testing-library/react";
import { TrustLine } from "./trust-line";
import type { FoundItem } from "@/lib/found/found-words";

/**
 * The trust line is the API's words, verbatim; the mark beside it is
 * decoration and hidden from assistive technology (yuvoy-app#179).
 */

const check = (over: Partial<FoundItem["check"]> = {}): FoundItem["check"] => ({
  tier: "staff_checked",
  label: "Checked by Yuvoy · 16 Oct · organiser's page",
  checkedAt: "2026-10-16T09:00:00Z",
  lapsed: false,
  sourceName: "example.in",
  sourceUrl: "https://example.in/events/1",
  ...over,
});

describe("TrustLine", () => {
  it("says the API's label word for word", () => {
    render(<TrustLine check={check()} />);
    expect(
      screen.getByText("Checked by Yuvoy · 16 Oct · organiser's page"),
    ).toBeInTheDocument();
  });

  it("hides the mark from assistive technology", () => {
    const { container } = render(<TrustLine check={check()} />);
    const mark = container.querySelector("svg");
    expect(mark).toHaveAttribute("aria-hidden", "true");
    // The line's whole accessible text is the label, nothing more.
    expect(container.querySelector("p")).toHaveTextContent(
      /^Checked by Yuvoy · 16 Oct · organiser's page$/,
    );
  });

  it("marks Trigo's find, and a lapsed or re-checked card, with their own looks", () => {
    const found = render(
      <TrustLine
        check={check({
          tier: "found",
          label: "Found by Trigo · not checked yet",
        })}
      />,
    );
    expect(found.container.querySelector("svg")).toHaveAttribute(
      "data-look",
      "found",
    );
    found.unmount();

    const lapsed = render(
      <TrustLine
        check={check({
          lapsed: true,
          label: "Last checked by Yuvoy 9 days ago",
        })}
      />,
    );
    expect(lapsed.container.querySelector("svg")).toHaveAttribute(
      "data-look",
      "lapsed",
    );
    expect(
      screen.getByText("Last checked by Yuvoy 9 days ago"),
    ).toBeInTheDocument();
    lapsed.unmount();

    const rechecking = render(
      <TrustLine
        check={check({
          rechecking: true,
          label: "Being re-checked · details may have changed",
        })}
      />,
    );
    expect(rechecking.container.querySelector("svg")).toHaveAttribute(
      "data-look",
      "lapsed",
    );
  });
});
