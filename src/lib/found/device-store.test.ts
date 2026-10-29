import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import {
  HIDDEN_CARDS_CHANGED,
  HIDDEN_KEEP_MS,
  HIDDEN_MAX,
  hiddenCardIds,
  hideCard,
  leaveNoticeOff,
  setLeaveNoticeOff,
} from "./device-store";

/**
 * The hidden list and the leaving notice's tick (yuvoy-app#179): at most 200
 * cards, none kept past 30 days, and a browser that refuses storage answers
 * as if nothing were kept rather than breaking the feed.
 *
 * jsdom has no IndexedDB, so `idb-keyval` is the Map below, the stand-in
 * `lib/feed/saved-store.test.ts` uses for the same reason.
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

const DAY = 24 * 60 * 60_000;
const NOW = new Date("2026-10-29T10:00:00Z").getTime();

beforeEach(() => {
  idb.mode = "ok";
  idb.store.clear();
  vi.stubGlobal("indexedDB", {});
  vi.useFakeTimers({ toFake: ["Date"] });
  vi.setSystemTime(NOW);
});
afterEach(() => {
  vi.useRealTimers();
  vi.unstubAllGlobals();
});

describe("the hidden list", () => {
  it("hides a card, by its id in lower case", async () => {
    await hideCard("6F1C0E2A-0000-4000-8000-00000000000A");
    expect(await hiddenCardIds()).toEqual(
      new Set(["6f1c0e2a-0000-4000-8000-00000000000a"]),
    );
  });

  it("keeps each card once", async () => {
    await hideCard("a");
    await hideCard("a");
    expect((idb.store.get("yv.hiddenCards") as unknown[]).length).toBe(1);
  });

  it("keeps at most 200, the oldest going first", async () => {
    for (let n = 0; n < HIDDEN_MAX + 5; n += 1) {
      vi.setSystemTime(NOW + n * 1000);
      await hideCard(`card-${n}`);
    }
    const ids = await hiddenCardIds();
    expect(ids.size).toBe(HIDDEN_MAX);
    for (let n = 0; n < 5; n += 1) expect(ids.has(`card-${n}`)).toBe(false);
    expect(ids.has(`card-${HIDDEN_MAX + 4}`)).toBe(true);
    expect((idb.store.get("yv.hiddenCards") as unknown[]).length).toBe(
      HIDDEN_MAX,
    );
  });

  it("forgets a card after 30 days", async () => {
    await hideCard("old");
    vi.setSystemTime(NOW + 10 * DAY);
    await hideCard("newer");

    vi.setSystemTime(NOW + HIDDEN_KEEP_MS - 1);
    expect(await hiddenCardIds()).toEqual(new Set(["old", "newer"]));

    vi.setSystemTime(NOW + HIDDEN_KEEP_MS);
    expect(await hiddenCardIds()).toEqual(new Set(["newer"]));
  });

  it("drops forgotten cards from storage at the next write", async () => {
    await hideCard("old");
    vi.setSystemTime(NOW + 31 * DAY);
    await hideCard("new");
    expect(idb.store.get("yv.hiddenCards")).toEqual([
      { id: "new", at: NOW + 31 * DAY },
    ]);
  });

  it("ignores anything in storage it did not write", async () => {
    idb.store.set("yv.hiddenCards", [
      { id: "kept", at: NOW - DAY },
      "bare-string",
      { id: 7, at: NOW },
      { id: "no-time" },
      null,
    ]);
    expect(await hiddenCardIds()).toEqual(new Set(["kept"]));
    idb.store.set("yv.hiddenCards", "not a list");
    expect(await hiddenCardIds()).toEqual(new Set());
  });

  it("tells a feed on screen that a card was hidden", async () => {
    const heard = vi.fn();
    window.addEventListener(HIDDEN_CARDS_CHANGED, heard);
    await hideCard("ABC");
    window.removeEventListener(HIDDEN_CARDS_CHANGED, heard);
    expect(heard).toHaveBeenCalledTimes(1);
    expect((heard.mock.calls[0]![0] as CustomEvent).detail).toEqual({
      id: "abc",
    });
  });
});

describe("when storage throws", () => {
  beforeEach(() => {
    idb.mode = "reject";
  });

  it("reads an empty list rather than failing", async () => {
    await expect(hiddenCardIds()).resolves.toEqual(new Set());
  });

  it("still tells the feed, so the card leaves the screen", async () => {
    const heard = vi.fn();
    window.addEventListener(HIDDEN_CARDS_CHANGED, heard);
    await expect(hideCard("abc")).resolves.toBeUndefined();
    window.removeEventListener(HIDDEN_CARDS_CHANGED, heard);
    expect(heard).toHaveBeenCalledTimes(1);
  });

  it("asks the leaving notice again rather than failing", async () => {
    await expect(setLeaveNoticeOff(true)).resolves.toBeUndefined();
    await expect(leaveNoticeOff()).resolves.toBe(false);
  });

  it("answers the same when IndexedDB is missing altogether", async () => {
    idb.mode = "ok";
    vi.stubGlobal("indexedDB", undefined);
    await hideCard("abc");
    expect(idb.store.size).toBe(0);
    expect(await hiddenCardIds()).toEqual(new Set());
    expect(await leaveNoticeOff()).toBe(false);
  });
});

describe("the leaving notice", () => {
  it("is on until it is ticked off, and back on when unticked", async () => {
    expect(await leaveNoticeOff()).toBe(false);
    await setLeaveNoticeOff(true);
    expect(await leaveNoticeOff()).toBe(true);
    await setLeaveNoticeOff(false);
    expect(await leaveNoticeOff()).toBe(false);
  });
});
