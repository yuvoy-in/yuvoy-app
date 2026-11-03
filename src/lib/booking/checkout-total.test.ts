import { describe, it, expect } from "vitest";
import { checkoutTotal, perPersonLine } from "./checkout-total";

const inr = (amountMinor: number) => ({ amountMinor, currency: "INR" });

describe("checkoutTotal", () => {
  it("multiplies a per-person price by the party", () => {
    expect(checkoutTotal(inr(450000), 3, "per_person")).toEqual(inr(1350000));
  });

  it("does NOT multiply a price for the whole group", () => {
    // A ₹18,000 boat for four is ₹18,000, not ₹72,000. The API computes it
    // this way, so a total that multiplied would be refused as `price_moved`.
    expect(checkoutTotal(inr(1800000), 4, "per_group")).toEqual(inr(1800000));
  });

  it("reads a listing with no unit as per person, as the API does", () => {
    expect(checkoutTotal(inr(450000), 2, undefined)).toEqual(inr(900000));
  });

  it("has nothing to say when the departure has no price", () => {
    expect(checkoutTotal(undefined, 2, "per_person")).toBeNull();
  });
});

/*
  yuvoy-app#219, the web half of yuvoy-mobile#368: the muted line under the
  Total on a listing priced for the whole group.
*/
describe("perPersonLine", () => {
  it("says what a group price comes to each", () => {
    expect(perPersonLine(inr(800000), 4, "per_group")).toBe(
      "₹2,000 each for 4 of you",
    );
  });

  it("says nothing for one guest", () => {
    expect(perPersonLine(inr(800000), 1, "per_group")).toBeNull();
  });

  it("says nothing for a per-person price, which already is so much each", () => {
    expect(perPersonLine(inr(1800000), 4, "per_person")).toBeNull();
    expect(perPersonLine(inr(1800000), 4, undefined)).toBeNull();
  });

  it("rounds the share to the paisa when the total does not divide", () => {
    // ₹10,000 for three is ₹3,333.33 each, never ₹3,333.333.
    expect(perPersonLine(inr(1000000), 3, "per_group")).toBe(
      "₹3,333.33 each for 3 of you",
    );
  });

  it("says nothing without a total or with a party that is not a count", () => {
    expect(perPersonLine(null, 4, "per_group")).toBeNull();
    expect(perPersonLine(inr(800000), 2.5, "per_group")).toBeNull();
    expect(perPersonLine(inr(800000), 0, "per_group")).toBeNull();
  });
});
