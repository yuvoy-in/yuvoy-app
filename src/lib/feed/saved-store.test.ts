import { describe, it, expect, vi, beforeEach } from "vitest";
import { deviceSavedStore as savedStore } from "./saved-store";

/**
 * A save has to be resolvable, and for a long time it was not.
 *
 * The store held bare experience ids. `GET /experiences/{slug}` takes a slug
 * and `GET /experiences` has no id filter, so **a saved id could not be turned
 * back into an experience by any call this API offers**. That was invisible
 * while nothing rendered a saved list and it is the first thing that bites
 * when something does.
 *
 * These cover the seam rather than the screen: what is stored, what comes
 * back, and what happens to the saves made before an entry carried a slug.
 *
 * jsdom has no IndexedDB, so `idb-keyval` is the Map below. Same stand-in
 * `token-store.idb.test.ts` uses, for the same reason.
 */
const idb = vi.hoisted(() => ({
  mode: "ok" as "ok" | "reject",
  store: new Map<string, unknown>(),
}));
vi.mock("idb-keyval", () => ({
  get: async (k: string) => {
    if (idb.mode === "reject") throw new Error("InvalidStateError");
    return idb.store.get(k);
  },
  set: async (k: string, v: unknown) => {
    if (idb.mode === "reject") throw new Error("QuotaExceededError");
    idb.store.set(k, v);
  },
}));

const V1 = "yuvoy.saved.v1";
const V2 = "yuvoy.saved.v2";

beforeEach(() => {
  idb.mode = "ok";
  idb.store.clear();
  vi.stubGlobal("indexedDB", {});
});

describe("saving", () => {
  it("records the slug, because the id alone cannot be rendered", async () => {
    await savedStore.addSaved("exp_1", "try-dive-nemo-reef");

    const saved = await savedStore.listSaved();
    expect(saved).toHaveLength(1);
    expect(saved[0]).toMatchObject({
      id: "exp_1",
      slug: "try-dive-nemo-reef",
    });
  });

  it("is idempotent", async () => {
    await savedStore.addSaved("exp_1", "try-dive-nemo-reef");
    await savedStore.addSaved("exp_1", "try-dive-nemo-reef");

    expect(await savedStore.listSaved()).toHaveLength(1);
  });

  it("still answers ids on their own, which is what the feed asks", async () => {
    await savedStore.addSaved("exp_1", "a");
    await savedStore.addSaved("exp_2", "b");

    expect(await savedStore.listSavedIds()).toEqual(["exp_1", "exp_2"]);
  });

  it("lists the newest first", async () => {
    vi.setSystemTime(new Date("2026-09-21T10:00:00Z"));
    await savedStore.addSaved("older", "a");
    vi.setSystemTime(new Date("2026-09-21T11:00:00Z"));
    await savedStore.addSaved("newer", "b");

    expect((await savedStore.listSaved()).map((e) => e.id)).toEqual([
      "newer",
      "older",
    ]);
    vi.useRealTimers();
  });

  it("removes, idempotently", async () => {
    await savedStore.addSaved("exp_1", "a");
    await savedStore.removeSaved("exp_1");
    await savedStore.removeSaved("exp_1");

    expect(await savedStore.listSaved()).toEqual([]);
  });

  it("removes several at once, and only those", async () => {
    /*
      What adoption calls once the account holds a batch (yuvoy-api#192).
      By id rather than "clear everything": a save made on this device while
      adoption was in flight is not in the batch, and must survive it.
    */
    await savedStore.addSaved("adopted_1", "a");
    await savedStore.addSaved("adopted_2", "b");
    await savedStore.addSaved("made_meanwhile", "c");

    await savedStore.removeSavedIds(["adopted_1", "adopted_2", "never_here"]);

    expect(await savedStore.listSavedIds()).toEqual(["made_meanwhile"]);
  });

  it("does not write at all when there is nothing to remove", async () => {
    await savedStore.addSaved("exp_1", "a");
    const before = idb.store.get(V2);

    await savedStore.removeSavedIds([]);
    await savedStore.removeSavedIds(["absent"]);

    // Same array object: nothing was rewritten.
    expect(idb.store.get(V2)).toBe(before);
  });
});

describe("saves made before an entry carried a slug", () => {
  it("keeps them, so the feed's bookmark does not silently empty", async () => {
    idb.store.set(V1, ["legacy_1", "legacy_2"]);

    // The ids survive, which is what `isSaved` reads on the feed. Dropping
    // them would un-save something a traveller chose to keep.
    expect(await savedStore.listSavedIds()).toEqual(["legacy_1", "legacy_2"]);
  });

  it("marks them unresolvable rather than inventing a slug", async () => {
    idb.store.set(V1, ["legacy_1"]);

    const saved = await savedStore.listSaved();
    expect(saved[0].slug).toBeNull();
  });

  it("migrates once and does not resurrect cleared saves", async () => {
    /*
      THE TRAP THIS PINS. `[]` and "never written" are different states. If an
      empty v2 were read as absent, a traveller who cleared their last save
      would have the whole v1 set migrated back on the next read, and saves
      they deliberately removed would reappear.
    */
    idb.store.set(V1, ["legacy_1"]);
    await savedStore.listSaved();
    await savedStore.removeSaved("legacy_1");

    expect(idb.store.get(V2)).toEqual([]);
    expect(await savedStore.listSaved()).toEqual([]);
  });

  it("learns the slug when the same experience is saved again", async () => {
    idb.store.set(V1, ["exp_1"]);
    await savedStore.listSaved();

    // Re-saving from the feed is the one moment a legacy entry can become
    // renderable, so `addSaved` updates rather than returning early.
    await savedStore.addSaved("exp_1", "try-dive-nemo-reef");

    const saved = await savedStore.listSaved();
    expect(saved).toHaveLength(1);
    expect(saved[0].slug).toBe("try-dive-nemo-reef");
  });
});

describe("when storage refuses", () => {
  it("answers empty rather than throwing at the feed", async () => {
    idb.mode = "reject";

    expect(await savedStore.listSaved()).toEqual([]);
    expect(await savedStore.listSavedIds()).toEqual([]);
    // A write that cannot land must not reject either: the optimistic update
    // in `use-saved` is rolled back by the refetch that follows.
    await expect(savedStore.addSaved("exp_1", "a")).resolves.toBeUndefined();
    await expect(savedStore.removeSaved("exp_1")).resolves.toBeUndefined();
    await expect(savedStore.removeSavedIds(["exp_1"])).resolves.toBeUndefined();
  });

  it("answers empty when there is no IndexedDB at all", async () => {
    vi.stubGlobal("indexedDB", undefined);

    expect(await savedStore.listSaved()).toEqual([]);
  });
});
