import { describe, it, expect, afterEach, beforeEach, vi } from "vitest";
import { act, cleanup, render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { useFeedStore } from "@/lib/feed/store";
import type { components } from "@/lib/api/schema.gen";

type Media = components["schemas"]["Media"];

/**
 * Clips that play in place (the approved redesign, traveller A, 3 Oct 2026).
 *
 * The player is the feed's, tested in `feed-player.test.tsx`; it is stubbed
 * here so these pin what the GALLERY decides: which frame may hold a source,
 * when it may run, and what is drawn around it.
 */

const reports: Record<string, (playable: boolean) => void> = {};

vi.mock("@/components/feed/feed-player", () => ({
  FeedPlayer: (props: {
    media: Media;
    active: boolean;
    mounted: boolean;
    muted: boolean;
    autoplayAllowed: boolean | undefined;
    sizes?: string;
    onPlayableChange?: (playable: boolean) => void;
  }) => {
    if (props.onPlayableChange)
      reports[props.media.id] = props.onPlayableChange;
    return (
      <div
        data-testid={`player-${props.media.id}`}
        data-active={String(props.active)}
        data-mounted={String(props.mounted)}
        data-muted={String(props.muted)}
        data-sizes={props.sizes}
      />
    );
  },
}));

const { Gallery } = await import("./gallery");

const clip = (id: string): Media => ({
  id,
  kind: "video",
  posterUrl: "https://videodelivery.net/x/thumb.jpg",
  hlsUrl: "https://stream.example.invalid/x.m3u8",
});
const photo = (id: string): Media => ({
  id,
  kind: "image",
  posterUrl: "https://videodelivery.net/y/thumb.jpg",
  alt: "The reef",
});
const poster = (id: string): Media => ({
  id,
  kind: "video",
  posterUrl: "https://videodelivery.net/z/thumb.jpg",
});

class NoopObserver {
  observe() {}
  unobserve() {}
  disconnect() {}
}

beforeEach(() => {
  vi.stubGlobal("IntersectionObserver", NoopObserver);
  // One frame later, here and now: the coverage check runs on a frame.
  vi.stubGlobal("requestAnimationFrame", (cb: FrameRequestCallback) => {
    cb(0);
    return 1;
  });
  vi.stubGlobal("cancelAnimationFrame", () => {});
  useFeedStore.setState({ muted: true, autoplayAllowed: undefined });
});

afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
  Reflect.deleteProperty(document, "elementFromPoint");
});

describe("a clip in the gallery", () => {
  it("is a slide holding the player, and a photograph still opens full screen", () => {
    render(<Gallery items={[clip("a"), photo("b")]} title="Try-dive" />);
    const strip = screen.getByRole("group", {
      name: "Photographs and clips of Try-dive",
    });
    expect(
      within(strip).getByRole("group", { name: "1 of 2, a clip" }),
    ).toContainElement(screen.getByTestId("player-a"));
    expect(
      within(strip).getByRole("button", { name: "Open 2 of 2 full screen" }),
    ).toBeInTheDocument();
    expect(
      within(strip).queryByRole("button", { name: /^Open 1 of/ }),
    ).toBeNull();
  });

  it("is a poster that opens full screen when it has no stream yet", () => {
    render(<Gallery items={[poster("a")]} title="Try-dive" />);
    expect(
      screen.getByRole("button", { name: "Open 1 of 1 full screen" }),
    ).toBeInTheDocument();
    expect(screen.queryByTestId("player-a")).toBeNull();
    expect(screen.getByText("Clip")).toBeInTheDocument();
  });

  it("lets only the frame on screen hold a source", () => {
    render(<Gallery items={[clip("a"), clip("b")]} title="Try-dive" />);
    expect(screen.getByTestId("player-a")).toHaveAttribute(
      "data-mounted",
      "true",
    );
    expect(screen.getByTestId("player-a")).toHaveAttribute(
      "data-active",
      "true",
    );
    expect(screen.getByTestId("player-b")).toHaveAttribute(
      "data-mounted",
      "false",
    );
    expect(screen.getByTestId("player-b")).toHaveAttribute(
      "data-active",
      "false",
    );
  });

  it("fetches the poster at the gallery's width, not the feed's", () => {
    render(<Gallery items={[clip("a")]} title="Try-dive" />);
    expect(screen.getByTestId("player-a")).toHaveAttribute(
      "data-sizes",
      "(min-width: 1024px) 768px, 100vw",
    );
  });

  it("stops under the sheet, and keeps its place to carry on", () => {
    // The browser says the middle of the gallery is the sheet, not the clip.
    Object.defineProperty(document, "elementFromPoint", {
      configurable: true,
      value: () => document.body,
    });
    render(<Gallery items={[clip("a")]} title="Try-dive" />);
    const player = screen.getByTestId("player-a");
    expect(player).toHaveAttribute("data-active", "false");
    expect(player).toHaveAttribute("data-mounted", "true");

    // Scrolled back: the middle is the clip again.
    Object.defineProperty(document, "elementFromPoint", {
      configurable: true,
      value: () => player,
    });
    act(() => {
      window.dispatchEvent(new Event("scroll"));
    });
    expect(player).toHaveAttribute("data-active", "true");
  });

  it("decides whether a clip may start by itself, the way the feed does", () => {
    render(<Gallery items={[clip("a")]} title="Try-dive" />);
    // jsdom reports no slow link, no Data Saver and no reduced motion.
    expect(useFeedStore.getState().autoplayAllowed).toBe(true);
  });

  it("keeps an answer already given, and asks nothing for a gallery of stills", () => {
    useFeedStore.setState({ autoplayAllowed: false });
    const { unmount } = render(<Gallery items={[clip("a")]} title="T" />);
    expect(useFeedStore.getState().autoplayAllowed).toBe(false);
    unmount();

    useFeedStore.setState({ autoplayAllowed: undefined });
    render(<Gallery items={[photo("b")]} title="T" />);
    expect(useFeedStore.getState().autoplayAllowed).toBeUndefined();
  });

  it("offers sound once there is a clip running, with the feed's setting", async () => {
    const user = userEvent.setup();
    render(<Gallery items={[clip("a")]} title="Try-dive" />);
    expect(screen.queryByRole("button", { name: /mute/i })).toBeNull();
    expect(screen.getByText("Clip")).toBeInTheDocument();

    act(() => reports.a(true));
    // Playing is its own evidence: the badge goes.
    expect(screen.queryByText("Clip")).toBeNull();
    await user.click(screen.getByRole("button", { name: "Unmute" }));
    expect(useFeedStore.getState().muted).toBe(false);
    expect(screen.getByTestId("player-a")).toHaveAttribute(
      "data-muted",
      "false",
    );
    expect(screen.getByRole("button", { name: "Mute" })).toBeInTheDocument();
  });
});

describe("the full-screen view", () => {
  it("draws the next photograph as a new picture, not the old one renamed", async () => {
    /*
      The picture was one element whose address changed, so the old frame
      stayed on screen under the new counter until the next had loaded,
      "2 of 2" over photograph 1 (stability audit, 6 Oct 2026).
    */
    const user = userEvent.setup();
    render(<Gallery items={[photo("a"), photo("b")]} title="Reef" />);
    await user.click(
      screen.getByRole("button", { name: "Open 1 of 2 full screen" }),
    );
    const view = screen.getByRole("dialog", { name: "Reef, 1 of 2" });
    const first = view.querySelector("img");
    expect(first).not.toBeNull();

    await user.click(
      within(view).getByRole("button", { name: "Next photograph" }),
    );
    expect(view).toHaveAccessibleName("Reef, 2 of 2");
    const next = view.querySelector("img");
    expect(next).not.toBeNull();
    expect(next).not.toBe(first);
    expect(first?.isConnected).toBe(false);
  });
});
