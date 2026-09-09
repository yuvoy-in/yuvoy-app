import { describe, it, expect } from "vitest";
import { render, screen } from "@testing-library/react";
import { StateChip } from "./state-chip";

/**
 * yuvoy-app#26. Account rendered the wire value, so a traveller waiting on an
 * operator read `awaiting_operator` and somebody who missed the boat read
 * `no_show`. `pnpm qa` now refuses that shape statically; these cover what a
 * static rule cannot see — the words themselves, and what happens to a value
 * nobody has mapped.
 */
describe("StateChip", () => {
  it("says what the state means to the person reading it", () => {
    render(<StateChip state="awaiting_operator" />);
    expect(screen.getByText("Asked")).toBeInTheDocument();
  });

  it("tells a declined traveller about their money, not our state machine", () => {
    // `declined` is the state name; "Refunded" is the fact that matters to
    // somebody who has been charged.
    render(<StateChip state="declined" />);
    expect(screen.getByText("Refunded")).toBeInTheDocument();
    expect(screen.queryByText("declined")).toBeNull();
  });

  it("does not accuse somebody who missed the boat", () => {
    render(<StateChip state="no_show" />);
    expect(screen.getByText("Not boarded")).toBeInTheDocument();
  });

  it("renders nothing for a state it has never seen", () => {
    /*
      `GET /me/bookings` types `state` as a bare `string` while
      `GET /bookings/status` types the closed union, so the loose endpoint can
      hand over anything. There is no honest generic — "Booked" is false for a
      cancellation and "In progress" is false for a completed trip — and the
      raw token is the defect. A missing chip loses a word; a wrong one lies.
    */
    const { container } = render(<StateChip state="teleported" />);
    expect(container).toBeEmptyDOMElement();
  });

  it("never leaks the token when it cannot map it", () => {
    render(<StateChip state="awaiting_something_new" />);
    expect(document.body.textContent).not.toMatch(/awaiting_something_new/);
  });
});
