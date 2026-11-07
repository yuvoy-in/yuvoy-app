import { describe, it, expect, vi } from "vitest";
import { render, screen, within } from "@testing-library/react";
import { NO_LONGER_LISTED } from "@/lib/trigo/words";
import { ReplyCards, type TrigoCard } from "./reply-cards";

/**
 * The cards under a Trigo reply (yuvoy-app#223 (b)): a live card is the
 * server's words and opens its page; a gone one stays, greyed, unlinked, with
 * "No longer listed on Yuvoy." in place of the price.
 */

vi.mock("next/navigation", () => ({
  usePathname: () => "/",
  useSearchParams: () => new URLSearchParams(),
  useRouter: () => ({ push: vi.fn(), replace: vi.fn(), prefetch: vi.fn() }),
}));

const LIVE: TrigoCard = {
  cardId: "exp:try-dive-nemo-reef",
  kind: "experience",
  available: true,
  title: "Try dive at Nemo Reef",
  placeName: "Havelock",
  whenText: "Sat 8 Nov, 7am",
  price: { amountMinor: 450000, currency: "INR" },
  priceText: "per person",
  checkLabel: "Andaman Bubbles",
  sourceName: null,
  href: "/e/try-dive-nemo-reef",
};

const EVENT: TrigoCard = {
  cardId: "evt:sunset-jazz",
  kind: "event",
  available: true,
  title: "Sunset jazz on the jetty",
  placeName: null,
  whenText: "Fri 7 Nov, 6pm",
  price: null,
  priceText: "Free",
  checkLabel: "Found by Trigo · not checked yet · insider.in",
  sourceName: "insider.in",
  href: "/f/0b9a3f7e-1c2d-4e5f-8a9b-0c1d2e3f4a5b",
};

const GONE: TrigoCard = {
  ...LIVE,
  cardId: "exp:sea-walk",
  available: false,
  title: "Sea walk at North Bay",
  href: "/e/sea-walk-north-bay",
};

describe("ReplyCards", () => {
  it("draws nothing for a reply with no cards", () => {
    const { container } = render(<ReplyCards cards={[]} />);
    expect(container).toBeEmptyDOMElement();
  });

  it("draws a live card in the server's words, opening its page", () => {
    render(<ReplyCards cards={[LIVE]} />);
    const link = screen.getByRole("link", { name: /Try dive at Nemo Reef/ });
    expect(link).toHaveAttribute("href", "/e/try-dive-nemo-reef");
    expect(within(link).getByText("Havelock · Sat 8 Nov, 7am")).toBeVisible();
    expect(within(link).getByText("₹4,500 per person")).toBeVisible();
    expect(within(link).getByText("Andaman Bubbles")).toBeVisible();
    expect(screen.queryByText(NO_LONGER_LISTED)).toBeNull();
  });

  it("draws an event with only its price words and the check line", () => {
    render(<ReplyCards cards={[EVENT]} />);
    const link = screen.getByRole("link", { name: /Sunset jazz/ });
    expect(link).toHaveAttribute(
      "href",
      "/f/0b9a3f7e-1c2d-4e5f-8a9b-0c1d2e3f4a5b",
    );
    expect(within(link).getByText("Fri 7 Nov, 6pm")).toBeVisible();
    expect(within(link).getByText("Free")).toBeVisible();
    expect(
      within(link).getByText("Found by Trigo · not checked yet · insider.in"),
    ).toBeVisible();
  });

  it("keeps a gone card, greyed and unlinked, with no price", () => {
    render(<ReplyCards cards={[LIVE, GONE]} />);
    expect(screen.getAllByRole("link")).toHaveLength(1);
    const gone = screen.getByTestId("trigo-card-gone");
    expect(within(gone).getByText("Sea walk at North Bay")).toBeVisible();
    expect(within(gone).getByText(NO_LONGER_LISTED)).toBeVisible();
    expect(within(gone).queryByText(/₹/)).toBeNull();
    expect(within(gone).queryByText("Andaman Bubbles")).toBeNull();
  });

  it("lists the cards in the order the server sent them", () => {
    render(<ReplyCards cards={[EVENT, LIVE]} />);
    const items = within(screen.getByRole("list", { name: "Cards" }))
      .getAllByRole("listitem")
      .map((li) => li.textContent);
    expect(items[0]).toMatch(/^Sunset jazz/);
    expect(items[1]).toMatch(/^Try dive/);
  });
});
