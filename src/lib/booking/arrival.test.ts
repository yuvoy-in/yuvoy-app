import { describe, it, expect } from "vitest";
import { arrivalPending, forgetArrival, markArrival } from "./arrival";

/**
 * The booking page's moment plays on the page the booking tap lands on, and
 * never again: not on a reload, a poll, Back, or a shared link (T10 A).
 */
describe("the arrival from checkout", () => {
  it("is pending for the booking checkout just opened, and only that one", () => {
    markArrival("tok_a");
    expect(arrivalPending("tok_a")).toBe(true);
    expect(arrivalPending("tok_b")).toBe(false);
    expect(arrivalPending(null)).toBe(false);
  });

  it("reads without taking, so a page that renders twice sees it both times", () => {
    markArrival("tok_a");
    expect(arrivalPending("tok_a")).toBe(true);
    expect(arrivalPending("tok_a")).toBe(true);
  });

  it("is gone once forgotten, and another booking's page cannot forget it", () => {
    markArrival("tok_a");
    forgetArrival("tok_b");
    expect(arrivalPending("tok_a")).toBe(true);
    forgetArrival("tok_a");
    expect(arrivalPending("tok_a")).toBe(false);
  });
});
