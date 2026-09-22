import { describe, it, expect } from "vitest";
import { checkoutTotal } from "./checkout-total";

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
