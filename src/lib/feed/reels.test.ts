import { describe, it, expect, vi, afterEach } from "vitest";
import { playableReels, feedTail, type ReelsPage } from "./reels";

/**
 * The two pure claims the feed makes about the server's answer.
 *
 * Both are here rather than only in the component because both are the kind of
 * thing that is wrong silently. A feed that stops one page early looks exactly
 * like a feed that has ended, and "that is everything on sale right now" is
 * the one sentence on that screen a traveller cannot check.
 */

type Reel = ReelsPage["items"][number];

/**
 * A reel with only the fields these functions read.
 *
 * Cast at this one boundary rather than filled out. `Media` and
 * `ExperienceSummary` carry a dozen required fields between them — a slug, a
 * market key, a category enum — and none of them are inputs to flattening,
 * dropping or tail-reading. Spelling them all out would make each case here
 * describe a card instead of describing the property under test, and would
 * need editing every time an unrelated field is added to the contract.
 */
const reel = (id: string) =>
  ({
    media: { id, kind: "video" },
    experience: { id: `e-${id}`, title: `Listing ${id}` },
  }) as unknown as Reel;

const bare = (media: unknown, experience?: unknown) =>
  ({ media, experience }) as unknown as Reel;

const page = (over: Partial<ReelsPage> = {}): ReelsPage =>
  ({ items: [], complete: true, ...over }) as ReelsPage;

afterEach(() => vi.restoreAllMocks());

describe("feedTail", () => {
  it("says the feed ended only when the server said `complete`", () => {
    expect(feedTail([page({ complete: true })])).toBe("complete");
  });

  it("says there is more while a cursor is on the last page", () => {
    expect(feedTail([page({ complete: false, nextCursor: "abc" })])).toBe(
      "more",
    );
  });

  it("distinguishes the server stopping from the feed ending", () => {
    /*
      The contract's own third case: "`false` with no `nextCursor` means the
      server stopped, which is a different thing from the feed having ended."
      Collapsing the two would tell a traveller they had seen everything on
      sale because a query timed out.
    */
    expect(feedTail([page({ complete: false })])).toBe("server_stopped");
  });

  it("never reads a short page as an ending", () => {
    /*
      The defect the API and the app agreed on in writing (yuvoy-api#114): a
      page that comes back shorter than asked for is not evidence of anything.
      Only `complete` is.
    */
    const short = page({
      items: [reel("a")],
      complete: false,
      nextCursor: "c",
    });
    expect(feedTail([short])).toBe("more");
  });

  it("never reads a FULL page as an ending either", () => {
    // The mirror of the above, and the one that actually bit: an infinite
    // scroll that stops on a coincidentally-full page is indistinguishable
    // from one with nothing more to show, so nobody reports it.
    const full = page({
      items: Array.from({ length: 12 }, (_, i) => reel(`f${i}`)),
      complete: false,
      nextCursor: "c",
    });
    expect(feedTail([full])).toBe("more");
  });

  it("is decided by the LAST page, not the first", () => {
    // Every page but the last is `complete: false` by construction, so reading
    // the first would report "more" forever.
    expect(
      feedTail([
        page({ complete: false, nextCursor: "c" }),
        page({ complete: true }),
      ]),
    ).toBe("complete");
  });

  it("claims nothing when there are no pages at all", () => {
    // Loading and error states have nothing to say about the bottom of a feed
    // they do not have. "more" is the answer that makes no claim.
    expect(feedTail(undefined)).toBe("more");
    expect(feedTail([])).toBe("more");
  });
});

describe("playableReels", () => {
  it("flattens every page, in the order the server gave them", () => {
    const items = playableReels([
      page({ items: [reel("a"), reel("b")], complete: false, nextCursor: "c" }),
      page({ items: [reel("c")] }),
    ]);
    expect(items.map((r) => r.media?.id)).toEqual(["a", "b", "c"]);
  });

  it("drops an item with no media, and one with no experience", () => {
    /*
      Both halves are optional in the contract. A row with nothing to play is a
      black rectangle in a reels feed; a clip with no listing is a dead stop in
      a scroll, because the card's whole job is to offer the booking.
    */
    const items = playableReels([
      page({
        items: [
          reel("a"),
          bare(undefined, { id: "e", title: "No clip" }),
          bare({ id: "orphan", kind: "video" }, undefined),
        ],
      }),
    ]);
    expect(items.map((r) => r.media?.id)).toEqual(["a"]);
  });

  it("drops a reel that arrives on two pages, and says so", () => {
    /*
      Should never happen — the API walked the whole feed a card at a time and
      no id appeared twice. It is guarded because the two outcomes are not
      symmetrical: dropping the repeat costs a row nobody would see twice,
      keeping it gives React duplicate keys, which unmounts the wrong card and
      hands one clip's player state to another.
    */
    const warn = vi.spyOn(console, "warn").mockImplementation(() => {});

    const items = playableReels([
      page({ items: [reel("a"), reel("b")], complete: false, nextCursor: "c" }),
      page({ items: [reel("b"), reel("c")] }),
    ]);

    expect(items.map((r) => r.media?.id)).toEqual(["a", "b", "c"]);
    // Not swallowed: a cursor that has started repeating rows is a real defect
    // upstream, and the interleave is probably wrong too.
    expect(warn).toHaveBeenCalledWith(expect.stringContaining("more than one"));
  });

  it("keeps items that have no id at all rather than folding them together", () => {
    // `id` is optional on Media. Two id-less items are not evidence of a
    // repeat, and treating absence as one shared key would delete real reels.
    const items = playableReels([
      page({
        items: [
          bare({ kind: "video" }, { id: "e1", title: "One" }),
          bare({ kind: "video" }, { id: "e2", title: "Two" }),
        ],
      }),
    ]);
    expect(items).toHaveLength(2);
  });

  it("survives an absent page list", () => {
    expect(playableReels(undefined)).toEqual([]);
  });
});
