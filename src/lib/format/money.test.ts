import { describe, it, expect } from "vitest";
import { formatMoney, formatFromPrice } from "./money";

describe("formatMoney", () => {
  it("reads paise as an integer minor unit", () => {
    // ₹4,500 is 450000. The brief's worked example, and the one that catches
    // a float-rupees mistake immediately.
    expect(formatMoney({ amountMinor: 450000, currency: "INR" })).toBe(
      "₹4,500",
    );
  });

  it("drops decimals on a whole amount", () => {
    // "₹4,500" reads as a price; "₹4,500.00" reads as an invoice.
    expect(formatMoney({ amountMinor: 1800000, currency: "INR" })).toBe(
      "₹18,000",
    );
  });

  it("keeps decimals when there genuinely are paise", () => {
    expect(formatMoney({ amountMinor: 450050, currency: "INR" })).toBe(
      "₹4,500.50",
    );
  });

  it("renders zero as zero, not as absent", () => {
    // A real ₹0 (a free experience) is different from no price at all, and
    // only formatFromPrice conflates them deliberately.
    expect(formatMoney({ amountMinor: 0, currency: "INR" })).toBe("₹0");
  });
});

describe("formatFromPrice", () => {
  it("returns null when no contracted price exists", () => {
    // `fromPrice` is ABSENT until a real price exists. Rendering ₹0 there
    // would be a fabricated claim — the exact class of thing this project
    // removed an entire site for publishing.
    expect(formatFromPrice(undefined)).toBeNull();
    expect(formatFromPrice(null)).toBeNull();
  });

  it("formats a real price", () => {
    expect(formatFromPrice({ amountMinor: 220000, currency: "INR" })).toBe(
      "₹2,200",
    );
  });
});
