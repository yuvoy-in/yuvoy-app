import { describe, it, expect } from "vitest";
import {
  PAY_AT_COUNTER,
  cancellationLine,
  paymentLine,
  registrationLine,
} from "./listing-lines";

/**
 * The two lines beside the price (yuvoy-app#110, yuvoy-app#112). Both are the
 * API's to word (yuvoy-api#248); these pin what the app does before and
 * after the fields arrive.
 */

describe("paymentLine", () => {
  it("says how everybody pays today when the API sends no phrase", () => {
    // Owner's call, 25 Sep: the line is live for launch, not held for the API.
    expect(paymentLine({})).toBe("Pay at the counter on the day");
    expect(PAY_AT_COUNTER).toBe("Pay at the counter on the day");
  });

  it("prints the API's phrase verbatim once it sends one", () => {
    // So when card payments go live the line changes with no release here.
    expect(
      paymentLine({
        paymentLabel: "Pay by card now, or at the counter on the day",
      }),
    ).toBe("Pay by card now, or at the counter on the day");
  });

  it("does not print a blank or a non-string as a phrase", () => {
    expect(paymentLine({ paymentLabel: "   " })).toBe(PAY_AT_COUNTER);
    expect(paymentLine({ paymentLabel: 42 })).toBe(PAY_AT_COUNTER);
    expect(paymentLine({ paymentLabel: null })).toBe(PAY_AT_COUNTER);
  });
});

describe("cancellationLine", () => {
  it("is nothing without the API's summary, however long the policy", () => {
    /*
      Cutting a summary out of the policy paragraph would be the app inventing
      terms. The live paragraph has three tiers; a line that kept only the
      first would misstate the other two.
    */
    expect(
      cancellationLine({
        cancellationPolicy:
          "Cancel 48 hours or more before your trip starts: full refund. Cancel 24-48 hours before: half refund. Inside 24 hours: no refund.",
      }),
    ).toBeNull();
  });

  it("prints the API's summary verbatim, trimmed", () => {
    expect(
      cancellationLine({
        cancellationSummary: "  Full refund until 48 hours before ",
      }),
    ).toBe("Full refund until 48 hours before");
  });

  it("does not print a blank summary", () => {
    expect(cancellationLine({ cancellationSummary: "" })).toBeNull();
    expect(cancellationLine({ cancellationSummary: 7 })).toBeNull();
  });
});

/*
  yuvoy-app#219, the web half of yuvoy-mobile#368. The API sends
  `compliance` only while the registration is verified and in date.
*/
describe("registrationLine", () => {
  it("prints the label verbatim and the last valid day written out", () => {
    expect(
      registrationLine({
        label: "Registered with A&N Tourism",
        validTo: "2027-06-30",
      }),
    ).toBe("Registered with A&N Tourism · valid to 30 Jun 2027");
  });

  it("says nothing at all when the API sends no registration", () => {
    expect(registrationLine(undefined)).toBeNull();
  });

  it("says nothing for a blank label or a date it cannot read", () => {
    expect(registrationLine({ label: "  ", validTo: "2027-06-30" })).toBeNull();
    expect(
      registrationLine({ label: "Registered with A&N Tourism" }),
    ).toBeNull();
    expect(
      registrationLine({
        label: "Registered with A&N Tourism",
        validTo: "30/06/2027",
      }),
    ).toBeNull();
  });
});
