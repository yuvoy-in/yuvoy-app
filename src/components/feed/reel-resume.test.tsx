import { describe, it, expect, vi, afterEach, beforeEach } from "vitest";
import { act, cleanup } from "@testing-library/react";
import { renderWithQuery } from "@/test/render";
import { ReelStrip } from "./reel-strip";
import { useFeedStore } from "@/lib/feed/store";
import { forgetReels, recallReel, rememberReel } from "@/lib/feed/reel-memory";
import { markStepBack, recordVisit } from "@/lib/site/route-trail";
import { REELS } from "../../../mocks/fixtures";

/**
 * Back returns to the reel a traveller left (an integration change of T02 C,
 * approved 4 Oct 2026): the listing slides away and THAT reel comes back from
 * the left. Going somewhere is not going back, so only a step back resumes.
 */

vi.mock("next/navigation", () => ({
  useSearchParams: () => new URLSearchParams(),
  useRouter: () => ({ push: vi.fn(), replace: vi.fn(), prefetch: vi.fn() }),
  usePathname: () => "/",
}));

function strip() {
  return renderWithQuery(
    <ReelStrip
      items={REELS}
      tail="complete"
      hasNextPage={false}
      isFetchingNextPage={false}
      isFetchNextPageError={false}
      fetchNextPage={() => {}}
    />,
  );
}

const active = () => useFeedStore.getState().activeIndex;

beforeEach(() => {
  forgetReels();
  // A visit consumes any step back a previous case left pending.
  recordVisit("/elsewhere");
});
afterEach(cleanup);

describe("a reel screen stepped back to", () => {
  it("resumes the clip that was on screen", () => {
    rememberReel("/", REELS[3].media.id);
    markStepBack();
    strip();
    expect(active()).toBe(3);
  });

  it("starts at the top when the traveller went there instead", () => {
    rememberReel("/", REELS[3].media.id);
    strip();
    expect(active()).toBe(0);
  });

  it("resumes nothing when the clip is no longer in the list", () => {
    rememberReel("/", "med_gone");
    markStepBack();
    strip();
    expect(active()).toBe(0);
  });

  it("remembers the clip on screen as the traveller moves", () => {
    strip();
    act(() => useFeedStore.getState().setActiveIndex(2));
    expect(recallReel("/")).toBe(REELS[2].media.id);
  });
});
