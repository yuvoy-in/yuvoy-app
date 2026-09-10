import { describe, it, expect } from "vitest";
import { checkoutRefusal } from "./checkout-readiness";

describe("checkoutRefusal — yuvoy-app#28", () => {
  it("lets checkout proceed when terms were published", () => {
    expect(
      checkoutRefusal({
        cancellationPolicy: "Full refund up to 48 hours before.",
      }),
    ).toBeNull();
  });

  it("refuses when the field is absent, which is what production sent", () => {
    // `omitempty` on a field nothing populated. Not `null`, not `""` — gone.
    expect(checkoutRefusal({})).not.toBeNull();
  });

  it("refuses an empty string and a string of whitespace", () => {
    expect(checkoutRefusal({ cancellationPolicy: "" })).not.toBeNull();
    expect(checkoutRefusal({ cancellationPolicy: "  \n\t " })).not.toBeNull();
  });

  it("blames us rather than the traveller, and says what is missing", () => {
    const refusal = checkoutRefusal({})!;
    expect(refusal.title).toMatch(/cannot take a booking/i);
    expect(refusal.body).toMatch(/cancellation/i);
    /*
      The sentence a traveller reads when a sale is refused is part of the
      fix, not decoration: the failure is ours, they did nothing wrong, and
      telling them so is what stops the support call.
    */
    expect(refusal.body).toMatch(/not anything you did/i);
  });

  it("never renders a wire enum or a field name at a traveller", () => {
    const refusal = checkoutRefusal({})!;
    expect(`${refusal.title} ${refusal.body}`).not.toMatch(
      /cancellationPolicy|omitempty|null|undefined/,
    );
  });
});
