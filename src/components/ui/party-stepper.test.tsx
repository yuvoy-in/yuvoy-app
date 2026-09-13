import { describe, it, expect, vi, afterEach } from "vitest";
import { render, screen, cleanup } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { PartyStepper } from "./party-stepper";

afterEach(cleanup);

/**
 * How many of you — yuvoy-app#32. "I should book for my family, friends,
 * right?"
 *
 * The owner ruled on the cap the same day: keep it. So the interesting
 * behaviour is what happens AT it, which is a sentence naming this listing's
 * own number.
 */
describe("PartyStepper", () => {
  it("stops at the listing's cap and says what to do instead", () => {
    render(<PartyStepper value={6} onChange={() => {}} max={6} />);

    expect(screen.getByLabelText("One more guest")).toBeDisabled();
    expect(
      screen.getByText(
        "Coming with more than 6? Ask the operator about a group booking.",
      ),
    ).toBeInTheDocument();
  });

  it("takes the number from the listing, never a constant", () => {
    /*
      The issue's example says 6 and adds "take the number from
      `maxPartySize` rather than writing 6". Hardcoding it would be wrong on
      every other listing and stale the day an operator changes theirs.
    */
    render(<PartyStepper value={12} onChange={() => {}} max={12} />);
    expect(screen.getByText(/more than 12\?/)).toBeInTheDocument();
  });

  it("says nothing about groups below the cap", () => {
    // Shown always it reads as an upsell on a solo booking.
    render(<PartyStepper value={1} onChange={() => {}} max={6} />);
    expect(screen.queryByText(/group booking/)).toBeNull();
  });

  it("never goes below one", async () => {
    const user = userEvent.setup();
    const onChange = vi.fn();
    render(<PartyStepper value={1} onChange={onChange} max={6} />);
    expect(screen.getByLabelText("One fewer guest")).toBeDisabled();
    await user.click(screen.getByLabelText("One more guest"));
    expect(onChange).toHaveBeenCalledWith(2);
  });
});
