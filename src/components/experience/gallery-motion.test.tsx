import { describe, it, expect, afterEach, vi } from "vitest";
import { cleanup, render, screen } from "@testing-library/react";
import type { ReactNode } from "react";
import { ListingPreviewContext } from "./preview-context";
import { clearPicture, handOffPicture } from "@/lib/motion/picture-handoff";
import type { components } from "@/lib/api/schema.gen";

type Media = components["schemas"]["Media"];

/**
 * The gallery's two motion duties (approved 4 Oct 2026): it opens on the
 * picture a saved card handed over, so that picture can fly into the hero
 * (T03 B); and inside the preview a reel's swipe brings in (T02 C) it is a
 * still drawing that downloads nothing until it is shown.
 */

const players: string[] = [];
vi.mock("@/components/feed/feed-player", () => ({
  FeedPlayer: (props: { media: Media }) => {
    players.push(props.media.id);
    return <div data-testid={`player-${props.media.id}`} />;
  },
}));

const { Gallery } = await import("./gallery");

const photo = (id: string): Media => ({
  id,
  kind: "image",
  posterUrl: `https://videodelivery.net/${id}/thumb.jpg`,
  alt: `Picture ${id}`,
});
const clip = (id: string): Media => ({
  id,
  kind: "video",
  posterUrl: `https://videodelivery.net/${id}/thumb.jpg`,
  hlsUrl: "https://stream.example.invalid/x.m3u8",
});

afterEach(() => {
  cleanup();
  clearPicture();
  players.length = 0;
});

function preview(shown: boolean, children: ReactNode) {
  return (
    <ListingPreviewContext.Provider value={{ shown }}>
      {children}
    </ListingPreviewContext.Provider>
  );
}

describe("a gallery opened from a saved card (T03 B)", () => {
  it("opens on the picture the card handed over", () => {
    handOffPicture("m3");
    const { container } = render(
      <Gallery
        items={[photo("m1"), photo("m2"), photo("m3")]}
        title="Try-dive"
        picture="m3"
      />,
    );
    const dots = container.querySelectorAll('[aria-hidden="true"] span');
    expect(dots[2]).toHaveClass("bg-paper");
    expect(dots[0]).not.toHaveClass("bg-paper");
  });

  it("opens on the first picture otherwise, as it always has", () => {
    handOffPicture("m9");
    const { container } = render(
      <Gallery items={[photo("m1"), photo("m2")]} title="Try-dive" />,
    );
    const dots = container.querySelectorAll('[aria-hidden="true"] span');
    expect(dots[0]).toHaveClass("bg-paper");
  });
});

describe("a gallery inside a listing preview (T02 C)", () => {
  it("downloads nothing and plays nothing before it is shown", () => {
    render(
      preview(
        false,
        <Gallery items={[clip("c1"), photo("m2")]} title="Try-dive" />,
      ),
    );
    expect(screen.queryAllByRole("img")).toHaveLength(0);
    expect(players).toHaveLength(0);
    // A drawing: no frame opens full screen (the whole preview is inert too).
    expect(
      screen.queryAllByRole("button", { name: /full screen/ }),
    ).toHaveLength(0);
  });

  it("loads only the picture on screen once shown, still not playing", () => {
    render(
      preview(
        true,
        <Gallery items={[clip("c1"), photo("m2")]} title="Try-dive" />,
      ),
    );
    expect(screen.getAllByRole("img")).toHaveLength(1);
    expect(players).toHaveLength(0);
  });

  it("never takes a picture a saved card handed to the real page", () => {
    handOffPicture("m2");
    const items = [photo("m1"), photo("m2")];
    const inPreview = render(
      preview(true, <Gallery items={items} title="Try-dive" />),
    ).container;
    expect(
      inPreview.querySelectorAll('[aria-hidden="true"] span')[0],
    ).toHaveClass("bg-paper");

    // The real page, rendered after it, still opens on the handed picture.
    const page = render(<Gallery items={items} title="Try-dive" />).container;
    expect(page.querySelectorAll('[aria-hidden="true"] span')[1]).toHaveClass(
      "bg-paper",
    );
  });
});
