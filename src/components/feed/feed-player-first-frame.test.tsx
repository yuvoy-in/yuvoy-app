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

/**
 * The media host's connection (production readiness, 6 Oct 2026). The first
 * request to it paid ~550ms of connection setup on the live feed; the player
 * warms it from its first render so the manifest does not wait for one.
 */
describe("the media host's connection", () => {
  /*
    A host of its own per case. React sends one hint per origin for the life
    of the page, and earlier cases in this file have already warmed CLIP's.
  */
  const clipOn = (host: string): Media => ({
    ...CLIP,
    hlsUrl: `https://${host}/clip.m3u8`,
  });
  const warmed = (host: string) =>
    [...document.head.querySelectorAll('link[rel="preconnect"]')].filter(
      (l) => l.getAttribute("href") === `https://${host}`,
    );

  it("is left cold for a card outside the preload budget", () => {
    render(
      <FeedPlayer
        media={clipOn("cold.example.test")}
        active={false}
        mounted={false}
        muted
        autoplayAllowed
      />,
    );
    expect(warmed("cold.example.test")).toHaveLength(0);
  });

  it("is warmed for a card with a clip, in the pool native HLS loads from", () => {
    render(
      <FeedPlayer
        media={clipOn("warm.example.test")}
        active
        mounted
        muted
        autoplayAllowed
      />,
    );
    expect(warmed("warm.example.test")).toHaveLength(1);
    // No crossorigin: native HLS fetches as no-cors media.
    expect(warmed("warm.example.test")[0].hasAttribute("crossorigin")).toBe(
      false,
    );
  });
});
