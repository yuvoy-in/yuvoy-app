import { describe, it, expect, vi, afterEach } from "vitest";
import { cleanup, render, screen } from "@testing-library/react";
import { TRIGO_LISTS_WORDS as W } from "@/lib/trigo/lists-words";
import { TrigoCardRow } from "./trigo-card-row";
import {
  FOUND_CARD,
  FOUND_ID,
  GONE_CARD,
  LISTED_CARD,
  ODD_CARD,
  UNTITLED_EVENT_CARD,
} from "../../../mocks/trigo-list-fixtures";

vi.mock("next/navigation", () => ({
  useSearchParams: () => new URLSearchParams(),
  useRouter: () => ({ push: vi.fn(), replace: vi.fn(), back: vi.fn() }),
  usePathname: () => "/account/date-alerts",
}));

afterEach(cleanup);

/** One card in a list (yuvoy-app#220): where it opens, and when it does not. */
describe("a Trigo card in a list", () => {
  it("opens a listing at /e/{slug}, with what it is in its name", () => {
    render(<TrigoCardRow card={LISTED_CARD} />);
    const link = screen.getByRole("link");
    expect(link).toHaveAttribute("href", "/e/try-dive-nemo-reef");
    expect(link).toHaveAccessibleName(
      expect.stringContaining("Try dive at Nemo Reef, Havelock"),
    );
    expect(screen.getByText("Havelock Divers")).toBeInTheDocument();
    expect(screen.queryByText(W.noLonger)).toBeNull();
  });

  it("opens a found event at /f/{uuid} from its cardId, never its href", () => {
    render(<TrigoCardRow card={FOUND_CARD} source />);
    const link = screen.getByRole("link");
    expect(link).toHaveAttribute("href", `/f/${FOUND_ID}`);
    expect(link.getAttribute("href")).not.toContain("example.com");
    expect(screen.getByText("Andaman Sheekha")).toBeInTheDocument();
  });

  it("leaves out where a found event came from unless asked", () => {
    render(<TrigoCardRow card={FOUND_CARD} />);
    expect(screen.queryByText("Andaman Sheekha")).toBeNull();
  });

  it("says an unavailable card is no longer listed, with no link", () => {
    render(<TrigoCardRow card={GONE_CARD} />);
    expect(screen.getByText("Sunset sail from Neil")).toBeInTheDocument();
    expect(screen.getByText(W.noLonger)).toBeInTheDocument();
    expect(screen.queryByRole("link")).toBeNull();
    // Nothing that reads as still on sale.
    expect(screen.queryByText(/₹/)).toBeNull();
    expect(screen.queryByText("Neil Sailing")).toBeNull();
  });

  it("says a found event whose title is gone is no longer listed, with no link", () => {
    render(<TrigoCardRow card={UNTITLED_EVENT_CARD} />);
    expect(screen.getAllByText(W.noLonger)).toHaveLength(1);
    expect(screen.queryByRole("link")).toBeNull();
  });

  it("opens nothing for a card id no page answers", () => {
    render(<TrigoCardRow card={ODD_CARD} />);
    expect(screen.getByText("Ross Island walk")).toBeInTheDocument();
    expect(screen.queryByRole("link")).toBeNull();
    expect(screen.queryByText(W.noLonger)).toBeNull();
  });
});
