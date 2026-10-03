import { describe, it, expect, afterEach, vi } from "vitest";
import { cleanup, render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { daysFromSlots } from "@/lib/booking/day-availability";
import { DateChooser, STRIP_DAYS } from "./day-strip";
import { TimePicker } from "./time-picker";
import type { components } from "@/lib/api/schema.gen";

type Slot = components["schemas"]["Slot"];

/**
 * Which day, on checkout (the approved redesign, traveller A, 3 Oct 2026):
 * the next two weeks as a strip, the month one tap away.
 */

const TODAY = "2026-09-14";
// 10:00 IST on the 14th: nothing below has passed its cutoff.
const NOW = Date.parse("2026-09-14T04:30:00Z");

const slot = (localDate: string, over: Partial<Slot> = {}): Slot =>
  ({
    id: `sl_${localDate}`,
    localDate,
    localStartTime: "07:00:00",
    status: "open",
    soldOut: false,
    remainingDisplay: "3 seats left",
    price: { amountMinor: 450000, currency: "INR" },
    ...over,
  }) as Slot;

function chooser(
  slots: Slot[],
  props: Partial<Parameters<typeof DateChooser>[0]> = {},
) {
  const onSelect = vi.fn();
  render(
    <DateChooser
      anchor="2026-09-01"
      onAnchor={() => {}}
      days={daysFromSlots(slots, NOW)}
      value={null}
      onSelect={onSelect}
      state="ready"
      onRetry={() => {}}
      today={TODAY}
      {...props}
    />,
  );
  return { onSelect };
}

afterEach(cleanup);

describe("the day strip", () => {
  it("shows the next two weeks, named the way the month names its days", () => {
    chooser([
      slot("2026-09-16"),
      slot("2026-09-17", { soldOut: true, remainingDisplay: "Full" }),
    ]);
    const strip = screen.getByRole("group", { name: "The next two weeks" });
    expect(within(strip).getAllByRole("button")).toHaveLength(STRIP_DAYS);

    const open = within(strip).getByRole("button", { name: /^Wed 16 Sep/ });
    expect(open).toBeEnabled();
    expect(open).toHaveAccessibleName("Wed 16 Sep, from ₹4,500");
    expect(
      within(strip).getByRole("button", { name: "Thu 17 Sep, full" }),
    ).toBeDisabled();
    // A day with nothing on is neither, and says nothing.
    expect(
      within(strip).getByRole("button", { name: "Fri 18 Sep" }),
    ).toBeDisabled();
    // Today is said in words on its chip; the name keeps the date.
    expect(
      within(strip).getByRole("button", { name: "Mon 14 Sep" }),
    ).toHaveTextContent(/^Today/);
  });

  it("chooses a day with one tap", async () => {
    const user = userEvent.setup();
    const { onSelect } = chooser([slot("2026-09-16")]);
    await user.click(screen.getByRole("button", { name: /^Wed 16 Sep/ }));
    expect(onSelect).toHaveBeenCalledWith(
      "2026-09-16",
      expect.objectContaining({ state: "open" }),
    );
  });

  it("puts the month one tap away, and comes back", async () => {
    const user = userEvent.setup();
    chooser([slot("2026-09-16")]);
    await user.click(screen.getByRole("button", { name: "More dates" }));
    expect(screen.getByText("September 2026")).toBeInTheDocument();
    expect(
      screen.queryByRole("group", { name: "The next two weeks" }),
    ).toBeNull();

    await user.click(screen.getByRole("button", { name: "Next two weeks" }));
    expect(
      screen.getByRole("group", { name: "The next two weeks" }),
    ).toBeInTheDocument();
  });

  it("opens on the month when the first open day is past the strip", () => {
    // Fourteen grey days would only send them to the button.
    chooser([slot("2026-11-03")], { anchor: "2026-11-01" });
    expect(screen.getByText("November 2026")).toBeInTheDocument();
    expect(
      screen.queryByRole("group", { name: "The next two weeks" }),
    ).toBeNull();
  });

  it("opens on the month when the day it was sent is past the strip", () => {
    chooser([slot("2026-09-16"), slot("2026-10-02")], {
      value: "2026-10-02",
      anchor: "2026-10-01",
    });
    expect(screen.getByText("October 2026")).toBeInTheDocument();
  });

  it("offers no other view until the dates have arrived", () => {
    chooser([], { state: "pending" });
    expect(screen.queryByRole("button", { name: "More dates" })).toBeNull();
  });

  it("says the dates did not load, with a way to try again", () => {
    chooser([], { state: "error" });
    expect(screen.getByText("Dates did not load.")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Try again" })).toBeVisible();
  });
});

describe("the time chips", () => {
  it("keep the time as the name and the seats as what is said after it", () => {
    render(
      <TimePicker
        slots={[slot("2026-09-16")]}
        value={null}
        onSelect={() => {}}
        now={NOW}
      />,
    );
    const chip = screen.getByRole("button", { name: "07:00" });
    expect(chip).toHaveAccessibleDescription("3 seats left");
    /*
      Two words, not one run-on: the chip used to read "07:003 seats left",
      because `tap-target` laid its two lines side by side with nothing
      between them.
    */
    expect(chip.className).not.toMatch(/\btap-target\b/);
    expect(chip.className).toMatch(/\bgap-2\b/);
  });
});
