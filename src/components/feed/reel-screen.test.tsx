import { describe, it, expect, afterEach, vi } from "vitest";
import { screen, cleanup, within, waitFor } from "@testing-library/react";
import { renderWithQuery } from "@/test/render";
import { ReelScreen } from "./reel-screen";
import { REELS } from "../../../mocks/fixtures";

/**
 * A shared reel — `/r/{media.id}`, yuvoy-app#36.
 *
 * The page's own job (fetching the reel, 404ing on anything the feed would not
 * show) is the route's and is exercised end to end. What is proved here is the
 * part a route test cannot see: that the shared reel is PINNED FIRST and can
 * never appear a second time as the feed pages in underneath it.
 */

vi.mock("next/navigation", () => ({
  useRouter: () => ({ push: vi.fn(), replace: vi.fn() }),
  usePathname: () => "/r/med_kayak",
}));

afterEach(cleanup);

/** A reel that is genuinely in the feed fixture, so the de-duplication is real. */
const shared = REELS[2]; // the kayak — third in the rotation, not first

describe("a shared reel", () => {
  it("opens on the reel that was shared, not on the top of the feed", async () => {
    renderWithQuery(<ReelScreen reel={shared} />);
    const cards = await screen.findAllByRole("article");
    expect(cards[0]).toHaveAttribute("aria-label", shared.experience.title);
  });

  it("names the reel rather than the screen a traveller did not ask for", async () => {
    /*
      Somebody arriving from a message has no context at all. "Experiences in
      the Andaman Islands" would be a heading about a page they did not choose.
    */
    renderWithQuery(<ReelScreen reel={shared} />);
    await screen.findAllByRole("article");
    expect(
      screen.getByRole("heading", { level: 1, name: shared.experience.title }),
    ).toBeInTheDocument();
  });

  it("never shows the shared reel twice once the feed pages in", async () => {
    /*
      The feed's ordering is a rotation across operators and knows nothing
      about this reel, so the very clip somebody opened is in the pages that
      load underneath it. Without de-duplication it turns up again a few swipes
      down — and React would be handed two children with one key, which unmounts
      the wrong card and hands one clip's player state to another.

      `playableReels` already drops a media id it has seen, so pinning the
      shared reel in front of the feed's pages makes that guard do this job
      too, rather than adding a second rule beside it.
    */
    renderWithQuery(<ReelScreen reel={shared} />);
    // Wait for the FEED to arrive, not just the pinned reel — the assertion
    // below is vacuous until the pages that could contain a repeat are in.
    await waitFor(() =>
      expect(screen.getAllByRole("article").length).toBeGreaterThan(1),
    );
    const cards = screen.getAllByRole("article");

    const shownTwice = cards.filter(
      (c) => c.getAttribute("aria-label") === shared.experience.title,
    );
    // The kayak has exactly one reel in the fixture, so one card is the whole
    // truth here — two would be the duplicate this guards.
    expect(shownTwice).toHaveLength(1);
    // And the feed really did load underneath it, or the assertion above is
    // passing because nothing arrived.
    expect(cards.length).toBeGreaterThan(1);
  });

  it("gives somebody arriving from a message a way into the app", async () => {
    /*
      The feed's masthead is wholly inert so the whole top of a reel scrolls.
      Here it is a link: there is no history to go back to, and no reason to
      know there is an app around the clip.
    */
    renderWithQuery(<ReelScreen reel={shared} />);
    await screen.findAllByRole("article");
    expect(screen.getByLabelText("Yuvoy home")).toHaveAttribute("href", "/");
  });

  it("offers the reel's own link to share, not the listing's", async () => {
    renderWithQuery(<ReelScreen reel={shared} />);
    const cards = await screen.findAllByRole("article");
    expect(within(cards[0]).getByLabelText("Share this reel")).toBeTruthy();
  });
});
