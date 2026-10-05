import { describe, it, expect, vi, afterEach } from "vitest";
import {
  clearPicture,
  handOffPicture,
  pictureHandedOff,
} from "./picture-handoff";

afterEach(() => {
  vi.restoreAllMocks();
  clearPicture();
});

describe("the picture a saved card hands its listing (T03 B)", () => {
  it("is offered to a gallery that holds it, until cleared", () => {
    handOffPicture("m2");
    expect(pictureHandedOff(["m1", "m2"])).toBe("m2");
    // Reading does not consume it: React may render twice.
    expect(pictureHandedOff(["m1", "m2"])).toBe("m2");
    clearPicture();
    expect(pictureHandedOff(["m1", "m2"])).toBeNull();
  });

  it("is nothing to a gallery that does not hold it", () => {
    handOffPicture("m9");
    expect(pictureHandedOff(["m1", "m2"])).toBeNull();
  });

  it("goes stale: a tap that never became a screen is not this one", () => {
    const clock = vi.spyOn(performance, "now").mockReturnValue(0);
    handOffPicture("m2");
    clock.mockReturnValue(10_001);
    expect(pictureHandedOff(["m2"])).toBeNull();
  });
});
