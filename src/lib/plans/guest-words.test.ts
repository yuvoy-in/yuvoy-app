import { describe, it, expect } from "vitest";
import { guestWords } from "./guest-words";

/**
 * The guest page's own words (yuvoy-mobile#373) keep the two rules every
 * plan line keeps: no dash, and never "host" for the person who made the
 * plan (yuvoy-api#480).
 */

function everyLine(): string[] {
  return Object.values(guestWords).map((value) =>
    typeof value === "function"
      ? String((value as (...a: string[]) => string)("Asha", "Fish", "₹450", "Asha"))
      : value,
  );
}

describe("the guest page's words", () => {
  it("have no dash in them", () => {
    for (const line of everyLine()) {
      expect(line, line).not.toMatch(/[‒-―−]/);
      expect(line, line).not.toMatch(/\s-\s/);
    }
  });

  it("never call the person who made the plan the host", () => {
    for (const line of everyLine()) {
      expect(line, line).not.toMatch(/\bhosts?\b/i);
    }
  });

  it("say the API's own sentence for a missing name", () => {
    expect(guestWords.nameNeeded).toBe("Use your first name, in letters only.");
  });

  it("share the mobile app's text, ready for the link after it", () => {
    expect(guestWords.shareMessage("Dinner", "Friends are choosing a time")).toBe(
      "Dinner. Friends are choosing a time. Reply here, no app needed:",
    );
  });
});
