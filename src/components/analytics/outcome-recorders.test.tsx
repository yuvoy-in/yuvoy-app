import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { StrictMode } from "react";
import { render, screen, cleanup, fireEvent } from "@testing-library/react";
import { setConsent } from "@/lib/analytics/consent";
import {
  __resetOutcomeCollector,
  outcomeCollector,
} from "@/lib/analytics/outcomes";
import { RecordOpened } from "./record-opened";
import { OutcomeLink } from "./outcome-link";

/**
 * The two recorders a server-rendered listing page carries (yuvoy-app#181):
 * `opened` as it arrives, and `link_out` on "Open in maps".
 */

const waiting = () =>
  outcomeCollector()
    .inspect()
    .waiting.map((e) => `${e.kind} ${e.surface} ${e.subjectId}`);

beforeEach(() => {
  __resetOutcomeCollector();
  setConsent("granted");
});
afterEach(() => {
  cleanup();
  setConsent("denied");
  __resetOutcomeCollector();
});

describe("RecordOpened", () => {
  it("records the open once, even under React's development double run", () => {
    render(
      <StrictMode>
        <RecordOpened subjectId="exp_try_dive" surface="listing" />
      </StrictMode>,
    );
    expect(waiting()).toEqual(["opened listing exp_try_dive"]);
  });

  it("records a second card arrived at, and nothing without consent", () => {
    const { rerender } = render(
      <RecordOpened subjectId="exp_try_dive" surface="listing" />,
    );
    rerender(<RecordOpened subjectId="exp_snorkel" surface="listing" />);
    expect(waiting()).toEqual([
      "opened listing exp_try_dive",
      "opened listing exp_snorkel",
    ]);

    cleanup();
    setConsent("denied");
    render(<RecordOpened subjectId="exp_kayak" surface="listing" />);
    // A yes given after the page arrived does not reach back for its open.
    setConsent("granted");
    expect(waiting()).toEqual([]);
  });
});

describe("OutcomeLink", () => {
  it("records link_out when the link is followed, by a click or a middle click", () => {
    render(
      <OutcomeLink
        href="https://www.google.com/maps/search/?api=1&query=12,92"
        target="_blank"
        rel="noopener noreferrer"
        outcome={{ subjectId: "exp_try_dive", surface: "listing" }}
      >
        Open in maps
      </OutcomeLink>,
    );
    const link = screen.getByRole("link", { name: "Open in maps" });
    // jsdom does not navigate; the anchor stays a plain link.
    expect(link).toHaveAttribute("target", "_blank");
    link.addEventListener("click", (event) => event.preventDefault());

    fireEvent.click(link);
    fireEvent(link, new MouseEvent("auxclick", { bubbles: true, button: 1 }));
    // A right click opens a menu, not the link.
    fireEvent(link, new MouseEvent("auxclick", { bubbles: true, button: 2 }));
    expect(waiting()).toEqual([
      "link_out listing exp_try_dive",
      "link_out listing exp_try_dive",
    ]);
  });
});
