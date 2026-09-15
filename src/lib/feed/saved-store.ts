/**
 * Where a traveller's saved experiences live, and the seam that lets that move.
 *
 * ## What saving is, and what it is not
 *
 * A **private wishlist**: a way to hold an experience while deciding, on a trip
 * where somebody is choosing between four things for three days. Nothing about
 * it is social. Nothing is counted, nothing is published, nothing reaches an
 * operator. This product publishes no rating and no review count on purpose,
 * and a save that became a number would reverse that decision by accident.
 *
 * That is also why the control is a bookmark rather than a heart: a heart means
 * "like" to everybody who has used a phone, and a like is a gesture this
 * product does not have.
 *
 * ## Why this file is an interface with one implementation
 *
 * Saves belong on the account, not on one device: a traveller who saves on
 * their phone and opens a laptop should see the same list. That is yuvoy-api
 * #192, and it does not exist yet.
 *
 * So the UI is written against {@link SavedStore} and never against IndexedDB,
 * and the swap when #192 lands is this file gaining a second implementation
 * rather than every component learning about a network. The shape here is
 * deliberately the shape those endpoints will have: list ids, add one, remove
 * one, all idempotent.
 *
 * ## IndexedDB, not localStorage
 *
 * The same reasoning `@/lib/booking/token-store` gives, and an eslint rule bans
 * `localStorage` outright so it cannot drift: it is synchronous and blocks the
 * main thread on a slow device, and it is the first place an XSS payload looks.
 *
 * ## The gap this leaves, stated rather than hidden
 *
 * Until #192 lands, saves are on one device. The app does not claim otherwise
 * in its copy, and the adoption path is already precedented here: guest
 * bookings live on the device and are adopted into the account on sign in
 * (`merge-trips.ts`, `adopt-stored-session.tsx`). Saving will follow the same
 * route, which is why {@link listSavedIds} returns the whole set rather than
 * answering one id at a time.
 */
import { get, set } from "idb-keyval";

/** One key. The set is small and is always read whole. */
const KEY = "yuvoy.saved.v1";

/**
 * The contract the UI is written against.
 *
 * Ids rather than bodies, because the feed's question is "is this one held",
 * twelve times per page, and twelve `ExperienceSummary` bodies to answer a
 * boolean twelve times is the wrong shape on an island connection. The list
 * screen fetches bodies separately when it exists.
 */
export interface SavedStore {
  /** Every saved experience id. Empty when there are none or storage is gone. */
  listSavedIds(): Promise<string[]>;
  /** Idempotent: saving something already saved is not an error. */
  addSaved(experienceId: string): Promise<void>;
  /** Idempotent: removing something absent is not an error. */
  removeSaved(experienceId: string): Promise<void>;
}

/**
 * Whether IndexedDB can actually be used.
 *
 * Not `typeof indexedDB !== "undefined"` alone. Safari's private mode DEFINES
 * `indexedDB` and then refuses to open it, and some embedded browsers throw on
 * first access rather than returning undefined. The same trap `token-store`
 * documents; every call below is wrapped for it.
 */
function available(): boolean {
  try {
    return typeof indexedDB !== "undefined";
  } catch {
    return false;
  }
}

/** Unknown in, a clean array of ids out. Anything else is treated as empty. */
function normalise(raw: unknown): string[] {
  if (!Array.isArray(raw)) return [];
  const out: string[] = [];
  for (const item of raw) {
    if (typeof item === "string" && item && !out.includes(item)) out.push(item);
  }
  return out;
}

/**
 * The device store.
 *
 * Every method swallows storage failure and answers as if the set were empty,
 * because a browser that will not persist is not a reason to break a feed. The
 * cost of a lost save is one tap; the cost of an unhandled rejection on the
 * app's front door is the screen.
 */
export const deviceSavedStore: SavedStore = {
  async listSavedIds() {
    if (!available()) return [];
    try {
      return normalise(await get(KEY));
    } catch {
      return [];
    }
  },

  async addSaved(experienceId) {
    if (!available() || !experienceId) return;
    try {
      const ids = normalise(await get(KEY));
      if (ids.includes(experienceId)) return;
      await set(KEY, [...ids, experienceId]);
    } catch {
      /* Storage refused. The optimistic update in `use-saved` is rolled back by
         the refetch that follows, so the control tells the truth again. */
    }
  },

  async removeSaved(experienceId) {
    if (!available() || !experienceId) return;
    try {
      const ids = normalise(await get(KEY));
      if (!ids.includes(experienceId)) return;
      await set(
        KEY,
        ids.filter((id) => id !== experienceId),
      );
    } catch {
      /* As above. */
    }
  },
};

/**
 * The store the app uses.
 *
 * One indirection, so the day yuvoy-api#192 lands this becomes a choice between
 * two implementations (device when signed out, API when signed in, and an
 * adoption step between) and nothing that renders has to change.
 */
export const savedStore: SavedStore = deviceSavedStore;
