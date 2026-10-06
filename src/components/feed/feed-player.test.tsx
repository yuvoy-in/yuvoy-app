import {
  describe,
  it,
  expect,
  vi,
  beforeAll,
  afterAll,
  afterEach,
} from "vitest";
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

describe("the reel player, tapped (tap is play and pause)", () => {
  /*
    The settled feed ruling production never built until the redesign
    (traveller A, 3 Oct 2026), and the only way to stop a looping clip, which
    WCAG 2.2.2 asks for. Native HLS, so the clip is attached without hls.js.
  */
  const canPlayType = HTMLMediaElement.prototype.canPlayType;
  beforeAll(() => {
    HTMLMediaElement.prototype.canPlayType = () => "maybe";
  });
  afterAll(() => {
    HTMLMediaElement.prototype.canPlayType = canPlayType;
  });

  const pauseControl = () =>
    screen.queryByRole("button", { name: "Pause video" });

  const player = (over: Partial<Parameters<typeof FeedPlayer>[0]> = {}) => (
    <FeedPlayer media={CLIP} active mounted muted autoplayAllowed {...over} />
  );

  it("makes the picture the pause control while the clip may play", () => {
    render(player());
    expect(pauseControl()).toBeInTheDocument();
    expect(playControl()).not.toBeInTheDocument();
  });

  it("pauses on a tap, and the play control brings it back", async () => {
    const pause = vi.mocked(HTMLMediaElement.prototype.pause);
    const play = vi.mocked(HTMLMediaElement.prototype.play);
    pause.mockClear();
    render(player());

    await act(async () => pauseControl()!.click());
    expect(pause).toHaveBeenCalled();
    // One named control for the clip at a time: the play control now.
    expect(pauseControl()).not.toBeInTheDocument();
    expect(playControl()).toBeInTheDocument();

    play.mockClear();
    await act(async () => playControl()!.click());
    expect(play).toHaveBeenCalled();
    expect(pauseControl()).toBeInTheDocument();
    expect(playControl()).not.toBeInTheDocument();
  });

  it("plays again when the reel comes back on screen", async () => {
    const { rerender } = render(player());
    await act(async () => pauseControl()!.click());
    expect(playControl()).toBeInTheDocument();

    rerender(player({ active: false }));
    rerender(player({ active: true }));
    expect(playControl()).not.toBeInTheDocument();
    expect(pauseControl()).toBeInTheDocument();
  });

  it("is no control at all while something covers the picture", () => {
    render(player({ hidden: true }));
    expect(pauseControl()).not.toBeInTheDocument();
  });

  it("plays a refused clip from a tap anywhere on the picture", async () => {
    const asked = vi.fn();
    const { container } = render(
      player({ autoplayAllowed: false, onRequestPlay: asked }),
    );
    // The named control is the play button; the picture is pointer-only.
    expect(playControl()).toBeInTheDocument();
    expect(pauseControl()).not.toBeInTheDocument();
    const surface = container.querySelector<HTMLButtonElement>(
      'button[aria-hidden="true"]',
    );
    expect(surface).not.toBeNull();
    await act(async () => surface!.click());
    expect(asked).toHaveBeenCalledTimes(1);
  });

  it("draws nothing to tap on a card that is not in view", () => {
    render(player({ active: false }));
    expect(pauseControl()).not.toBeInTheDocument();
  });
});

/*
  T12 A (approved 4 Oct 2026): the clip is seen only from its first decoded
  frame, and a clip Safari cannot play gives up instead of spinning for ever.
  Both on the native HLS path (Safari, iOS), which jsdom stands in for here.
*/
describe("the reel player, on its first frame (T12 A)", () => {
  const native = Object.getOwnPropertyDescriptor(
    HTMLMediaElement.prototype,
    "canPlayType",
  );
  beforeAll(() => {
    Object.defineProperty(HTMLMediaElement.prototype, "canPlayType", {
      configurable: true,
      writable: true,
      value: (type: string) =>
        type === "application/vnd.apple.mpegurl" ? "maybe" : "",
    });
  });
  afterAll(() => {
    if (native)
      Object.defineProperty(HTMLMediaElement.prototype, "canPlayType", native);
  });

  const element = (over: Partial<Parameters<typeof FeedPlayer>[0]> = {}) => (
    <FeedPlayer media={CLIP} active mounted muted autoplayAllowed {...over} />
  );
  const player = () => render(element());
  const ring = () => screen.queryByRole("status", { name: "Loading video" });

  it("stays invisible over its poster until it has a frame, then fades in", async () => {
    const { container } = player();
    const video = container.querySelector("video")!;
    // Attached and asked to play, but nothing decoded: still the poster.
    await act(async () => {});
    expect(video.getAttribute("src")).toBe(CLIP.hlsUrl);
    expect(video).toHaveClass("opacity-0");
    act(() => {
      video.dispatchEvent(new Event("loadeddata"));
    });
    expect(video).toHaveClass("opacity-100", "duration-200");
  });

  it("gives a dead clip up, leaving its poster and no spinner", async () => {
    vi.useFakeTimers();
    try {
      const { container } = player();
      const video = container.querySelector("video")!;
      await act(async () => {});
      act(() => {
        video.dispatchEvent(new Event("error"));
      });
      act(() => {
        vi.advanceTimersByTime(2000);
      });
      expect(container.querySelector("video")).toBeNull();
      expect(
        screen.queryByRole("status", { name: "Loading video" }),
      ).not.toBeInTheDocument();
    } finally {
      vi.useRealTimers();
    }
  });

  it("says a slow start is slow, and stops saying so once the clip plays", async () => {
    vi.useFakeTimers();
    try {
      const { container } = player();
      const video = container.querySelector("video")!;
      await act(async () => {});
      act(() => {
        vi.advanceTimersByTime(700);
      });
      expect(ring()).toBeInTheDocument();
      // A first frame is not a start: the clip can hold it while it buffers.
      act(() => {
        video.dispatchEvent(new Event("loadeddata"));
      });
      expect(ring()).toHaveAttribute("data-shown", "true");
      act(() => {
        video.dispatchEvent(new Event("playing"));
      });
      expect(ring()).not.toBeInTheDocument();
      // Still drawn, so that it fades out rather than vanishing.
      expect(container.querySelector(".feed-slow-ring")).toHaveAttribute(
        "data-shown",
        "false",
      );
    } finally {
      vi.useRealTimers();
    }
  });

  it("says so again at once when a clip it already knows is slow stops to buffer", async () => {
    vi.useFakeTimers();
    try {
      const { container } = player();
      const video = container.querySelector("video")!;
      await act(async () => {});
      act(() => {
        vi.advanceTimersByTime(700);
      });
      act(() => {
        video.dispatchEvent(new Event("loadeddata"));
        video.dispatchEvent(new Event("playing"));
      });
      expect(ring()).not.toBeInTheDocument();
      act(() => {
        video.dispatchEvent(new Event("waiting"));
      });
      // Named, and seen: over the picture it already has.
      expect(ring()).toHaveAttribute("data-shown", "true");
    } finally {
      vi.useRealTimers();
    }
  });

  it("never calls a clip the traveller paused slow to start", async () => {
    vi.useFakeTimers();
    try {
      const { container } = player();
      const video = container.querySelector("video")!;
      await act(async () => {});
      act(() => {
        video.dispatchEvent(new Event("loadeddata"));
        video.dispatchEvent(new Event("playing"));
      });
      await act(async () =>
        screen.getByRole("button", { name: "Pause video" }).click(),
      );
      act(() => {
        video.dispatchEvent(new Event("pause"));
      });
      act(() => {
        vi.advanceTimersByTime(2000);
      });
      expect(ring()).not.toBeInTheDocument();
      expect(playControl()).toBeInTheDocument();
    } finally {
      vi.useRealTimers();
    }
  });

  it("fades a clip in again from its own first frame when it is drawn again", async () => {
    const { container, rerender } = player();
    await act(async () => {});
    act(() => {
      container.querySelector("video")!.dispatchEvent(new Event("loadeddata"));
    });
    expect(container.querySelector("video")).toHaveClass("opacity-100");
    // Out of the preload budget, and back: a new element, with no frame yet.
    rerender(element({ mounted: false }));
    expect(container.querySelector("video")).toBeNull();
    rerender(element({ mounted: true }));
    await act(async () => {});
    const again = container.querySelector("video")!;
    expect(again).toHaveClass("opacity-0");
    act(() => {
      again.dispatchEvent(new Event("loadeddata"));
    });
    expect(again).toHaveClass("opacity-100");
  });

  it("does not call a quiet network a stop: stalled with a full buffer plays on", async () => {
    /*
      `stalled` fires when the network has been quiet for about three
      seconds, which is normal once the buffer is full. It used to be read as
      stopped, and drew "Loading video" over a clip that was playing.
    */
    vi.useFakeTimers();
    try {
      const { container } = player();
      const video = container.querySelector("video")!;
      await act(async () => {});
      act(() => {
        video.dispatchEvent(new Event("loadeddata"));
        video.dispatchEvent(new Event("playing"));
      });
      act(() => {
        video.dispatchEvent(new Event("stalled"));
      });
      act(() => {
        vi.advanceTimersByTime(2000);
      });
      expect(ring()).not.toBeInTheDocument();
      expect(playControl()).not.toBeInTheDocument();
    } finally {
      vi.useRealTimers();
    }
  });

  it("gives its media back when it leaves the preload budget", async () => {
    const { container, rerender } = player();
    await act(async () => {});
    const video = container.querySelector("video")!;
    expect(video.getAttribute("src")).toBe(CLIP.hlsUrl);
    const load = vi.spyOn(video, "load");

    rerender(element({ mounted: false }));

    // Not left holding a source and its buffers until garbage collection.
    expect(video.getAttribute("src")).toBeNull();
    expect(load).toHaveBeenCalled();
  });

  it("tries a failed clip again when it comes back into the budget", async () => {
    const { container, rerender } = player();
    await act(async () => {});
    act(() => {
      container.querySelector("video")!.dispatchEvent(new Event("error"));
    });
    expect(container.querySelector("video")).toBeNull();

    // Scrolled past, and back: one dropped segment is not a dead clip.
    rerender(element({ mounted: false }));
    rerender(element({ mounted: true }));
    await act(async () => {});
    expect(container.querySelector("video")?.getAttribute("src")).toBe(
      CLIP.hlsUrl,
    );
  });
});

describe("the reel player, when play() is turned down", () => {
  const play = HTMLMediaElement.prototype.play;
  const native = Object.getOwnPropertyDescriptor(
    HTMLMediaElement.prototype,
    "canPlayType",
  );
  // The native path, as on every iPhone: the source attaches and play() runs.
  beforeAll(() => {
    Object.defineProperty(HTMLMediaElement.prototype, "canPlayType", {
      configurable: true,
      writable: true,
      value: (type: string) =>
        type === "application/vnd.apple.mpegurl" ? "maybe" : "",
    });
  });
  afterAll(() => {
    if (native)
      Object.defineProperty(HTMLMediaElement.prototype, "canPlayType", native);
  });
  afterEach(() => {
    HTMLMediaElement.prototype.play = play;
  });
  const rejectWith = (name: string) => {
    HTMLMediaElement.prototype.play = vi
      .fn()
      .mockRejectedValue(new DOMException("no", name));
  };

  it("draws the play control when the browser refused it", async () => {
    rejectWith("NotAllowedError");
    render(<FeedPlayer media={CLIP} active mounted muted autoplayAllowed />);
    await act(async () => {});
    expect(playControl()).toBeInTheDocument();
  });

  it("draws nothing when the start was only interrupted", async () => {
    /*
      Leaving a card pauses it, and a pause rejects a play() still pending
      with an AbortError. That is not a refusal, and recording it drew the
      play control over a clip that was only starting when the traveller
      flicked back to it.
    */
    rejectWith("AbortError");
    render(<FeedPlayer media={CLIP} active mounted muted autoplayAllowed />);
    await act(async () => {});
    expect(playControl()).not.toBeInTheDocument();
  });
});

describe("the reel player's poster", () => {
  const poster = (container: HTMLElement) => container.querySelector("img")!;

  it("asks first for the card in view", () => {
    const { container } = render(
      <FeedPlayer media={CLIP} active mounted muted autoplayAllowed />,
    );
    expect(poster(container)).toHaveAttribute("loading", "eager");
    expect(poster(container)).toHaveAttribute("fetchpriority", "high");
  });

  it("loads now for a card one swipe away, which nothing else can fill", () => {
    const { container } = render(
      <FeedPlayer media={CLIP} active={false} mounted muted autoplayAllowed />,
    );
    expect(poster(container)).toHaveAttribute("loading", "eager");
    expect(poster(container)).toHaveAttribute("fetchpriority", "auto");
  });

  it("waits for a card beyond the preload budget", () => {
    const { container } = render(
      <FeedPlayer
        media={CLIP}
        active={false}
        mounted={false}
        muted
        autoplayAllowed
      />,
    );
    expect(poster(container)).toHaveAttribute("loading", "lazy");
  });
});
