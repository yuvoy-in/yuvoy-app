import { describe, it, expect, vi, afterEach } from "vitest";
import { screen, cleanup, within, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { renderWithQuery } from "@/test/render";
import { BookingLayer } from "./booking-layer";
import { EXPERIENCE_DETAIL } from "../../../mocks/fixtures";

vi.mock("next/navigation", () => ({
  useRouter: () => ({ push: vi.fn(), replace: vi.fn() }),
  useSearchParams: () => new URLSearchParams(),
  usePathname: () => "/e/snorkel-elephant-beach",
}));

afterEach(cleanup);

const request = EXPERIENCE_DETAIL["snorkel-elephant-beach"];
const instant = EXPERIENCE_DETAIL["try-dive-nemo-reef"];

/**
 * Opens the date pop-up and chooses the first departure that can be chosen.
 *
 * Walks the day chips rather than trusting the first one: the fixture's day
 * zero is a departure past its cutoff and nothing else, which is deliberate —
 * a closed day is offered rather than hidden — so a helper that only looked at
 * the open day would find nothing selectable on an allotment listing.
 */
async function chooseDeparture(user: ReturnType<typeof userEvent.setup>) {
  await user.click(
    screen.getByRole("button", { name: /Choose a departure|Change/ }),
  );
  const sheet = await screen.findByRole("dialog", { name: "Pick a day" });
  const chips = within(
    await within(sheet).findByRole("group", { name: "Which day" }),
  ).getAllByRole("button");

  for (const chip of chips) {
    await user.click(chip);
    const row = within(sheet)
      .queryAllByRole("button")
      .find(
        (r) =>
          !r.hasAttribute("disabled") &&
          /^\d\d:\d\d/.test(r.textContent?.trim() ?? ""),
      );
    if (row) {
      await user.click(row);
      return;
    }
  }
  throw new Error("no selectable departure in any day of the fixture");
}

describe("picking a day", () => {
  it("is a pop-up, not fourteen days stacked on the page", async () => {
    /*
      The owner walked the page and called the list an endless scroll: "make
      this simple sweet." Nothing renders departures until the pop-up is
      opened.
    */
    const user = userEvent.setup();
    renderWithQuery(<BookingLayer experience={request} bookable />);

    expect(screen.queryByRole("group", { name: "Which day" })).toBeNull();
    await user.click(
      screen.getByRole("button", { name: /Choose a departure/ }),
    );
    const sheet = await screen.findByRole("dialog", { name: "Pick a day" });
    expect(
      await within(sheet).findByRole("group", { name: "Which day" }),
    ).toBeInTheDocument();
  });

  it("closes once a departure is chosen, and says which", async () => {
    // Choosing is the whole reason the sheet is open. Staying would make a
    // traveller find the close control to see what they did.
    const user = userEvent.setup();
    renderWithQuery(<BookingLayer experience={request} bookable />);
    await chooseDeparture(user);

    await waitFor(() =>
      expect(screen.queryByRole("dialog", { name: "Pick a day" })).toBeNull(),
    );
    expect(screen.getByRole("button", { name: /Change/ })).toBeInTheDocument();
  });
});

describe("the sticky bar", () => {
  it("carries no price", async () => {
    /*
      The bar is the last thing a traveller reads before committing, and a
      per-person figure there reads as the total. The total is on the screen
      that takes the money.
    */
    const user = userEvent.setup();
    renderWithQuery(<BookingLayer experience={request} bookable />);
    await chooseDeparture(user);

    const bar = await screen.findByRole("button", { name: /Ask the operator/ });
    const region = bar.closest("div")!.parentElement!;
    expect(region.textContent).not.toMatch(/₹/);
  });

  it("asks in place for a request, and goes to checkout for an instant book", async () => {
    const user = userEvent.setup();
    const { unmount } = renderWithQuery(
      <BookingLayer experience={request} bookable />,
    );
    await chooseDeparture(user);
    // A request charges nothing and holds nothing, so it never leaves the page.
    expect(
      await screen.findByRole("button", { name: /Ask the operator/ }),
    ).toBeInTheDocument();
    unmount();

    renderWithQuery(<BookingLayer experience={instant} bookable />);
    await chooseDeparture(user);
    // Money gets a page.
    const go = await screen.findByRole("link", { name: /Continue/ });
    expect(go.getAttribute("href")).toMatch(
      /^\/e\/try-dive-nemo-reef\/book\?slot=/,
    );
  });

  it("carries the party size to checkout", async () => {
    // The count was only settable at checkout, so a traveller had to commit to
    // a departure before saying there were four of them.
    const user = userEvent.setup();
    renderWithQuery(<BookingLayer experience={instant} bookable />);
    await user.click(screen.getByLabelText("One more guest"));
    await chooseDeparture(user);

    const go = await screen.findByRole("link", { name: /Continue/ });
    expect(go.getAttribute("href")).toMatch(/guests=2/);
  });
});

describe("asking the operator", () => {
  it("opens a pop-up on the listing and asks for three things", async () => {
    /*
      "It only asks for name, WhatsApp number, email." The snorkel listing
      declares no safety screener, so for it that is literally all there is
      besides the terms acknowledgement the product refuses to book without.
    */
    const user = userEvent.setup();
    renderWithQuery(<BookingLayer experience={request} bookable />);
    await chooseDeparture(user);
    await user.click(
      await screen.findByRole("button", { name: /Ask the operator/ }),
    );

    const sheet = await screen.findByRole("dialog", {
      name: "Ask the operator",
    });
    expect(within(sheet).getByLabelText("Your name")).toBeInTheDocument();
    expect(within(sheet).getByLabelText("WhatsApp number")).toBeInTheDocument();
    expect(
      within(sheet).getByLabelText("Email (optional)"),
    ).toBeInTheDocument();
    // +91 already in it, not a placeholder that vanishes on the first keystroke.
    expect(within(sheet).getByLabelText("Country code")).toHaveValue("+91");
  });

  it("sends, then offers the feed and Trips rather than the listing", async () => {
    /*
      "Back goes to the home reels feed, not to the listing. A button to their
      bookings (Trips), where the request now appears." Somebody who has just
      asked about this experience has finished with its page.
    */
    const user = userEvent.setup();
    renderWithQuery(<BookingLayer experience={request} bookable />);
    await chooseDeparture(user);
    await user.click(
      await screen.findByRole("button", { name: /Ask the operator/ }),
    );

    const sheet = await screen.findByRole("dialog", {
      name: "Ask the operator",
    });
    await user.type(within(sheet).getByLabelText("Your name"), "Asha Menon");
    await user.type(
      within(sheet).getByLabelText("WhatsApp number"),
      "9000000000",
    );
    await user.click(within(sheet).getByRole("checkbox"));
    await user.click(
      within(sheet).getByRole("button", { name: /Send the request/ }),
    );

    const sent = await screen.findByRole("dialog", { name: "Request sent" });
    // Said ONCE. The sheet's own header carries it; a second heading under it
    // was two headings with one name inside one dialog.
    expect(
      within(sent).getAllByRole("heading", { name: "Request sent" }),
    ).toHaveLength(1);
    expect(
      within(sent).getByText(/answers this one by hand/),
    ).toBeInTheDocument();
    expect(
      within(sent).getByRole("link", { name: "Go to my trips" }),
    ).toHaveAttribute("href", "/trips");
    expect(
      within(sent).getByRole("link", { name: "Back to the feed" }),
    ).toHaveAttribute("href", "/");
  });

  it("will not send without a number, and says what is missing", async () => {
    const user = userEvent.setup();
    renderWithQuery(<BookingLayer experience={request} bookable />);
    await chooseDeparture(user);
    await user.click(
      await screen.findByRole("button", { name: /Ask the operator/ }),
    );

    const sheet = await screen.findByRole("dialog", {
      name: "Ask the operator",
    });
    await user.type(within(sheet).getByLabelText("Your name"), "Asha Menon");
    expect(
      within(sheet).getByRole("button", { name: /Send the request/ }),
    ).toBeDisabled();
    expect(within(sheet).getByText(/a WhatsApp number/)).toBeInTheDocument();
  });

  it("does not treat a bare country code as a number", async () => {
    // `+91` alone is what the field starts with. Counting it as filled in is
    // how a request goes out with no way to answer it.
    const user = userEvent.setup();
    renderWithQuery(<BookingLayer experience={request} bookable />);
    await chooseDeparture(user);
    await user.click(
      await screen.findByRole("button", { name: /Ask the operator/ }),
    );

    const sheet = await screen.findByRole("dialog", {
      name: "Ask the operator",
    });
    await user.type(within(sheet).getByLabelText("Your name"), "Asha");
    await user.click(within(sheet).getByRole("checkbox"));
    expect(
      within(sheet).getByRole("button", { name: /Send the request/ }),
    ).toBeDisabled();
  });
});
