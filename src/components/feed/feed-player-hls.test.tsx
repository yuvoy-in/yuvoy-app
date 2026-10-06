import { describe, it, expect, vi, beforeAll, afterEach } from "vitest";
import { act, render, cleanup, waitFor } from "@testing-library/react";
import type { components } from "@/lib/api/schema.gen";

/**
 * The hls.js path: the browsers that cannot play HLS themselves, jsdom among
 * them. hls.js is replaced by a stand-in that records what the player asks of
 * it and lets a case raise its errors, so these pin what the PLAYER does with
 * a fault, not what hls.js does.
 */

type Media = components["schemas"]["Media"];

interface Stand {
  raise: (data: { fatal: boolean; type: string }) => void;
  recoverMediaError: ReturnType<typeof vi.fn>;
}

const hls = vi.hoisted(() => ({ made: [] as Stand[] }));

vi.mock("hls.js", () => {
  class StandInHls {
    static isSupported() {
      return true;
    }
    static Events = { ERROR: "hlsError" };
    static ErrorTypes = {
      NETWORK_ERROR: "networkError",
      MEDIA_ERROR: "mediaError",
      OTHER_ERROR: "otherError",
    };
    private handlers: ((event: string, data: object) => void)[] = [];
    recoverMediaError = vi.fn();
    constructor() {
      hls.made.push(this);
    }
    on(_event: string, handler: (event: string, data: object) => void) {
      this.handlers.push(handler);
    }
    loadSource() {}
    attachMedia() {}
    destroy() {}
    raise(data: { fatal: boolean; type: string }) {
      for (const handler of this.handlers) handler("hlsError", data);
    }
  }
  return { default: StandInHls };
});

const { FeedPlayer } = await import("./feed-player");

const CLIP: Media = {
  posterUrl: "https://cdn.example.test/poster.jpg",
  hlsUrl: "https://cdn.example.test/clip.m3u8",
  alt: "A reef from above",
} as Media;

beforeAll(() => {
  // jsdom implements neither; muted playback resolving is the normal outcome.
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

afterEach(() => {
  cleanup();
  hls.made.length = 0;
});

/** The clip is drawn: a failed one is its poster alone, with no element. */
const clipDrawn = (container: HTMLElement) =>
  container.querySelector("video") !== null;

async function attached() {
  const { container } = render(
    <FeedPlayer media={CLIP} active mounted muted autoplayAllowed />,
  );
  await waitFor(() => expect(hls.made).toHaveLength(1));
  return { container, stand: hls.made[0] };
}

describe("a clip on hls.js, when it faults", () => {
  it("rebuilds the media once after a decode fault, and keeps the clip", async () => {
    /*
      A fatal decode fault is often one bad fragment. It used to end the clip
      on the spot (stability audit, 6 Oct 2026).
    */
    const { container, stand } = await attached();
    act(() => stand.raise({ fatal: true, type: "mediaError" }));
    expect(stand.recoverMediaError).toHaveBeenCalledTimes(1);
    expect(clipDrawn(container)).toBe(true);
  });

  it("falls back to the poster on a second decode fault", async () => {
    const { container, stand } = await attached();
    act(() => stand.raise({ fatal: true, type: "mediaError" }));
    act(() => stand.raise({ fatal: true, type: "mediaError" }));
    expect(stand.recoverMediaError).toHaveBeenCalledTimes(1);
    expect(clipDrawn(container)).toBe(false);
  });

  it("falls back to the poster on a network fault, without asking again", async () => {
    // Fatal only once hls.js has spent its own retries.
    const { container, stand } = await attached();
    act(() => stand.raise({ fatal: true, type: "networkError" }));
    expect(stand.recoverMediaError).not.toHaveBeenCalled();
    expect(clipDrawn(container)).toBe(false);
  });

  it("leaves a fault hls.js recovers from itself alone", async () => {
    const { container, stand } = await attached();
    act(() => stand.raise({ fatal: false, type: "networkError" }));
    expect(stand.recoverMediaError).not.toHaveBeenCalled();
    expect(clipDrawn(container)).toBe(true);
  });
});
