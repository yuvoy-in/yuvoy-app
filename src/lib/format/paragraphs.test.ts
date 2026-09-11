import { describe, it, expect } from "vitest";
import { paragraphsOf } from "./paragraphs";

describe("paragraphsOf", () => {
  it("keeps the breaks the author typed", () => {
    expect(
      paragraphsOf("Two dives on the house reef.\nBoat at seven."),
    ).toEqual(["Two dives on the house reef.", "Boat at seven."]);
  });

  it("collapses a run of blank lines into one break", () => {
    expect(paragraphsOf("One.\r\n\r\n\n   \nTwo.")).toEqual(["One.", "Two."]);
  });

  it("is nothing for whitespace, the way the publish gate reads it", () => {
    expect(paragraphsOf("  \n \t\n")).toEqual([]);
  });

  it("is nothing for a value that is not text", () => {
    // The contract says absent, never "" — but `null` is what a nullable
    // column becomes the day somebody forgets an `omitempty`.
    expect(paragraphsOf(undefined)).toEqual([]);
    expect(paragraphsOf(null)).toEqual([]);
    expect(paragraphsOf(42)).toEqual([]);
  });
});
