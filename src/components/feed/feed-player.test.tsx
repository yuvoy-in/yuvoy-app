import { describe, it, expect, vi, beforeAll, afterEach } from "vitest";
import { act, render, screen, cleanup } from "@testing-library/react";
import { FeedPlayer } from "./feed-player";
import type { components } from "@/lib/api/schema.gen";

/**
 * The play control appears on refusal, and on nothing else - yuvoy-app#78.
 *
 * The owner reported a play icon over every reel before it started playing by
 * itself. Three defects wore that one symptom, and each is pinned here by a
 * case that fails without its fix:
 *
 *   1. The store began `false` (a REFUSAL) until an effect corrected it, so
 *      the control was drawn on first paint for every card, every load.
 *   2. The control keyed off the absence of the `playing` event, so it was
 *      also drawn through the whole of a normal start: attach, manifest,
 *      buffer. Seconds of it on an island connection.
 *   3. `preload="none"` on every card meant the mounted neighbour fetched
 *      nothing on native HLS, which is Safari and all of iOS.
 *
 * These are asserted BY STATE rather than by counting what is on the card. A
 * count passes for the wrong reason the moment the overlay gains anything, and
 * the distinction being defended here is between three states that all used to
 * look identical.
 */

type Media = components["schemas"]["Media"];

const CLIP: Media = {
  posterUrl: "https://cdn.example.test/poster.jpg",
  hlsUrl: "https://cdn.example.test/clip.m3u8",
  alt: "A reef from above",
} as Media;

beforeAll(() => {
  /*
    jsdom implements neither, and every case here turns on what `play()` does.
    Resolving is the normal outcome: muted playback needs no gesture in any
    browser, which is the whole reason the feed can start by itself.
  */
  Object.defineProperty(HTMLMediaElement.prototype, "play", {
    configurable: true,
    writable: true,
    value: vi.fn().mockResolvedValue(undefined),
  });
  Object.defineProperty(HTMLMediaElement.prototype, "pause", {
    configurable: true,
    writable: true,
    value: vi.fn(),
  });
});

afterEach(cleanup);

/** The control, by its accessible name rather than by shape. */
const playControl = () => screen.queryByRole("button", { name: /^Play/ });

describe("the reel player, while it is starting", () => {
  it("draws no play control before the browser has been asked", () => {
    /*
      THE REPORTED DEFECT. `undefined` is the store's state on first paint:
      `detectAutoplayAllowed` has not run yet. It used to be `false`, and
      `false` is a refusal, so this control was on screen every single load.
    */
    render(
      <FeedPlayer
        media={CLIP}
        active
        mounted
        muted
        autoplayAllowed={undefined}
      />,
    );

    expect(playControl()).not.toBeInTheDocument();
  });

  it("holds a video element before the decision, so nothing moves after it", () => {
    /*
      The element used to be gated on the autoplay decision, so first paint had
      no `<video>` at all and gained one a tick later. Keeping it in the markup
      either side of the decision is what makes the start seamless rather than
      a swap.
    */
    const { container } = render(
      <FeedPlayer
        media={CLIP}
        active
        mounted
        muted
        autoplayAllowed={undefined}
      />,
    );

    expect(container.querySelector("video")).toBeInTheDocument();
  });

  it("spends no bytes on a clip it has not been cleared to play", () => {
    const { container } = render(
      <FeedPlayer
        media={CLIP}
        active
        mounted
        muted
        autoplayAllowed={undefined}
      />,
    );

    // Undecided must cost nothing: a traveller on Data Saver has not yet been
    // asked, and an element that prefetched here would have spent their data
    // before the preference was read.
    expect(container.querySelector("video")).toHaveAttribute("preload", "none");
  });
});

describe("the reel player, once it has been refused", () => {
  it("draws the play control when the decision actually said no", () => {
    /*
      The other half, and the reason this is not simply a deletion. Reduced
      motion, Data Saver and a positively slow link all land here, and a poster
      with nothing to press is the dead end yuvoy-app#17 was filed about.
    */
    render(
      <FeedPlayer media={CLIP} active mounted muted autoplayAllowed={false} />,
    );

    expect(playControl()).toBeInTheDocument();
  });

  it("still spends no bytes while refused", () => {
    const { container } = render(
      <FeedPlayer media={CLIP} active mounted muted autoplayAllowed={false} />,
    );

    expect(container.querySelector("video")).toHaveAttribute("preload", "none");
  });
});

describe("the reel player, once it may play", () => {
  it("draws no play control on the card in view", () => {
    render(<FeedPlayer media={CLIP} active mounted muted autoplayAllowed />);

    expect(playControl()).not.toBeInTheDocument();
  });

  it("fetches eagerly for the card in view", () => {
    const { container } = render(
      <FeedPlayer media={CLIP} active mounted muted autoplayAllowed />,
    );

    expect(container.querySelector("video")).toHaveAttribute("preload", "auto");
  });

  it("fetches metadata for a mounted neighbour, which is what the budget is for", () => {
    /*
      DEFECT 3. `preload="none"` was on every card, so `PRELOAD_AHEAD` mounted
      the next reel's element and then told it to fetch nothing. On the hls.js
      path `loadSource` fetches anyway, so Android pre-buffered and Safari did
      not, and Safari plus iOS is most of our traffic. The budget was inert
      exactly where it mattered.
    */
    const { container } = render(
      <FeedPlayer media={CLIP} active={false} mounted muted autoplayAllowed />,
    );

    expect(container.querySelector("video")).toHaveAttribute(
      "preload",
      "metadata",
    );
  });
});

describe("the reel player, with no clip", () => {
  it("draws neither a video nor a control for a poster that will never play", () => {
    const posterOnly = {
      posterUrl: CLIP.posterUrl,
      alt: "Just a still",
    } as Media;
    const { container } = render(
      <FeedPlayer media={posterOnly} active mounted muted autoplayAllowed />,
    );

    expect(container.querySelector("video")).not.toBeInTheDocument();
    expect(playControl()).not.toBeInTheDocument();
  });
});

/**
 * How much of a clip actually PLAYED, for a reel view (yuvoy-app#96).
 *
 * The API asks for watch time "across loops" and whether the reel "played to
 * the end at least once". Both are read off the element's own clock, so a
 * clip that is paused, buffering or refused adds nothing, and a loop (which
 * never fires `ended`) is seen as the media time going backwards.
 */
describe("the reel player, reporting what played", () => {
  /** Puts the element where a real one would be, then lets it report. */
  function at(
    video: HTMLVideoElement,
    time: number,
    { duration = 10, paused = false } = {},
  ) {
    Object.defineProperty(video, "currentTime", {
      configurable: true,
      get: () => time,
      set: () => {},
    });
    Object.defineProperty(video, "duration", {
      configurable: true,
      get: () => duration,
    });
    Object.defineProperty(video, "paused", {
      configurable: true,
      get: () => paused,
    });
    act(() => {
      video.dispatchEvent(new Event("timeupdate"));
    });
  }

  function mount() {
    const watch = { played: vi.fn(), completed: vi.fn() };
    const { container } = render(
      <FeedPlayer
        media={CLIP}
        active
        mounted
        muted
        autoplayAllowed={undefined}
        watch={watch}
      />,
    );
    const video = container.querySelector("video")!;
    const total = () =>
      watch.played.mock.calls.reduce((sum, [ms]) => sum + (ms as number), 0);
    return { watch, video, total };
  }

  it("adds up the media time that passed while it played", () => {
    const { watch, video, total } = mount();
    at(video, 0);
    at(video, 0.25);
    at(video, 0.5);
    at(video, 1.5);
    expect(total()).toBeCloseTo(1_500);
    expect(watch.completed).not.toHaveBeenCalled();
  });

  it("adds nothing while paused", () => {
    const { video, total } = mount();
    at(video, 2);
    at(video, 2, { paused: true });
    at(video, 2, { paused: true });
    expect(total()).toBe(0);
  });

  it("counts a loop as the end, and the time on both sides of it", () => {
    const { watch, video, total } = mount();
    at(video, 9.8);
    // `loop` comes round to the start without an `ended`.
    at(video, 0.1);
    expect(total()).toBeCloseTo(300);
    expect(watch.completed).toHaveBeenCalled();
  });

  it("counts the last moment before the end as the end", () => {
    // Somebody who scrolls on just as it finishes has seen it finish.
    const { watch, video } = mount();
    at(video, 9.5);
    at(video, 9.75);
    expect(watch.completed).toHaveBeenCalled();
  });

  it("does not count a jump as playback", () => {
    // A source attaching, or a stall recovering, is not time anybody watched.
    const { video, total } = mount();
    at(video, 0);
    at(video, 6);
    expect(total()).toBe(0);
  });

  it("measures nothing at all without a view to report to", () => {
    const { container } = render(
      <FeedPlayer
        media={CLIP}
        active
        mounted
        muted
        autoplayAllowed={undefined}
      />,
    );
    const video = container.querySelector("video")!;
    expect(() => at(video, 1)).not.toThrow();
  });
});
