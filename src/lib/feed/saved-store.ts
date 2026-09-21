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
 * deliberately the shape those endpoints will have: list ids, list bodies, add
 * one, remove one, all idempotent.
 *
 * ## Why an entry carries a slug, and why that is not redundant
 *
 * **The id cannot be resolved to an experience.** `GET /experiences/{slug}`
 * takes a slug and `GET /experiences` has no id filter, so a list of saved ids
 * is a list the app cannot render. That was invisible for as long as there was
 * no screen showing saved experiences, and it is the first thing that bites
 * when one exists.
 *
 * The id stays because it is what the feed asks about twelve times a page and
 * it is what #192 will key on. The slug is added because it is the only handle
 * the current API accepts. When #192 lands the slug becomes redundant and can
 * go; until then it is the difference between a wishlist and a list of opaque
 * strings.
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

/**
 * The current key, holding {@link SavedEntry} objects.
 *
 * v1 held bare id strings. See {@link listSaved} for what happens to those.
 */
const KEY = "yuvoy.saved.v2";

/** The old key. Read once, to migrate, and never written. */
const KEY_V1 = "yuvoy.saved.v1";

/** One saved experience, as the device holds it. */
export interface SavedEntry {
  /** The experience id. What the feed asks about and what #192 will key on. */
  id: string;
  /**
   * The only handle the current API accepts, so the only way to render this.
   *
   * **Null for a save made before v2**, which therefore cannot be resolved to
   * a listing at all. The list screen counts those and offers to clear them
   * rather than pretending the set is smaller than it is.
   */
  slug: string | null;
  /** ms since epoch. Newest first on the list screen. `0` for a migrated v1. */
  savedAt: number;
}

/**
 * The contract the UI is written against.
 *
 * Two reads, deliberately, and they are the two `#192` specifies. The feed's
 * question is "is this one held", twelve times per page, and twelve bodies to
 * answer a boolean twelve times is the wrong shape on an island connection.
 * The list screen wants the set with enough to render it, and asks separately.
 */
export interface SavedStore {
  /** Every saved experience id. Empty when there are none or storage is gone. */
  listSavedIds(): Promise<string[]>;
  /** Every save, newest first. */
  listSaved(): Promise<SavedEntry[]>;
  /**
   * Idempotent: saving something already saved is not an error.
   *
   * Re-saving refreshes the slug rather than ignoring the call, so a listing
   * that was renamed is reachable again the next time somebody taps.
   *
   * `savedAt` is for UNDO and nothing else. A restored save must go back where
   * it was: a row that jumps to the front of the list after an undo reads as a
   * second change rather than the reversal of one. Left out, it is now.
   */
  addSaved(experienceId: string, slug: string, savedAt?: number): Promise<void>;
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

/**
 * Unknown in, clean entries out. Anything unrecognisable is treated as absent.
 *
 * Accepts BOTH shapes on purpose: a bare string is a v1 id, which becomes an
 * entry with no slug rather than being dropped. Dropping it would silently
 * delete something a traveller chose to keep, and the id is still worth having
 * because it is what makes the bookmark on the feed stay filled.
 */
function normalise(raw: unknown): SavedEntry[] {
  if (!Array.isArray(raw)) return [];
  const out: SavedEntry[] = [];
  const seen = new Set<string>();
  for (const item of raw) {
    let entry: SavedEntry | null = null;
    if (typeof item === "string" && item) {
      entry = { id: item, slug: null, savedAt: 0 };
    } else if (item && typeof item === "object") {
      const { id, slug, savedAt } = item as Partial<SavedEntry>;
      if (typeof id === "string" && id) {
        entry = {
          id,
          slug: typeof slug === "string" && slug ? slug : null,
          savedAt: typeof savedAt === "number" && savedAt > 0 ? savedAt : 0,
        };
      }
    }
    if (!entry || seen.has(entry.id)) continue;
    seen.add(entry.id);
    out.push(entry);
  }
  return out;
}

/**
 * Every save, current key first and the old one only if there is no new one.
 *
 * `undefined` rather than an empty array is what says "never written". A
 * traveller who removes their last save leaves `[]` behind, and reading that
 * as "absent" would migrate v1 again and resurrect everything they cleared.
 */
async function read(): Promise<SavedEntry[]> {
  const current = await get(KEY);
  if (current !== undefined) return normalise(current);

  const legacy = await get(KEY_V1);
  if (legacy === undefined) return [];

  const migrated = normalise(legacy);
  // Written through so the next read is a single lookup and the branch above
  // stops being reachable. v1 is left in place: deleting it buys nothing and
  // an interrupted migration would then have lost the only copy.
  await set(KEY, migrated);
  return migrated;
}

/** Newest first, with migrated v1 entries (`savedAt: 0`) last. */
function byNewest(a: SavedEntry, b: SavedEntry): number {
  return b.savedAt - a.savedAt;
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
      return (await read()).map((entry) => entry.id);
    } catch {
      return [];
    }
  },

  async listSaved() {
    if (!available()) return [];
    try {
      return (await read()).sort(byNewest);
    } catch {
      return [];
    }
  },

  async addSaved(experienceId, slug, savedAt) {
    if (!available() || !experienceId) return;
    try {
      const entries = await read();
      const existing = entries.find((entry) => entry.id === experienceId);
      if (existing) {
        // Idempotent, but not inert: a re-save is the one moment a v1 entry
        // can learn the slug it never had, which is what makes it renderable.
        if (existing.slug === slug) return;
        await set(
          KEY,
          entries.map((entry) =>
            entry.id === experienceId ? { ...entry, slug } : entry,
          ),
        );
        return;
      }
      await set(KEY, [
        ...entries,
        {
          id: experienceId,
          slug: slug || null,
          savedAt: savedAt ?? Date.now(),
        },
      ]);
    } catch {
      /* Storage refused. The optimistic update in `use-saved` is rolled back by
         the refetch that follows, so the control tells the truth again. */
    }
  },

  async removeSaved(experienceId) {
    if (!available() || !experienceId) return;
    try {
      const entries = await read();
      if (!entries.some((entry) => entry.id === experienceId)) return;
      await set(
        KEY,
        entries.filter((entry) => entry.id !== experienceId),
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
