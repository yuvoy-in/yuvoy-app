import { describe, it, expect, vi, afterEach } from "vitest";
import { forgetReels, recallReel, rememberReel } from "./reel-memory";
import { CACHE } from "@/lib/query/policy";

afterEach(() => {
  vi.restoreAllMocks();
  forgetReels();
});

describe("reel memory", () => {
  it("keeps the last clip per reel screen", () => {
    rememberReel("/", "a");
    rememberReel("/", "b");
    rememberReel("/search/r/x?q=dive", "c");
    expect(recallReel("/")).toBe("b");
    expect(recallReel("/search/r/x?q=dive")).toBe("c");
    expect(recallReel("/search/r/x")).toBeNull();
  });

  it("forgets a clip once the visit it belonged to has gone", () => {
    const clock = vi.spyOn(performance, "now").mockReturnValue(1_000);
    rememberReel("/", "a");
    clock.mockReturnValue(1_000 + CACHE.reelVisit.gcTime - 1);
    expect(recallReel("/")).toBe("a");
    clock.mockReturnValue(1_000 + CACHE.reelVisit.gcTime + 1);
    expect(recallReel("/")).toBeNull();
  });
});
