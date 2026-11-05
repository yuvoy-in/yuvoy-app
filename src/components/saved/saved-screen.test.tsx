import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { act, screen, cleanup, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { http, HttpResponse } from "msw";
import { server } from "../../../mocks/server";
import { renderWithQuery } from "@/test/render";
import { SavedScreen } from "./saved-screen";
import { EXPERIENCES } from "../../../mocks/fixtures";

/**
 * The wishlist, which is the first screen saving has ever had.
 *
 * The bookmark on the feed wrote to storage that nothing read back, so every
 * save was a tap into a void. These cover the four states a held experience
 * can actually be in, because a wishlist is kept for weeks and a listing can
 * be withdrawn underneath it.
 */
const idb = vi.hoisted(() => ({
  store: new Map<string, unknown>(),
  /** When set, every read waits for it: storage that is slow to answer. */
  hold: null as Promise<void> | null,
}));
vi.mock("idb-keyval", () => ({
  get: async (k: string) => {
    if (idb.hold) await idb.hold;
    return idb.store.get(k);
  },
  set: async (k: string, v: unknown) => {
    idb.store.set(k, v);
  },
}));

vi.mock("next/navigation", () => ({
  useSearchParams: () => new URLSearchParams(),
  useRouter: () => ({ push: vi.fn(), replace: vi.fn(), back: vi.fn() }),
  usePathname: () => "/saved",
}));

const BASE = process.env.NEXT_PUBLIC_API_URL ?? "http://localhost:8099/v1";
const KEY = "yuvoy.saved.v2";
const first = EXPERIENCES[0];

/** One entry, shaped as the store holds it. */
const entry = (id: string, slug: string | null) => ({
  id,
  slug,
  savedAt: 1_700_000_000_000,
});

beforeEach(() => {
  idb.store.clear();
  idb.hold = null;
  vi.stubGlobal("indexedDB", {});
});
afterEach(cleanup);

describe("with nothing saved", () => {
  it("teaches the gesture rather than apologising", async () => {
    renderWithQuery(<SavedScreen />);

    expect(await screen.findByText("Nothing saved yet")).toBeInTheDocument();
    // A dead end is the defect this screen exists to fix, so the empty state
    // is a way back into the feed rather than a full stop.
    expect(
      screen.getByRole("link", { name: /find something to do/i }),
    ).toHaveAttribute("href", "/");
    // And, signed out, a way to the account: an empty browser is not an empty
    // wishlist for somebody who saved on another phone.
    expect(screen.getByRole("link", { name: "Sign in" })).toHaveAttribute(
      "href",
      "/account?next=%2Fsaved",
    );
  });
});

describe("with saved experiences", () => {
  it("does not say 'Nothing saved yet' while storage is still answering", async () => {
    /*
      The device list used a placeholder, which puts a query in `success`
      before storage has answered, so this screen drew the empty state for a
      frame over somebody's list. Storage is held open here so that frame is
      long enough to catch.
    */
    let release!: () => void;
    idb.hold = new Promise<void>((resolve) => {
      release = resolve;
    });
    idb.store.set(KEY, [entry(first.id, first.slug)]);

    renderWithQuery(<SavedScreen />);

    // Long enough for the session answer (signed out) to land.
    await new Promise((r) => setTimeout(r, 50));
    expect(screen.queryByText("Nothing saved yet")).toBeNull();
    expect(
      screen.getByRole("status", { name: "Loading your saved experiences" }),
    ).toBeInTheDocument();

    release();
    expect(
      await screen.findByRole("link", { name: new RegExp(first.title, "i") }),
    ).toBeInTheDocument();
  });

  it("shows what was saved, as a link to it", async () => {
    idb.store.set(KEY, [entry(first.id, first.slug)]);

    renderWithQuery(<SavedScreen />);

    const link = await screen.findByRole("link", {
      name: new RegExp(first.title, "i"),
    });
    expect(link).toHaveAttribute("href", `/e/${first.slug}`);
  });

  it("does not call a saved listing gone because a refresh failed", async () => {
    /*
      The tile says "no longer on Yuvoy" and offers Remove for a listing that
      never came back. It used to say so for any failed read, a refresh of a
      tile already drawn included, so one dropped connection offered to
      delete somebody's saves (6 Oct 2026).
    */
    idb.store.set(KEY, [entry(first.id, first.slug)]);
    const { client } = renderWithQuery(<SavedScreen />);
    await screen.findByRole("link", { name: new RegExp(first.title, "i") });

    server.use(
      http.get(`${BASE}/experiences/:slug`, () =>
        HttpResponse.json(
          { error: { code: "bad_request", message: "no" } },
          { status: 400 },
        ),
      ),
    );
    await act(async () => {
      await client.refetchQueries({ queryKey: ["getExperience"] });
      await new Promise((resolve) => setTimeout(resolve, 20));
    });

    expect(
      screen.getByRole("link", { name: new RegExp(first.title, "i") }),
    ).toBeInTheDocument();
    expect(
      screen.queryByText("This experience is no longer on Yuvoy."),
    ).toBeNull();
  });

  it("says the saves are on this device, and how to keep them", async () => {
    idb.store.set(KEY, [entry(first.id, first.slug)]);

    renderWithQuery(<SavedScreen />);

    /*
      Signed out, the one-device limit is real. Asserted so the sentence cannot
      be quietly dropped as polish: a traveller who loses a list by switching
      phones was never told it could happen. And since yuvoy-api#192 there is a
      fix to offer with it: signing in moves the list onto the account.
    */
    expect(
      await screen.findByText(/saved in this browser only/i),
    ).toBeInTheDocument();
    expect(screen.getByRole("link", { name: "Sign in" })).toHaveAttribute(
      "href",
      "/account?next=%2Fsaved",
    );
  });

  it("removes, and offers the way back", async () => {
    const user = userEvent.setup();
    idb.store.set(KEY, [entry(first.id, first.slug)]);

    renderWithQuery(<SavedScreen />);
    await user.click(
      await screen.findByRole("button", { name: /remove .* from saved/i }),
    );

    /*
      Undo is not decoration. The control sits on a poster that is also a link,
      on a phone, in a grid: a mis-tap is likely and what it destroys is the
      only record that somebody wanted this.
    */
    const undo = await screen.findByRole("button", { name: /undo/i });
    await user.click(undo);

    await waitFor(async () => {
      expect(await idb.store.get(KEY)).toHaveLength(1);
    });
  });

  it("still offers undo after the LAST save is removed", async () => {
    /*
      THE DEFECT THIS PINS, found by the test above rather than by reading.

      Undo lived on the tile. Removing the last save unmounted that tile, the
      screen flipped to its empty state, and the only way back went with it.
      The one removal most worth undoing is the one that empties the list.
    */
    const user = userEvent.setup();
    idb.store.set(KEY, [entry(first.id, first.slug)]);

    renderWithQuery(<SavedScreen />);
    await user.click(
      await screen.findByRole("button", { name: /remove .* from saved/i }),
    );

    expect(await screen.findByText("Nothing saved yet")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: /undo/i })).toBeInTheDocument();
  });

  it("puts a restored save back where it was, not at the front", async () => {
    const user = userEvent.setup();
    idb.store.set(KEY, [
      { id: "newer", slug: "b", savedAt: 2000 },
      { id: first.id, slug: first.slug, savedAt: 1000 },
    ]);

    renderWithQuery(<SavedScreen />);
    await user.click(
      await screen.findByRole("button", {
        name: new RegExp(`remove ${first.title}`, "i"),
      }),
    );
    await user.click(await screen.findByRole("button", { name: /undo/i }));

    await waitFor(async () => {
      const rows = (await idb.store.get(KEY)) as { id: string }[];
      expect(rows).toHaveLength(2);
    });
    /* An undo is a reversal. A row that reappears at the top reads as a second
       change, so `savedAt` is handed back to the store rather than restamped. */
    const rows = (await idb.store.get(KEY)) as { savedAt: number }[];
    expect(rows.find((r) => r.savedAt === 1000)).toBeDefined();
  });
});

describe("a listing that changed underneath the save", () => {
  it("says a withdrawn listing is not selling, and still links to it", async () => {
    /*
      `bookable: false` is a 200, not a 404: the contract is explicit that
      telling somebody the business does not exist is worse than telling them
      it is not selling. So the tile stays and the PRICE line is what changes,
      since the price is the part that stopped being true.
    */
    server.use(
      http.get(`${BASE}/experiences/${first.slug}`, () =>
        HttpResponse.json({ ...first, bookable: false }),
      ),
    );
    idb.store.set(KEY, [entry(first.id, first.slug)]);

    renderWithQuery(<SavedScreen />);
    expect(await screen.findByText(/not taking bookings/i)).toBeInTheDocument();
  });
});

describe("saves made before an entry carried a slug", () => {
  it("counts them instead of quietly showing a shorter list", async () => {
    idb.store.set(KEY, [entry(first.id, first.slug), entry("legacy_1", null)]);

    renderWithQuery(<SavedScreen />);

    /*
      The feed still reads these as saved, so a screen that silently omitted
      them would make the two disagree with no way to tell which was right.
    */
    expect(
      await screen.findByText(/cannot be shown here/i),
    ).toBeInTheDocument();
    expect(
      screen.getByRole("button", { name: /clear them/i }),
    ).toBeInTheDocument();
  });
});
