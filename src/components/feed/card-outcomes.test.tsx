import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { act } from "react";
import { screen, within, cleanup, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { renderWithQuery } from "@/test/render";
import { Feed } from "./feed";
import { ReelStrip } from "./reel-strip";
import { REELS } from "../../../mocks/fixtures";
import { useFeedStore } from "@/lib/feed/store";
import { setConsent } from "@/lib/analytics/consent";
import {
  __resetOutcomeCollector,
  outcomeCollector,
} from "@/lib/analytics/outcomes";

/**
 * What a reel card counts (yuvoy-app#181): its panel opened, a save, a share,
 * each with the strip's surface and the card's place in it. Closing the panel
 * and removing a save are not counted.
 */

vi.mock("next/navigation", () => ({
  useSearchParams: () => new URLSearchParams(),
  useRouter: () => ({ push: vi.fn(), replace: vi.fn() }),
  usePathname: () => "/",
}));

const idb = vi.hoisted(() => ({ store: new Map<string, unknown>() }));
vi.mock("idb-keyval", () => ({
  get: async (k: string) => idb.store.get(k),
  set: async (k: string, v: unknown) => {
    idb.store.set(k, v);
  },
}));

class NoResizeObserver {
  observe() {}
  unobserve() {}
  disconnect() {}
}
vi.stubGlobal("ResizeObserver", NoResizeObserver);

const waiting = () =>
  outcomeCollector()
    .inspect()
    .waiting.filter((e) => e.kind !== "shown")
    .map((e) => `${e.kind} ${e.surface} ${e.subjectId} ${e.position}`);

beforeEach(() => {
  idb.store.clear();
  vi.stubGlobal("indexedDB", {});
  act(() => useFeedStore.getState().resetFeed());
  __resetOutcomeCollector();
  setConsent("granted");
});
afterEach(() => {
  cleanup();
  setConsent("denied");
  __resetOutcomeCollector();
});

describe("a reel card's outcomes", () => {
  it("counts the panel opened, not closed, on the feed", async () => {
    const user = userEvent.setup();
    renderWithQuery(<Feed />);
    const [card] = await screen.findAllByRole("article");
    const id = REELS[0].experience.id;
    const line = card.querySelector<HTMLButtonElement>("button[aria-controls]");

    await user.click(line!);
    await user.click(line!);
    expect(waiting()).toEqual([`opened feed ${id} 0`]);
  });

  it("counts a save once it is kept, and never a removal", async () => {
    const user = userEvent.setup();
    renderWithQuery(<Feed />);
    const [card] = await screen.findAllByRole("article");
    const id = REELS[0].experience.id;
    const save = within(card).getByRole("button", { name: /^Save / });

    await user.click(save);
    await waitFor(() => expect(waiting()).toEqual([`saved feed ${id} 0`]));

    await user.click(
      await within(card).findByRole("button", { name: /^Saved\. Remove / }),
    );
    await waitFor(() =>
      expect(
        within(card).getByRole("button", { name: /^Save / }),
      ).toBeInTheDocument(),
    );
    expect(waiting()).toEqual([`saved feed ${id} 0`]);
  });

  it("counts under the strip's own surface", async () => {
    const user = userEvent.setup();
    renderWithQuery(
      <ReelStrip
        items={REELS}
        tail="complete"
        hasNextPage={false}
        isFetchingNextPage={false}
        isFetchNextPageError={false}
        fetchNextPage={() => {}}
        surface="search"
      />,
    );
    const [card] = await screen.findAllByRole("article");
    await user.click(
      card.querySelector<HTMLButtonElement>("button[aria-controls]")!,
    );
    expect(waiting()).toEqual([`opened search ${REELS[0].experience.id} 0`]);
  });
});
